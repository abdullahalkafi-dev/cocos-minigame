import type { Cache } from '../../infra/cache.js';
import type { WebhookService } from './webhook.service.js';

/** Sends due webhook events every few seconds. A lock keeps several servers from working at the same time. */
export function startWebhookWorker(d: { webhooks: WebhookService; cache: Cache }) {
  const timer = setInterval(async () => {
    const release = await d.cache.lock('webhooks:deliver', 10_000);
    if (!release) return;
    try { await d.webhooks.deliverDue(); } catch (e) { console.error('webhook worker', e); } finally { await release(); }
  }, 3000);
  timer.unref();
  return () => clearInterval(timer);
}
