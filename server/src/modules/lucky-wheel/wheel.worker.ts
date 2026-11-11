import type { Cache } from '../../infra/cache.js';
import type { WheelService } from './wheel.service.js';

/**
 * Background jobs: settle finished rounds even when nobody is polling (so balances and dashboards stay current),
 * and drop idle old rounds. A lock keeps several servers from doing the same work at once.
 * Returns a function that stops the timers.
 */
export function startWheelWorker(d: { wheel: WheelService; cache: Cache }) {
  const settle = setInterval(async () => {
    const release = await d.cache.lock('wheel:settle', 4000);
    if (!release) return;
    try { await d.wheel.settleDue(null, Date.now()); } catch (e) { console.error('settle worker', e); } finally { await release(); }
  }, 2000);
  const prune = setInterval(async () => {
    const release = await d.cache.lock('wheel:prune', 60_000);
    if (!release) return;
    try { await d.wheel.prune(Date.now()); } catch (e) { console.error('prune worker', e); }
  }, 10 * 60_000);
  settle.unref(); prune.unref();
  return () => { clearInterval(settle); clearInterval(prune); };
}
