// The live side of the Lucky Wheel: who is connected to which room and what they should see right now.
//
// Instead of every player asking the server for the state once a second, the server keeps the state of each active room
// in memory and PUSHES it over WebSocket: one computation per room per second, then a small message per player.
// Only the things that really are per player (balance, own bets, own result) are added per socket.
//
// Memory state is a cache of the database, never the truth: a restarted server rebuilds a room from the stored round and
// bets. NOTE for scaling out: this hub lives inside one server process. With several processes, each one serves the players
// connected to it and learns about bets placed on another process only after the next round starts (see docs/architecture/realtime.md).
import type { WebSocket } from 'ws';
import type { Bus } from '../../infra/bus.js';
import type { GameRec } from '../games/game.model.js';
import type { GameService } from '../games/game.service.js';
import type { RoomRec } from '../rooms/room.model.js';
import type { RoomService } from '../rooms/room.service.js';
import { MAIN_ROOM } from '../../config/constants.js';
import { phaseOf } from './wheel.engine.js';
import type { WheelRoundRec } from './wheel.model.js';
import type { WheelRepository } from './wheel.repository.js';
import type { SettleInfo, WheelService } from './wheel.service.js';

export interface HubClient {
  ws: WebSocket;
  playerId: string;
  externalId: string;
  isPreview: boolean;
  balance: number;
  gameId: string;
  roomKey: string;
}

interface RoomRuntime {
  gameId: string;
  roomKey: string;
  clients: Set<HubClient>;
  game: GameRec | null;
  room: RoomRec | null;
  cfg: any;
  cfgAt: number;
  round: WheelRoundRec | null;
  pot: Record<string, number>;
  mine: Map<string, Record<string, number>>;
  history: { no: number; hits: string[] }[] | null;
  settle: SettleInfo | null;
  winnersJson: { real: string; preview: string };
  settling: boolean;
  busy: boolean;
  presenceAt: number;
  emptySince: number | null;
}

const MAX_BUFFERED = 512 * 1024;
const CFG_REFRESH_MS = 10_000;
const PRESENCE_EVERY_MS = 15_000;
const EMPTY_KEEP_MS = 120_000;

export function createWheelHub(d: { wheel: WheelService; games: GameService; rooms: RoomService; repo: WheelRepository; bus: Bus }) {
  const runtimes = new Map<string, RoomRuntime>();
  const byPlayer = new Map<string, Set<HubClient>>();
  const stats = { ticks: 0, lastTickMs: 0, maxTickMs: 0, sent: 0, skippedSlow: 0 };
  let timer: NodeJS.Timeout | null = null;
  const keyOf = (gameId: string, roomKey: string) => `${gameId}/${roomKey}`;

  const runtimeFor = (gameId: string, roomKey: string): RoomRuntime => {
    const k = keyOf(gameId, roomKey);
    let rt = runtimes.get(k);
    if (!rt) {
      rt = {
        gameId, roomKey, clients: new Set(), game: null, room: null, cfg: null, cfgAt: 0, round: null, pot: {}, mine: new Map(), history: null,
        settle: null, winnersJson: { real: 'null', preview: 'null' }, settling: false, busy: false, presenceAt: 0, emptySince: null,
      };
      runtimes.set(k, rt);
    }
    return rt;
  };

  const frame = (rt: RoomRuntime, now: number) => {
    const r = rt.round!;
    const phase = phaseOf(r, now);
    const shared = {
      serverTime: now,
      round: {
        no: r.no, phase, startAt: r.startAt, betEnd: r.betEnd, spinEnd: r.spinEnd, endAt: r.endAt,
        result: phase !== 'betting' ? { target: r.resultTarget, segment: r.segment, hits: [r.resultTarget, ...r.extra] } : null,
      },
      timing: r.snapshot.timing, pot: rt.pot, history: rt.history ?? [],
    };
    return JSON.stringify(shared).slice(1, -1);     // the members without the braces, ready to be wrapped per player
  };

  const sendTo = (rt: RoomRuntime, c: HubClient, sharedStr: string) => {
    if (c.ws.readyState !== 1) return;
    if (c.ws.bufferedAmount > MAX_BUFFERED) { stats.skippedSlow++; return; }   // a slow connection must not hold the room back
    const done = !!rt.settle;
    const mine = rt.mine.get(c.playerId);
    const winners = done ? (c.isPreview ? rt.winnersJson.preview : rt.winnersJson.real) : 'null';
    const my = done ? JSON.stringify(rt.settle!.perPlayer.get(c.playerId) ?? { bet: 0, win: 0 }) : 'null';
    c.ws.send(`{"t":"state",${sharedStr},"balance":${c.balance},"mine":${mine ? JSON.stringify(mine) : '{}'},"winners":${winners},"my":${my}}`);
    stats.sent++;
  };

  const pushRoom = (rt: RoomRuntime) => {
    if (!rt.round || !rt.clients.size) return;
    const s = frame(rt, Date.now());
    for (const c of rt.clients) sendTo(rt, c, s);
  };
  const pushClient = (rt: RoomRuntime, c: HubClient) => { if (rt.round) sendTo(rt, c, frame(rt, Date.now())); };

  /** Brings a room's memory up to date with the database. Returns false when the room cannot be served (game gone, room closed). */
  async function refresh(rt: RoomRuntime, now: number): Promise<boolean> {
    try {
      if (!rt.game || now - rt.cfgAt > CFG_REFRESH_MS) {
        rt.game = await d.games.get(rt.gameId);
        if (!rt.game || rt.game.status !== 'active') { for (const c of rt.clients) c.ws.close(4003, 'game not active'); return false; }
        rt.room = rt.roomKey === MAIN_ROOM ? await d.rooms.main(rt.game) : await d.rooms.get(rt.game, rt.roomKey);
        if (!rt.room) { for (const c of rt.clients) c.ws.close(4004, 'room closed'); return false; }
        rt.cfg = d.rooms.effectiveConfig(rt.game, rt.room);
        rt.cfgAt = now;
      }
      const round = await d.wheel.currentRound(rt.game, rt.room!, rt.cfg, now);
      if (!rt.round || rt.round._id !== round._id) {          // a new round (or the first look after a restart)
        rt.round = round; rt.settle = null; rt.winnersJson = { real: 'null', preview: 'null' };
        rt.pot = await d.repo.potByTarget(round._id);
        rt.mine = await d.repo.betsByPlayer(round._id);
        rt.history = await d.wheel.history(rt.gameId, rt.roomKey);
      }
      if (now >= round.spinEnd && !rt.settle) {
        const fresh = await d.repo.roundById(round._id);
        if (fresh?.settled) {                                   // paid already (by this server's worker or another one)
          rt.settle = await d.wheel.settleInfoFor(round); rt.history = await d.wheel.history(rt.gameId, rt.roomKey);
          rt.winnersJson = { real: JSON.stringify(rt.settle.winners.real), preview: JSON.stringify(rt.settle.winners.preview) };
        } else if (!rt.settling) {
          rt.settling = true;
          void d.wheel.settleDue(now, { gameId: rt.gameId, roomId: rt.roomKey }).finally(() => { rt.settling = false; });
        }
      }
      if (now - rt.presenceAt > PRESENCE_EVERY_MS) {
        rt.presenceAt = now;
        void d.rooms.touch(rt.gameId, rt.roomKey, [...rt.clients].map(c => c.playerId));
      }
      return true;
    } catch (e) { console.error('hub refresh', rt.gameId, rt.roomKey, e); return false; }
  }

  /** One heartbeat of a room: update the memory, then send the picture to everybody in it. */
  async function tick(rt: RoomRuntime, now: number) {
    if (rt.busy) return;
    rt.busy = true;
    try { if (await refresh(rt, now)) pushRoom(rt); } finally { rt.busy = false; }
  }

  const hub = {
    stats: () => ({ rooms: runtimes.size, clients: [...runtimes.values()].reduce((a, r) => a + r.clients.size, 0), ...stats }),

    start() {
      if (timer) return;
      d.bus.on('balance', (pid, balance) => hub.setBalance(pid, balance));
      timer = setInterval(async () => {
        const t0 = process.hrtime.bigint(), now = Date.now();
        const live: RoomRuntime[] = [];
        for (const [k, rt] of runtimes) {
          if (rt.clients.size) { rt.emptySince = null; live.push(rt); }
          else if ((rt.emptySince ??= now) < now - EMPTY_KEEP_MS) runtimes.delete(k);
        }
        await Promise.all(live.map(rt => tick(rt, now)));
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        stats.ticks++; stats.lastTickMs = Math.round(ms * 10) / 10; stats.maxTickMs = Math.max(stats.maxTickMs, ms);
      }, 1000);
      timer.unref();
    },
    stop() { if (timer) clearInterval(timer); timer = null; for (const rt of runtimes.values()) for (const c of rt.clients) c.ws.close(1001, 'server stopping'); runtimes.clear(); byPlayer.clear(); },

    /** A player connected. Their room is loaded if needed and they get the first picture immediately. */
    async join(c: HubClient) {
      const rt = runtimeFor(c.gameId, c.roomKey);
      rt.clients.add(c);
      const set = byPlayer.get(c.playerId) ?? new Set<HubClient>(); set.add(c); byPlayer.set(c.playerId, set);
      // Only the newcomer needs a picture now. Re-sending to the whole room for every join would cost N x N messages in a rush.
      if (!rt.round) {
        if (rt.busy) { for (let i = 0; i < 50 && !rt.round; i++) await new Promise(r => setTimeout(r, 40)); }
        else { rt.busy = true; try { await refresh(rt, Date.now()); } finally { rt.busy = false; } }
      }
      pushClient(rt, c);
    },
    leave(c: HubClient) {
      runtimes.get(keyOf(c.gameId, c.roomKey))?.clients.delete(c);
      const set = byPlayer.get(c.playerId); set?.delete(c); if (set && !set.size) byPlayer.delete(c.playerId);
    },
    socketsOf: (playerId: string) => byPlayer.get(playerId)?.size ?? 0,
    /** The oldest connection of a player (used to keep at most a few per player). */
    oldestOf: (playerId: string) => byPlayer.get(playerId)?.values().next().value as HubClient | undefined,

    /** A bet was stored: update the pot and the player's own bets and show it at once. */
    onBet(gameId: string, roomKey: string, playerId: string, add: Map<string, number>, balance: number) {
      const rt = runtimes.get(keyOf(gameId, roomKey));
      if (rt) {
        const mine = rt.mine.get(playerId) ?? {};
        for (const [t, a] of add) { rt.pot[t] = (rt.pot[t] ?? 0) + a; mine[t] = (mine[t] ?? 0) + a; }
        rt.mine.set(playerId, mine);
      }
      hub.setBalance(playerId, balance);
    },

    /** A round was paid out: everybody learns who won, without waiting for the next tick. */
    onSettled(round: WheelRoundRec, info: SettleInfo) {
      const rt = runtimes.get(keyOf(round.gameId, round.roomId));
      if (!rt || !rt.round || rt.round._id !== round._id) return;
      rt.settle = info;
      rt.winnersJson = { real: JSON.stringify(info.winners.real), preview: JSON.stringify(info.winners.preview) };
      void d.wheel.history(rt.gameId, rt.roomKey).then(h => { rt.history = h; pushRoom(rt); });
    },

    /** A balance changed (bet, win, wallet API, refill): show it to the player's open connections straight away. */
    setBalance(playerId: string, balance: number, push = true) {
      const set = byPlayer.get(playerId);
      if (!set) return;
      for (const c of set) {
        c.balance = balance;
        if (!push) continue;
        const rt = runtimes.get(keyOf(c.gameId, c.roomKey));
        if (rt) pushClient(rt, c);
      }
    },
    pushTo(c: HubClient) { const rt = runtimes.get(keyOf(c.gameId, c.roomKey)); if (rt) pushClient(rt, c); },
  };
  return hub;
}
export type WheelHub = ReturnType<typeof createWheelHub>;
