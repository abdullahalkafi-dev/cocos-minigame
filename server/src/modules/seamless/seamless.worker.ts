import type { Cache } from '../../infra/cache.js';
import type { SeamlessService } from './seamless.service.js';

/** Sends stored wallet operations (win payouts, rollbacks) to the client's system until they succeed. */
export function startSeamlessWorker(d: { seamless: SeamlessService; cache: Cache }) {
  const timer = setInterval(async () => {
    const release = await d.cache.lock('seamless:deliver', 10_000);
    if (!release) return;
    try { await d.seamless.deliverDue(); } catch (e) { console.error('seamless worker', e); } finally { await release(); }
  }, 2000);
  timer.unref();
  return () => clearInterval(timer);
}
