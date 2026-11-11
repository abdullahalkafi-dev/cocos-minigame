import { RoomModel, type RoomRec } from './room.model.js';

export const roomRepository = {
  byKey: (gameId: string, key: string) => RoomModel.findOne({ gameId, key }).lean<RoomRec>().exec(),
  listByGame: (gameId: string) => RoomModel.find({ gameId }).sort({ createdAt: 1 }).lean<RoomRec[]>().exec(),
  count: (gameId: string) => RoomModel.countDocuments({ gameId }).exec(),
  /** False when a room with that key already exists (two requests created it at once). */
  async create(rec: RoomRec) {
    try { await RoomModel.create(rec); return true; } catch (e: any) { if (e?.code === 11000) return false; throw e; }
  },
  update: (gameId: string, key: string, set: Partial<RoomRec>) => RoomModel.updateOne({ gameId, key }, { $set: set }).exec(),
  remove: (gameId: string, key: string) => RoomModel.deleteOne({ gameId, key }).exec(),
};
export type RoomRepository = typeof roomRepository;
