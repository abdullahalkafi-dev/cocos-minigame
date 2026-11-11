import { rid, sha256 } from '../../common/utils/crypto.js';
import type { UserRepository } from '../users/user.repository.js';
import type { UserRec } from '../users/user.model.js';

export const newApiKey = () => 'mgs_' + rid('', 32);
export const keyRecord = (key: string) => ({ apiKeyHash: sha256(key), apiKeyPrefix: key.slice(0, 12) });

/** The ONE secret API key of an account. It is hashed at rest and shown to the buyer only once. */
export function createApiKeyService(users: UserRepository) {
  return {
    status: (u: UserRec) => ({ hasKey: !!u.apiKeyHash, prefix: u.apiKeyPrefix ?? null }),
    /** Creates the key, or replaces it (the old one stops working immediately). */
    async rotate(u: UserRec) {
      const key = newApiKey();
      await users.setApiKey(u._id, sha256(key), key.slice(0, 12));
      return { apiKey: key, prefix: key.slice(0, 12) };
    },
    /** Finds the account for a key sent by the client's server, or null. */
    async authenticate(key: string | undefined): Promise<UserRec | null> {
      if (!key || !key.startsWith('mgs_')) return null;
      return users.byApiKeyHash(sha256(key));
    },
  };
}
export type ApiKeyService = ReturnType<typeof createApiKeyService>;
