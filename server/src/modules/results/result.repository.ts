import type { ClientSession } from 'mongoose';
import { ResultModel, type ResultRec } from './result.model.js';

const real = (gameId: string) => ({ gameId, isPreview: false });

export const resultRepository = {
  async insertMany(recs: ResultRec[], session?: ClientSession) { if (recs.length) await ResultModel.insertMany(recs, { session }); },

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
  list: (gameId: string, o: { limit: number; offset: number; playerId?: string }) =>
    ResultModel.find({ ...real(gameId), ...(o.playerId ? { playerId: o.playerId } : {}) })
      .sort({ createdAt: -1 }).skip(o.offset).limit(o.limit).lean<ResultRec[]>().exec(),
  all: (gameId: string) => ResultModel.find(real(gameId)).sort({ createdAt: -1 }).lean<ResultRec[]>().exec(),
};
export type ResultRepository = typeof resultRepository;
