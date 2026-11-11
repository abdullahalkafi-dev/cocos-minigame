import { GAME_CACHE_TTL_SEC, type GameMode, type WalletMode } from '../../config/constants.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import type { UserRec } from '../users/user.model.js';
import { clone, deepMerge } from '../../common/utils/object.js';
import type { Cache } from '../../infra/cache.js';
import { fillAssetDefaults, gameBySlug, sanitizeConfig } from '../catalog/index.js';
import type { GameRepository } from './game.repository.js';
import type { GameRec } from './game.model.js';

const ORIGIN_RE = /^https?:\/\/[\w.-]+(:\d+)?$/;
const cacheKey = (id: string) => `game:${id}`;

/** Purchased games: lookup (cached), the merged configuration, and the buyer's changes to it. */
export function createGameService(d: { repo: GameRepository; cache: Cache; publicUrl: string }) {
  const absUrl = (u: string) => (u && u.startsWith('/') ? d.publicUrl + u : u);

  const service = {
    /** Game by id. Cached in Redis; every change below clears the cache. */
    async get(id: string): Promise<GameRec | null> {
      const hit = await d.cache.getJson<GameRec>(cacheKey(id));
      if (hit) return hit;
      const g = await d.repo.byId(id);
      if (g) await d.cache.setJson(cacheKey(id), g, GAME_CACHE_TTL_SEC);
      return g;
    },
    ownedBy: (userId: string, id: string) => d.repo.byOwnerAndId(userId, id),
    listFor: (userId: string, order?: 'newest' | 'oldest') => d.repo.listByUser(userId, order),
    invalidate: (id: string) => d.cache.del(cacheKey(id)),

    /** Defaults + the buyer's changes, with empty asset slots filled by the built-in artwork. */
    resolveConfig(game: GameRec): Record<string, any> {
      const def = gameBySlug(game.slug);
      return def ? fillAssetDefaults(def, deepMerge(def.defaults, game.config ?? {})) : {};
    },
    /** The config sent to the running game: odds are removed and asset urls are made absolute. */
    publicConfig(game: GameRec) {
      const cfg: any = clone(service.resolveConfig(game));
      const walk = (n: any) => {
        if (Array.isArray(n)) n.forEach(walk);
        else if (n && typeof n === 'object') for (const k of Object.keys(n)) {
          if (k === 'url' && typeof n[k] === 'string') n[k] = absUrl(n[k]); else walk(n[k]);
        }
      };
      walk(cfg);
      if (Array.isArray(cfg.segments)) cfg.segments = cfg.segments.map((x: any) => ({ target: x.target }));
      cfg.walletMode = service.playerSettings(game).walletMode;   // the game hides "free refill" when coins come from the client's wallet
      return cfg;
    },
    /** How players are identified and where their coins come from (see docs: identity and wallet). */
    playerSettings: (g: GameRec) => ({
      guestLogin: !!g.guestLogin,
      walletMode: (g.walletMode === 'managed' || g.walletMode === 'seamless' ? g.walletMode : 'demo') as WalletMode,
      mode: (g.mode === 'test' ? 'test' : 'live') as GameMode,
    }),
    /** A test game only answers to the test API key and a live game only to the live key. */
    assertKeyMode(g: GameRec, keyMode: 'live' | 'test' | undefined) {
      const gameMode = g.mode === 'test' ? 'test' : 'live';
      if (keyMode && keyMode !== gameMode) {
        throw forbidden(gameMode === 'test' ? 'This is a test game: use your test API key (mgs_test_...).' : 'This is a live game: use your live API key (mgs_...).', 'wrong_environment');
      }
    },
    /** A new player's balance: the configured starting balance in demo mode, zero when the client's wallet feeds it. */
    startingBalance(g: GameRec) {
      return service.playerSettings(g).walletMode === 'demo' ? Number(service.resolveConfig(g).startingBalance) || 0 : 0;
    },
    view: (g: GameRec) => ({
      id: g._id, gameId: g._id, name: g.name, game: g.slug, status: g.status,
      allowedOrigins: g.allowedOrigins ?? [], createdAt: g.createdAt, price: g.price, ...service.playerSettings(g),
    }),

    detail(game: GameRec) {
      const def = gameBySlug(game.slug);
      if (!def) throw notFound('Unknown game', 'unknown_game');
      return {
        license: service.view(game), game: { slug: def.slug, name: def.name, manifest: def.manifest, tech: def.tech },
        config: service.resolveConfig(game), defaults: def.defaults, publicUrl: d.publicUrl,
      };
    },

    /** Saves a partial config. It is validated against the manifest and merged, so nothing else is wiped. */
    async updateConfig(game: GameRec, input: unknown) {
      const def = gameBySlug(game.slug);
      if (!def) throw notFound('Unknown game', 'unknown_game');
      const r = sanitizeConfig(def, input);
      if (!r.ok) throw badRequest(r.error, 'invalid_config');
      const merged = deepMerge(game.config ?? {}, r.config);
      const problem = def.validate?.(fillAssetDefaults(def, deepMerge(def.defaults, merged)));
      if (problem) throw badRequest(problem, 'invalid_config');
      await d.repo.update(game._id, { config: merged });
      await service.invalidate(game._id);
      return { config: service.resolveConfig({ ...game, config: merged }) };
    },

    async updateSettings(game: GameRec, input: { name?: unknown; allowedOrigins?: unknown; guestLogin?: unknown; walletMode?: unknown; mode?: unknown }, account?: UserRec) {
      const set: Partial<GameRec> = {};
      if (input.guestLogin !== undefined) {
        if (typeof input.guestLogin !== 'boolean') throw badRequest('guestLogin must be true or false');
        set.guestLogin = input.guestLogin;
      }
      if (input.walletMode !== undefined) {
        if (input.walletMode !== 'demo' && input.walletMode !== 'managed' && input.walletMode !== 'seamless') throw badRequest("walletMode must be 'demo', 'managed' or 'seamless'");
        if (input.walletMode === 'seamless' && !account?.walletUrl) throw conflict('Set your wallet endpoint first (API key & webhooks page), then switch this game to the seamless wallet.', 'wallet_endpoint_missing');
        set.walletMode = input.walletMode;
      }
      if (input.mode !== undefined) {
        if (input.mode !== 'live' && input.mode !== 'test') throw badRequest("mode must be 'live' or 'test'");
        set.mode = input.mode;
      }
      if (input.name !== undefined) {
        if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 40) throw badRequest('Name must be 1-40 characters');
        set.name = input.name.trim();
      }
      if (input.allowedOrigins !== undefined) {
        const list = (Array.isArray(input.allowedOrigins) ? input.allowedOrigins : []).map(s => String(s).trim()).filter(Boolean);
        if (list.some(s => !ORIGIN_RE.test(s))) throw badRequest('Origins look like https://example.com (no path)');
        set.allowedOrigins = list;
      }
      if (Object.keys(set).length) { await d.repo.update(game._id, set); await service.invalidate(game._id); }
      return { license: service.view({ ...game, ...set }) };
    },
  };
  return service;
}
export type GameService = ReturnType<typeof createGameService>;
