import { SIGNUP_CREDITS, USER_TOKEN_TTL_SEC } from '../../config/constants.js';
import { checkPassword, hashPassword, rid, sign, verify } from '../../common/utils/crypto.js';
import { AppError, conflict, unauthorized } from '../../common/errors.js';
import type { Cache } from '../../infra/cache.js';
import { inTransaction, isDuplicateKey } from '../../infra/mongo.js';
import type { UserRepository } from '../users/user.repository.js';
import type { UserRec } from '../users/user.model.js';
import { userView } from '../users/user.service.js';
import { keyRecord, newApiKey } from '../api-keys/api-key.service.js';

/** Dashboard sign-up and sign-in for buyers. (End players never sign in to us: their client's system does that.) */
const MAX_FAILS = 8, LOCK_SEC = 300;
const DUMMY = { salt: '00000000000000000000000000000000', hash: '0'.repeat(64) };

export function createAuthService(d: { users: UserRepository; secret: string; cache: Cache }) {
  const failKey = (email: string) => 'login-fails:' + email;
  const userToken = (id: string) => sign({ t: 'u', uid: id }, d.secret, USER_TOKEN_TTL_SEC);
  return {
    async register(email: string, password: string) {
      const e = email.toLowerCase();
      if (await d.users.byEmail(e)) throw conflict('This email is already registered', 'email_taken');
      const { salt, hash } = await hashPassword(password);
      const apiKey = newApiKey();
      const rec: UserRec = { _id: rid('usr_'), email: e, passSalt: salt, passHash: hash, balance: SIGNUP_CREDITS, ...keyRecord(apiKey), createdAt: Date.now() };
      try {
        await inTransaction(async s => {
          await d.users.create(rec, s);
          await d.users.addTx({ userId: rec._id, delta: SIGNUP_CREDITS, reason: 'Welcome demo credits', createdAt: Date.now() }, s);
        });
      } catch (err) {
        if (isDuplicateKey(err)) throw conflict('This email is already registered', 'email_taken');
        throw err;
      }
      // the API key is shown once; only its hash is stored
      return { token: userToken(rec._id), user: userView(rec), apiKey };
    },
    async login(email: string, password: string) {
      const e = email.toLowerCase();
      // a few wrong guesses at one account lock it for a few minutes, whichever address they come from
      const fails = (await d.cache.getJson<number>(failKey(e))) ?? 0;
      if (fails >= MAX_FAILS) throw new AppError(429, 'Too many wrong attempts. Try again in a few minutes.', 'too_many_attempts');
      const u = await d.users.byEmail(e);
      // an unknown address costs the same time as a wrong password, so the answer time does not reveal which accounts exist
      const valid = u ? await checkPassword(password, u.passSalt, u.passHash) : (await checkPassword(password, DUMMY.salt, DUMMY.hash), false);
      if (!u || !valid) {
        await d.cache.setJson(failKey(e), fails + 1, LOCK_SEC);
        throw unauthorized('Wrong email or password', 'bad_credentials');
      }
      await d.cache.del(failKey(e));
      return { token: userToken(u._id), user: userView(u) };
    },
    /** The buyer a dashboard token belongs to, or null. */
    async userFromToken(token: string | undefined): Promise<UserRec | null> {
      const t = verify<{ t: string; uid: string }>(token, d.secret);
      return t && t.t === 'u' ? d.users.byId(t.uid) : null;
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
