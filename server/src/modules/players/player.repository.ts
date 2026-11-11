import type { ClientSession } from 'mongoose';
import { PlayerModel, type PlayerRec } from './player.model.js';

export const playerRepository = {
  byId: (id: string) => PlayerModel.findById(id).lean<PlayerRec>().exec(),
  byIds: (ids: string[]) => PlayerModel.find({ _id: { $in: ids } }).lean<PlayerRec[]>().exec(),
  byExternal: (gameId: string, externalId: string) => PlayerModel.findOne({ gameId, externalId }).lean<PlayerRec>().exec(),
  async create(rec: PlayerRec, session?: ClientSession) { await PlayerModel.create([rec], { session }); },
  touch: (id: string, now: number) => PlayerModel.updateOne({ _id: id }, { $set: { lastSeen: now } }).exec(),
  /**
   * The only place a balance changes. Adds `delta` atomically; a negative delta returns null instead of
   * going below zero. Always call it through the ledger service so the change is recorded.
   */
  adjustBalance(id: string, delta: number, session?: ClientSession) {
    const filter: Record<string, unknown> = { _id: id };
    if (delta < 0) filter.balance = { $gte: -delta };
    return PlayerModel.findOneAndUpdate(filter, { $inc: { balance: delta } }, { new: true, session }).lean<PlayerRec>().exec();
  },
  listByGame: (gameId: string, limit = 500) =>
    PlayerModel.find({ gameId, isPreview: false }).sort({ lastSeen: -1 }).limit(limit).lean<PlayerRec[]>().exec(),
  /** Number of real (non-preview) players per game. */
  async countByGames(gameIds: string[]) {
    const rows = await PlayerModel.aggregate<{ _id: string; n: number }>([
      { $match: { gameId: { $in: gameIds }, isPreview: false } }, { $group: { _id: '$gameId', n: { $sum: 1 } } },
    ]);
    return new Map(rows.map(r => [r._id, r.n]));
  },
};
export type PlayerRepository = typeof playerRepository;
