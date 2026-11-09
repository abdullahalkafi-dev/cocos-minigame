import crypto from 'node:crypto';

export function rid(prefix: string, bytes = 9): string {
  return prefix + crypto.randomBytes(bytes).toString('base64url');
}
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

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
  const hash = crypto.scryptSync(pw, salt, 32).toString('hex');
  return { salt, hash };
}
export function checkPassword(pw: string, salt: string, hash: string) {
  const h = crypto.scryptSync(pw, salt, 32);
  const e = Buffer.from(hash, 'hex');
  return h.length === e.length && crypto.timingSafeEqual(h, e);
}

/** Cryptographically secure float in [0,1). */
export function rng(): number {
  return crypto.randomInt(0, 2 ** 32) / 2 ** 32;
}
export function weightedIndex(weights: number[], rand: () => number = rng): number {
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return 0;
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r < 0) return i;
  }
  return weights.length - 1;
}
export function deepMerge<T>(base: T, over: any): T {
  if (Array.isArray(base) || Array.isArray(over)) return (over !== undefined ? over : base) as T;
  if (base && typeof base === 'object' && over && typeof over === 'object') {
    const out: any = { ...base };
    for (const k of Object.keys(over)) out[k] = deepMerge((base as any)[k], over[k]);
    return out;
  }
  return (over !== undefined ? over : base) as T;
}
