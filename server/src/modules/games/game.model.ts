import { Schema, model } from 'mongoose';

/**
 * A game a buyer purchased ("license" in older code). Its id is the public game ID (lic_...).
 * `config` holds only what the buyer customised; defaults come from the catalog.
 */
export interface GameRec {
  _id: string;
  userId: string;
  slug: string;
  name: string;
  config: Record<string, any>;
  allowedOrigins: string[];
  status: string;
  price: number;
  createdAt: number;
}

const gameSchema = new Schema({
  _id: String,
  userId: { type: String, required: true, index: true },
  slug: { type: String, required: true },
  name: { type: String, required: true },
  config: { type: Schema.Types.Mixed, default: {} },
  allowedOrigins: { type: [String], default: [] },
  status: { type: String, default: 'active' },
  price: Number,
  createdAt: Number,
}, { versionKey: false, minimize: false });
export const GameModel = model<GameRec>('Game', gameSchema);
