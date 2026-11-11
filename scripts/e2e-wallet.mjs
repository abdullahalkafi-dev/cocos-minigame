// Managed wallet end to end in a real browser: the client's server credits coins, the game shows and uses them,
// and when the player runs out the game asks the host app for coins instead of offering a free refill.
//   node scripts/e2e-wallet.mjs <host>
import { open, sleep } from './lib/playtest.mjs';
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const j = async (method, url, token, body) => {
  const r = await fetch(base + url, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const email = `wallet+${Math.random().toString(36).slice(2, 8)}@test.dev`;
const reg = (await j('POST', '/api/auth/register', null, { email, password: 'password123' })).body;
const lic = (await j('POST', '/api/store/lucky-wheel/buy', reg.token)).body.license.id;
await j('PUT', `/api/licenses/${lic}`, reg.token, { walletMode: 'managed' });
console.log('1. managed wallet game created');

// the client's server names the player and sells 60,000 coins (the smallest chip is 30,000)
const sess = (await j('POST', '/api/v1/sessions', reg.apiKey, { gameId: lic, playerId: 'shop-user-42', displayName: 'Maria' })).body;
const credit = await j('POST', `/api/v1/games/${lic}/players/shop-user-42/credit`, reg.apiKey, { amount: 60_000, reference: 'order-1' });
console.log('2. credited 60,000 ->', credit.body.balance);

const g = await open(sess.playUrl + '&debug=1', { w: 390, h: 844, scale: 1 });
// play the part of a Flutter/WebView host: the game posts its events to a channel named MiniGames
await g.page.evaluate(() => { window.__events = []; window.MiniGames = { postMessage: m => window.__events.push(JSON.parse(m).type) }; });
for (let k = 0; k < 100; k++) { if (await g.page.evaluate(() => !!window.__game?.chipNodes?.length && window.__game.chipNodes.every(Boolean))) break; await sleep(200); }
await sleep(2500);
const shown = await g.page.evaluate(() => ({ balance: window.__game.ctx.hud.balance, name: window.__game.ctx.player.username, live: window.__game.live.healthy }));
console.log('   live WebSocket connection in use:', shown.live ? 'OK' : 'MISMATCH (polling)');
console.log(`3. game shows ${shown.name} with balance ${shown.balance}`, shown.balance === 60_000 && shown.name === 'Maria' ? 'OK' : 'MISMATCH');
if (await g.page.locator('#mg-login').count()) console.log('   MISMATCH: a sign-in screen was shown');

// bet everything the smallest chip allows, twice, then the player is out of coins
await g.page.evaluate(() => window.__game.selectChip(0, false));
for (let k = 0; k < 2; k++) { await g.tapB(0, 250); await sleep(500); }
await sleep(1500);
const after = await g.page.evaluate(() => window.__game.ctx.hud.balance);
console.log('4. after two bets of 30,000 the balance is', after, after === 0 ? 'OK' : 'MISMATCH');
const server = (await j('GET', `/api/v1/games/${lic}/players/shop-user-42`, reg.apiKey)).body.balance;
console.log('5. the server agrees:', server, server === 0 ? 'OK' : 'MISMATCH');

await g.tapB(0, 250); await sleep(1200);
const ev = await g.page.evaluate(() => window.__events);
console.log('6. host app was asked for coins:', ev.includes('needCoins') ? 'OK' : `MISMATCH (events: ${ev.join(',')})`);
await g.shot('wallet-out-of-coins');

// the client sells more coins while the game is open: the balance follows within a second or two
await j('POST', `/api/v1/games/${lic}/players/shop-user-42/credit`, reg.apiKey, { amount: 90_000, reference: 'order-2' });
await sleep(3500);
const topped = await g.page.evaluate(() => window.__game.ctx.hud.balance);
console.log('7. after the client credited 90,000 the game shows', topped, topped === 90_000 ? 'OK' : 'MISMATCH');
console.log('page errors:', g.errors.length);
await g.close();
