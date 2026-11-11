import { Schema, model } from 'mongoose';

export type WebhookStatus = 'pending' | 'delivered' | 'failed';

/** One notification to send to the buyer's server, kept until it is delivered (or given up on) so nothing is lost. */
export interface WebhookEventRec {
  _id: string;
  userId: string;
  gameId?: string | null;
  type: string;
  /** The exact JSON body that is sent. */
  payload: Record<string, unknown>;
  status: WebhookStatus;
  attempts: number;
  nextAttemptAt: number;
  lastStatus?: number | null;
  lastError?: string | null;
  createdAt: number;
  deliveredAt?: number | null;
}

const schema = new Schema({
  _id: String,
  userId: { type: String, required: true },
  gameId: String,
  type: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, required: true },
  status: { type: String, default: 'pending' },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Number, required: true },
  lastStatus: Number,
  lastError: String,
  createdAt: { type: Number, required: true },
  deliveredAt: Number,
}, { versionKey: false });
schema.index({ status: 1, nextAttemptAt: 1 });
schema.index({ userId: 1, createdAt: -1 });
export const WebhookEventModel = model<WebhookEventRec>('WebhookEvent', schema);
