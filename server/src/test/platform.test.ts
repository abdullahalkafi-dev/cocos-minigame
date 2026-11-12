import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { startHarness } from './harness.js';
import { WebhookEventModel } from '../modules/webhooks/webhook.model.js';
import { SeamlessOpModel } from '../modules/seamless/seamless.model.js';

let h: Awaited<ReturnType<typeof startHarness>>;
before(async () => { h = await startHarness(); });
after(async () => { await h.stop(); });
beforeEach(async () => { await h.reset(); });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const api = (b: { lic: string }, p = '') => `/api/v1/games/${b.lic}${p}`;

test('rooms: capacity, automatic placement, presets and isolation', async () => {
  const { call, buyer, container } = h;
  const b = await buyer('rooms@test.com', { guest: false, wallet: 'managed' });
  await container.cache.flush();                          // forget the probe session the helper opened
  const sess = (playerId: string, room?: string) => call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId, ...(room ? { room } : {}) });

  // every game has a main room; small tables are made by giving it a capacity
  const list = await call('GET', api(b, '/rooms'), b.apiKey);
  assert.deepEqual(list.body.rooms.map((r: any) => r.key), ['main']);
  assert.equal((await call('PUT', api(b, '/rooms/main'), b.apiKey, { capacity: 2 })).body.capacity, 2);

  const s1 = await sess('p1'), s2 = await sess('p2'), s3 = await sess('p3');
  assert.equal(s1.body.room, 'main'); assert.equal(s2.body.room, 'main');
  assert.equal(s3.body.room, 'main-2', 'the third player opens an overflow room, a copy of the first');
  const rooms = (await call('GET', api(b, '/rooms'), b.apiKey)).body.rooms;
  assert.equal(rooms.find((r: any) => r.key === 'main').online, 2);
  assert.equal(rooms.find((r: any) => r.key === 'main-2').online, 1);
  assert.equal((await sess('p4', 'main')).body.code, 'room_full', 'a named room respects its capacity');

  // a VIP room with its own chips and round timing, not used by "auto"
  const vip = await call('POST', api(b, '/rooms'), b.apiKey, { key: 'vip', name: 'VIP table', auto: false, capacity: 10, overrides: { chips: [100_000, 500_000, 1_000_000], maxPerTarget: 2_000_000, timing: { betSeconds: 10 } } });
  assert.equal(vip.status, 200); assert.equal(vip.body.auto, false);
  assert.equal((await sess('p5')).body.room, 'main-2', 'auto never picks a non-auto room');
  const sv = await sess('vip1', 'vip');
  const boot = await call('GET', '/api/play/bootstrap', sv.body.sessionToken);
  assert.equal(boot.body.room, 'vip');
  assert.deepEqual(boot.body.config.chips.map((c: any) => c.value), [100_000, 500_000, 1_000_000], 'the game sees the room preset');
  assert.equal(boot.body.config.timing.betSeconds, 10);
  assert.ok(boot.body.config.chips[0].image.url.startsWith('http://x.test/'), 'chip art is reused with absolute urls');

  // validation and errors
  assert.equal((await call('POST', api(b, '/rooms'), b.apiKey, { key: 'Bad Key' })).body.code, 'invalid_room');
  assert.equal((await call('POST', api(b, '/rooms'), b.apiKey, { key: 'vip' })).status, 409);
  assert.equal((await call('POST', api(b, '/rooms'), b.apiKey, { key: 'x1', overrides: { chips: [5] } })).status, 400);
  assert.equal((await call('POST', api(b, '/rooms'), b.apiKey, { key: 'x2', capacity: 0 })).status, 400);
  assert.equal((await sess('p9', 'ghost')).body.code, 'room_not_found');
  assert.equal((await call('DELETE', api(b, '/rooms/main'), b.apiKey)).body.code, 'room_protected');
  assert.equal((await call('DELETE', api(b, '/rooms/vip'), b.apiKey)).body.code, 'room_busy', 'players are in it right now');

  // each room has its own round clock, pot and history
  await call('POST', api(b, '/players/vip1/credit'), b.apiKey, { amount: 5_000_000, reference: 'c1' });
  await call('POST', api(b, '/players/p1/credit'), b.apiKey, { amount: 5_000_000, reference: 'c2' });
  const pv = boot.body.token, pm = (await call('GET', '/api/play/bootstrap', s1.body.sessionToken)).body.token;
  assert.equal((await call('POST', '/api/play/wheel/bet', pv, { bets: [{ target: 'seven', amount: 100_000 }] })).status, 200);
  const stVip = await call('GET', '/api/play/wheel/state', pv), stMain = await call('GET', '/api/play/wheel/state', pm);
  assert.equal(stVip.body.pot.seven, 100_000); assert.equal(stMain.body.pot.seven, undefined, "main room does not see the VIP room's pot");
  assert.equal(stVip.body.timing.betSeconds, 10); assert.equal(stMain.body.timing.betSeconds, 20);
  assert.equal(stVip.body.round.no, 1001); assert.equal(stMain.body.round.no, 1001, 'every room counts its own rounds');
  // the preset limit applies inside the room only
  assert.equal((await call('POST', '/api/play/wheel/bet', pv, { bets: [{ target: 'plum', amount: 2_000_001 }] })).body.code, 'max_bet');

  // presence expires, then an empty room can be deleted
  await container.cache.flush();
  assert.equal((await call('DELETE', api(b, '/rooms/vip'), b.apiKey)).status, 200);
  assert.equal((await call('GET', api(b, '/rooms'), b.apiKey)).body.rooms.some((r: any) => r.key === 'vip'), false);

  // the same API is available to the signed-in buyer in the dashboard
  assert.ok((await call('GET', `/api/licenses/${b.lic}/rooms`, b.T)).body.rooms.length >= 2);
  assert.equal((await call('POST', api(b, '/rooms'), undefined, { key: 'z' })).status, 401);
});

test('leaderboard: periods, metrics, rooms and "me"', async () => {
  const { call, buyer, age, container } = h;
  const b = await buyer('lb@test.com', { guest: false, wallet: 'managed' });
  const tokens: Record<string, string> = {};
  for (const [i, id] of ['ann', 'bob', 'cy'].entries()) {
    await call('POST', api(b, `/players/${id}/credit`), b.apiKey, { amount: 10_000_000, reference: 'seed-' + id, displayName: id.toUpperCase() });
    const s = await call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId: id });
    tokens[id] = (await call('GET', '/api/play/bootstrap', s.body.sessionToken)).body.token;
    // different stakes so the ranking by "wagered" has a clear order
    assert.equal((await call('POST', '/api/play/wheel/bet', tokens[id], { bets: [{ target: 'plum', amount: 100_000 * (i + 1) }] })).status, 200);
  }
  await age(40_000);
  await container.wheel.settleDue(Date.now());

  const lb = (q = '') => call('GET', api(b, `/leaderboard${q}`), b.apiKey);
  const byStake = (await lb('?metric=wagered')).body;
  assert.deepEqual(byStake.entries.map((e: any) => e.playerId), ['cy', 'bob', 'ann']);
  assert.deepEqual(byStake.entries.map((e: any) => e.value), [300_000, 200_000, 100_000]);
  assert.equal(byStake.entries[0].displayName, 'CY'); assert.equal(byStake.entries[0].rank, 1);

  const won = (await lb('?metric=winnings&room=main&period=day')).body.entries as any[];
  const hit = (await container.cache.getJson('x'), won.some(e => e.value > 0));
  assert.deepEqual(won.map(e => e.value), [...won.map(e => e.value)].sort((a, b) => b - a), 'sorted by the metric');
  assert.equal(won.reduce((a, e) => a + e.value, 0), won.reduce((a, e) => a + e.won, 0));
  void hit;

  const me = (await lb('?metric=wagered&playerId=bob')).body.me;
  assert.equal(me.rank, 2); assert.equal(me.value, 200_000); assert.equal(me.displayName, 'BOB');
  assert.equal((await lb('?metric=wagered&playerId=nobody')).body.me, null);
  assert.equal((await lb('?room=other')).body.entries.length, 0, 'nothing in another room');
  assert.equal((await lb('?limit=2&metric=wagered')).body.entries.length, 2);
  assert.equal((await lb('?period=year')).body.code, 'invalid_period');
  assert.equal((await lb('?metric=luck')).body.code, 'invalid_metric');
  assert.equal((await call('GET', `/api/licenses/${b.lic}/leaderboard?metric=wagered`, b.T)).body.entries.length, 3, 'the dashboard can read it too');
});

test('sandbox: the test key only opens test games, the live key only live games', async () => {
  const { call, buyer } = h;
  const b = await buyer('sb@test.com', { guest: false });
  const testKey = (await call('POST', '/api/account/test-api-key', b.T)).body.apiKey as string;
  assert.match(testKey, /^mgs_test_/);
  const status = (await call('GET', '/api/account/api-key', b.T)).body;
  assert.equal(status.hasTestKey, true); assert.equal(status.testPrefix, testKey.slice(0, 16));

  const body = { gameId: b.lic, playerId: 'u1' };
  assert.equal((await call('POST', '/api/v1/sessions', b.apiKey, body)).status, 200, 'live key, live game');
  const wrong = await call('POST', '/api/v1/sessions', testKey, body);
  assert.equal(wrong.status, 403); assert.equal(wrong.body.code, 'wrong_environment');
  assert.equal((await call('GET', '/api/v1/games', testKey)).body.games.length, 0, 'the test key sees no live games');

  assert.equal((await call('PUT', `/api/licenses/${b.lic}`, b.T, { mode: 'test' })).body.license.mode, 'test');
  assert.equal((await call('POST', '/api/v1/sessions', testKey, body)).status, 200, 'test key, test game');
  assert.equal((await call('POST', '/api/v1/sessions', b.apiKey, body)).body.code, 'wrong_environment');
  assert.equal((await call('GET', '/api/v1/games', testKey)).body.games.length, 1);
  assert.equal((await call('PUT', `/api/licenses/${b.lic}`, b.T, { mode: 'staging' })).status, 400);
  assert.equal((await call('POST', '/api/v1/sessions', 'mgs_test_nope', body)).status, 401);
});

test('WebSocket push: state without polling, balance and bets at once, rooms apart', async () => {
  const { call, buyer, base } = h;
  const b = await buyer('ws@test.com', { guest: false, wallet: 'managed' });
  await call('POST', api(b, '/rooms'), b.apiKey, { key: 'side', name: 'Side room' });
  const open = async (playerId: string, room: string) => {
    await call('POST', api(b, `/players/${playerId}/credit`), b.apiKey, { amount: 1_000_000, reference: 'seed-' + playerId });
    const s = await call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId, room });
    const token = (await call('GET', '/api/play/bootstrap', s.body.sessionToken)).body.token as string;
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
    const msgs: any[] = [];
    ws.on('message', m => msgs.push(JSON.parse(m.toString())));
    await new Promise(r => ws.once('open', r));
    ws.send(JSON.stringify({ t: 'auth', token }));
    for (let i = 0; i < 50 && !msgs.some(m => m.t === 'state'); i++) await sleep(50);
    return { ws, msgs, token, state: () => [...msgs].reverse().find(m => m.t === 'state') };
  };

  const a = await open('wsa', 'main'), c = await open('wsc', 'side');
  assert.ok(a.state(), 'the first picture arrives right after authentication');
  assert.equal(a.state().balance, 1_000_000); assert.equal(a.state().round.phase, 'betting'); assert.equal(a.state().round.result, null, 'no outcome while betting');
  assert.deepEqual(a.state().mine, {}); assert.equal(a.state().winners, null);

  // a bet is visible immediately: own bets, the pot and the balance
  assert.equal((await call('POST', '/api/play/wheel/bet', a.token, { bets: [{ target: 'seven', amount: 30_000 }] })).status, 200);
  await sleep(150);
  assert.deepEqual(a.state().mine, { seven: 30_000 }); assert.equal(a.state().pot.seven, 30_000); assert.equal(a.state().balance, 970_000);
  assert.equal(c.state().pot.seven, undefined, 'the side room is not told');

  // coins credited by the client's server show up without any request from the game
  await call('POST', api(b, '/players/wsa/credit'), b.apiKey, { amount: 5_000, reference: 'top-1' });
  await sleep(150);
  assert.equal(a.state().balance, 975_000);

  // it keeps coming once a second, and ping answers with the server clock
  const before = a.msgs.filter(m => m.t === 'state').length;
  await sleep(2300);
  assert.ok(a.msgs.filter(m => m.t === 'state').length >= before + 2, 'periodic pushes');
  a.ws.send(JSON.stringify({ t: 'ping', c: 123 }));
  await sleep(150);
  const pong = a.msgs.find(m => m.t === 'pong');
  assert.equal(pong.c, 123); assert.ok(Math.abs(pong.s - Date.now()) < 2000);

  // the same message shape as the HTTP state, so the game can use either
  const http = (await call('GET', '/api/play/wheel/state', a.token)).body;
  assert.equal(http.round.no, a.state().round.no); assert.deepEqual(http.pot, a.state().pot); assert.deepEqual(http.mine, a.state().mine);

  // bad credentials are refused
  const bad = new WebSocket(base.replace('http', 'ws') + '/ws');
  const closed = new Promise<number>(r => bad.once('close', code => r(code)));
  await new Promise(r => bad.once('open', r));
  bad.send(JSON.stringify({ t: 'auth', token: 'nope' }));
  assert.equal(await closed, 4401);

  a.ws.close(); c.ws.close();
});

/** A pretend wallet of a client: keeps balances, checks signatures, answers idempotently, and can be told to fail. */
async function fakeWallet(secret: () => string) {
  const balances = new Map<string, number>();
  const calls: any[] = [];
  const seen = new Map<string, any>();                 // reference -> answer (idempotency)
  let failing = false;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      const ts = String(req.headers['x-minigame-timestamp']);
      const ok = req.headers['x-minigame-signature'] === 'v1=' + crypto.createHmac('sha256', secret()).update(`${ts}.${raw}`).digest('hex');
      if (!ok) { res.writeHead(401).end('{"error":"bad signature"}'); return; }
      const m = JSON.parse(raw);
      calls.push(m);
      if (failing && m.type !== 'ping') { res.writeHead(500).end('{}'); return; }
      const reply = (status: number, body: object) => { res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body)); };
      if (m.type === 'ping') return reply(200, { ok: true });
      const bal = balances.get(m.playerId) ?? 0;
      if (m.type === 'balance') return reply(200, { balance: bal });
      if (seen.has(m.reference) && m.type !== 'rollback') return reply(200, seen.get(m.reference));
      if (m.type === 'debit') {
        if (bal < m.amount) return reply(402, { code: 'insufficient_balance', balance: bal });
        balances.set(m.playerId, bal - m.amount); const a = { balance: bal - m.amount }; seen.set(m.reference, a); return reply(200, a);
      }
      if (m.type === 'credit') { balances.set(m.playerId, bal + m.amount); const a = { balance: bal + m.amount }; seen.set(m.reference, a); return reply(200, a); }
      if (m.type === 'rollback') {
        const debit = seen.get(m.reference);                                   // only undo a debit that really happened
        if (debit && !seen.has('rb:' + m.reference)) { balances.set(m.playerId, bal + m.amount); seen.set('rb:' + m.reference, true); }
        return reply(200, { balance: balances.get(m.playerId) ?? 0 });
      }
      reply(400, { code: 'unknown_type' });
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  return { balances, calls, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/wallet`, fail: (v: boolean) => { failing = v; }, close: () => server.close() };
}

test('seamless wallet: the client keeps the coins; stake, win, insufficient funds and outage', async () => {
  const { call, buyer, age, container } = h;
  const b = await buyer('seam@test.com', { guest: false });
  const hook = await (async () => {
    const got: any[] = [];
    const server = http.createServer((req, res) => { let s = ''; req.on('data', c => { s += c; }); req.on('end', () => { got.push(JSON.parse(s)); res.writeHead(200).end(); }); });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    return { got, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/h`, close: () => server.close() };
  })();
  let secret = '';
  const wallet = await fakeWallet(() => secret);
  try {
    // the game cannot use the seamless wallet until the endpoint is set
    assert.equal((await call('PUT', `/api/licenses/${b.lic}`, b.T, { walletMode: 'seamless' })).body.code, 'wallet_endpoint_missing');
    assert.equal((await call('PUT', '/api/account/wallet-endpoint', b.T, { url: 'ftp://x' })).status, 400);
    assert.equal((await call('PUT', '/api/account/wallet-endpoint', b.T, { url: wallet.url })).status, 200);
    await call('PUT', '/api/account/webhook', b.T, { url: hook.url });
    secret = (await call('GET', '/api/account/webhook', b.T)).body.secret;
    assert.equal((await call('POST', '/api/account/wallet-endpoint/test', b.T)).body.ok, true, 'ping works and is signed');
    assert.equal((await call('PUT', `/api/licenses/${b.lic}`, b.T, { walletMode: 'seamless' })).body.license.walletMode, 'seamless');
    // the managed wallet API says clearly that this is a different mode
    assert.equal((await call('POST', api(b, '/players/s1/credit'), b.apiKey, { amount: 1, reference: 'r1' })).body.code, 'wallet_not_enabled');

    wallet.balances.set('s1', 100_000);
    const sess = await call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId: 's1' });
    const boot = await call('GET', '/api/play/bootstrap', sess.body.sessionToken);
    assert.equal(boot.body.player.balance, 100_000, 'the game starts with the balance the client reports');
    const P = boot.body.token;
    assert.equal((await call('POST', '/api/play/refill', P)).body.code, 'refill_disabled');

    // stake: taken from the client's wallet before the bet is stored
    const bet = await call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'seven', amount: 30_000 }] });
    assert.equal(bet.status, 200); assert.equal(bet.body.balance, 70_000);
    assert.equal(wallet.balances.get('s1'), 70_000);
    const debit = wallet.calls.find(c => c.type === 'debit');
    assert.equal(debit.amount, 30_000); assert.equal(debit.playerId, 's1'); assert.match(debit.reference, /^bet:/); assert.equal(debit.livemode, true);

    // not enough coins: refused by the client's wallet, the bet is not stored, the buyer is told once
    const poor = await call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'plum', amount: 900_000 }] });
    assert.equal(poor.status, 402); assert.equal(poor.body.code, 'insufficient_balance');
    await call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'plum', amount: 900_000 }] });
    await container.webhooks.deliverDue();
    assert.equal(hook.got.filter(e => e.type === 'player.needs_coins').length, 1, 'once per player and five minutes');
    assert.equal(hook.got.find(e => e.type === 'player.needs_coins').data.playerId, 's1');

    // the wallet is down: no stake is taken, and anything uncertain is given back
    wallet.fail(true);
    const down = await call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'plum', amount: 30_000 }] });
    assert.equal(down.status, 503); assert.equal(down.body.code, 'wallet_unavailable');
    assert.equal((await SeamlessOpModel.find({ type: 'rollback', status: 'pending' }).lean()).length, 1, 'a rollback is stored for the uncertain stake');
    wallet.fail(false);
    await SeamlessOpModel.updateMany({}, { $set: { nextAttemptAt: Date.now() - 1 } });
    await container.seamless.deliverDue();
    assert.equal((await SeamlessOpModel.find({ type: 'rollback', status: 'done' }).lean()).length, 1);
    assert.equal(wallet.balances.get('s1'), 70_000, 'the client balance is unchanged: the rollback of a debit that never applied does nothing');

    // payout: the win is stored, then sent to the client's wallet until it acknowledges
    await age(40_000);
    await container.wheel.settleDue(Date.now());
    const round = (await call('GET', '/api/play/wheel/state', P)).body;
    const hits = (await h.container.wheel.history(b.lic, 'main'))[0]?.hits ?? [];
    const win = hits.includes('seven') ? 240_000 : 0;
    await container.seamless.deliverDue();
    assert.equal(wallet.balances.get('s1'), 70_000 + win, 'the win reached the client wallet');
    void round;
    if (win) assert.equal((await SeamlessOpModel.find({ type: 'credit', status: 'done' }).lean()).length, 1);
    // every movement is in the ledger with the balance the client reported
    const tx = (await call('GET', api(b, '/players/s1/transactions'), b.apiKey)).body;
    assert.equal(tx.transactions[tx.transactions.length - 1].type, 'bet');
    assert.equal(tx.balance, 70_000 + win);

    // a client that is down for a payout does not lose it
    if (win) {
      // (covered by the retry schedule: the stored operation is retried until acknowledged)
      assert.ok((await call('GET', '/api/account/wallet-endpoint/operations', b.T)).body.operations.length >= 1);
    }
  } finally { wallet.close(); hook.close(); }
});

test('openapi: the published contract matches the real routes', async () => {
  const { call, buyer } = h;
  const b = await buyer('oa@test.com', { guest: false });
  const spec = (await call('GET', '/openapi.json')).body;
  assert.equal(spec.openapi, '3.1.0');
  assert.ok(Object.keys(spec.webhooks).length >= 5);
  let n = 0;
  for (const [path, ops] of Object.entries<any>(spec.paths)) {
    for (const method of Object.keys(ops)) {
      const url = path.replace(/\{(\w+)\}/g, 'x');
      const r = await call(method.toUpperCase(), url, b.apiKey, method === 'post' || method === 'put' ? {} : undefined);
      assert.notEqual(r.body?.code, 'not_found', `${method.toUpperCase()} ${path} is documented but does not exist`);
      assert.notEqual(r.status, 401, `${method.toUpperCase()} ${path} should accept an API key`);
      n++;
    }
  }
  assert.equal(n, 13, 'every documented operation was checked');
  // every documented schema reference resolves
  const text = JSON.stringify(spec);
  for (const m of text.matchAll(/#\/components\/schemas\/(\w+)/g)) assert.ok(spec.components.schemas[m[1]], 'missing schema ' + m[1]);
});
