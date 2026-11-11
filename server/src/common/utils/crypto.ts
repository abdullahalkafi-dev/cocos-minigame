import crypto from 'node:crypto';

/** Random id with a readable prefix, e.g. rid('usr_') -> usr_Kf3x... */
export function rid(prefix: string, bytes = 9): string {
  return prefix + crypto.randomBytes(bytes).toString('base64url');
}
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** HMAC-signed, expiring token: base64url(payload).signature */
export function sign(payload: Record<string, unknown>, secret: string, ttlSec: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verify<T = Record<string, any>>(token: string | undefined, secret: string): (T & { exp: number }) | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof data.exp !== 'number' || data.exp < Date.now() / 1000) return null;
    return data;
  } catch { return null; }
}

const scrypt = (pw: string, salt: string) => new Promise<Buffer>((resolve, reject) => crypto.scrypt(pw, salt, 32, (e, k) => (e ? reject(e) : resolve(k))));

/** Passwords are hashed with scrypt, off the main thread so a sign-in never blocks the game rounds. */
export async function hashPassword(pw: string, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: (await scrypt(pw, salt)).toString('hex') };
}
export async function checkPassword(pw: string, salt: string, hash: string) {
  const h = await scrypt(pw, salt);
  const e = Buffer.from(hash, 'hex');
  return h.length === e.length && crypto.timingSafeEqual(h, e);
}

/** Encrypts a small secret for storage (AES-256-GCM, key derived from the server secret). */
export function encryptSecret(plain: string, secret: string): string {
  const key = crypto.createHash('sha256').update('enc:' + secret).digest();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return 'enc1:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url');
}
/** Reverses encryptSecret. Values saved before encryption existed are returned unchanged. */
export function decryptSecret(stored: string, secret: string): string {
  if (!stored.startsWith('enc1:')) return stored;
  const raw = Buffer.from(stored.slice(5), 'base64url');
  const key = crypto.createHash('sha256').update('enc:' + secret).digest();
  const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}
