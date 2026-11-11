import { Router } from 'express';
import type { Container } from '../../container.js';
import { badRequest, forbidden } from '../../common/errors.js';
import { USERNAME_RE } from '../../config/constants.js';
import { playerView } from '../players/player.service.js';

/** What every game needs, whatever its rules: load the config, identify the player, show the balance. */
export function playRoutes(c: Container) {
  const r = Router();

  r.get('/api/play/bootstrap', c.play.requireSession, async (req, res) => {
    const { claims, game } = req.session!;
    let player = null, token: string | null = null;
    if (claims.t === 'p' && claims.pid) player = await c.players.byId(claims.pid);
    else if (claims.u) {
      player = await c.players.getOrCreate(game._id, claims.u, { preview: !!claims.pv, startingBalance: c.games.startingBalance(game) });
      token = c.sessions.playerToken(player, !!claims.pv);
    }
    res.json({ game: game.slug, config: c.games.publicConfig(game), player: player ? playerView(player) : null, token });
  });

  /**
   * Free-username login: only for the dashboard preview and for games that explicitly allow guests.
   * Real clients authenticate their own users and pass the player id when creating the session.
   */
  r.post('/api/play/login', c.limit(60, 60_000), c.play.requireSession, async (req, res) => {
    const { claims, game } = req.session!;
    if (!claims.pv && !c.games.playerSettings(game).guestLogin) throw forbidden('This game does not allow players to choose their own name.', 'guest_login_disabled');
    const username = String(req.body?.username ?? '').trim();
    if (!USERNAME_RE.test(username)) throw badRequest('Username must be 3-20 characters: letters, numbers, _ . -', 'invalid_username');
    const player = await c.players.getOrCreate(game._id, username, { preview: !!claims.pv, startingBalance: c.games.startingBalance(game) });
    res.json({ token: c.sessions.playerToken(player, !!claims.pv), player: playerView(player) });
  });

  r.get('/api/play/me', ...c.play.requirePlayer(), (req, res) => { res.json({ player: playerView(req.player!) }); });

  /** Demo mode only. With a managed wallet the client's system decides when a player gets coins. */
  r.post('/api/play/refill', ...c.play.requirePlayer(), async (req, res) => {
    const game = req.session!.game;
    if (c.games.playerSettings(game).walletMode === 'managed') throw forbidden('Coins for this game are added by the app you are playing in.', 'refill_disabled');
    const cfg = c.games.resolveConfig(game);
    const min = Math.min(...((cfg.chips as { value: number }[]) || [{ value: 1 }]).map(x => x.value));
    if (req.player!.balance >= min) throw badRequest('You still have enough balance to play', 'not_needed');
    res.json({ balance: await c.players.refill(req.player!, Number(cfg.startingBalance) || 0) });
  });
  return r;
}
