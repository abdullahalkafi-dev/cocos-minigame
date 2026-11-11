import type { RequestHandler } from 'express';
import { bearer } from '../../common/http/bearer.js';
import { badRequest, unauthorized } from '../../common/errors.js';
import type { GameService } from '../games/game.service.js';
import type { PlayerService } from '../players/player.service.js';
import type { SessionService } from '../sessions/session.service.js';

const TOUCH_EVERY_MS = 30_000;

/**
 * Authentication of the running game:
 *  - requireSession: a valid session or player token for an active game
 *  - requirePlayer:  a logged-in player token (optionally for one specific game type)
 */
export function createPlayMiddleware(d: { sessions: SessionService; games: GameService; players: PlayerService }) {
  const requireSession: RequestHandler = async (req, _res, next) => {
    const claims = d.sessions.claims(bearer(req));
    const game = claims ? await d.games.get(claims.lic) : null;
    if (!claims || !game || game.status !== 'active') throw unauthorized('Session expired. Reload the game.', 'session_expired');
    req.session = { claims, game };
    next();
  };

  const requirePlayer = (slug?: string): RequestHandler[] => [requireSession, async (req, _res, next) => {
    const { claims, game } = req.session!;
    const player = claims.t === 'p' && claims.pid ? await d.players.byId(claims.pid) : null;
    if (!player || player.gameId !== game._id) throw unauthorized('Please enter your username first', 'login_required');
    if (slug && game.slug !== slug) throw badRequest('Wrong game', 'wrong_game');
    // "last seen" is for the dashboard only, so a write every poll would be wasted load
    const now = Date.now();
    if (now - player.lastSeen > TOUCH_EVERY_MS) { await d.players.touch(player, now); player.lastSeen = now; }
    req.player = player;
    next();
  }];

  return { requireSession, requirePlayer };
}
export type PlayMiddleware = ReturnType<typeof createPlayMiddleware>;
