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
  /** Players may type their own name (demo, preview). Off by default: the client's server names the player. */
  guestLogin?: boolean;
  /** demo: starting balance + free refill. managed: balance only changes through the wallet API. */
  walletMode?: 'demo' | 'managed' | 'seamless';
  /** A test game only answers to the test API key (mgs_test_...), so test traffic never mixes with live statistics. */
  mode?: 'live' | 'test';
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
  guestLogin: { type: Boolean, default: false },
  walletMode: { type: String, default: 'demo' },
  mode: { type: String, default: 'live' },
  price: Number,
  createdAt: Number,
}, { versionKey: false, minimize: false });
export const GameModel = model<GameRec>('Game', gameSchema);
