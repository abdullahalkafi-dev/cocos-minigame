// Composition root: the one place where modules are wired together.
// Each module only knows the interfaces of the modules it depends on, which keeps them easy to test and replace.
import type { Cache } from './infra/cache.js';
import type { Env } from './config/env.js';
import { createLimiterFactory } from './common/middleware/rate-limit.js';
import { userRepository } from './modules/users/user.repository.js';
import { createUserService } from './modules/users/user.service.js';
import { createApiKeyService } from './modules/api-keys/api-key.service.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createAuthMiddleware } from './modules/auth/auth.middleware.js';
import { gameRepository } from './modules/games/game.repository.js';
import { createGameService } from './modules/games/game.service.js';
import { createStoreService } from './modules/store/store.service.js';
import { playerRepository } from './modules/players/player.repository.js';
import { createPlayerService } from './modules/players/player.service.js';
import { ledgerRepository } from './modules/ledger/ledger.repository.js';
import { createLedgerService } from './modules/ledger/ledger.service.js';
import { resultRepository } from './modules/results/result.repository.js';
import { createResultService } from './modules/results/result.service.js';
import { createUploadService } from './modules/uploads/upload.service.js';
import { createSessionService } from './modules/sessions/session.service.js';
import { createPlayMiddleware } from './modules/play/play.middleware.js';
import { wheelRepository } from './modules/lucky-wheel/wheel.repository.js';
import { createWheelService } from './modules/lucky-wheel/wheel.service.js';

export function createContainer(env: Env, cache: Cache) {
  const limit = createLimiterFactory(cache);

  const users = createUserService(userRepository);
  const apiKeys = createApiKeyService(userRepository);
  const authSvc = createAuthService({ users: userRepository, secret: env.secret });
  const games = createGameService({ repo: gameRepository, cache, publicUrl: env.publicUrl });
  const store = createStoreService({ users: userRepository, gameRepo: gameRepository, games });
  const ledger = createLedgerService({ players: playerRepository, repo: ledgerRepository });
  const players = createPlayerService({ repo: playerRepository, ledger });
  const results = createResultService({ repo: resultRepository, players: playerRepository });
  const uploads = createUploadService({ uploadsDir: env.uploadsDir });
  const sessions = createSessionService({ secret: env.secret, publicUrl: env.publicUrl, games });
  const wheel = createWheelService({ repo: wheelRepository, ledger, results, players: playerRepository, cache });

  const auth = createAuthMiddleware({ auth: authSvc, apiKeys, games });
  const play = createPlayMiddleware({ sessions, games, players });

  return { env, cache, limit, auth, play, users, apiKeys, authSvc, games, store, ledger, players, results, uploads, sessions, wheel };
}
export type Container = ReturnType<typeof createContainer>;
