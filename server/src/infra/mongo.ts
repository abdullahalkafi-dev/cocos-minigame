import mongoose, { ClientSession } from 'mongoose';

export async function connectMongo(uri: string) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  return mongoose.connection;
}

export const disconnectMongo = () => mongoose.disconnect();

/**
 * Runs `fn` in a MongoDB transaction (needs a replica set, which Atlas always is).
 * The callback may run more than once on transient errors, so keep it free of side effects outside the database.
 */
export function inTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  return mongoose.connection.transaction(fn);
}

export const isDuplicateKey = (e: any) => e?.code === 11000;
export type { ClientSession };
