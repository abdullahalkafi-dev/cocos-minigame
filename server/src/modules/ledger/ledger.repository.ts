import type { ClientSession } from 'mongoose';
import { LedgerModel, type LedgerRec } from './ledger.model.js';

export const ledgerRepository = {
  async append(rec: LedgerRec, session: ClientSession) { await LedgerModel.create([rec], { session }); },
  byReference: (gameId: string, reference: string) => LedgerModel.findOne({ gameId, reference }).lean<LedgerRec & { _id: unknown }>().exec(),
  forPlayer: (playerId: string, limit = 50) => LedgerModel.find({ playerId }).sort({ _id: -1 }).limit(limit).lean<(LedgerRec & { _id: unknown })[]>().exec(),
};
export type LedgerRepository = typeof ledgerRepository;
