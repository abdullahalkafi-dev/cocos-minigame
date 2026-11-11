import { Router } from 'express';
import type { Container } from '../../container.js';
import { badRequest } from '../../common/errors.js';
import { USERNAME_RE } from '../../config/constants.js';
import { playerView } from '../players/player.service.js';

/** What every game needs, whatever its rules: load the config, identify the player, show the balance. */
export function playRoutes(c: Container) {
  const r = Router();
  const startingBalance = (req: { session?: { game: any } }) => Number(c.games.resolveConfig(req.session!.game).startingBalance) || 0;

  r.get('/api/play/bootstrap', c.play.requireSession, async (req, res) => {
    const { claims, game } = req.session!;
    let player = null, token: string | null = null;
    if (claims.t === 'p' && claims.pid) player = await c.players.byId(claims.pid);
    else if (claims.u) {
      player = await c.players.getOrCreate(game._id, claims.u, { preview: !!claims.pv, startingBalance: startingBalance(req) });
      token = c.sessions.playerToken(player, !!claims.pv);
    }
    res.json({ game: game.slug, config: c.games.publicConfig(game), player: player ? playerView(player) : null, token });
  });

  /** Free-username login (demo and preview). Real clients pass their own player id when creating the session. */
  r.post('/api/play/login', c.limit(60, 60_000), c.play.requireSession, async (req, res) => {
    const { claims, game } = req.session!;
    const username = String(req.body?.username ?? '').trim();
    if (!USERNAME_RE.test(username)) throw badRequest('Username must be 3-20 characters: letters, numbers, _ . -', 'invalid_username');
    const player = await c.players.getOrCreate(game._id, username, { preview: !!claims.pv, startingBalance: startingBalance(req) });
    res.json({ token: c.sessions.playerToken(player, !!claims.pv), player: playerView(player) });
  });

  r.get('/api/play/me', ...c.play.requirePlayer(), (req, res) => { res.json({ player: playerView(req.player!) }); });

  r.post('/api/play/refill', ...c.play.requirePlayer(), async (req, res) => {
    const cfg = c.games.resolveConfig(req.session!.game);
    const min = Math.min(...((cfg.chips as { value: number }[]) || [{ value: 1 }]).map(x => x.value));
    if (req.player!.balance >= min) throw badRequest('You still have enough balance to play', 'not_needed');
    res.json({ balance: await c.players.refill(req.player!, Number(cfg.startingBalance) || 0) });
  });
  return r;
}
