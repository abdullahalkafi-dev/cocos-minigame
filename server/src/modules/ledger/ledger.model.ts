import { Schema, model } from 'mongoose';

export type LedgerKind = 'starting' | 'refill' | 'bet' | 'win' | 'credit' | 'debit';

/**
 * Immutable record of every balance change of a player. `balanceAfter` makes the history verifiable:
 * a player's balance always equals the balanceAfter of their latest entry.
 * `reference` is an optional idempotency key, unique per game.
 */
export interface LedgerRec {
  gameId: string;
  playerId: string;
  delta: number;
  balanceAfter: number;
  kind: LedgerKind;
  reference?: string | null;
  note?: string | null;
  createdAt: number;
}

const ledgerSchema = new Schema({
  gameId: { type: String, required: true },
  playerId: { type: String, required: true },
  delta: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  kind: { type: String, required: true },
  reference: String,
  note: String,
  createdAt: { type: Number, required: true },
}, { versionKey: false });
ledgerSchema.index({ playerId: 1, _id: -1 });
ledgerSchema.index({ gameId: 1, reference: 1 }, { unique: true, partialFilterExpression: { reference: { $type: 'string' } } });
export const LedgerModel = model<LedgerRec>('Ledger', ledgerSchema);
