import crypto from 'node:crypto';
import type { ClientSession } from 'mongoose';
import { badRequest, notFound } from '../../common/errors.js';
import { rid } from '../../common/utils/crypto.js';
import type { UserRepository } from '../users/user.repository.js';
import type { UserRec } from '../users/user.model.js';
import type { WebhookRepository } from './webhook.repository.js';
import type { WebhookEventRec } from './webhook.model.js';
import { assertSafeWebhookUrl } from './webhook.url.js';

/** Wait before the 2nd, 3rd ... 7th attempt after a failure. After the 7th failed attempt the event is given up on. */
export const RETRY_DELAYS_MS = [10_000, 60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const TIMEOUT_MS = 8000;
const LEASE_MS = 30_000;

/** The signature a receiver must compute: HMAC-SHA256 of "<timestamp>.<raw body>" with the webhook secret. */
export const signPayload = (secret: string, timestamp: number, body: string) =>
  crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
export const newWebhookSecret = () => 'whsec_' + rid('', 24);

export interface Delivery { ok: boolean; status?: number; error?: string }

/**
 * Signed notifications to the buyer's server (round results, test events).
 * Events are stored first and sent by a worker, so a buyer's outage never loses one: failed deliveries are
 * retried with growing pauses, and every attempt is visible in the dashboard.
 */
export function createWebhookService(d: { repo: WebhookRepository; users: UserRepository; allowPrivate: boolean }) {
  const deliveryView = (e: WebhookEventRec) => ({
    id: e._id, type: e.type, gameId: e.gameId ?? null, status: e.status, attempts: e.attempts, lastStatus: e.lastStatus ?? null,
    lastError: e.lastError ?? null, createdAt: e.createdAt, deliveredAt: e.deliveredAt ?? null, nextAttemptAt: e.status === 'pending' ? e.nextAttemptAt : null,
  });

  const service = {
    // ------------------------------------------------------------ settings (dashboard)
    config: (u: UserRec) => ({ url: u.webhookUrl ?? null, secret: u.webhookSecret ?? null, configured: !!u.webhookUrl }),

    /** Sets (or clears, with null) the address. The first time, a signing secret is created. */
    async setUrl(u: UserRec, url: unknown) {
      if (url === null || url === '') { await d.users.setWebhook(u._id, { webhookUrl: null }); return { url: null, secret: u.webhookSecret ?? null, configured: false }; }
      if (typeof url !== 'string' || url.length > 500) throw badRequest('Enter a full address such as https://example.com/webhooks', 'invalid_webhook_url');
      const safe = await assertSafeWebhookUrl(url.trim(), d.allowPrivate);
      const secret = u.webhookSecret ?? newWebhookSecret();
      await d.users.setWebhook(u._id, { webhookUrl: safe.toString(), webhookSecret: secret });
      return { url: safe.toString(), secret, configured: true };
    },
    async rotateSecret(u: UserRec) {
      const secret = newWebhookSecret();
      await d.users.setWebhook(u._id, { webhookSecret: secret });
      return { url: u.webhookUrl ?? null, secret, configured: !!u.webhookUrl };
    },
    async deliveries(u: UserRec) { return { deliveries: (await d.repo.recent(u._id)).map(deliveryView) }; },

    // ------------------------------------------------------------ producing events
    /** Stores an event for sending. Does nothing when the account has no webhook address. Safe to call inside a transaction. */
    async enqueue(userId: string, gameId: string | null, type: string, data: Record<string, unknown>, session?: ClientSession) {
      const u = await d.users.byId(userId);
      if (!u?.webhookUrl) return null;
      const id = rid('evt_', 12), now = Date.now();
      const payload = { id, type, createdAt: new Date(now).toISOString(), gameId, data };
      await d.repo.create({ _id: id, userId, gameId, type, payload, status: 'pending', attempts: 0, nextAttemptAt: now, createdAt: now }, session);
      return id;
    },

    // ------------------------------------------------------------ delivering
    /** One HTTP attempt, and the bookkeeping of its outcome. */
    async attempt(ev: WebhookEventRec): Promise<Delivery> {
      const u = await d.users.byId(ev.userId);
      const attempts = ev.attempts + 1;
      let result: Delivery;
      if (!u?.webhookUrl || !u.webhookSecret) {
        result = { ok: false, error: 'No webhook address is set for this account' };
      } else {
        try {
          await assertSafeWebhookUrl(u.webhookUrl, d.allowPrivate);
          const body = JSON.stringify(ev.payload);
          const ts = Math.floor(Date.now() / 1000);
          const res = await fetch(u.webhookUrl, {
            method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: {
              'Content-Type': 'application/json', 'User-Agent': 'MiniGameStudio-Webhooks/1',
              'X-Minigame-Event': ev.type, 'X-Minigame-Delivery': ev._id, 'X-Minigame-Timestamp': String(ts),
              'X-Minigame-Signature': 'v1=' + signPayload(u.webhookSecret, ts, body),
            },
            body,
          });
          result = res.status >= 200 && res.status < 300 ? { ok: true, status: res.status } : { ok: false, status: res.status, error: `Your server answered HTTP ${res.status}` };
        } catch (e: any) {
          result = { ok: false, error: e?.name === 'TimeoutError' ? `No answer within ${TIMEOUT_MS / 1000} seconds` : String(e?.message ?? e).slice(0, 200) };
        }
      }
      const now = Date.now();
      if (result.ok) await d.repo.update(ev._id, { status: 'delivered', attempts, lastStatus: result.status ?? null, lastError: null, deliveredAt: now });
      else if (attempts >= MAX_ATTEMPTS) await d.repo.update(ev._id, { status: 'failed', attempts, lastStatus: result.status ?? null, lastError: result.error ?? null });
      else await d.repo.update(ev._id, { status: 'pending', attempts, lastStatus: result.status ?? null, lastError: result.error ?? null, nextAttemptAt: now + RETRY_DELAYS_MS[attempts - 1] });
      return result;
    },

    /** Sends every event that is due. Called by the worker; the lease keeps several servers from sending the same one. */
    async deliverDue(now = Date.now()) {
      for (const { _id } of await d.repo.dueIds(now)) {
        const ev = await d.repo.lease(_id, now, LEASE_MS);
        if (ev) await service.attempt(ev);
      }
    },

    /** "Send test event" button: sends right away and tells the buyer what their server answered. */
    async sendTest(u: UserRec) {
      if (!u.webhookUrl) throw badRequest('Set your webhook address first', 'webhook_not_configured');
      const id = rid('evt_', 12), now = Date.now();
      const payload = { id, type: 'webhook.test', createdAt: new Date(now).toISOString(), gameId: null, data: { message: 'This is a test event from MiniGame Studio.' } };
      const ev: WebhookEventRec = { _id: id, userId: u._id, gameId: null, type: 'webhook.test', payload, status: 'pending', attempts: 0, nextAttemptAt: now + LEASE_MS, createdAt: now };
      await d.repo.create(ev);
      return { deliveryId: id, ...(await service.attempt(ev)) };
    },

    /** "Retry" on a failed delivery. */
    async retry(u: UserRec, id: string) {
      const ev = await d.repo.byId(id);
      if (!ev || ev.userId !== u._id) throw notFound('Delivery not found', 'delivery_not_found');
      return { deliveryId: id, ...(await service.attempt(ev)) };
    },
  };
  return service;
}
export type WebhookService = ReturnType<typeof createWebhookService>;
