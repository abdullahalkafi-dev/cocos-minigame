import { AVATAR_URL_MAX, DISPLAY_NAME_MAX, MAIN_ROOM, PLAYER_ID_RE, PLAYER_TTL_SEC, SESSION_TTL_SEC } from '../../config/constants.js';
import { badRequest, forbidden, notFound } from '../../common/errors.js';
import { sign, verify } from '../../common/utils/crypto.js';
import { gameBySlug } from '../catalog/index.js';
import type { GameService } from '../games/game.service.js';
import type { GameRec } from '../games/game.model.js';
import type { PlayerService } from '../players/player.service.js';
import type { PlayerRec } from '../players/player.model.js';
import type { RoomService } from '../rooms/room.service.js';
import type { UserRec } from '../users/user.model.js';
import type { SessionClaims } from '../../common/http/express.js';

export interface CreateSessionBody {
  gameId?: unknown;
  /** The client's own id for this person. Required unless the game allows guest login. */
  playerId?: unknown;
  displayName?: unknown;
  avatarUrl?: unknown;
  /** "auto" (default) or the key of one of the game's rooms. */
  room?: unknown;
  /** Older name for playerId, still accepted. */
  username?: unknown;
}

/**
 * Play sessions. The client's server (authenticated with the account API key) asks for a short-lived session
 * for one of its games and says WHO the player is and, optionally, in WHICH ROOM. We never see the client's passwords or
 * logins: the API key proves the call comes from the client's server, so the player id it sends is trusted.
 */
export function createSessionService(d: { secret: string; publicUrl: string; games: GameService; players: PlayerService; rooms: RoomService }) {
  const playUrl = (game: GameRec, token: string, extra = '') => `${d.publicUrl}/g/${game.slug}/?session=${token}${extra}`;
  const text = (v: unknown, field: string, max: number) => {
    if (typeof v !== 'string' || !v.trim() || v.length > max || /[\u0000-\u001f]/.test(v)) throw badRequest(`${field} must be 1-${max} characters`, `invalid_${field}`);
    return v.trim();
  };
  return {
    async listGames(account: UserRec, keyMode?: 'live' | 'test') {
      const games = (await d.games.listFor(account._id, 'oldest')).filter(g => !keyMode || d.games.playerSettings(g).mode === keyMode);
      return { games: games.map(g => ({ gameId: g._id, name: g.name, game: g.slug, status: g.status, ...d.games.playerSettings(g) })) };
    },

    /** POST /api/v1/sessions */
    async create(account: UserRec, keyMode: 'live' | 'test' | undefined, body: CreateSessionBody) {
      const { gameId } = body;
      if (typeof gameId !== 'string' || !gameId) throw badRequest('gameId is required. List yours with GET /api/v1/games or copy it from the dashboard.', 'game_id_required');
      const game = await d.games.ownedBy(account._id, gameId);
      if (!game || !gameBySlug(game.slug)) throw notFound('Game not found for this API key', 'game_not_found');
      d.games.assertKeyMode(game, keyMode);
      if (game.status !== 'active') throw forbidden('This game is not active', 'game_inactive');

      const rawId = body.playerId ?? body.username;
      let playerId: string | undefined;
      if (rawId !== undefined) {
        if (typeof rawId !== 'string' || !PLAYER_ID_RE.test(rawId)) throw badRequest('playerId must be 1-64 characters: letters, numbers and _ . : @ -', 'invalid_player_id');
        playerId = rawId;
      } else if (!d.games.playerSettings(game).guestLogin) {
        throw badRequest('playerId is required: send the id your own system uses for this person (or allow guest login for this game in the dashboard).', 'player_id_required');
      }
      const displayName = body.displayName !== undefined ? text(body.displayName, 'displayName', DISPLAY_NAME_MAX) : undefined;
      let avatarUrl: string | undefined;
      if (body.avatarUrl !== undefined) {
        avatarUrl = text(body.avatarUrl, 'avatarUrl', AVATAR_URL_MAX);
        if (!/^https:\/\//.test(avatarUrl)) throw badRequest('avatarUrl must be an https address', 'invalid_avatarUrl');
      }

      // the player exists from now on, so the client can credit coins before the first game load
      const player = playerId ? await d.players.getOrCreate(game._id, playerId, { preview: false, startingBalance: d.games.startingBalance(game), displayName, avatarUrl }) : null;
      const room = await d.rooms.assign(game, body.room, player?._id);
      const token = sign({ t: 's', lic: game._id, rm: room.key, ...(playerId ? { u: playerId } : {}) }, d.secret, SESSION_TTL_SEC);
      return { sessionToken: token, playUrl: playUrl(game, token), expiresIn: SESSION_TTL_SEC, gameId: game._id, game: game.slug, playerId: playerId ?? null, room: room.key };
    },

    /** Dashboard "Preview": a session whose players are marked as previews (always allowed to type a name). */
    previewUrl: (game: GameRec) => playUrl(game, sign({ t: 's', lic: game._id, rm: MAIN_ROOM, pv: 1 }, d.secret, SESSION_TTL_SEC), `&v=${Date.now()}`),

    playerToken: (p: PlayerRec, preview: boolean, room: string = MAIN_ROOM) => sign({ t: 'p', lic: p.gameId, pid: p._id, pv: preview ? 1 : 0, rm: room }, d.secret, PLAYER_TTL_SEC),
    claims: (token: string | undefined) => verify<SessionClaims>(token, d.secret),
    /** The game a session token belongs to (used for the frame-ancestors policy of a game page). */
    gameIdFromToken: (token: string) => verify<{ lic: string }>(token, d.secret)?.lic ?? null,
  };
}
export type SessionService = ReturnType<typeof createSessionService>;
