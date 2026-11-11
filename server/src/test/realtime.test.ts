// Round clock and WebSocket edge cases found while auditing the live part of the platform.
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startHarness } from './harness.js';
import { WheelRoundModel } from '../modules/lucky-wheel/wheel.model.js';

let h: Awaited<ReturnType<typeof startHarness>>;
before(async () => { h = await startHarness(); });
after(async () => { await h.stop(); });
beforeEach(async () => { await h.reset(); });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function managed(email: string) {
  const b = await h.buyer(email, { guest: false, wallet: 'managed' });
  await h.call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId: 'p1' });
  await h.call('POST', `/api/v1/games/${b.lic}/players/p1/credit`, b.apiKey, { amount: 1_000_000, reference: 'seed' });
  const sess = await h.call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId: 'p1' });
  const boot = await h.call('GET', '/api/play/bootstrap', sess.body.sessionToken);
  return { b, P: boot.body.token as string };
}
const wsUrl = () => h.base.replace('http', 'ws') + '/ws';
function open(token?: string) {
  const ws = new WebSocket(wsUrl());
  const msgs: any[] = []; let closed: number | null = null;
  ws.on('message', m => { try { msgs.push(JSON.parse(String(m))); } catch { /* ignore */ } });
  ws.on('close', code => { closed = code; });
  ws.on('open', () => { if (token) ws.send(JSON.stringify({ t: 'auth', token })); });
  return { ws, msgs, closed: () => closed };
}

test('the winning result is never sent while betting is open (HTTP and WebSocket)', async () => {
  const { P } = await managed('secret@test.com');
  const st = (await h.call('GET', '/api/play/wheel/state', P)).body;
  assert.equal(st.round.phase, 'betting');
  assert.equal(st.round.result, null, 'the outcome is hidden while bets are taken');
  assert.ok(!JSON.stringify(st).includes('resultTarget'));
  const c = open(P);
  await sleep(600);
  const first = c.msgs.find(m => m.t === 'state');
  assert.ok(first, 'a state message arrives');
  assert.equal(first.round.phase, 'betting');
  assert.equal(first.round.result, null);
  c.ws.close();
});

test('betting closes slightly before the timer ends, and nothing is accepted while the wheel spins', async () => {
  const { P } = await managed('late@test.com');
  const state = (await h.call('GET', '/api/play/wheel/state', P)).body;
  const bet = () => h.call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'seven', amount: 100 }] });
  assert.equal((await bet()).status, 200);
  // move the clock so that only 100 ms of the betting phase are left
  const left = state.round.betEnd - Date.now();
  await h.age(left - 100);
  const late = await bet();
  assert.equal(late.status, 409); assert.equal(late.body.code, 'betting_closed');
  await h.age(2000);                                         // now the wheel is spinning
  assert.equal((await bet()).body.code, 'betting_closed');
});

test('a round without bets still ends, the next one starts, and numbers keep counting up', async () => {
  const { P } = await managed('empty@test.com');
  const r1 = (await h.call('GET', '/api/play/wheel/state', P)).body.round.no;
  await h.age(40_000);
  await h.container.wheel.settleDue(Date.now());
  const r2 = (await h.call('GET', '/api/play/wheel/state', P)).body.round.no;
  assert.equal(r2, r1 + 1);
  assert.equal(await WheelRoundModel.countDocuments({ settled: true }), 1);
  await h.age(40_000);
  const r3 = (await h.call('GET', '/api/play/wheel/state', P)).body.round.no;
  assert.equal(r3, r2 + 1);
});

test('WebSocket: bad tokens are closed, a fourth connection replaces the oldest, garbage is ignored, ping is answered', async () => {
  const { P } = await managed('ws@test.com');
  const bad = open('not-a-token');
  await sleep(500);
  assert.equal(bad.closed(), 4401);

  const conns = [open(P), open(P), open(P)];
  await sleep(500);
  assert.ok(conns.every(c => c.closed() === null), 'three connections are allowed');
  const fourth = open(P);
  await sleep(500);
  assert.equal(conns[0].closed(), 4000, 'the oldest is closed for the newest');
  assert.equal(fourth.closed(), null);

  fourth.ws.send('{{{ not json'); fourth.ws.send(JSON.stringify({ t: 'bet', amount: 5 })); fourth.ws.send(JSON.stringify({ t: 'auth', token: 5 }));
  fourth.ws.send(JSON.stringify({ t: 'ping', c: 123 }));
  await sleep(400);
  const pong = fourth.msgs.find(m => m.t === 'pong');
  assert.equal(pong?.c, 123); assert.ok(typeof pong.s === 'number');
  assert.equal(fourth.closed(), null, 'garbage does not break the connection');

  // a message larger than the limit closes the socket instead of being processed
  fourth.ws.send('x'.repeat(5000));
  await sleep(400);
  assert.notEqual(fourth.closed(), null);
  conns.forEach(c => c.ws.close());
});

test('a session token (not yet a player) cannot open the live feed', async () => {
  const b = await h.buyer('wsess@test.com', { guest: false });
  const sess = (await h.call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId: 'p1' })).body.sessionToken;
  const c = open(sess);
  await sleep(500);
  assert.equal(c.closed(), 4401);
});

test('the live feed follows a stopped game: players are disconnected', async () => {
  const { b, P } = await managed('stop@test.com');
  const c = open(P);
  await sleep(500);
  assert.equal(c.closed(), null);
  // the buyer deactivates the game directly in the database (there is no dashboard switch yet)
  const { GameModel } = await import('../modules/games/game.model.js');
  await GameModel.updateOne({ _id: b.lic }, { $set: { status: 'inactive' } });
  await h.container.cache.flush();
  h.container.games.invalidate(b.lic);
  await sleep(11_500);                                       // the hub re-reads the game every 10 s
  assert.equal(c.closed(), 4003);
});
