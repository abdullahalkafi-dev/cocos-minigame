import { Router } from 'express';
import type { Container } from '../../container.js';
import { notFound } from '../../common/errors.js';

/**
 * Rooms and leaderboards, for the client's server (API key) and for the dashboard (signed-in buyer):
 *   GET/POST   /api/v1/games/:gameId/rooms            list (with players online) / create
 *   PUT/DELETE /api/v1/games/:gameId/rooms/:key       change / delete (only when empty)
 *   GET        /api/v1/games/:gameId/leaderboard      ?room=&period=day|week|month|all&metric=winnings|wagered|biggest_win|net&limit=&playerId=
 */
export function roomRoutes(c: Container) {
  const r = Router();
  const lim = c.limit(300, 60_000);

  // ---- client's server
  const own = async (req: any) => {
    const g = await c.games.ownedBy(req.account._id, String(req.params.gameId));
    if (!g) throw notFound('Game not found for this API key', 'game_not_found');
    c.games.assertKeyMode(g, req.keyMode);
    return g;
  };
  const base = '/api/v1/games/:gameId';
  r.get(`${base}/rooms`, lim, c.auth.requireApiKey, async (req, res) => { res.json(await c.rooms.list(await own(req), req.query)); });
  r.get(`${base}/rooms/:key`, lim, c.auth.requireApiKey, async (req, res) => { res.json(await c.rooms.show(await own(req), String(req.params.key))); });
  r.post(`${base}/rooms`, lim, c.auth.requireApiKey, async (req, res) => { res.json(await c.rooms.create(await own(req), req.body ?? {})); });
  r.put(`${base}/rooms/:key`, lim, c.auth.requireApiKey, async (req, res) => { res.json(await c.rooms.update(await own(req), String(req.params.key), req.body ?? {})); });
  r.delete(`${base}/rooms/:key`, lim, c.auth.requireApiKey, async (req, res) => { res.json(await c.rooms.remove(await own(req), String(req.params.key))); });
  r.get(`${base}/leaderboard`, lim, c.auth.requireApiKey, async (req, res) => { res.json(await c.leaderboards.get(await own(req), req.query)); });

  // ---- dashboard
  const d = [c.auth.requireUser, c.auth.requireOwnedGame];
  r.get('/api/licenses/:id/rooms', ...d, async (req, res) => { res.json(await c.rooms.list(req.game!, req.query)); });
  r.post('/api/licenses/:id/rooms', ...d, async (req, res) => { res.json(await c.rooms.create(req.game!, req.body ?? {})); });
  r.put('/api/licenses/:id/rooms/:key', ...d, async (req, res) => { res.json(await c.rooms.update(req.game!, String(req.params.key), req.body ?? {})); });
  r.delete('/api/licenses/:id/rooms/:key', ...d, async (req, res) => { res.json(await c.rooms.remove(req.game!, String(req.params.key))); });
  r.get('/api/licenses/:id/leaderboard', ...d, async (req, res) => { res.json(await c.leaderboards.get(req.game!, req.query)); });
  return r;
}
