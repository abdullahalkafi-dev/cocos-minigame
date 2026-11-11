import type { ClientSession } from 'mongoose';
import { WheelBetModel, WheelRoundModel, type WheelBetRec, type WheelRoundRec } from './wheel.model.js';

const agg = <T>(p: any[]) => (WheelBetModel.aggregate<T>(p) as unknown) as Promise<T[]>;
const notLeased = (now: number) => ({ $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: null }, { leaseUntil: { $lt: now } }] });

export const wheelRepository = {
  lastRound: (gameId: string, roomId: string) => WheelRoundModel.findOne({ gameId, roomId }).sort({ no: -1 }).lean<WheelRoundRec>().exec(),
  roundById: (id: string) => WheelRoundModel.findById(id).lean<WheelRoundRec>().exec(),
  roundsByIds: (ids: string[]) => WheelRoundModel.find({ _id: { $in: ids } }).lean<WheelRoundRec[]>().exec(),
  /** False when another request created the same round number first. */
  async insertRound(rec: WheelRoundRec) {
    try { await WheelRoundModel.create(rec); return true; } catch (e: any) { if (e?.code === 11000) return false; throw e; }
  },
  /** Finished rounds nobody is paying right now. `where` narrows it to one room. */
  dueRounds: (now: number, where: { gameId?: string; roomId?: string } = {}, limit = 200) =>
    WheelRoundModel.find({ settled: false, spinEnd: { $lte: now }, ...where, ...notLeased(now) }).limit(limit).lean<WheelRoundRec[]>().exec(),
  /** Reserves a round for payout. Only one server at a time gets it; if that server dies the lease runs out and another takes over. */
  lease: (id: string, now: number, ms: number) =>
    WheelRoundModel.findOneAndUpdate({ _id: id, settled: false, ...notLeased(now) }, { $set: { leaseUntil: now + ms } }, { new: true }).lean<WheelRoundRec>().exec(),
  async finalize(id: string) { await WheelRoundModel.updateOne({ _id: id }, { $set: { settled: true, leaseUntil: null } }); },
  history: (gameId: string, roomId: string, n = 48) => WheelRoundModel.find({ gameId, roomId, settled: true }).sort({ no: -1 }).limit(n).lean<WheelRoundRec[]>().exec(),

  betsOfRound: (roundId: string, session?: ClientSession) => WheelBetModel.find({ roundId }).session(session ?? null).lean<WheelBetRec[]>().exec(),
  async insertBets(recs: Omit<WheelBetRec, '_id'>[], session: ClientSession) { await WheelBetModel.create(recs, { session, ordered: true }); },
  async markBets(updates: { id: unknown; win: number }[], session: ClientSession) {
    if (!updates.length) return;
    await WheelBetModel.bulkWrite(updates.map(u => ({ updateOne: { filter: { _id: u.id }, update: { $set: { win: u.win, settled: true } } } })), { session });
  },
  async sumFor(roundId: string, playerId: string, target: string, session?: ClientSession) {
    const q = WheelBetModel.aggregate<{ s: number }>([{ $match: { roundId, playerId, target } }, { $group: { _id: null, s: { $sum: '$amount' } } }]);
    const r = await (session ? q.session(session) : q);
    return r[0]?.s ?? 0;
  },

  async potByTarget(roundId: string) {
    const rows = await agg<{ _id: string; s: number }>([{ $match: { roundId } }, { $group: { _id: '$target', s: { $sum: '$amount' } } }]);
    return Object.fromEntries(rows.map(r => [r._id, r.s])) as Record<string, number>;
  },
  /** Every player's bets of a round: used to rebuild the live state after a restart. */
  async betsByPlayer(roundId: string) {
    const rows = await agg<{ _id: { p: string; t: string }; s: number }>([{ $match: { roundId } }, { $group: { _id: { p: '$playerId', t: '$target' }, s: { $sum: '$amount' } } }]);
    const out = new Map<string, Record<string, number>>();
    for (const r of rows) { const m = out.get(r._id.p) ?? {}; m[r._id.t] = r.s; out.set(r._id.p, m); }
    return out;
  },
  async mineByTarget(roundId: string, playerId: string) {
    const rows = await agg<{ _id: string; s: number }>([{ $match: { roundId, playerId } }, { $group: { _id: '$target', s: { $sum: '$amount' } } }]);
    return Object.fromEntries(rows.map(r => [r._id, r.s])) as Record<string, number>;
  },
  async playerRoundTotals(roundId: string, playerId: string) {
    const r = await agg<{ bet: number; win: number }>([{ $match: { roundId, playerId } }, { $group: { _id: null, bet: { $sum: '$amount' }, win: { $sum: '$win' } } }]);
    return { bet: r[0]?.bet ?? 0, win: r[0]?.win ?? 0 };
  },
  /** Everyone's bet and win in a round (used to rebuild the winners list). */
  totalsByPlayer: (roundId: string) => agg<{ _id: string; bet: number; win: number }>([
    { $match: { roundId } }, { $group: { _id: '$playerId', bet: { $sum: '$amount' }, win: { $sum: '$win' } } },
  ]),
  myBets: (playerId: string, limit = 30) => WheelBetModel.find({ playerId, settled: true }).sort({ _id: -1 }).limit(limit).lean<WheelBetRec[]>().exec(),
  /** Total won / bet per player over all settled rounds of a room. */
  rankingRows: (gameId: string, roomId: string) => agg<{ _id: string; win: number; bet: number }>([
    { $match: { gameId, roomId, settled: true } }, { $group: { _id: '$playerId', win: { $sum: '$win' }, bet: { $sum: '$amount' } } },
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
