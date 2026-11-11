import { Router } from 'express';
import type { Container } from '../../container.js';

export function storeRoutes(c: Container) {
  const r = Router();
  r.get('/api/store', (_req, res) => { res.json(c.store.list()); });
  r.post('/api/store/:slug/buy', c.auth.requireUser, async (req, res) => { res.json(await c.store.buy(req.user!, String(req.params.slug))); });
  return r;
}
