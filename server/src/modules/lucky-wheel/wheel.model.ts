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
  no: number;
  startAt: number;
  betEnd: number;
  spinEnd: number;
  endAt: number;
  resultTarget: string;
  segment: number;
  extra: string[];
  snapshot: Snapshot;
  settled: boolean;
}
const roundSchema = new Schema({
  _id: String,
  gameId: { type: String, required: true },
  no: { type: Number, required: true },
  startAt: Number, betEnd: Number, spinEnd: Number, endAt: Number,
  resultTarget: String, segment: Number,
  extra: { type: [String], default: [] },
  snapshot: { type: Schema.Types.Mixed, required: true },
  settled: { type: Boolean, default: false },
}, { versionKey: false });
roundSchema.index({ gameId: 1, no: -1 }, { unique: true });
roundSchema.index({ settled: 1, spinEnd: 1 });
export const WheelRoundModel = model<WheelRoundRec>('WheelRound', roundSchema);

export interface WheelBetRec {
  _id: Types.ObjectId;
  gameId: string;
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
