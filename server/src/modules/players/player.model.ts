import { Schema, model } from 'mongoose';

/**
 * An end player inside ONE game. `externalId` is the identifier the client's own system uses for this person
 * (or the username they typed in guest mode). The client owns identity; we only trust it per game.
 */
export interface PlayerRec {
  _id: string;
  gameId: string;
  externalId: string;
  displayName: string;
  avatarUrl?: string | null;
  balance: number;
  /** Created from the dashboard preview; hidden from stats and rankings of real players. */
  isPreview: boolean;
  createdAt: number;
  lastSeen: number;
}

const playerSchema = new Schema({
  _id: String,
  gameId: { type: String, required: true },
  externalId: { type: String, required: true },
  displayName: { type: String, required: true },
  avatarUrl: String,
  balance: { type: Number, default: 0 },
  isPreview: { type: Boolean, default: false },
  createdAt: Number,
  lastSeen: Number,
}, { versionKey: false });
playerSchema.index({ gameId: 1, externalId: 1 }, { unique: true });
playerSchema.index({ gameId: 1, lastSeen: -1 });
export const PlayerModel = model<PlayerRec>('Player', playerSchema);
