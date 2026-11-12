import type { ClientSession } from 'mongoose';
import type { PlayerRepository } from '../players/player.repository.js';
import type { LedgerRepository } from './ledger.repository.js';
import type { LedgerKind } from './ledger.model.js';

export interface LedgerEntryInput {
  gameId: string;
  playerId: string;
  /** Positive adds coins, negative removes them. Whole numbers only. */
  delta: number;
  kind: LedgerKind;
  /** Optional idempotency key (unique per game). */
  reference?: string;
  note?: string;
  /** Bets and wins of a round: where and which round. */
  roomId?: string;
  round?: number;
}

/**
 * Every balance change goes through here, inside a transaction: the balance moves atomically and an
 * immutable entry records it. Money never changes anywhere else.
 */
export function createLedgerService(d: { players: PlayerRepository; repo: LedgerRepository }) {
  return {
    /** Returns the new balance, or null when a debit would take the balance below zero. */
    async post(e: LedgerEntryInput, session: ClientSession): Promise<{ balance: number; id: string } | null> {
      if (!Number.isSafeInteger(e.delta) || e.delta === 0) throw new Error('Ledger delta must be a non-zero whole number');
      const p = await d.players.adjustBalance(e.playerId, e.delta, session);
      if (!p) return null;
      const id = await d.repo.append({
        gameId: e.gameId, playerId: e.playerId, delta: e.delta, balanceAfter: p.balance, kind: e.kind,
        reference: e.reference ?? null, note: e.note ?? null, roomId: e.roomId ?? null, round: e.round ?? null, createdAt: Date.now(),
      }, session);
      return { balance: p.balance, id };
    },
    /**
     * Seamless wallet only: the client's system holds the money, so we do not change the balance, we record what it
     * told us (`balanceAfter` is the balance it reported) and mirror that balance on the player.
     */
    async record(e: LedgerEntryInput & { balanceAfter: number }, session: ClientSession): Promise<{ id: string }> {
      const id = await d.repo.append({
        gameId: e.gameId, playerId: e.playerId, delta: e.delta, balanceAfter: e.balanceAfter, kind: e.kind,
        reference: e.reference ?? null, note: e.note ?? null, roomId: e.roomId ?? null, round: e.round ?? null, createdAt: Date.now(),
      }, session);
      await d.players.setBalance(e.playerId, e.balanceAfter, session);
      return { id };
    },
    paidReferences: (gameId: string, refs: string[], session?: ClientSession) => d.repo.existingReferences(gameId, refs, session),
    history: (playerId: string, limit?: number, before?: string) => d.repo.forPlayer(playerId, limit, before),
    byReference: (gameId: string, reference: string) => d.repo.byReference(gameId, reference),
  };
}
export type LedgerService = ReturnType<typeof createLedgerService>;
