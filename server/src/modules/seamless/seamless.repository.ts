import type { ClientSession } from 'mongoose';
import { SeamlessOpModel, type SeamlessOpRec } from './seamless.model.js';

export const seamlessRepository = {
  /** Creates the operation; an existing one with the same reference is left alone. */
  async create(rec: SeamlessOpRec, session?: ClientSession) {
    try { await SeamlessOpModel.create([rec], { session }); } catch (e: any) { if (e?.code !== 11000) throw e; }
  },
  /** Which of these references already exist (a payout run again must not try to create them twice). */
  async existingIds(ids: string[], session?: ClientSession) {
    if (!ids.length) return new Set<string>();
    const rows = await SeamlessOpModel.find({ _id: { $in: ids } }).select('_id').session(session ?? null).lean<{ _id: string }[]>();
    return new Set(rows.map(r => r._id));
  },
  byId: (id: string) => SeamlessOpModel.findById(id).lean<SeamlessOpRec>().exec(),
  recent: (userId: string, limit = 30) => SeamlessOpModel.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean<SeamlessOpRec[]>().exec(),
  dueIds: (now: number, limit = 50) => SeamlessOpModel.find({ status: 'pending', nextAttemptAt: { $lte: now } }).sort({ nextAttemptAt: 1 }).limit(limit).select('_id').lean<{ _id: string }[]>().exec(),
  lease: (id: string, now: number, ms: number) =>
    SeamlessOpModel.findOneAndUpdate({ _id: id, status: 'pending', nextAttemptAt: { $lte: now } }, { $set: { nextAttemptAt: now + ms } }, { new: true }).lean<SeamlessOpRec>().exec(),
  update: (id: string, set: Partial<SeamlessOpRec>) => SeamlessOpModel.updateOne({ _id: id }, { $set: set }).exec(),
};
export type SeamlessRepository = typeof seamlessRepository;
