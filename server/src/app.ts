import compression from 'compression';
import cors from 'cors';
import express from 'express';
import type { Container } from './container.js';
import { errorHandler, notFoundHandler } from './common/middleware/error-handler.js';
import { securityHeaders } from './common/middleware/security-headers.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { userRoutes } from './modules/users/user.routes.js';
import { apiKeyRoutes } from './modules/api-keys/api-key.routes.js';
import { storeRoutes } from './modules/store/store.routes.js';
import { gameRoutes } from './modules/games/game.routes.js';
import { uploadRoutes } from './modules/uploads/upload.routes.js';
import { resultRoutes } from './modules/results/result.routes.js';
import { sessionRoutes } from './modules/sessions/session.routes.js';
import { playRoutes } from './modules/play/play.routes.js';
import { wheelRoutes } from './modules/lucky-wheel/wheel.routes.js';
import { systemRoutes } from './modules/system/system.routes.js';

/** Builds the HTTP application. Pure wiring: middleware order and which module owns which routes. */
export function createApp(c: Container) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);                       // one reverse proxy (nginx) in front

  app.use(securityHeaders);
  app.use(cors({ origin: true, allowedHeaders: ['Authorization', 'Content-Type'], methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));

  // buyer side (dashboard)
  app.use(authRoutes(c), userRoutes(c), apiKeyRoutes(c), storeRoutes(c), gameRoutes(c), uploadRoutes(c), resultRoutes(c));
  // client's server
  app.use(sessionRoutes(c));
  // the running game
  app.use(playRoutes(c), wheelRoutes(c));
  // files, health
  app.use(systemRoutes(c));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
