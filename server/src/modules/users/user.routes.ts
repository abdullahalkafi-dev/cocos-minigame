import { Router } from 'express';
import type { Container } from '../../container.js';

/** The signed-in buyer: profile and demo wallet. */
export function userRoutes(c: Container) {
  const r = Router();
  r.get('/api/me', c.auth.requireUser, async (req, res) => { res.json(await c.users.profile(req.user!)); });
  r.post('/api/wallet/topup', c.auth.requireUser, async (req, res) => { res.json(await c.users.topUp(req.user!)); });
  return r;
}
