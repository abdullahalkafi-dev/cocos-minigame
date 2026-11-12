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
  /** Presence: "this member was seen now" in a named set (who is in a room). Entries older than the window count as gone. */
  touchPresence(set: string, members: string[], windowSec: number): Promise<void>;
  countPresence(set: string, windowSec: number): Promise<number>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

const PREFIX = 'mgs:';

class MemoryCache implements Cache {
  readonly kind = 'memory' as const;
  private data = new Map<string, { v: string; exp: number }>();
  private presence = new Map<string, Map<string, number>>();
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
  async touchPresence(set: string, members: string[], windowSec: number) {
    const m = this.presence.get(set) ?? new Map<string, number>();
    const now = Date.now();
    members.forEach(x => m.set(x, now));
    for (const [k, t] of m) if (t < now - windowSec * 1000) m.delete(k);
    this.presence.set(set, m);
  }
  async countPresence(set: string, windowSec: number) {
    const m = this.presence.get(set); if (!m) return 0;
    const cut = Date.now() - windowSec * 1000;
    let n = 0; for (const t of m.values()) if (t >= cut) n++;
    return n;
  }
  async flush() { this.data.clear(); this.presence.clear(); }
  async close() { this.data.clear(); this.presence.clear(); }
}

export class RedisCache implements Cache {
  readonly kind = 'redis' as const;
  readonly redis: Redis;
  /** While Redis is failing, calls are skipped for a few seconds instead of each waiting for its own timeout (a dead Redis must not slow every request). */
  private downUntil = 0;
  constructor(url: string) {
    // commands wait for the connection but never longer than 1.5 s: a slow Redis must not slow the game down
    this.redis = new Redis(url, { maxRetriesPerRequest: 1, commandTimeout: 1500, retryStrategy: n => Math.min(n * 200, 3000) });
    this.redis.on('error', () => { /* reported as cache misses; reconnect is automatic */ });
    this.redis.on('ready', () => { this.downUntil = 0; });
  }
  get isDown() { return Date.now() < this.downUntil; }
  /** Runs one Redis call. On failure (or while Redis is known to be down) returns `fallback` and skips Redis for 5 seconds. */
  private async run<T>(fallback: T, fn: () => Promise<T>): Promise<T> {
    if (this.isDown) return fallback;
    try { return await fn(); } catch { this.downUntil = Date.now() + 5000; return fallback; }
  }
  /** A raw command for the rate limiter: fails at once while Redis is down, and marks it down when it fails. */
  async command(args: string[]): Promise<any> {
    if (this.isDown) throw new Error('redis down');
    try { return await this.redis.call(args[0], ...args.slice(1)); } catch (e) { this.downUntil = Date.now() + 5000; throw e; }
  }
  getJson<T>(key: string) {
    return this.run<T | null>(null, async () => { const v = await this.redis.get(PREFIX + key); return v ? (JSON.parse(v) as T) : null; });
  }
  async setJson(key: string, value: unknown, ttlSec: number) {
    await this.run(undefined, async () => { await this.redis.set(PREFIX + key, JSON.stringify(value), 'EX', Math.max(1, Math.ceil(ttlSec))); });
  }
  async del(...keys: string[]) {
    await this.run(undefined, async () => { if (keys.length) await this.redis.del(...keys.map(k => PREFIX + k)); });
  }
  async lock(key: string, ttlMs: number) {
    const k = PREFIX + 'lock:' + key;
    const noop = async () => {};
    if (this.isDown) return noop;                      // Redis down: do not block the work
    try {
      const ok = await this.redis.set(k, '1', 'PX', ttlMs, 'NX');
      if (ok !== 'OK') return null;
      return async () => { try { await this.redis.del(k); } catch { /* expires by itself */ } };
    } catch { this.downUntil = Date.now() + 5000; return noop; }
  }
  async touchPresence(set: string, members: string[], windowSec: number) {
    if (!members.length) return;
    await this.run(undefined, async () => {
      const key = PREFIX + 'pres:' + set, now = Date.now();
      const p = this.redis.pipeline();
      for (const m of members) p.zadd(key, now, m);
      p.zremrangebyscore(key, '-inf', now - windowSec * 1000);
      p.expire(key, windowSec * 3);
      await p.exec();
    });
  }
  countPresence(set: string, windowSec: number) {
    return this.run(0, () => this.redis.zcount(PREFIX + 'pres:' + set, Date.now() - windowSec * 1000, '+inf'));
  }
  async flush() { await this.run(undefined, async () => { const keys = await this.redis.keys(PREFIX + '*'); if (keys.length) await this.redis.del(...keys); }); }
  async close() { try { await this.redis.quit(); } catch { /* ignore */ } }
}

export const createMemoryCache = (): Cache => new MemoryCache();
export const createCache = (redisUrl?: string): Cache => (redisUrl ? new RedisCache(redisUrl) : new MemoryCache());
