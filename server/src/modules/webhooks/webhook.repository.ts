import type { ClientSession } from 'mongoose';
import { WebhookEventModel, type WebhookEventRec } from './webhook.model.js';

export const webhookRepository = {
  async create(rec: WebhookEventRec, session?: ClientSession) { await WebhookEventModel.create([rec], { session }); },
  byId: (id: string) => WebhookEventModel.findById(id).lean<WebhookEventRec>().exec(),
  recent: (userId: string, limit = 30) => WebhookEventModel.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean<WebhookEventRec[]>().exec(),
  dueIds: (now: number, limit = 20) => WebhookEventModel.find({ status: 'pending', nextAttemptAt: { $lte: now } }).sort({ nextAttemptAt: 1 }).limit(limit).select('_id').lean<{ _id: string }[]>().exec(),
  /** Reserves an event for one delivery attempt: only one server can take it, and it is retried later if that server dies. */
  lease: (id: string, now: number, leaseMs: number) =>
    WebhookEventModel.findOneAndUpdate({ _id: id, status: 'pending', nextAttemptAt: { $lte: now } }, { $set: { nextAttemptAt: now + leaseMs } }, { new: true }).lean<WebhookEventRec>().exec(),
  update: (id: string, set: Partial<WebhookEventRec>) => WebhookEventModel.updateOne({ _id: id }, { $set: set }).exec(),
};
export type WebhookRepository = typeof webhookRepository;
