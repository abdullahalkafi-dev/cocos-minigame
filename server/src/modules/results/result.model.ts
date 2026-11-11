import { Schema, model } from 'mongoose';

/** One player's result in one finished round. The dashboard's statistics and results table read these. */
export interface ResultRec {
  _id: string;
  gameId: string;
  playerId: string;
  slug: string;
  bet: number;
  win: number;
  outcome: { summary: string; round?: number; result?: string[] };
  isPreview: boolean;
  createdAt: number;
}

const resultSchema = new Schema({
  _id: String,
  gameId: { type: String, required: true },
  playerId: { type: String, required: true },
  slug: String,
  bet: Number,
  win: Number,
  outcome: { type: Schema.Types.Mixed, default: {} },
  isPreview: { type: Boolean, default: false },
  createdAt: Number,
}, { versionKey: false });
resultSchema.index({ gameId: 1, isPreview: 1, createdAt: -1 });
resultSchema.index({ playerId: 1 });
export const ResultModel = model<ResultRec>('Result', resultSchema);
