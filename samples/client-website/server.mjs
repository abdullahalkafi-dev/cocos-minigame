// Example "client website": shows how a buyer integrates a game.
// The SECRET account API key lives only here, on the server. The browser only gets a temporary play URL.
//
//   MINIGAME_API_KEY=mgs_xxx MINIGAME_GAME_ID=lic_xxx MINIGAME_HOST=http://localhost:3000 node server.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const HOST = (process.env.MINIGAME_HOST || 'http://localhost:3000').replace(/\/$/, '');
const KEY = process.env.MINIGAME_API_KEY;
const GAME_ID = process.env.MINIGAME_GAME_ID;
const PORT = Number(process.env.PORT || 4000);
if (!KEY || !GAME_ID) { console.error('Set MINIGAME_API_KEY (your account API key) and MINIGAME_GAME_ID (the game to show)'); process.exit(1); }

const page = fs.readFileSync(path.join(import.meta.dirname, 'index.html'), 'utf8').replaceAll('__HOST__', HOST);

http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (req.method === 'GET' && pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(page);
  }
  if (req.method === 'POST' && pathname === '/game-session') {
    // A real site would read the logged-in user from ITS OWN session (cookie, JWT...). This demo trusts a "user" field
    // so you can try different players. Whoever you name here is the player: we never ask the player for a name or password.
    let body = '';
    for await (const chunk of req) body += chunk;
    const user = String((body && JSON.parse(body).user) || 'guest_' + Math.random().toString(36).slice(2, 8));
    const r = await fetch(`${HOST}/api/v1/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: GAME_ID, playerId: user, displayName: user }),
    });
    res.writeHead(r.status, { 'Content-Type': 'application/json' });
    return res.end(await r.text());
  }
  res.writeHead(404).end('Not found');
}).listen(PORT, () => console.log(`Client website running at http://localhost:${PORT}`));
