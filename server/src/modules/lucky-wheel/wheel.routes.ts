import { Router } from 'express';
import type { Container } from '../../container.js';
import { badRequest } from '../../common/errors.js';

const SLUG = 'lucky-wheel';

/** Player-facing endpoints of the Lucky Wheel game. */
export function wheelRoutes(c: Container) {
  const r = Router();
  const player = c.play.requirePlayer(SLUG);
  const cfgOf = (req: any) => c.games.resolveConfig(req.session.game);

  r.get('/api/play/wheel/state', c.limit(150, 60_000), ...player, async (req, res) => {
    res.json(await c.wheel.state(req.session!.game, cfgOf(req), req.player!, Date.now()));
  });
  r.post('/api/play/wheel/bet', c.limit(240, 60_000), ...player, async (req, res) => {
    const bets = req.body?.bets;
    if (!Array.isArray(bets) || !bets.length || bets.length > 24) throw badRequest('Invalid bets', 'invalid_bets');
    const list = bets.map((b: any) => ({ target: String(b?.target ?? ''), amount: Number(b?.amount) }));
    res.json(await c.wheel.placeBets(req.session!.game, cfgOf(req), req.player!, list, Date.now()));
  });
  r.get('/api/play/wheel/mybets', ...player, async (req, res) => {
    await c.wheel.settleDue(req.session!.game._id, Date.now());
    res.json({ bets: await c.wheel.myBets(req.player!) });
  });
  r.get('/api/play/wheel/ranking', ...player, async (req, res) => {
    await c.wheel.settleDue(req.session!.game._id, Date.now());
    res.json(await c.wheel.ranking(req.session!.game, req.player!));
  });
  return r;
}
