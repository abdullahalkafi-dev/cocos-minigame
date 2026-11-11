import { Router } from 'express';
import type { Container } from '../../container.js';

/** Dashboard analytics of one game: statistics, players, results, CSV export. */
export function resultRoutes(c: Container) {
  const r = Router();
  const own = [c.auth.requireUser, c.auth.requireOwnedGame];

  r.get('/api/licenses/:id/stats', ...own, async (req, res) => { res.json(await c.results.dashboard(req.game!)); });
  r.get('/api/licenses/:id/players', ...own, async (req, res) => { res.json({ players: await c.results.players(req.game!) }); });
  r.get('/api/licenses/:id/rounds', ...own, async (req, res) => {
    const { limit = '50', offset = '0', player } = req.query as Record<string, string>;
    res.json({
      rounds: await c.results.rounds(req.game!, {
        limit: Math.min(200, Math.max(1, Number(limit) || 50)), offset: Math.max(0, Number(offset) || 0), player: player ? String(player) : undefined,
      }),
    });
  });
  r.get('/api/licenses/:id/export.csv', ...own, async (req, res) => {
    const kind = req.query.kind === 'players' ? 'players' : 'rounds';
    res.type('text/csv').set('Content-Disposition', `attachment; filename="${kind}.csv"`).send(await c.results.csv(req.game!, kind));
  });
  return r;
}
