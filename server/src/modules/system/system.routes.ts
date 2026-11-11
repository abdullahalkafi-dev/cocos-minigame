import express, { Router, type RequestHandler } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { Container } from '../../container.js';

const NO_CACHE = (res: express.Response) => res.setHeader('Cache-Control', 'no-cache');

/** Health check plus everything served as files: uploads, game builds, SDK, docs, default art, dashboard. */
export function systemRoutes(c: Container) {
  const r = Router();
  const { publicDir, uploadsDir } = c.env;
  const dir = (...p: string[]) => path.resolve(publicDir, ...p);
  const mount = (url: string, root: string, opts: Parameters<typeof express.static>[1] = {}) => {
    if (fs.existsSync(root)) r.use(url, express.static(root, opts));
  };

  r.get('/api/health', (_req, res) => { res.json({ ok: true, time: Date.now(), cache: c.cache.kind }); });

  // A game page may only be framed by the sites the buyer allowed (frame-ancestors).
  const framePolicy: RequestHandler = async (req, res, next) => {
    const token = typeof req.query.session === 'string' ? req.query.session : '';
    const gameId = token ? c.sessions.gameIdFromToken(token) : null;
    const game = gameId ? await c.games.get(gameId) : null;
    if (game?.allowedOrigins?.length) res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${game.allowedOrigins.join(' ')}`);
    next();
  };

  fs.mkdirSync(uploadsDir, { recursive: true });
  r.use('/uploads', express.static(path.resolve(uploadsDir), { maxAge: '1h' }));
  r.use('/g', framePolicy);
  mount('/g', dir('games'), { setHeaders: NO_CACHE });
  mount('/sdk', dir('sdk'), { setHeaders: NO_CACHE });
  mount('/docs', dir('docs'), { setHeaders: NO_CACHE });
  mount('/defaults', dir('defaults'), { maxAge: '7d' });

  // The dashboard is a static build; unknown paths fall back to its index.html (client-side routing).
  const app = dir('app');
  if (fs.existsSync(app)) {
    r.use(express.static(app, { setHeaders: NO_CACHE }));
    r.get(/^\/(?!api\/|g\/|uploads\/|sdk\/|docs\/|defaults\/).*/, (_req, res) => { res.sendFile(path.join(app, 'index.html')); });
  }
  return r;
}
