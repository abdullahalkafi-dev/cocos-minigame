import { Router } from 'express';
import type { Container } from '../../container.js';
import { validateBody } from '../../common/middleware/validate.js';
import { parseLogin, parseRegister } from './auth.schemas.js';

export function authRoutes(c: Container) {
  const r = Router();
  r.post('/api/auth/register', c.limit(20, 60_000), validateBody(parseRegister), async (req, res) => {
    res.json(await c.authSvc.register(req.body.email, req.body.password));
  });
  r.post('/api/auth/login', c.limit(30, 60_000), validateBody(parseLogin), async (req, res) => {
    res.json(await c.authSvc.login(req.body.email, req.body.password));
  });
  return r;
}
