import { Router } from 'express';
import type { Container } from '../../container.js';

/** Dashboard endpoints for the seamless wallet: the address of the buyer's wallet endpoint, a test, and the operation log. */
export function seamlessRoutes(c: Container) {
  const r = Router();
  const user = c.auth.requireUser;
  r.get('/api/account/wallet-endpoint', user, (req, res) => { res.json(c.seamless.config(req.user!)); });
  r.put('/api/account/wallet-endpoint', c.limit(30, 60_000), user, async (req, res) => { res.json(await c.seamless.setUrl(req.user!, req.body?.url)); });
  r.post('/api/account/wallet-endpoint/test', c.limit(20, 60_000), user, async (req, res) => { res.json(await c.seamless.test(req.user!)); });
  r.get('/api/account/wallet-endpoint/operations', user, async (req, res) => { res.json(await c.seamless.operations(req.user!)); });
  return r;
}
