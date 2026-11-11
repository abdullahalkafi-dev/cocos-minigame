import { Router } from 'express';
import type { Container } from '../../container.js';

/** Server-to-server API: the client's backend authenticates with the account API key (live or test). */
export function sessionRoutes(c: Container) {
  const r = Router();
  r.get('/api/v1/games', c.limit(120, 60_000), c.auth.requireApiKey, async (req, res) => { res.json(await c.sessions.listGames(req.account!, req.keyMode)); });
  r.post('/api/v1/sessions', c.limit(300, 60_000), c.auth.requireApiKey, async (req, res) => {
    res.json(await c.sessions.create(req.account!, req.keyMode, req.body ?? {}));
  });
  return r;
}
