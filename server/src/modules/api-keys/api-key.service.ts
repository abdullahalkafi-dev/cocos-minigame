import { rid, sha256 } from '../../common/utils/crypto.js';
import type { UserRepository } from '../users/user.repository.js';
import type { UserRec } from '../users/user.model.js';

export const newApiKey = () => 'mgs_' + rid('', 32);
export const newTestApiKey = () => 'mgs_test_' + rid('', 32);
export const keyRecord = (key: string) => ({ apiKeyHash: sha256(key), apiKeyPrefix: key.slice(0, 12) });

/**
 * The secret API keys of an account. They are hashed at rest and shown to the buyer only once.
 *  - the live key (mgs_...) works for live games, the test key (mgs_test_...) for games marked as test games.
 */
export function createApiKeyService(users: UserRepository) {
  return {
    status: (u: UserRec) => ({ hasKey: !!u.apiKeyHash, prefix: u.apiKeyPrefix ?? null, hasTestKey: !!u.testApiKeyHash, testPrefix: u.testApiKeyPrefix ?? null }),
    /** Creates the key, or replaces it (the old one stops working immediately). */
    async rotate(u: UserRec) {
      const key = newApiKey();
      await users.setApiKey(u._id, sha256(key), key.slice(0, 12));
      return { apiKey: key, prefix: key.slice(0, 12) };
    },
    async rotateTest(u: UserRec) {
      const key = newTestApiKey();
      await users.setTestApiKey(u._id, sha256(key), key.slice(0, 16));
      return { apiKey: key, prefix: key.slice(0, 16) };
    },
    /** Finds the account for a key sent by the client's server, and whether it is the live or the test key. */
    async authenticate(key: string | undefined): Promise<{ user: UserRec; mode: 'live' | 'test' } | null> {
      if (!key) return null;
      if (key.startsWith('mgs_test_')) { const user = await users.byTestApiKeyHash(sha256(key)); return user ? { user, mode: 'test' } : null; }
      if (!key.startsWith('mgs_')) return null;
      const user = await users.byApiKeyHash(sha256(key));
      return user ? { user, mode: 'live' } : null;
    },
  };
}
export type ApiKeyService = ReturnType<typeof createApiKeyService>;
