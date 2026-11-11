import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { RequestHandler } from 'express';
import { RedisCache, type Cache } from '../../infra/cache.js';
import { bearer } from '../http/bearer.js';

export type LimiterFactory = (max: number, windowMs: number) => RequestHandler;

/** Builds rate limiters that share their counters through Redis when it is available. */
export function createLimiterFactory(cache: Cache): LimiterFactory {
  let n = 0;
  return (max, windowMs) => rateLimit({
    windowMs, limit: max, standardHeaders: 'draft-7', legacyHeaders: false, passOnStoreError: true,
    message: { error: 'Too many requests. Please slow down.', code: 'rate_limited' },
    // players behind one shared IP (mobile carriers, offices) must not throttle each other: count per token when there is one
    keyGenerator: req => { const t = bearer(req); return t ? 't:' + t.slice(-24) : req.ip ?? 'unknown'; },    store: cache instanceof RedisCache
      // a failing Redis must never crash or block requests: errors become "store unavailable" and the request is let through
      ? new RedisStore({ prefix: `mgs:rl:${n++}:`, sendCommand: (...a: string[]) => (cache.redis.call(a[0], ...a.slice(1)) as Promise<any>).catch(() => '') })
      : undefined,
  });
}
