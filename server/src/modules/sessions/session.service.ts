import { PLAYER_TTL_SEC, SESSION_TTL_SEC, USERNAME_RE } from '../../config/constants.js';
import { badRequest, forbidden, notFound } from '../../common/errors.js';
import { sign, verify } from '../../common/utils/crypto.js';
import { gameBySlug } from '../catalog/index.js';
import type { GameService } from '../games/game.service.js';
import type { GameRec } from '../games/game.model.js';
import type { PlayerRec } from '../players/player.model.js';
import type { UserRec } from '../users/user.model.js';
import type { SessionClaims } from '../../common/http/express.js';

/**
 * Play sessions. The client's server (authenticated with the account API key) asks for a short-lived session
 * for one of its games; the game exchanges it for a player token. The client decides WHO the player is.
 */
export function createSessionService(d: { secret: string; publicUrl: string; games: GameService }) {
  const playUrl = (game: GameRec, token: string, extra = '') => `${d.publicUrl}/g/${game.slug}/?session=${token}${extra}`;
  return {
    async listGames(account: UserRec) {
      const games = await d.games.listFor(account._id, 'oldest');
      return { games: games.map(g => ({ gameId: g._id, name: g.name, game: g.slug, status: g.status })) };
    },

    /** POST /api/v1/sessions */
    async create(account: UserRec, body: { gameId?: unknown; username?: unknown }) {
      const { gameId, username } = body;
      if (typeof gameId !== 'string' || !gameId) throw badRequest('gameId is required. List yours with GET /api/v1/games or copy it from the dashboard.', 'game_id_required');
      const game = await d.games.ownedBy(account._id, gameId);
      if (!game || !gameBySlug(game.slug)) throw notFound('Game not found for this API key', 'game_not_found');
      if (game.status !== 'active') throw forbidden('This game is not active', 'game_inactive');
      if (username !== undefined && (typeof username !== 'string' || !USERNAME_RE.test(username))) throw badRequest('username must be 3-20 chars: letters, numbers, _ . -', 'invalid_username');
      const token = sign({ t: 's', lic: game._id, ...(username ? { u: username } : {}) }, d.secret, SESSION_TTL_SEC);
      return { sessionToken: token, playUrl: playUrl(game, token), expiresIn: SESSION_TTL_SEC, gameId: game._id, game: game.slug };
    },

    /** Dashboard "Preview": a session whose players are marked as previews. */
    previewUrl: (game: GameRec) => playUrl(game, sign({ t: 's', lic: game._id, pv: 1 }, d.secret, SESSION_TTL_SEC), `&v=${Date.now()}`),

    playerToken: (p: PlayerRec, preview: boolean) => sign({ t: 'p', lic: p.gameId, pid: p._id, pv: preview ? 1 : 0 }, d.secret, PLAYER_TTL_SEC),
    claims: (token: string | undefined) => verify<SessionClaims>(token, d.secret),
    /** Origin list used to build the frame-ancestors policy of a game page. */
    gameIdFromToken: (token: string) => verify<{ lic: string }>(token, d.secret)?.lic ?? null,
  };
}
export type SessionService = ReturnType<typeof createSessionService>;
