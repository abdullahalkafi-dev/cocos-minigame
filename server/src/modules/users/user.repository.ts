import type { ClientSession } from 'mongoose';
import { UserModel, WalletTxModel, type UserRec, type WalletTxRec } from './user.model.js';

export const userRepository = {
  byId: (id: string) => UserModel.findById(id).lean<UserRec>().exec(),
  byEmail: (email: string) => UserModel.findOne({ email }).lean<UserRec>().exec(),
  byApiKeyHash: (hash: string) => UserModel.findOne({ apiKeyHash: hash }).lean<UserRec>().exec(),
  async create(rec: UserRec, session?: ClientSession) { await UserModel.create([rec], { session }); },
  setApiKey: (id: string, hash: string, prefix: string) => UserModel.updateOne({ _id: id }, { $set: { apiKeyHash: hash, apiKeyPrefix: prefix } }).exec(),
  setWebhook: (id: string, set: { webhookUrl?: string | null; webhookSecret?: string | null }) => UserModel.updateOne({ _id: id }, { $set: set }).exec(),
  /** Adds `delta` to the demo balance. A negative delta returns null when the balance would drop below zero. */
  adjustBalance(id: string, delta: number, session?: ClientSession) {
    const filter: Record<string, unknown> = { _id: id };
    if (delta < 0) filter.balance = { $gte: -delta };
    return UserModel.findOneAndUpdate(filter, { $inc: { balance: delta } }, { new: true, session }).lean<UserRec>().exec();
  },
  async addTx(rec: WalletTxRec, session?: ClientSession) { await WalletTxModel.create([rec], { session }); },
  recentTx: (userId: string, limit = 20) => WalletTxModel.find({ userId }).sort({ _id: -1 }).limit(limit).lean<WalletTxRec[]>().exec(),
};
export type UserRepository = typeof userRepository;
