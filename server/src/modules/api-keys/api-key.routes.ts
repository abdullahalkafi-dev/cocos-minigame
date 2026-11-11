import { Router } from 'express';
import type { Container } from '../../container.js';

export function apiKeyRoutes(c: Container) {
  const r = Router();
  r.get('/api/account/api-key', c.auth.requireUser, (req, res) => { res.json(c.apiKeys.status(req.user!)); });
  r.post('/api/account/api-key', c.limit(10, 60_000), c.auth.requireUser, async (req, res) => { res.json(await c.apiKeys.rotate(req.user!)); });
  r.post('/api/account/test-api-key', c.limit(10, 60_000), c.auth.requireUser, async (req, res) => { res.json(await c.apiKeys.rotateTest(req.user!)); });
  return r;
}
