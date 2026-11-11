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

export function hashPassword(pw: string, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 32).toString('hex') };
}
export function checkPassword(pw: string, salt: string, hash: string) {
  const h = crypto.scryptSync(pw, salt, 32);
  const e = Buffer.from(hash, 'hex');
  return h.length === e.length && crypto.timingSafeEqual(h, e);
}
