import { badRequest, conflict, notFound } from '../../common/errors.js';
import { clone } from '../../common/utils/object.js';
import { rid } from '../../common/utils/crypto.js';
import { MAIN_ROOM, MAX_ROOMS_PER_GAME, PRESENCE_WINDOW_SEC, ROOM_KEY_RE } from '../../config/constants.js';
import type { Cache } from '../../infra/cache.js';
import type { GameRec } from '../games/game.model.js';
import type { GameService } from '../games/game.service.js';
import type { RoomOverrides, RoomRec } from './room.model.js';
import type { RoomRepository } from './room.repository.js';

const roomCacheKey = (gameId: string, key: string) => `room:${gameId}:${key}`;
const presenceSet = (gameId: string, key: string) => `${gameId}:${key}`;

/** Applies a room's overrides on top of a game configuration (full or public: only existing keys are touched). */
export function applyOverrides(cfg: any, o: RoomOverrides | undefined, baseChips: any[] | undefined) {
  if (!o) return cfg;
  const out = clone(cfg);
  if (o.title) out.title = o.title;
  if (o.chips?.length) out.chips = o.chips.map((value, i) => ({ value, image: baseChips?.[Math.min(i, baseChips.length - 1)]?.image }));
  if (o.maxPerTarget) out.limits = { ...(out.limits ?? {}), maxPerTarget: o.maxPerTarget };
  if (o.timing) out.timing = { ...(out.timing ?? {}), ...o.timing };
  return out;
}

const int = (v: unknown, lo: number, hi: number, what: string) => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) throw badRequest(`${what} must be a whole number between ${lo} and ${hi}`, 'invalid_room');
  return v;
};

/** Free notes of the client: up to 10 entries, key 1-32 characters (letters, digits, _ . -), text value up to 200 characters. */
export function sanitizeMetadata(input: unknown): Record<string, string> {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) throw badRequest('metadata must be an object of text values', 'invalid_room');
  const out: Record<string, string> = {}, entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > 10) throw badRequest('metadata can have at most 10 entries', 'invalid_room');
  for (const [k, v] of entries) {
    if (!/^[A-Za-z0-9_.-]{1,32}$/.test(k)) throw badRequest('metadata keys are 1-32 characters: letters, digits, _ . -', 'invalid_room');
    if (typeof v !== 'string' || v.length > 200) throw badRequest('metadata values must be text of at most 200 characters', 'invalid_room');
    out[k] = v;
  }
  return out;
}
const deleteAfter = (v: unknown) => (v === null ? null : int(v, 1, 10_080, 'deleteWhenEmptyMinutes'));

/** Validates the overrides of a room. Anything not listed here cannot be changed per room. */
export function sanitizeOverrides(input: unknown): RoomOverrides {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object') throw badRequest('overrides must be an object', 'invalid_room');
  const o = input as Record<string, any>, out: RoomOverrides = {};
  if (o.title !== undefined) { if (typeof o.title !== 'string' || !o.title.trim() || o.title.length > 80) throw badRequest('overrides.title must be 1-80 characters', 'invalid_room'); out.title = o.title.trim(); }
  if (o.chips !== undefined) {
    if (!Array.isArray(o.chips) || o.chips.length < 2 || o.chips.length > 5) throw badRequest('overrides.chips needs 2 to 5 chip values', 'invalid_room');
    const vals = o.chips.map((v: unknown) => int(v, 1, 1_000_000_000, 'A chip value'));
    if (new Set(vals).size !== vals.length) throw badRequest('Chip values must be different', 'invalid_room');
    out.chips = vals;
  }
  if (o.maxPerTarget !== undefined) out.maxPerTarget = int(o.maxPerTarget, 1, 1_000_000_000, 'overrides.maxPerTarget');
  if (o.timing !== undefined) {
    const t = o.timing ?? {}, timing: NonNullable<RoomOverrides['timing']> = {};
    if (t.betSeconds !== undefined) timing.betSeconds = int(t.betSeconds, 8, 120, 'timing.betSeconds');
    if (t.spinSeconds !== undefined) timing.spinSeconds = int(t.spinSeconds, 3, 15, 'timing.spinSeconds');
    if (t.resultSeconds !== undefined) timing.resultSeconds = int(t.resultSeconds, 3, 20, 'timing.resultSeconds');
    out.timing = timing;
  }
  return out;
}

/** Rooms of a game: creating and listing them, who is in them, and placing a player in one. */
export function createRoomService(d: { repo: RoomRepository; cache: Cache; games: GameService }) {
  const view = async (g: GameRec, r: RoomRec) => ({
    key: r.key, name: r.name, capacity: r.capacity, auto: r.auto, overrides: r.overrides ?? {}, metadata: r.metadata ?? {},
    deleteWhenEmptyMinutes: r.deleteWhenEmptyMinutes ?? null, createdAt: r.createdAt,
    online: await d.cache.countPresence(presenceSet(g._id, r.key), PRESENCE_WINDOW_SEC),
  });

  const lastWrite = new Map<string, number>();
  const service = {
    /** The implicit room every game has. Created the first time it is needed. */
    async main(g: GameRec): Promise<RoomRec> {
      return (await service.get(g, MAIN_ROOM)) ?? (await service.createRaw(g, { key: MAIN_ROOM, name: 'Main room', capacity: null, auto: true, overrides: {} }));
    },

    async get(g: GameRec, key: string): Promise<RoomRec | null> {
      const hit = await d.cache.getJson<RoomRec>(roomCacheKey(g._id, key));
      if (hit) return hit;
      const r = await d.repo.byKey(g._id, key);
      if (r) await d.cache.setJson(roomCacheKey(g._id, key), r, 60);
      return r;
    },

    async createRaw(g: GameRec, o: { key: string; name: string; capacity: number | null; auto: boolean; overrides: RoomOverrides; metadata?: Record<string, string>; deleteWhenEmptyMinutes?: number | null }): Promise<RoomRec> {
      const now = Date.now();
      const rec: RoomRec = { _id: rid('rm_', 8), gameId: g._id, ...o, lastActiveAt: now, createdAt: now };
      await d.repo.create(rec);                                     // a lost race just means it already exists
      return (await d.repo.byKey(g._id, o.key))!;
    },

    /** Rooms of a game, oldest first, `limit` (default 100, at most 500) at a time. */
    async list(g: GameRec, q: { limit?: unknown; offset?: unknown } = {}) {
      await service.main(g);
      const limit = Math.min(500, Math.max(1, Number(q.limit) || 100)), offset = Math.max(0, Number(q.offset) || 0);
      const [rows, total] = await Promise.all([d.repo.page(g._id, offset, limit), d.repo.count(g._id)]);
      return { rooms: await Promise.all(rows.map(r => view(g, r))), total, limit, offset };
    },

    /** One room with its player count (cheaper than the whole list). */
    async show(g: GameRec, key: string) {
      const r = key === MAIN_ROOM ? await service.main(g) : await service.get(g, key);
      if (!r) throw notFound('Room not found', 'room_not_found');
      return view(g, r);
    },

    async create(g: GameRec, body: Record<string, unknown>) {
      const key = String(body.key ?? '');
      if (!ROOM_KEY_RE.test(key)) throw badRequest('key must be 1-32 characters: lowercase letters, digits, - and _ (starting with a letter or digit)', 'invalid_room');
      const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : key;
      if (name.length > 40) throw badRequest('name must be at most 40 characters', 'invalid_room');
      const capacity = body.capacity === undefined || body.capacity === null ? null : int(body.capacity, 1, 1_000_000, 'capacity');
      if (body.auto !== undefined && typeof body.auto !== 'boolean') throw badRequest('auto must be true or false', 'invalid_room');
      if ((await d.repo.count(g._id)) >= MAX_ROOMS_PER_GAME) throw conflict(`A game can have at most ${MAX_ROOMS_PER_GAME} rooms`, 'too_many_rooms');
      if (await d.repo.byKey(g._id, key)) throw conflict('A room with this key already exists', 'room_exists');
      const rec = await service.createRaw(g, { key, name, capacity, auto: body.auto ?? true, overrides: sanitizeOverrides(body.overrides), metadata: sanitizeMetadata(body.metadata), deleteWhenEmptyMinutes: body.deleteWhenEmptyMinutes === undefined ? null : deleteAfter(body.deleteWhenEmptyMinutes) } as any);
      return view(g, rec);
    },

    async update(g: GameRec, key: string, body: Record<string, unknown>) {
      const r = await service.get(g, key);
      if (!r) throw notFound('Room not found', 'room_not_found');
      const set: Partial<RoomRec> = {};
      if (body.name !== undefined) { if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 40) throw badRequest('name must be 1-40 characters', 'invalid_room'); set.name = body.name.trim(); }
      if (body.capacity !== undefined) set.capacity = body.capacity === null ? null : int(body.capacity, 1, 1_000_000, 'capacity');
      if (body.auto !== undefined) { if (typeof body.auto !== 'boolean') throw badRequest('auto must be true or false', 'invalid_room'); set.auto = body.auto; }
      if (body.overrides !== undefined) set.overrides = sanitizeOverrides(body.overrides);
      if (body.metadata !== undefined) set.metadata = sanitizeMetadata(body.metadata);
      if (body.deleteWhenEmptyMinutes !== undefined) { set.deleteWhenEmptyMinutes = deleteAfter(body.deleteWhenEmptyMinutes); set.lastActiveAt = Date.now(); }
      if (Object.keys(set).length) { await d.repo.update(g._id, key, set); await d.cache.del(roomCacheKey(g._id, key)); }
      return view(g, { ...r, ...set });
    },

    async remove(g: GameRec, key: string) {
      if (key === MAIN_ROOM) throw conflict('The main room cannot be deleted', 'room_protected');
      const r = await service.get(g, key);
      if (!r) throw notFound('Room not found', 'room_not_found');
      if ((await service.online(g, key)) > 0) throw conflict('Players are in this room right now. Try again when it is empty.', 'room_busy');
      await d.repo.remove(g._id, key);
      await d.cache.del(roomCacheKey(g._id, key));
      return { ok: true };
    },

    online: (g: GameRec, key: string) => d.cache.countPresence(presenceSet(g._id, key), PRESENCE_WINDOW_SEC),
    /** Marks players as present in a room (the live hub and the HTTP fallback call this). */
    touch(gameId: string, key: string, playerIds: string[]) {
      // remember that the room was in use, for "delete when empty" (a database write at most once a minute per room)
      if (playerIds.length) {
        const k = presenceSet(gameId, key), now = Date.now();
        if (now - (lastWrite.get(k) ?? 0) > 60_000) { lastWrite.set(k, now); void d.repo.setActive(gameId, key, now).catch(() => {}); }
      }
      return d.cache.touchPresence(presenceSet(gameId, key), playerIds, PRESENCE_WINDOW_SEC);
    },

    /** Deletes the rooms that asked to go when empty and have been empty long enough. Called by a worker. Returns how many were deleted. */
    async cleanup(now = Date.now()) {
      let n = 0;
      for (const r of await d.repo.expirable(now)) {
        if ((await d.cache.countPresence(presenceSet(r.gameId, r.key), PRESENCE_WINDOW_SEC)) > 0) continue;
        await d.repo.remove(r.gameId, r.key); await d.cache.del(roomCacheKey(r.gameId, r.key)); lastWrite.delete(presenceSet(r.gameId, r.key)); n++;
      }
      return n;
    },

    /**
     * Picks the room for a session: the named room (409 when it is full), or with "auto" the first auto room that has space.
     * When every auto room is full, a new one is opened as a copy of the last auto room, so a busy game just grows.
     */
    async assign(g: GameRec, requested: unknown, playerId?: string): Promise<RoomRec> {
      let room: RoomRec | null = null;
      if (requested !== undefined && requested !== null && requested !== 'auto') {
        if (typeof requested !== 'string' || !ROOM_KEY_RE.test(requested)) throw badRequest('room must be "auto" or the key of one of your rooms', 'invalid_room');
        room = requested === MAIN_ROOM ? await service.main(g) : await service.get(g, requested);
        if (!room) throw notFound(`Room "${requested}" does not exist`, 'room_not_found');
        if (room.capacity !== null && (await service.online(g, room.key)) >= room.capacity) throw conflict('This room is full', 'room_full');
      } else {
        await service.main(g);
        const autos = (await d.repo.listByGame(g._id)).filter(r => r.auto);
        for (const r of autos) {
          if (r.capacity === null || (await service.online(g, r.key)) < r.capacity) { room = r; break; }
        }
        if (!room) {
          const last = autos[autos.length - 1];
          if (!last) throw conflict('This game has no room that accepts automatic placement', 'no_room_available');
          if ((await d.repo.count(g._id)) >= MAX_ROOMS_PER_GAME) throw conflict('Every room is full and the room limit is reached', 'no_room_available');
          const base = last.key.replace(/-\d+$/, '');
          const n = (await d.repo.listByGame(g._id)).filter(r => r.key === base || r.key.startsWith(base + '-')).length + 1;
          room = await service.createRaw(g, { key: `${base}-${n}`.slice(0, 32), name: `${last.name.replace(/ \d+$/, '')} ${n}`.slice(0, 40), capacity: last.capacity, auto: true, overrides: last.overrides ?? {}, metadata: {}, deleteWhenEmptyMinutes: last.deleteWhenEmptyMinutes ?? null });
        }
      }
      // reserve the seat right away, so a burst of sessions does not all land in the same room
      if (playerId) await service.touch(g._id, room.key, [playerId]);
      return room;
    },

    /** Full game configuration as seen inside a room. */
    effectiveConfig(g: GameRec, room: RoomRec | null) {
      const base = d.games.resolveConfig(g);
      return applyOverrides(base, room?.overrides, base.chips);
    },
    /** The configuration sent to the game page for a room. */
    publicConfig(g: GameRec, room: RoomRec | null) {
      const pub = d.games.publicConfig(g);
      return applyOverrides(pub, room?.overrides, pub.chips);
    },
  };
  return service;
}
export type RoomService = ReturnType<typeof createRoomService>;
