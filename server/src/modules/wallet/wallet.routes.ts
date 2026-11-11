import { Router } from 'express';
import type { Container } from '../../container.js';

/**
 * Wallet API for the client's server (account API key). Coins of a player in one game:
 *   GET  /api/v1/games/:gameId/players/:playerId                 balance
 *   POST /api/v1/games/:gameId/players/:playerId/credit          add coins   { amount, reference, note?, displayName? }
 *   POST /api/v1/games/:gameId/players/:playerId/debit           remove coins { amount, reference, note? }
 *   GET  /api/v1/games/:gameId/players/:playerId/transactions    history (newest first)
 */
export function walletRoutes(c: Container) {
  const r = Router();
  const base = '/api/v1/games/:gameId/players/:playerId';
  const ids = (req: { params: Record<string, any>; keyMode?: 'live' | 'test' }) => [req.keyMode, String(req.params.gameId), String(req.params.playerId)] as const;

  r.get(base, c.limit(600, 60_000), c.auth.requireApiKey, async (req, res) => { res.json(await c.wallet.getPlayer(req.account!, ...ids(req))); });
  r.post(`${base}/credit`, c.limit(600, 60_000), c.auth.requireApiKey, async (req, res) => { res.json(await c.wallet.move(req.account!, ...ids(req), 'credit', req.body ?? {})); });
  r.post(`${base}/debit`, c.limit(600, 60_000), c.auth.requireApiKey, async (req, res) => { res.json(await c.wallet.move(req.account!, ...ids(req), 'debit', req.body ?? {})); });
  r.get(`${base}/transactions`, c.limit(300, 60_000), c.auth.requireApiKey, async (req, res) => { res.json(await c.wallet.transactions(req.account!, ...ids(req), req.query)); });

  // the buyer looks at the same history in the dashboard (signed in as the buyer, no API key needed)
  r.get('/api/licenses/:id/players/:playerId/transactions', c.auth.requireUser, c.auth.requireOwnedGame, async (req, res) => {
    res.json(await c.wallet.transactions(req.user!, undefined, req.game!._id, String(req.params.playerId), req.query));
  });
  return r;
}
