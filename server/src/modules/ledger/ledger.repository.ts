import type { ClientSession } from 'mongoose';
import { LedgerModel, type LedgerRec } from './ledger.model.js';

export const ledgerRepository = {
  /** Returns the id of the new entry. */
  async append(rec: LedgerRec, session: ClientSession) { const [doc] = await LedgerModel.create([rec], { session }); return String(doc._id); },
  byReference: (gameId: string, reference: string) => LedgerModel.findOne({ gameId, reference }).lean<LedgerRec & { _id: unknown }>().exec(),
  /** Which of these references already exist (used to resume an interrupted payout without paying twice). */
  async existingReferences(gameId: string, refs: string[], session?: ClientSession) {
    if (!refs.length) return new Set<string>();
    const rows = await LedgerModel.find({ gameId, reference: { $in: refs } }).select('reference').session(session ?? null).lean<{ reference: string }[]>();
    return new Set(rows.map(r => r.reference));
  },
  forPlayer: (playerId: string, limit = 50, before?: string) =>
    LedgerModel.find({ playerId, ...(before ? { _id: { $lt: before } } : {}) }).sort({ _id: -1 }).limit(limit).lean<(LedgerRec & { _id: unknown })[]>().exec(),
};
export type LedgerRepository = typeof ledgerRepository;
