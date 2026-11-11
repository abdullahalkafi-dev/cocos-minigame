import { Schema, model } from 'mongoose';
import type { Types } from 'mongoose';
import type { Snapshot } from './wheel.engine.js';

/**
 * One round of the shared clock. The outcome is drawn when the round is created but never sent to clients
 * before betting closes. `snapshot` freezes the rules (multipliers, layout, timing) the round was played with.
 */
export interface WheelRoundRec {
  _id: string;
  gameId: string;
  /** Room key inside the game ("main" when the game has no rooms). Every room has its own round clock. */
  roomId: string;
  no: number;
  startAt: number;
  betEnd: number;
  spinEnd: number;
  endAt: number;
  resultTarget: string;
  segment: number;
  extra: string[];
  snapshot: Snapshot;
  /** Where the coins of this round live. Fixed when the round starts, so bets and payouts always go to the same system. */
  walletMode?: 'demo' | 'managed' | 'seamless';
  settled: boolean;
  /** While a server is paying the round out, nobody else starts until this time. */
  leaseUntil?: number | null;
}
const roundSchema = new Schema({
  _id: String,
  gameId: { type: String, required: true },
  roomId: { type: String, default: 'main' },
  no: { type: Number, required: true },
  startAt: Number, betEnd: Number, spinEnd: Number, endAt: Number,
  resultTarget: String, segment: Number,
  extra: { type: [String], default: [] },
  snapshot: { type: Schema.Types.Mixed, required: true },
  walletMode: String,
  settled: { type: Boolean, default: false },
  leaseUntil: Number,
}, { versionKey: false });
roundSchema.index({ gameId: 1, roomId: 1, no: -1 }, { unique: true });
roundSchema.index({ settled: 1, spinEnd: 1 });
export const WheelRoundModel = model<WheelRoundRec>('WheelRound', roundSchema);

export interface WheelBetRec {
  _id: Types.ObjectId;
  gameId: string;
  roomId: string;
  roundId: string;
  playerId: string;
  target: string;
  amount: number;
  win: number;
  settled: boolean;
  createdAt: number;
}
const betSchema = new Schema({
  gameId: { type: String, required: true },
  roomId: { type: String, default: 'main' },
  roundId: { type: String, required: true },
  playerId: { type: String, required: true },
  target: String, amount: Number,
  win: { type: Number, default: 0 },
  settled: { type: Boolean, default: false },
  createdAt: Number,
}, { versionKey: false });
betSchema.index({ roundId: 1, playerId: 1 });
betSchema.index({ playerId: 1, _id: -1 });
betSchema.index({ gameId: 1, settled: 1, playerId: 1 });
export const WheelBetModel = model<WheelBetRec>('WheelBet', betSchema);
