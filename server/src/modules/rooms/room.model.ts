import { Schema, model } from 'mongoose';

/** The few game settings a room may change for itself (a beginner room with small chips, a VIP room with big ones...). */
export interface RoomOverrides {
  title?: string;
  /** Chip values, smallest first. The chip artwork of the game is reused by position. */
  chips?: number[];
  maxPerTarget?: number;
  timing?: { betSeconds?: number; spinSeconds?: number; resultSeconds?: number };
}

/**
 * A room is its own round clock, pot, history and ranking inside one game. A small table and a huge shared event
 * are the same thing with different capacity. Every game has an implicit room called "main".
 */
export interface RoomRec {
  _id: string;
  gameId: string;
  /** Short id the client uses ("vip", "table-3"). Unique inside the game. */
  key: string;
  name: string;
  /** Soft limit of players at the same time. null = unlimited. */
  capacity: number | null;
  /** Players asked for room "auto" are placed in auto rooms (first with space). */
  auto: boolean;
  overrides: RoomOverrides;
  createdAt: number;
}

const roomSchema = new Schema({
  _id: String,
  gameId: { type: String, required: true },
  key: { type: String, required: true },
  name: { type: String, required: true },
  capacity: { type: Number, default: null },
  auto: { type: Boolean, default: true },
  overrides: { type: Schema.Types.Mixed, default: {} },
  createdAt: Number,
}, { versionKey: false, minimize: false });
roomSchema.index({ gameId: 1, key: 1 }, { unique: true });
export const RoomModel = model<RoomRec>('Room', roomSchema);
