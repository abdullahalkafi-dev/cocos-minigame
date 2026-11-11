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
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(page);
  }
  if (req.method === 'POST' && req.url === '/game-session') {
    // In a real site, pass your logged-in user's name here to skip the username screen:
    //   body: JSON.stringify({ username: currentUser.name })
    const r = await fetch(`${HOST}/api/v1/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: GAME_ID }),   // add username: currentUser.name to skip the username screen
    });
    res.writeHead(r.status, { 'Content-Type': 'application/json' });
    return res.end(await r.text());
  }
  res.writeHead(404).end('Not found');
}).listen(PORT, () => console.log(`Client website running at http://localhost:${PORT}`));
