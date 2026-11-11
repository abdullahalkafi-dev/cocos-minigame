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
}

/**
 * Every balance change goes through here, inside a transaction: the balance moves atomically and an
 * immutable entry records it. Money never changes anywhere else.
 */
export function createLedgerService(d: { players: PlayerRepository; repo: LedgerRepository }) {
  return {
    /** Returns the new balance, or null when a debit would take the balance below zero. */
    async post(e: LedgerEntryInput, session: ClientSession): Promise<{ balance: number } | null> {
      if (!Number.isSafeInteger(e.delta) || e.delta === 0) throw new Error('Ledger delta must be a non-zero whole number');
      const p = await d.players.adjustBalance(e.playerId, e.delta, session);
      if (!p) return null;
      await d.repo.append({
        gameId: e.gameId, playerId: e.playerId, delta: e.delta, balanceAfter: p.balance, kind: e.kind,
        reference: e.reference ?? null, note: e.note ?? null, createdAt: Date.now(),
      }, session);
      return { balance: p.balance };
    },
    history: (playerId: string, limit?: number) => d.repo.forPlayer(playerId, limit),
  };
}
export type LedgerService = ReturnType<typeof createLedgerService>;
