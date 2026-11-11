import { Router } from 'express';
import type { Container } from '../../container.js';

/** The buyer's games in the dashboard: list, details, customisation, settings, preview. */
export function gameRoutes(c: Container) {
  const r = Router();
  const { requireUser, requireOwnedGame } = c.auth;

  r.get('/api/licenses', requireUser, async (req, res) => {
    const games = await c.games.listFor(req.user!._id);
    const stats = await c.results.statsForGames(games.map(g => g._id));
    res.json({ licenses: games.map(g => ({ ...c.games.view(g), stats: stats.get(g._id) })) });
  });
  r.get('/api/licenses/:id', requireUser, requireOwnedGame, (req, res) => { res.json(c.games.detail(req.game!)); });
  r.put('/api/licenses/:id/config', requireUser, requireOwnedGame, async (req, res) => {
    res.json(await c.games.updateConfig(req.game!, req.body?.config));
  });
  r.put('/api/licenses/:id', requireUser, requireOwnedGame, async (req, res) => {
    res.json(await c.games.updateSettings(req.game!, req.body ?? {}, req.user!));
  });
  r.post('/api/licenses/:id/preview-session', requireUser, requireOwnedGame, (req, res) => {
    res.json({ playUrl: c.sessions.previewUrl(req.game!) });
  });
  return r;
}
