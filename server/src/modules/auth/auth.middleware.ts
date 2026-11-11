import type { RequestHandler } from 'express';
import { bearer } from '../../common/http/bearer.js';
import { notFound, unauthorized } from '../../common/errors.js';
import type { AuthService } from './auth.service.js';
import type { ApiKeyService } from '../api-keys/api-key.service.js';
import type { GameService } from '../games/game.service.js';

/**
 * The three ways a caller can prove who they are on the buyer side:
 *  - requireUser:      a dashboard token (the buyer in the browser)
 *  - requireApiKey:    the account's secret API key (the buyer's server)
 *  - requireOwnedGame: loads :id and checks it belongs to the signed-in buyer
 */
export function createAuthMiddleware(d: { auth: AuthService; apiKeys: ApiKeyService; games: GameService }) {
  const requireUser: RequestHandler = async (req, _res, next) => {
    const user = await d.auth.userFromToken(bearer(req));
    if (!user) throw unauthorized('Please sign in again');
    req.user = user;
    next();
  };
  const requireApiKey: RequestHandler = async (req, _res, next) => {
    const found = await d.apiKeys.authenticate(bearer(req));
    if (!found) throw unauthorized('Invalid API key. Send it as "Authorization: Bearer <your API key>".', 'invalid_api_key');
    req.account = found.user;
    req.keyMode = found.mode;
    next();
  };
  const requireOwnedGame: RequestHandler = async (req, _res, next) => {
    const game = await d.games.ownedBy(req.user!._id, String(req.params.id));
    if (!game) throw notFound('Game not found', 'game_not_found');
    req.game = game;
    next();
  };
  return { requireUser, requireApiKey, requireOwnedGame };
}
export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;
