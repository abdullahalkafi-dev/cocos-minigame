// Composition root: the one place where modules are wired together.
// Each module only knows the interfaces of the modules it depends on, which keeps them easy to test and replace.
import type { Cache } from './infra/cache.js';
import type { Env } from './config/env.js';
import { createBus } from './infra/bus.js';
import { createMetrics } from './infra/metrics.js';
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
import { createLeaderboardService } from './modules/leaderboards/leaderboard.service.js';
import { createUploadService } from './modules/uploads/upload.service.js';
import { roomRepository } from './modules/rooms/room.repository.js';
import { createRoomService } from './modules/rooms/room.service.js';
import { createSessionService } from './modules/sessions/session.service.js';
import { createPlayMiddleware } from './modules/play/play.middleware.js';
import { webhookRepository } from './modules/webhooks/webhook.repository.js';
import { createWebhookService } from './modules/webhooks/webhook.service.js';
import { seamlessRepository } from './modules/seamless/seamless.repository.js';
import { createSeamlessService } from './modules/seamless/seamless.service.js';
import { createWalletService } from './modules/wallet/wallet.service.js';
import { wheelRepository } from './modules/lucky-wheel/wheel.repository.js';
import { createWheelService } from './modules/lucky-wheel/wheel.service.js';
import { createWheelHub } from './modules/lucky-wheel/wheel.hub.js';

export function createContainer(env: Env, cache: Cache) {
  const limit = createLimiterFactory(cache);
  const bus = createBus();
  const metrics = createMetrics();

  const users = createUserService(userRepository);
  const apiKeys = createApiKeyService(userRepository);
  const authSvc = createAuthService({ users: userRepository, secret: env.secret, cache });
  const games = createGameService({ repo: gameRepository, cache, publicUrl: env.publicUrl });
  const store = createStoreService({ users: userRepository, gameRepo: gameRepository, games });
  const ledger = createLedgerService({ players: playerRepository, repo: ledgerRepository });
  const players = createPlayerService({ repo: playerRepository, ledger });
  const results = createResultService({ repo: resultRepository, players: playerRepository });
  const leaderboards = createLeaderboardService({ results: resultRepository, players: playerRepository, cache });
  const uploads = createUploadService({ uploadsDir: env.uploadsDir });
  const rooms = createRoomService({ repo: roomRepository, cache, games });
  const sessions = createSessionService({ secret: env.secret, publicUrl: env.publicUrl, games, players, rooms });
  const webhooks = createWebhookService({ repo: webhookRepository, users: userRepository, allowPrivate: env.allowPrivateWebhooks, secret: env.secret });
  const seamless = createSeamlessService({ repo: seamlessRepository, users: userRepository, games, webhooks, ledger, bus, allowPrivate: env.allowPrivateWebhooks, secret: env.secret });
  const wallet = createWalletService({ games, players, ledger, bus, results: resultRepository });
  const wheel = createWheelService({ repo: wheelRepository, ledger, results, players: playerRepository, cache, games, webhooks, rooms, seamless });
  const hub = createWheelHub({ wheel, games, rooms, repo: wheelRepository, bus });
  wheel.attachHub(hub);

  const auth = createAuthMiddleware({ auth: authSvc, apiKeys, games });
  const play = createPlayMiddleware({ sessions, games, players });

  return { env, cache, limit, bus, metrics, auth, play, users, apiKeys, authSvc, games, store, ledger, players, results, leaderboards, uploads, rooms, sessions, wallet, webhooks, seamless, wheel, hub };
}
export type Container = ReturnType<typeof createContainer>;
