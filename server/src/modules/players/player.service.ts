import { rid } from '../../common/utils/crypto.js';
import { inTransaction, isDuplicateKey } from '../../infra/mongo.js';
import type { LedgerService } from '../ledger/ledger.service.js';
import type { PlayerRepository } from './player.repository.js';
import type { PlayerRec } from './player.model.js';

/** What the game client sees of a player. `username` is the name shown on screen. */
export const playerView = (p: PlayerRec) => ({ id: p._id, username: p.displayName, playerId: p.externalId, balance: p.balance });

export interface NewPlayerOptions { preview: boolean; startingBalance: number; displayName?: string; avatarUrl?: string }

export function createPlayerService(d: { repo: PlayerRepository; ledger: LedgerService }) {
  return {
    byId: (id: string) => d.repo.byId(id),
    byIds: (ids: string[]) => d.repo.byIds(ids),
    byExternal: (gameId: string, externalId: string) => d.repo.byExternal(gameId, externalId),
    touch: (p: PlayerRec, now: number) => d.repo.touch(p._id, now),

    /** Finds the player with this external id in the game, or creates it (with the starting balance, recorded in the ledger). */
    async getOrCreate(gameId: string, externalId: string, o: NewPlayerOptions): Promise<PlayerRec> {
      const now = Date.now();
      const existing = await d.repo.byExternal(gameId, externalId);
      if (existing) {
        // the client's system is the source of truth for the name and picture: keep ours in step
        const set: { displayName?: string; avatarUrl?: string } = {};
        if (o.displayName && o.displayName !== existing.displayName) set.displayName = o.displayName;
        if (o.avatarUrl && o.avatarUrl !== existing.avatarUrl) set.avatarUrl = o.avatarUrl;
        if (Object.keys(set).length) await d.repo.setProfile(existing._id, set);
        await d.repo.touch(existing._id, now);
        return { ...existing, ...set, lastSeen: now };
      }
      const rec: PlayerRec = {
        _id: rid('ply_', 8), gameId, externalId, displayName: o.displayName ?? externalId, avatarUrl: o.avatarUrl ?? null,
        balance: 0, isPreview: o.preview, createdAt: now, lastSeen: now,
      };
      try {
        await inTransaction(async s => {
          await d.repo.create(rec, s);
          if (o.startingBalance > 0) await d.ledger.post({ gameId, playerId: rec._id, delta: o.startingBalance, kind: 'starting', note: 'Starting balance' }, s);
        });
      } catch (e) {
        if (isDuplicateKey(e)) return (await d.repo.byExternal(gameId, externalId))!;   // two requests created it at once
        throw e;
      }
      return (await d.repo.byId(rec._id))!;
    },

    /** Seamless wallet: keeps our copy of the balance in step with the client's system. */
    syncBalance: (p: PlayerRec, balance: number) => d.repo.setBalance(p._id, balance),

    /** Demo mode only: tops a broke player back up to the starting balance. */
    async refill(p: PlayerRec, startingBalance: number) {
      const delta = startingBalance - p.balance;
      if (delta <= 0) return p.balance;
      const r = await inTransaction(s => d.ledger.post({ gameId: p.gameId, playerId: p._id, delta, kind: 'refill', note: 'Free refill' }, s));
      return r?.balance ?? p.balance;
    },
  };
}
export type PlayerService = ReturnType<typeof createPlayerService>;
