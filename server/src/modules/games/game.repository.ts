import type { ClientSession } from 'mongoose';
import { GameModel, type GameRec } from './game.model.js';

export const gameRepository = {
  byId: (id: string) => GameModel.findById(id).lean<GameRec>().exec(),
  byOwnerAndId: (userId: string, id: string) => GameModel.findOne({ _id: id, userId }).lean<GameRec>().exec(),
  listByUser: (userId: string, order: 'newest' | 'oldest' = 'newest') =>
    GameModel.find({ userId }).sort({ createdAt: order === 'newest' ? -1 : 1 }).lean<GameRec[]>().exec(),
  countByOwnerAndSlug: (userId: string, slug: string, session?: ClientSession) => GameModel.countDocuments({ userId, slug }).session(session ?? null).exec(),
  async create(rec: GameRec, session?: ClientSession) { await GameModel.create([rec], { session }); },
  update: (id: string, set: Partial<GameRec>) => GameModel.updateOne({ _id: id }, { $set: set }).exec(),
};
export type GameRepository = typeof gameRepository;
