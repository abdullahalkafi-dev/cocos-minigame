// Regression tests written during the full audit (see docs/operations/audit-log.md).
// Each test pins down a defect that was found and fixed, or a guarantee the platform must keep.
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { startHarness } from './harness.js';
import { WheelRoundModel } from '../modules/lucky-wheel/wheel.model.js';
import { ResultModel } from '../modules/results/result.model.js';
import { SeamlessOpModel } from '../modules/seamless/seamless.model.js';
import { LedgerModel } from '../modules/ledger/ledger.model.js';
import { UserModel } from '../modules/users/user.model.js';
import { safePost } from '../common/http/safe-fetch.js';

let h: Awaited<ReturnType<typeof startHarness>>;
before(async () => { h = await startHarness(); });
after(async () => { await h.stop(); });
beforeEach(async () => { await h.reset(); });

const api = (b: { lic: string }, p = '') => `/api/v1/games/${b.lic}${p}`;
const TARGETS = ['seven', 'plum'];

/** A buyer with a managed wallet, one player with `coins`, and that player's game token. */
async function managedPlayer(email: string, coins: number, playerId = 'p1') {
  const b = await h.buyer(email, { guest: false, wallet: 'managed' });
  await h.call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId });
  await h.call('POST', api(b, `/players/${playerId}/credit`), b.apiKey, { amount: coins, reference: 'seed' });
  const sess = await h.call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId });
  const boot = await h.call('GET', '/api/play/bootstrap', sess.body.sessionToken);
  return { b, P: boot.body.token as string, id: boot.body.player.id as string };
}

test('bets: absurd or malformed amounts are refused with 400, never a server error', async () => {
  const { P } = await managedPlayer('amounts@test.com', 100_000);
  const bad: unknown[] = [1e300, 1e15, 2 ** 53, -5, 0, 1.5, 'abc', null, NaN, Infinity];
  for (const amount of bad) {
    const r = await h.call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'seven', amount }] });
    assert.equal(r.status, 400, `amount ${String(amount)} should be a 400, got ${r.status}`);
  }
  // many small bets that add up to something huge are refused too
  const many = Array.from({ length: 24 }, () => ({ target: 'seven', amount: 1_000_000_000_000 }));
  assert.equal((await h.call('POST', '/api/play/wheel/bet', P, { bets: many })).status, 400);
  assert.equal((await h.call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'seven', amount: 1000 }] })).status, 200, 'a normal bet still works');
});

test('bets: 20 simultaneous bets can never spend more than the balance, and the ledger always adds up', async () => {
  const { P, id } = await managedPlayer('race@test.com', 10_000);
  const results = await Promise.all(Array.from({ length: 20 }, () => h.call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'seven', amount: 1000 }] })));
  const ok = results.filter(r => r.status === 200).length;
  assert.equal(ok, 10, 'exactly ten bets of 1,000 fit into 10,000');
  assert.ok(results.filter(r => r.status !== 200).every(r => r.status === 402 && r.body.code === 'insufficient_balance'));
  const me = (await h.call('GET', '/api/play/me', P)).body.player;
  assert.equal(me.balance, 0);
  assert.equal(await h.ledgerSum(id), 0 + 0, 'credit +10,000 and ten bets of -1,000 add up to the balance');
});

test('max bet per option holds under simultaneous bets', async () => {
  const { b, P } = await managedPlayer('maxbet@test.com', 100_000);
  assert.equal((await h.call('PUT', api(b, '/rooms/main'), b.apiKey, { overrides: { maxPerTarget: 3000 } })).status, 200);
  const res = await Promise.all(Array.from({ length: 10 }, () => h.call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'plum', amount: 1000 }] })));
  assert.equal(res.filter(r => r.status === 200).length, 3, 'only three bets of 1,000 fit under the 3,000 limit');
  assert.ok(res.filter(r => r.status !== 200).every(r => r.body.code === 'max_bet'));
  assert.equal((await h.call('GET', '/api/play/wheel/state', P)).body.mine.plum, 3000);
});

test('managed wallet: simultaneous identical credits apply exactly once', async () => {
  const b = await h.buyer('idem@test.com', { guest: false, wallet: 'managed' });
  await h.call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId: 'p1' });
  const res = await Promise.all(Array.from({ length: 12 }, () => h.call('POST', api(b, '/players/p1/credit'), b.apiKey, { amount: 500, reference: 'same-ref' })));
  assert.ok(res.every(r => r.status === 200), 'every retry gets a normal answer');
  assert.equal(res.filter(r => r.body.duplicate === false).length, 1, 'only one of them moved money');
  assert.equal((await h.call('GET', api(b, '/players/p1'), b.apiKey)).body.balance, 500);
  // the same reference for another amount is a clear conflict
  assert.equal((await h.call('POST', api(b, '/players/p1/credit'), b.apiKey, { amount: 501, reference: 'same-ref' })).body.code, 'reference_conflict');
});

test('demo refill: simultaneous refills cannot print extra coins', async () => {
  const b = await h.buyer('refill@test.com');
  const P = await h.player(b.session, 'refiller');
  const me = (await h.call('GET', '/api/play/me', P)).body.player;
  const start = me.balance;
  // spend everything so a refill is allowed
  await h.call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'seven', amount: start }] });
  const res = await Promise.all(Array.from({ length: 10 }, () => h.call('POST', '/api/play/refill', P)));
  assert.ok(res.some(r => r.status === 200));
  const after = (await h.call('GET', '/api/play/me', P)).body.player;
  assert.equal(after.balance, start, 'the balance is back at the starting balance, not a multiple of it');
  assert.equal(await h.ledgerSum(me.id), after.balance);
});

test('seamless wallet: a payout that is interrupted and run again finishes without paying twice', async () => {
  const balances = new Map<string, number>([['s1', 1_000_000]]);
  const credits: string[] = [];
  const seen = new Map<string, unknown>();
  const server = http.createServer((req, res) => {
    let raw = ''; req.on('data', c => { raw += c; }); req.on('end', () => {
      const m = JSON.parse(raw);
      const reply = (status: number, body: object) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
      const bal = balances.get(m.playerId) ?? 0;
      if (m.type === 'ping') return reply(200, { ok: true });
      if (m.type === 'balance') return reply(200, { balance: bal });
      if (seen.has(m.reference)) return reply(200, seen.get(m.reference) as object);
      if (m.type === 'debit') { balances.set(m.playerId, bal - m.amount); const a = { balance: bal - m.amount }; seen.set(m.reference, a); return reply(200, a); }
      if (m.type === 'credit') { credits.push(m.reference); balances.set(m.playerId, bal + m.amount); const a = { balance: bal + m.amount }; seen.set(m.reference, a); return reply(200, a); }
      reply(200, { balance: bal });
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  try {
    const b = await h.buyer('seamresume@test.com', { guest: false });
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/w`;
    assert.equal((await h.call('PUT', '/api/account/wallet-endpoint', b.T, { url })).status, 200);
    assert.equal((await h.call('PUT', `/api/licenses/${b.lic}`, b.T, { walletMode: 'seamless' })).status, 200);
    const sess = await h.call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId: 's1' });
    const P = (await h.call('GET', '/api/play/bootstrap', sess.body.sessionToken)).body.token;
    // bet on every option: whatever the wheel shows, this player wins something
    const targets = (await h.call('GET', '/api/play/bootstrap', sess.body.sessionToken)).body.config.targets.map((t: any) => t.id);
    const bet = await h.call('POST', '/api/play/wheel/bet', P, { bets: targets.map((t: string) => ({ target: t, amount: 1000 })) });
    assert.equal(bet.status, 200, JSON.stringify(bet.body));

    await h.age(40_000);
    await h.container.wheel.settleDue(Date.now());
    const round = await WheelRoundModel.findOne({}).lean();
    assert.equal(round!.settled, true);
    assert.equal(await SeamlessOpModel.countDocuments({ type: 'credit' }), 1);

    // simulate a crash right before the round was marked as paid: another server runs the same payout again
    await WheelRoundModel.updateOne({ _id: round!._id }, { $set: { settled: false, leaseUntil: null } });
    await h.container.wheel.settleDue(Date.now());
    assert.equal((await WheelRoundModel.findOne({ _id: round!._id }).lean())!.settled, true, 'the repeated payout completes instead of failing forever');
    assert.equal(await SeamlessOpModel.countDocuments({ type: 'credit' }), 1, 'still exactly one credit');
    await h.container.seamless.deliverDue();
    await h.container.seamless.deliverDue();
    assert.equal(credits.length, 1, 'the client wallet was asked to pay once');
  } finally { server.close(); }
});

test('changing the wallet mode in the middle of a round cannot move money between two systems', async () => {
  const { b, P } = await managedPlayer('modeswitch@test.com', 100_000);
  assert.equal((await h.call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'seven', amount: 1000 }] })).status, 200);
  assert.equal((await h.call('PUT', `/api/licenses/${b.lic}`, b.T, { walletMode: 'demo' })).status, 200);
  const r = await h.call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'seven', amount: 1000 }] });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'wallet_mode_changed');
  // the round that was started under the old mode is paid under the old mode: no credit to a seamless wallet, no free coins
  await h.age(40_000);
  await h.container.wheel.settleDue(Date.now());
  assert.equal(await SeamlessOpModel.countDocuments({}), 0);
});

test('leaderboard: bad filters are refused and "me" always agrees with the list, ties included', async () => {
  const b = await h.buyer('lb2@test.com', { guest: false, wallet: 'managed' });
  for (const p of ['a', 'b', 'c', 'd']) await h.call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId: p });
  const ids = new Map<string, string>();
  for (const p of ['a', 'b', 'c', 'd']) ids.set(p, (await h.container.players.byExternal(b.lic, p))!._id);
  const row = (p: string, win: number, bet: number, n: number) => ({ _id: `r_${p}_${n}`, gameId: b.lic, roomId: 'main', playerId: ids.get(p)!, slug: 'lucky-wheel', bet, win, outcome: {}, isPreview: false, createdAt: Date.now() });
  // a, b and c have the same winnings, but different amounts wagered; d is last
  await ResultModel.insertMany([row('a', 500, 100, 1), row('b', 500, 300, 1), row('c', 500, 200, 1), row('d', 100, 50, 1)]);
  const board = (await h.call('GET', api(b, '/leaderboard?metric=winnings'), b.apiKey)).body;
  for (const e of board.entries) {
    const me = (await h.call('GET', api(b, `/leaderboard?metric=winnings&playerId=${e.playerId}`), b.apiKey)).body.me;
    assert.equal(me.rank, e.rank, `rank of ${e.playerId} must match its place in the list`);
  }
  assert.deepEqual(board.entries.map((e: any) => e.playerId), ['b', 'c', 'a', 'd']);
  assert.equal((await h.call('GET', api(b, '/leaderboard?room=Bad%20Room'), b.apiKey)).status, 400);
  assert.equal((await h.call('GET', api(b, '/leaderboard?playerId=' + 'x'.repeat(200)), b.apiKey)).status, 400);
  assert.equal((await h.call('GET', api(b, '/leaderboard?limit=abc'), b.apiKey)).status, 200, 'a bad limit falls back to the default');
});

test('uploads: a malformed form is a 400, not a server error', async () => {
  const b = await h.buyer('upl@test.com');
  const fd = new FormData();
  fd.append('wrongfield', new Blob([new Uint8Array([1, 2, 3])]), 'x.png');
  const r = await fetch(`${h.base}/api/licenses/${b.lic}/upload`, { method: 'POST', headers: { authorization: `Bearer ${b.T}` }, body: fd });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'bad_request');
});

test('webhook secret that cannot be decrypted (server secret changed) does not break the dashboard', async () => {
  const b = await h.buyer('badsecret@test.com');
  assert.equal((await h.call('PUT', '/api/account/webhook', b.T, { url: 'http://127.0.0.1:9/hook' })).status, 200);
  await UserModel.updateOne({ email: 'badsecret@test.com' }, { $set: { webhookSecret: 'enc1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } });
  const cfg = await h.call('GET', '/api/account/webhook', b.T);
  assert.equal(cfg.status, 200);
  assert.equal(cfg.body.secret, null);
  // setting the address again creates a fresh secret
  const again = await h.call('PUT', '/api/account/webhook', b.T, { url: 'http://127.0.0.1:9/hook' });
  assert.equal(again.status, 200);
  assert.match(again.body.secret, /^whsec_/);
});

test('safe outgoing calls: private addresses are refused at connection time, answers are size-limited', async () => {
  await assert.rejects(() => safePost('https://localhost/x', { body: '{}', headers: {}, timeoutMs: 2000, allowPrivate: false }), /private|local/i);
  await assert.rejects(() => safePost('https://127.0.0.1/x', { body: '{}', headers: {}, timeoutMs: 2000, allowPrivate: false }), /private|local/i);
  await assert.rejects(() => safePost('https://[::1]/x', { body: '{}', headers: {}, timeoutMs: 2000, allowPrivate: false }), /private|local/i);
  // redirects are not followed, and a huge answer is cut off
  const server = http.createServer((req, res) => {
    if (req.url === '/redir') { res.writeHead(302, { location: 'http://127.0.0.1:1/' }).end(); return; }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"balance":5,"pad":"' + 'x'.repeat(3_000_000) + '"}');
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const r1 = await safePost(base + '/redir', { body: '{}', headers: {}, timeoutMs: 2000, allowPrivate: true });
    assert.equal(r1.status, 302);
    const r2 = await safePost(base + '/big', { body: '{}', headers: {}, timeoutMs: 2000, allowPrivate: true });
    assert.equal(r2.status, 200);
    assert.equal(r2.json, null, 'an oversized answer is not parsed');
  } finally { server.close(); }
});

test('login: wrong password for a real account and for an unknown account look the same', async () => {
  await h.buyer('real@test.com');
  const a = await h.call('POST', '/api/auth/login', undefined, { email: 'real@test.com', password: 'wrongpassword' });
  const c = await h.call('POST', '/api/auth/login', undefined, { email: 'ghost@test.com', password: 'wrongpassword' });
  assert.equal(a.status, 401); assert.equal(c.status, 401);
  assert.deepEqual(a.body, c.body);
});

test('ledger: every balance equals the sum of its entries after a mixed workload', async () => {
  const { P, id, b } = await managedPlayer('mix@test.com', 50_000);
  await h.call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'seven', amount: 5000 }, { target: 'plum', amount: 5000 }] });
  await h.call('POST', api(b, '/players/p1/debit'), b.apiKey, { amount: 1000, reference: 'out1' });
  await h.age(40_000);
  await h.container.wheel.settleDue(Date.now());
  await h.container.wheel.settleDue(Date.now());           // running it twice must not pay twice
  const me = (await h.call('GET', '/api/play/me', P)).body.player;
  assert.equal(await h.ledgerSum(id), me.balance);
  const wins = await LedgerModel.find({ playerId: id, kind: 'win' }).lean();
  assert.ok(wins.length <= 1, 'at most one payout entry per round');
  void TARGETS;
});

test('many simultaneous valid requests from one address (a client server, an office) are never throttled as failures', async () => {
  const b = await h.buyer('burst@test.com', { guest: false });
  const res = await Promise.all(Array.from({ length: 160 }, (_, i) => (i % 2 ? h.call('GET', '/api/health') : h.call('GET', '/api/v1/games', b.apiKey))));
  assert.equal(res.filter(r => r.status === 429).length, 0);
  assert.equal(res.filter(r => r.status === 200).length, 160);
});

// These two exhaust the per-address limits for a minute, so they run last.
test('rate limits cannot be dodged by sending a different fake token each time', async () => {
  const codes: number[] = [];
  for (let i = 0; i < 40; i++) {
    const r = await fetch(h.base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer fakefakefakefakefake-${i}` }, body: JSON.stringify({ email: `nobody${i}@test.com`, password: 'wrongpassword' }) });
    codes.push(r.status);
  }
  assert.ok(codes.includes(429), 'the login limit applies per address, so random tokens do not help');
});

test('repeated failed API key attempts from one address get throttled', async () => {
  const b = await h.buyer('floodkey@test.com', { guest: false });
  let throttled = false;
  for (let i = 0; i < 150 && !throttled; i++) {
    const r = await h.call('GET', '/api/v1/games', `mgs_notarealkey${i}`);
    if (r.status === 429) throttled = true;
  }
  assert.ok(throttled, 'a flood of invalid keys is slowed down');
  void b;
});


test('a Redis that is down costs one short delay, then requests stay fast', async () => {
  const { RedisCache } = await import('../infra/cache.js');
  const dead = new RedisCache('redis://127.0.0.1:1');          // nothing listens here
  try {
    await dead.getJson('a');                                   // the first call finds out (may wait for the timeout)
    const t0 = Date.now();
    for (let i = 0; i < 50; i++) { await dead.getJson('k' + i); await dead.setJson('k' + i, 1, 5); await dead.touchPresence('s', ['p'], 30); await dead.countPresence('s', 30); }
    const release = await dead.lock('x', 1000);
    assert.ok(release, 'work is never blocked by a dead Redis');
    assert.ok(Date.now() - t0 < 500, `200 calls took ${Date.now() - t0} ms: they must be skipped, not each wait for a timeout`);
    await assert.rejects(() => dead.command(['PING']));
  } finally { await dead.close(); }
});
