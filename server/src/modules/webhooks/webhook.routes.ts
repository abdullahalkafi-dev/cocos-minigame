import { Router } from 'express';
import type { Container } from '../../container.js';

/** Dashboard endpoints to manage the account's webhook: address, signing secret, test, delivery log. */
export function webhookRoutes(c: Container) {
  const r = Router();
  const user = c.auth.requireUser;
  r.get('/api/account/webhook', user, (req, res) => { res.json(c.webhooks.config(req.user!)); });
  r.put('/api/account/webhook', c.limit(30, 60_000), user, async (req, res) => { res.json(await c.webhooks.setUrl(req.user!, req.body?.url)); });
  r.post('/api/account/webhook/secret', c.limit(10, 60_000), user, async (req, res) => { res.json(await c.webhooks.rotateSecret(req.user!)); });
  r.post('/api/account/webhook/test', c.limit(20, 60_000), user, async (req, res) => { res.json(await c.webhooks.sendTest(req.user!)); });
  r.get('/api/account/webhook/deliveries', user, async (req, res) => { res.json(await c.webhooks.deliveries(req.user!)); });
  r.post('/api/account/webhook/deliveries/:id/retry', c.limit(30, 60_000), user, async (req, res) => { res.json(await c.webhooks.retry(req.user!, String(req.params.id))); });
  return r;
}
