import { Schema, model } from 'mongoose';

export type SeamlessOpType = 'credit' | 'rollback';

/**
 * A request to the client's wallet that must eventually succeed: paying a win ("credit") or undoing a stake whose
 * outcome we could not confirm ("rollback"). It is stored first and retried, so a client outage never loses coins.
 * The `_id` is the reference of the operation, so creating it twice is harmless.
 */
export interface SeamlessOpRec {
  _id: string;
  userId: string;
  gameId: string;
  /** The player's internal id and the id the client knows them by. */
  playerId: string;
  externalId: string;
  type: SeamlessOpType;
  amount: number;
  note?: string | null;
  status: 'pending' | 'done' | 'failed';
  attempts: number;
  nextAttemptAt: number;
  lastError?: string | null;
  createdAt: number;
  doneAt?: number | null;
}

const schema = new Schema({
  _id: String,
  userId: { type: String, required: true },
  gameId: { type: String, required: true },
  playerId: { type: String, required: true },
  externalId: { type: String, required: true },
  type: { type: String, required: true },
  amount: { type: Number, required: true },
  note: String,
  status: { type: String, default: 'pending' },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Number, required: true },
  lastError: String,
  createdAt: { type: Number, required: true },
  doneAt: Number,
}, { versionKey: false });
schema.index({ status: 1, nextAttemptAt: 1 });
schema.index({ userId: 1, createdAt: -1 });
export const SeamlessOpModel = model<SeamlessOpRec>('SeamlessOp', schema);
