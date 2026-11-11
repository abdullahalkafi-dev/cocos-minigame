// WebSocket endpoint of the Lucky Wheel: GET /ws, then the first message must be { t: "auth", token: <player token> }.
// The server pushes { t: "state", ... } about once a second and whenever something changes for that player.
// The client may send { t: "ping", c: <its clock> } to measure latency and clock offset: the answer is { t: "pong", c, s: <server clock> }.
import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { GameService } from '../games/game.service.js';
import type { PlayerService } from '../players/player.service.js';
import type { RoomService } from '../rooms/room.service.js';
import type { SessionService } from '../sessions/session.service.js';
import { MAIN_ROOM } from '../../config/constants.js';
import type { HubClient, WheelHub } from './wheel.hub.js';

const MAX_SOCKETS_PER_PLAYER = 3;
const AUTH_TIMEOUT_MS = 5000;

export function attachWheelSocket(server: Server, d: { hub: WheelHub; sessions: SessionService; games: GameService; players: PlayerService; rooms: RoomService }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });

  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://x').pathname !== '/ws') { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket & { alive?: boolean }) => {
    let client: HubClient | null = null;
    let authing = false;
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    const timer = setTimeout(() => { if (!client) ws.close(4001, 'auth timeout'); }, AUTH_TIMEOUT_MS);
    let msgs = 0; const meter = setInterval(() => { msgs = 0; }, 1000);

    ws.on('message', async raw => {
      if (++msgs > 20) return;                                     // ignore a flood
      let m: any;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      if (m?.t === 'ping') { ws.send(JSON.stringify({ t: 'pong', c: m.c, s: Date.now() })); return; }
      if (client || authing || m?.t !== 'auth' || typeof m.token !== 'string') return;
      authing = true;
      try {
        const claims = d.sessions.claims(m.token);
        const game = claims ? await d.games.get(claims.lic) : null;
        const player = claims?.t === 'p' && claims.pid ? await d.players.byId(claims.pid) : null;
        if (!claims || !game || game.status !== 'active' || !player || player.gameId !== game._id || game.slug !== 'lucky-wheel') { ws.close(4401, 'unauthorized'); return; }
        const roomKey = claims.rm ?? MAIN_ROOM;
        if (roomKey !== MAIN_ROOM && !(await d.rooms.get(game, roomKey))) { ws.close(4404, 'room not found'); return; }
        while (d.hub.socketsOf(player._id) >= MAX_SOCKETS_PER_PLAYER) d.hub.oldestOf(player._id)?.ws.close(4000, 'replaced by a newer connection');
        client = { ws, playerId: player._id, externalId: player.externalId, isPreview: player.isPreview, balance: player.balance, gameId: game._id, roomKey };
        clearTimeout(timer);
        await d.hub.join(client);
      } catch (e) { console.error('ws auth', e); ws.close(1011, 'error'); }
    });
    ws.on('close', () => { clearTimeout(timer); clearInterval(meter); if (client) d.hub.leave(client); });
    ws.on('error', () => { /* the close event follows */ });
  });

  // drop connections that stopped answering (a phone that lost signal never says goodbye)
  const beat = setInterval(() => {
    for (const ws of wss.clients as Set<WebSocket & { alive?: boolean }>) {
      if (ws.alive === false) { ws.terminate(); continue; }
      ws.alive = false; ws.ping();
    }
  }, 30_000);
  beat.unref();

  return { close() { clearInterval(beat); wss.close(); for (const ws of wss.clients) ws.terminate(); } };
}
