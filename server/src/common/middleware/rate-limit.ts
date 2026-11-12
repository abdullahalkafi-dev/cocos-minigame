import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { RequestHandler } from 'express';
import { RedisCache, type Cache } from '../../infra/cache.js';
import { bearer } from '../http/bearer.js';

export interface LimiterFactory {
  /**
   * `max` requests per `windowMs`. Counted per token when the caller sends one (players behind one shared address, such as a
   * mobile carrier or an office, must not throttle each other), otherwise per address. `byAddress: true` always counts per
   * address: use it where a caller could invent tokens to get a fresh allowance (sign-in, sign-up).
   */
  (max: number, windowMs: number, o?: { byAddress?: boolean }): RequestHandler;
  /** Blocks an address that keeps sending requests the server answers with 401 (guessing keys or tokens). */
  failures(max: number, windowMs: number): RequestHandler;
}

/** Builds rate limiters that share their counters through Redis when it is available. */
export function createLimiterFactory(cache: Cache): LimiterFactory {
  let n = 0;
  const store = () => (cache instanceof RedisCache
    // a failing Redis must never crash or block requests: errors become "store unavailable" and the request is let through
    ? new RedisStore({ prefix: `mgs:rl:${n++}:`, sendCommand: (...a: string[]) => cache.command(a) })
    : undefined);
  const base = { standardHeaders: 'draft-7' as const, legacyHeaders: false, passOnStoreError: true, message: { error: 'Too many requests. Please slow down.', code: 'rate_limited' } };

  const make = (max: number, windowMs: number, o: { byAddress?: boolean } = {}) => rateLimit({
    ...base, windowMs, limit: max, store: store(),
    keyGenerator: req => { const t = o.byAddress ? undefined : bearer(req); return t ? 't:' + t.slice(-24) : req.ip ?? 'unknown'; },
  });
  const factory = make as unknown as LimiterFactory;

  // Counts only finished requests answered with 401 (never requests still in progress: a client server or an office behind one
  // address legitimately has hundreds in flight at once). Kept in this process's memory: it needs no network round trip per request.
  factory.failures = (max, windowMs): RequestHandler => {
    const seen = new Map<string, { n: number; reset: number }>();
    const sweep = setInterval(() => { const now = Date.now(); for (const [k, v] of seen) if (v.reset < now) seen.delete(k); }, 60_000);
    sweep.unref();
    return (req, res, next) => {
      const ip = req.ip ?? 'unknown', now = Date.now();
      const e = seen.get(ip);
      if (e && e.reset > now && e.n >= max) { res.status(429).json(base.message); return; }
      res.on('finish', () => {
        if (res.statusCode !== 401) return;
        const cur = seen.get(ip);
        if (cur && cur.reset > Date.now()) cur.n++; else seen.set(ip, { n: 1, reset: Date.now() + windowMs });
      });
      next();
    };
  };
  return factory;
}
