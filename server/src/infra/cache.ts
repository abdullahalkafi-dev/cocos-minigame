import { Redis } from 'ioredis';

/**
 * Small cache abstraction. Redis in production (shared by every instance, survives restarts),
 * an in-memory map when no REDIS_URL is set (tests, quick local runs).
 * A cache must never break a request, so failures are swallowed and reported as a miss.
 */
export interface Cache {
  readonly kind: 'redis' | 'memory';
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttlSec: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  /** Try to take a lock for `ttlMs`. Returns a release function, or null when someone else holds it. */
  lock(key: string, ttlMs: number): Promise<(() => Promise<void>) | null>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

const PREFIX = 'mgs:';

class MemoryCache implements Cache {
  readonly kind = 'memory' as const;
  private data = new Map<string, { v: string; exp: number }>();
  async getJson<T>(key: string) {
    const e = this.data.get(key);
    if (!e) return null;
    if (e.exp < Date.now()) { this.data.delete(key); return null; }
    return JSON.parse(e.v) as T;
  }
  async setJson(key: string, value: unknown, ttlSec: number) { this.data.set(key, { v: JSON.stringify(value), exp: Date.now() + ttlSec * 1000 }); }
  async del(...keys: string[]) { keys.forEach(k => this.data.delete(k)); }
  async lock(key: string, ttlMs: number) {
    const k = 'lock:' + key;
    const e = this.data.get(k);
    if (e && e.exp > Date.now()) return null;
    this.data.set(k, { v: '1', exp: Date.now() + ttlMs });
    return async () => { this.data.delete(k); };
  }
  async flush() { this.data.clear(); }
  async close() { this.data.clear(); }
}

export class RedisCache implements Cache {
  readonly kind = 'redis' as const;
  readonly redis: Redis;
  constructor(url: string) {
    // commands wait for the connection but never longer than 1.5 s: a slow Redis must not slow the game down
    this.redis = new Redis(url, { maxRetriesPerRequest: 1, commandTimeout: 1500, retryStrategy: n => Math.min(n * 200, 3000) });
    this.redis.on('error', () => { /* reported as cache misses; reconnect is automatic */ });
  }
  async getJson<T>(key: string) {
    try { const v = await this.redis.get(PREFIX + key); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
  }
  async setJson(key: string, value: unknown, ttlSec: number) {
    try { await this.redis.set(PREFIX + key, JSON.stringify(value), 'EX', Math.max(1, Math.ceil(ttlSec))); } catch { /* miss next time */ }
  }
  async del(...keys: string[]) {
    try { if (keys.length) await this.redis.del(...keys.map(k => PREFIX + k)); } catch { /* ignore */ }
  }
  async lock(key: string, ttlMs: number) {
    const k = PREFIX + 'lock:' + key;
    try {
      const ok = await this.redis.set(k, '1', 'PX', ttlMs, 'NX');
      if (ok !== 'OK') return null;
      return async () => { try { await this.redis.del(k); } catch { /* expires by itself */ } };
    } catch { return async () => {}; }   // Redis down: do not block the work
  }
  async flush() { try { const keys = await this.redis.keys(PREFIX + '*'); if (keys.length) await this.redis.del(...keys); } catch { /* ignore */ } }
  async close() { try { await this.redis.quit(); } catch { /* ignore */ } }
}

export const createMemoryCache = (): Cache => new MemoryCache();
export const createCache = (redisUrl?: string): Cache => (redisUrl ? new RedisCache(redisUrl) : new MemoryCache());
