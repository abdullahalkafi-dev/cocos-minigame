import type { ClientSession } from 'mongoose';
import { WheelBetModel, WheelRoundModel, type WheelBetRec, type WheelRoundRec } from './wheel.model.js';

const agg = <T>(p: any[]) => (WheelBetModel.aggregate<T>(p) as unknown) as Promise<T[]>;

export const wheelRepository = {
  lastRound: (gameId: string) => WheelRoundModel.findOne({ gameId }).sort({ no: -1 }).lean<WheelRoundRec>().exec(),
  roundById: (id: string) => WheelRoundModel.findById(id).lean<WheelRoundRec>().exec(),
  roundsByIds: (ids: string[]) => WheelRoundModel.find({ _id: { $in: ids } }).lean<WheelRoundRec[]>().exec(),
  /** False when another request created the same round number first. */
  async insertRound(rec: WheelRoundRec) {
    try { await WheelRoundModel.create(rec); return true; } catch (e: any) { if (e?.code === 11000) return false; throw e; }
  },
  dueRounds: (gameId: string | null, now: number) =>
    WheelRoundModel.find({ settled: false, spinEnd: { $lte: now }, ...(gameId ? { gameId } : {}) }).limit(200).lean<WheelRoundRec[]>().exec(),
  /** Marks the round as paid. Only one caller can win, which is what makes settlement exactly-once. */
  async claim(id: string, session: ClientSession) {
    const r = await WheelRoundModel.updateOne({ _id: id, settled: false }, { $set: { settled: true } }, { session });
    return r.modifiedCount === 1;
  },
  history: (gameId: string, n = 48) => WheelRoundModel.find({ gameId, settled: true }).sort({ no: -1 }).limit(n).lean<WheelRoundRec[]>().exec(),

  betsOfRound: (roundId: string, session?: ClientSession) => WheelBetModel.find({ roundId }).session(session ?? null).lean<WheelBetRec[]>().exec(),
  async insertBets(recs: Omit<WheelBetRec, '_id'>[], session: ClientSession) { await WheelBetModel.create(recs, { session, ordered: true }); },
  async markBets(updates: { id: unknown; win: number }[], session: ClientSession) {
    if (!updates.length) return;
    await WheelBetModel.bulkWrite(updates.map(u => ({ updateOne: { filter: { _id: u.id }, update: { $set: { win: u.win, settled: true } } } })), { session });
  },
  async sumFor(roundId: string, playerId: string, target: string, session: ClientSession) {
    const r = await WheelBetModel.aggregate<{ s: number }>([{ $match: { roundId, playerId, target } }, { $group: { _id: null, s: { $sum: '$amount' } } }]).session(session);
    return r[0]?.s ?? 0;
  },

  async potByTarget(roundId: string) {
    const rows = await agg<{ _id: string; s: number }>([{ $match: { roundId } }, { $group: { _id: '$target', s: { $sum: '$amount' } } }]);
    return Object.fromEntries(rows.map(r => [r._id, r.s])) as Record<string, number>;
  },
  async mineByTarget(roundId: string, playerId: string) {
    const rows = await agg<{ _id: string; s: number }>([{ $match: { roundId, playerId } }, { $group: { _id: '$target', s: { $sum: '$amount' } } }]);
    return Object.fromEntries(rows.map(r => [r._id, r.s])) as Record<string, number>;
  },
  async playerRoundTotals(roundId: string, playerId: string) {
    const r = await agg<{ bet: number; win: number }>([{ $match: { roundId, playerId } }, { $group: { _id: null, bet: { $sum: '$amount' }, win: { $sum: '$win' } } }]);
    return { bet: r[0]?.bet ?? 0, win: r[0]?.win ?? 0 };
  },
  /** Everyone who won in a round, biggest first. */
  winnersOfRound: (roundId: string) => agg<{ _id: string; bet: number; win: number }>([
    { $match: { roundId } }, { $group: { _id: '$playerId', bet: { $sum: '$amount' }, win: { $sum: '$win' } } },
    { $match: { win: { $gt: 0 } } }, { $sort: { win: -1 } },
  ]),
  myBets: (playerId: string, limit = 30) => WheelBetModel.find({ playerId, settled: true }).sort({ _id: -1 }).limit(limit).lean<WheelBetRec[]>().exec(),
  /** Total won / bet per player over all settled rounds of a game. */
  rankingRows: (gameId: string) => agg<{ _id: string; win: number; bet: number }>([
    { $match: { gameId, settled: true } }, { $group: { _id: '$playerId', win: { $sum: '$win' }, bet: { $sum: '$amount' } } },
  ]),

  /** Drops old settled rounds that nobody bet on (history only needs recent rounds). */
  async pruneIdle(before: number) {
    const old = await WheelRoundModel.find({ settled: true, spinEnd: { $lt: before } }).select('_id').limit(5000).lean<{ _id: string }[]>();
    if (!old.length) return 0;
    const ids = old.map(r => r._id);
    const used = new Set(await WheelBetModel.distinct('roundId', { roundId: { $in: ids } }));
    const idle = ids.filter(id => !used.has(id));
    if (idle.length) await WheelRoundModel.deleteMany({ _id: { $in: idle } });
    return idle.length;
  },
};
export type WheelRepository = typeof wheelRepository;
