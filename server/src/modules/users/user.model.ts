import { Schema, model } from 'mongoose';

/** A buyer (the client's developer who signs in to the dashboard). Not an end player. */
export interface UserRec {
  _id: string;
  email: string;
  passSalt: string;
  passHash: string;
  /** Demo credits used to buy games in the store. */
  balance: number;
  /** Hash of the account's ONE secret API key (the key itself is shown once). */
  apiKeyHash?: string | null;
  apiKeyPrefix?: string | null;
  createdAt: number;
}

const userSchema = new Schema({
  _id: String,
  email: { type: String, required: true, unique: true },
  passSalt: { type: String, required: true },
  passHash: { type: String, required: true },
  balance: { type: Number, default: 0 },
  apiKeyHash: { type: String, index: { unique: true, sparse: true } },
  apiKeyPrefix: String,
  createdAt: { type: Number, required: true },
}, { versionKey: false });
export const UserModel = model<UserRec>('User', userSchema);

/** History of the buyer's demo credits (welcome credits, top-ups, purchases). */
export interface WalletTxRec { userId: string; delta: number; reason: string; createdAt: number }
const walletTxSchema = new Schema({
  userId: { type: String, required: true, index: true }, delta: Number, reason: String, createdAt: Number,
}, { versionKey: false });
export const WalletTxModel = model<WalletTxRec>('WalletTx', walletTxSchema);
