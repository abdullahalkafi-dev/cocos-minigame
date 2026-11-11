import { TOPUP_CREDITS } from '../../config/constants.js';
import { inTransaction } from '../../infra/mongo.js';
import { userRepository, type UserRepository } from './user.repository.js';
import type { UserRec } from './user.model.js';

export const userView = (u: UserRec) => ({
  id: u._id, email: u.email, balance: u.balance, hasApiKey: !!u.apiKeyHash, apiKeyPrefix: u.apiKeyPrefix ?? null,
  hasTestApiKey: !!u.testApiKeyHash, testApiKeyPrefix: u.testApiKeyPrefix ?? null,
});

export function createUserService(repo: UserRepository = userRepository) {
  return {
    async profile(user: UserRec) {
      const transactions = (await repo.recentTx(user._id)).map(t => ({ delta: t.delta, reason: t.reason, created_at: t.createdAt }));
      return { user: userView(user), transactions };
    },
    /** Demo only: gives the buyer more credits to spend in the store. */
    async topUp(user: UserRec) {
      const updated = await inTransaction(async s => {
        const u = await repo.adjustBalance(user._id, TOPUP_CREDITS, s);
        await repo.addTx({ userId: user._id, delta: TOPUP_CREDITS, reason: 'Demo top-up', createdAt: Date.now() }, s);
        return u!;
      });
      return { user: userView(updated) };
    },
  };
}
export type UserService = ReturnType<typeof createUserService>;
