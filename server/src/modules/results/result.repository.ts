import type { ClientSession } from 'mongoose';
import { ResultModel, type ResultRec } from './result.model.js';

const real = (gameId: string) => ({ gameId, isPreview: false });

export type LeaderboardMetric = 'winnings' | 'wagered' | 'biggest_win' | 'net';
export interface LeaderRow { _id: string; won: number; wagered: number; biggestWin: number; rounds: number; net: number }
const FIELD: Record<LeaderboardMetric, keyof LeaderRow> = { winnings: 'won', wagered: 'wagered', biggest_win: 'biggestWin', net: 'net' };
const boardMatch = (gameId: string, o: { roomId?: string; since?: number }) =>
  ({ ...real(gameId), ...(o.roomId ? { roomId: o.roomId } : {}), ...(o.since ? { createdAt: { $gte: o.since } } : {}) });
const perPlayer = [
  { $group: { _id: '$playerId', won: { $sum: '$win' }, wagered: { $sum: '$bet' }, biggestWin: { $max: '$win' }, rounds: { $sum: 1 } } },
  { $addFields: { net: { $subtract: ['$won', '$wagered'] } } },
];

export const resultRepository = {
  async insertMany(recs: ResultRec[], session?: ClientSession) { if (recs.length) await ResultModel.insertMany(recs, { session }); },
  async existingIds(ids: string[], session?: ClientSession) {
    const rows = await ResultModel.find({ _id: { $in: ids } }).select('_id').session(session ?? null).lean<{ _id: string }[]>();
    return new Set(rows.map(r => r._id));
  },

  async totalsByGames(gameIds: string[]) {
    const rows = await ResultModel.aggregate<{ _id: string; rounds: number; bet: number; win: number }>([
      { $match: { gameId: { $in: gameIds }, isPreview: false } },
      { $group: { _id: '$gameId', rounds: { $sum: 1 }, bet: { $sum: '$bet' }, win: { $sum: '$win' } } },
    ]);
    return new Map(rows.map(r => [r._id, r]));
  },
  topWinners: (gameId: string, limit = 5) => ResultModel.aggregate<{ _id: string; win: number; rounds: number }>([
    { $match: real(gameId) }, { $group: { _id: '$playerId', win: { $sum: '$win' }, rounds: { $sum: 1 } } },
    { $match: { win: { $gt: 0 } } }, { $sort: { win: -1 } }, { $limit: limit },
  ]),
  async daily(gameId: string, days = 14) {
    const rows = await ResultModel.aggregate<{ _id: string; rounds: number; bet: number; win: number }>([
      { $match: real(gameId) },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$createdAt' } } }, rounds: { $sum: 1 }, bet: { $sum: '$bet' }, win: { $sum: '$win' } } },
      { $sort: { _id: -1 } }, { $limit: days },
    ]);
    return rows.reverse();
  },
  async perPlayer(gameId: string) {
    const rows = await ResultModel.aggregate<{ _id: string; rounds: number; bet: number; win: number }>([
      { $match: real(gameId) }, { $group: { _id: '$playerId', rounds: { $sum: 1 }, bet: { $sum: '$bet' }, win: { $sum: '$win' } } },
    ]);
    return new Map(rows.map(r => [r._id, r]));
  },
  /** Ranked players of a game (optionally one room, optionally since a time). */
  leaderboard(gameId: string, o: { roomId?: string; since?: number; metric: LeaderboardMetric; limit: number }) {
    return ResultModel.aggregate<LeaderRow>([
      { $match: boardMatch(gameId, o) }, ...perPlayer,
      { $sort: { [FIELD[o.metric]]: -1, wagered: -1, _id: 1 } }, { $limit: o.limit },
    ]);
  },
  /** One player's row and rank (1 = best), or null when they have no results in the period. */
  async rankOf(gameId: string, playerId: string, o: { roomId?: string; since?: number; metric: LeaderboardMetric }) {
    const field = FIELD[o.metric];
    const base = [{ $match: boardMatch(gameId, o) }, ...perPlayer];
    const mine = (await ResultModel.aggregate<LeaderRow>([...base, { $match: { _id: playerId } }]))[0];
    if (!mine) return null;
    const better = await ResultModel.aggregate<{ n: number }>([...base, { $match: { [field]: { $gt: mine[field] } } }, { $count: 'n' }]);
    return { row: mine, rank: (better[0]?.n ?? 0) + 1 };
  },
  list: (gameId: string, o: { limit: number; offset: number; playerId?: string }) =>
    ResultModel.find({ ...real(gameId), ...(o.playerId ? { playerId: o.playerId } : {}) })
      .sort({ createdAt: -1 }).skip(o.offset).limit(o.limit).lean<ResultRec[]>().exec(),
  all: (gameId: string) => ResultModel.find(real(gameId)).sort({ createdAt: -1 }).lean<ResultRec[]>().exec(),
};
export type ResultRepository = typeof resultRepository;
