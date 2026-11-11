import { Router, type RequestHandler } from 'express';
import type { Container } from '../../container.js';
import { badRequest } from '../../common/errors.js';
import { MAIN_ROOM } from '../../config/constants.js';
import type { RoomRec } from '../rooms/room.model.js';

const SLUG = 'lucky-wheel';

/** Player-facing endpoints of the Lucky Wheel game. The WebSocket push lives in wheel.ws.ts; these are bets and the HTTP fallback. */
export function wheelRoutes(c: Container) {
  const r = Router();
  const player = c.play.requirePlayer(SLUG);
  /** Finds the room this player's session belongs to and the game configuration as seen inside it. */
  const inRoom: RequestHandler = async (req, _res, next) => {
    const { game, claims } = req.session!;
    const key = claims.rm ?? MAIN_ROOM;
    const room: RoomRec = key === MAIN_ROOM ? await c.rooms.main(game) : (await c.rooms.get(game, key)) ?? (await c.rooms.main(game));
    (req as any).room = room;
    (req as any).roomCfg = c.rooms.effectiveConfig(game, room);
    next();
  };
  const roomOf = (req: unknown) => (req as any).room as RoomRec;
  const cfgOf = (req: unknown) => (req as any).roomCfg;

  r.get('/api/play/wheel/state', c.limit(150, 60_000), ...player, inRoom, async (req, res) => {
    res.json(await c.wheel.state(req.session!.game, roomOf(req), cfgOf(req), req.player!, Date.now()));
  });
  r.post('/api/play/wheel/bet', c.limit(240, 60_000), ...player, inRoom, async (req, res) => {
    const bets = req.body?.bets;
    if (!Array.isArray(bets) || !bets.length || bets.length > 24) throw badRequest('Invalid bets', 'invalid_bets');
    const list = bets.map((b: any) => ({ target: String(b?.target ?? ''), amount: Number(b?.amount) }));
    res.json(await c.wheel.placeBets(req.session!.game, roomOf(req), cfgOf(req), req.player!, list, Date.now()));
  });
  r.get('/api/play/wheel/mybets', ...player, async (req, res) => { res.json({ bets: await c.wheel.myBets(req.player!) }); });
  r.get('/api/play/wheel/ranking', ...player, inRoom, async (req, res) => { res.json(await c.wheel.ranking(req.session!.game, roomOf(req), req.player!)); });
  return r;
}
