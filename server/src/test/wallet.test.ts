import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { startHarness } from './harness.js';
import { PlayerModel } from '../modules/players/player.model.js';
import { WheelRoundModel } from '../modules/lucky-wheel/wheel.model.js';
import { WebhookEventModel } from '../modules/webhooks/webhook.model.js';

let h: Awaited<ReturnType<typeof startHarness>>;
before(async () => { h = await startHarness(); });
after(async () => { await h.stop(); });
beforeEach(async () => { await h.reset(); });

const game = (b: { lic: string }) => `/api/v1/games/${b.lic}/players`;

test('identity: the client names the player, nobody else can', async () => {
  const { call, buyer } = h;
  const b = await buyer('id@test.com', { guest: false });
  const sess = (body: object) => call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, ...body });

  // a real client setup: a player id is required, because the game does not allow guests
  const missing = await sess({});
  assert.equal(missing.status, 400); assert.equal(missing.body.code, 'player_id_required');
  assert.equal((await sess({ playerId: 'bad id!' })).body.code, 'invalid_player_id');
  assert.equal((await sess({ playerId: 'u_1', displayName: '' })).body.code, 'invalid_displayName');
  assert.equal((await sess({ playerId: 'u_1', avatarUrl: 'http://x.test/a.png' })).body.code, 'invalid_avatarUrl');

  const s1 = await sess({ playerId: 'user:8841', displayName: 'Maria', avatarUrl: 'https://cdn.example.com/m.png' });
  assert.equal(s1.status, 200); assert.equal(s1.body.playerId, 'user:8841');
  const boot = await call('GET', '/api/play/bootstrap', s1.body.sessionToken);
  assert.equal(boot.body.player.username, 'Maria', 'the game shows the name the client sent');
  assert.equal(boot.body.player.playerId, 'user:8841');
  assert.equal(boot.body.player.balance, 5_000_000, 'demo wallet: starting balance');

  // the player can already play, and cannot rename or switch identity by calling the login endpoint
  const play = await call('GET', '/api/play/wheel/state', boot.body.token);
  assert.equal(play.status, 200);
  const login = await call('POST', '/api/play/login', s1.body.sessionToken, { username: 'someone_else' });
  assert.equal(login.status, 403); assert.equal(login.body.code, 'guest_login_disabled');

  // a later session updates the name; the same id is always the same player
  await sess({ playerId: 'user:8841', displayName: 'Maria G.' });
  assert.equal((await PlayerModel.find({ externalId: 'user:8841' })).length, 1);
  assert.equal((await PlayerModel.findOne({ externalId: 'user:8841' }))!.displayName, 'Maria G.');

  // guest mode is an explicit switch: then a session without a player works and players type a name
  assert.equal((await call('PUT', `/api/licenses/${b.lic}`, b.T, { guestLogin: true })).body.license.guestLogin, true);
  const guest = await sess({});
  assert.equal(guest.status, 200);
  assert.equal((await call('POST', '/api/play/login', guest.body.sessionToken, { username: 'typed_name' })).status, 200);
  assert.equal((await call('PUT', `/api/licenses/${b.lic}`, b.T, { guestLogin: 'yes' })).status, 400);
});

test('managed wallet: credit, debit, idempotency, errors, history', async () => {
  const { call, buyer } = h;
  const b = await buyer('w@test.com', { guest: false, wallet: 'managed' });
  const P = (id: string) => `${game(b)}/${encodeURIComponent(id)}`;

  // a new player starts with nothing, and "free refill" is switched off
  const s = await call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId: 'u_1' });
  const boot = await call('GET', '/api/play/bootstrap', s.body.sessionToken);
  assert.equal(boot.body.player.balance, 0);
  assert.equal(boot.body.config.walletMode, 'managed');
  assert.equal((await call('POST', '/api/play/refill', boot.body.token)).body.code, 'refill_disabled');

  // credit
  const c1 = await call('POST', `${P('u_1')}/credit`, b.apiKey, { amount: 1_000_000, reference: 'order-1001', note: 'bought 1M coins' });
  assert.equal(c1.status, 200); assert.equal(c1.body.balance, 1_000_000); assert.equal(c1.body.duplicate, false);
  assert.equal((await call('GET', P('u_1'), b.apiKey)).body.balance, 1_000_000);
  assert.equal((await call('GET', '/api/play/wheel/state', boot.body.token)).body.balance, 1_000_000, 'the game sees the new balance');

  // idempotent: the same reference is the same answer and never moves money twice
  const again = await call('POST', `${P('u_1')}/credit`, b.apiKey, { amount: 1_000_000, reference: 'order-1001' });
  assert.equal(again.status, 200); assert.equal(again.body.duplicate, true);
  assert.equal(again.body.transactionId, c1.body.transactionId); assert.equal(again.body.balance, 1_000_000);
  assert.equal((await call('GET', P('u_1'), b.apiKey)).body.balance, 1_000_000);
  // ...and cannot be reused for something else
  assert.equal((await call('POST', `${P('u_1')}/credit`, b.apiKey, { amount: 5, reference: 'order-1001' })).body.code, 'reference_conflict');
  assert.equal((await call('POST', `${P('u_1')}/debit`, b.apiKey, { amount: 1_000_000, reference: 'order-1001' })).body.code, 'reference_conflict');

  // ten identical requests at the same moment credit once
  const burst = await Promise.all(Array.from({ length: 10 }, () => call('POST', `${P('u_1')}/credit`, b.apiKey, { amount: 500, reference: 'race-1' })));
  assert.ok(burst.every(r => r.status === 200), burst.map(r => r.status).join());
  assert.equal(burst.filter(r => !r.body.duplicate).length, 1, 'exactly one real credit');
  assert.equal((await call('GET', P('u_1'), b.apiKey)).body.balance, 1_000_500);

  // debit, including the refusal that keeps balances from going negative
  const d1 = await call('POST', `${P('u_1')}/debit`, b.apiKey, { amount: 400_500, reference: 'cashout-1' });
  assert.equal(d1.body.balance, 600_000);
  const poor = await call('POST', `${P('u_1')}/debit`, b.apiKey, { amount: 600_001, reference: 'cashout-2' });
  assert.equal(poor.status, 402); assert.equal(poor.body.code, 'insufficient_balance'); assert.equal(poor.body.balance, 600_000);
  assert.equal((await call('POST', `${P('nobody')}/debit`, b.apiKey, { amount: 1, reference: 'x-1' })).body.code, 'player_not_found');
  // a failed debit can be retried with the same reference once there are coins
  await call('POST', `${P('u_1')}/credit`, b.apiKey, { amount: 1, reference: 'topup-1' });
  assert.equal((await call('POST', `${P('u_1')}/debit`, b.apiKey, { amount: 600_001, reference: 'cashout-2' })).body.balance, 0);

  // bad input
  for (const amount of [0, -5, 1.5, '10', null, 1e15]) assert.equal((await call('POST', `${P('u_1')}/credit`, b.apiKey, { amount, reference: 'bad-' + String(amount) })).body.code, 'invalid_amount', String(amount));
  assert.equal((await call('POST', `${P('u_1')}/credit`, b.apiKey, { amount: 5 })).body.code, 'reference_required');
  assert.equal((await call('POST', `${P('u_1')}/credit`, b.apiKey, { amount: 5, reference: 'has space' })).body.code, 'reference_required');

  // history: newest first, with a cursor
  const first = await call('GET', `${P('u_1')}/transactions?limit=3`, b.apiKey);
  assert.equal(first.body.transactions.length, 3); assert.ok(first.body.nextBefore);
  assert.equal(first.body.transactions[0].type, 'debit');
  const rest = await call('GET', `${P('u_1')}/transactions?limit=50&before=${first.body.nextBefore}`, b.apiKey);
  assert.equal(rest.body.nextBefore, null);
  const all = [...first.body.transactions, ...rest.body.transactions];
  assert.equal(all.reduce((a: number, t: any) => a + t.amount, 0), 0, 'every coin is accounted for');
  assert.deepEqual(all.map((t: any) => t.type).reverse(), ['credit', 'credit', 'debit', 'credit', 'debit']);

  // a player credited before ever opening the game, and the display name from the credit
  const pre = await call('POST', `${P('u_new')}/credit`, b.apiKey, { amount: 50, reference: 'welcome-1', displayName: 'Newcomer' });
  assert.equal(pre.body.balance, 50);
  assert.equal((await call('GET', P('u_new'), b.apiKey)).body.displayName, 'Newcomer');
  assert.equal((await call('GET', P('never_seen'), b.apiKey)).status, 404);
});

test('wallet: demo games and other accounts are kept out', async () => {
  const { call, buyer } = h;
  const demo = await buyer('demo@test.com', { guest: false });           // wallet mode stays "demo"
  const other = await buyer('other@test.com', { guest: false, wallet: 'managed' });
  const url = `${game(demo)}/u_1/credit`;
  const r = await call('POST', url, demo.apiKey, { amount: 5, reference: 'a-1' });
  assert.equal(r.status, 409); assert.equal(r.body.code, 'wallet_not_enabled');
  assert.equal((await call('POST', `${game(other)}/u_1/credit`, demo.apiKey, { amount: 5, reference: 'a-2' })).status, 404, "another account's game");
  assert.equal((await call('POST', `${game(other)}/u_1/credit`, undefined, { amount: 5, reference: 'a-3' })).status, 401);
  assert.equal((await call('POST', `${game(other)}/u_1/credit`, other.T, { amount: 5, reference: 'a-4' })).status, 401, 'a dashboard token is not an API key');
  assert.equal((await call('PUT', `/api/licenses/${demo.lic}`, demo.T, { walletMode: 'managed' })).body.license.walletMode, 'managed');
  assert.equal((await call('POST', url, demo.apiKey, { amount: 5, reference: 'a-5' })).status, 200, 'works after switching the mode');
  assert.equal((await call('PUT', `/api/licenses/${demo.lic}`, demo.T, { walletMode: 'crypto' })).status, 400);
});

/** A tiny receiver for webhooks, remembering what it got. */
async function receiver() {
  const got: { headers: http.IncomingHttpHeaders; body: string }[] = [];
  let answer = 200;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => { got.push({ headers: req.headers, body }); res.writeHead(answer).end('ok'); });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  return { got, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`, setAnswer: (n: number) => { answer = n; }, close: () => server.close() };
}
const verifySignature = (secret: string, headers: http.IncomingHttpHeaders, body: string) => {
  const ts = String(headers['x-minigame-timestamp']);
  const expect = 'v1=' + crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  return headers['x-minigame-signature'] === expect;
};

test('webhooks: signed test event, round results, retry with backoff', async () => {
  const { call, buyer, age, container } = h;
  const rx = await receiver();
  try {
    const b = await buyer('hook@test.com', { guest: false, wallet: 'managed' });
    assert.equal((await call('POST', '/api/account/webhook/test', b.T)).body.code, 'webhook_not_configured');
    assert.equal((await call('PUT', '/api/account/webhook', b.T, { url: 'not a url' })).status, 400);

    const set = await call('PUT', '/api/account/webhook', b.T, { url: rx.url });
    assert.equal(set.status, 200); assert.match(set.body.secret, /^whsec_/);
    const secret = set.body.secret as string;

    // test event: delivered, signed with the secret, carrying the documented headers
    const t = await call('POST', '/api/account/webhook/test', b.T);
    assert.equal(t.body.ok, true); assert.equal(t.body.status, 200);
    assert.equal(rx.got.length, 1);
    const ev = JSON.parse(rx.got[0].body);
    assert.equal(ev.type, 'webhook.test'); assert.match(ev.id, /^evt_/);
    assert.equal(rx.got[0].headers['x-minigame-event'], 'webhook.test');
    assert.equal(rx.got[0].headers['x-minigame-delivery'], ev.id);
    assert.ok(verifySignature(secret, rx.got[0].headers, rx.got[0].body), 'signature verifies with the secret');
    assert.ok(!verifySignature('whsec_wrong', rx.got[0].headers, rx.got[0].body), 'and not with another');
    assert.ok(Math.abs(Number(rx.got[0].headers['x-minigame-timestamp']) - Date.now() / 1000) < 10);

    // a real round: a managed-wallet player bets, the round is paid, the buyer's server is told
    await call('POST', `${game(b)}/u_77/credit`, b.apiKey, { amount: 100_000, reference: 'seed-1' });
    const s = await call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId: 'u_77', displayName: 'Seven' });
    const boot = await call('GET', '/api/play/bootstrap', s.body.sessionToken);
    assert.equal((await call('POST', '/api/play/wheel/bet', boot.body.token, { bets: [{ target: 'seven', amount: 30_000 }] })).status, 200);
    await age(40_000);
    await container.wheel.settleDue(Date.now());
    await container.webhooks.deliverDue();
    const settled = rx.got.map(g => JSON.parse(g.body)).find(e => e.type === 'round.settled');
    assert.ok(settled, 'round.settled was delivered');
    assert.equal(settled.gameId, b.lic);
    assert.equal(settled.data.game, 'lucky-wheel');
    assert.deepEqual(settled.data.players, [{ playerId: 'u_77', bet: 30_000, win: settled.data.players[0].win }]);
    assert.ok(settled.data.result.length >= 1);
    const round = (await WheelRoundModel.findOne({}).lean())!;
    assert.equal(settled.data.round, round.no);

    // the buyer's server is down: the event waits and is retried later, never lost
    rx.setAnswer(500);
    await call('POST', `${game(b)}/u_77/credit`, b.apiKey, { amount: 100_000, reference: 'seed-2' });
    const bad = await call('POST', '/api/account/webhook/test', b.T);
    assert.equal(bad.body.ok, false); assert.equal(bad.body.status, 500);
    const pending = (await WebhookEventModel.findById(bad.body.deliveryId).lean())!;
    assert.equal(pending.status, 'pending'); assert.equal(pending.attempts, 1);
    assert.ok(pending.nextAttemptAt > Date.now() + 5000, 'next attempt is in the future');
    const log = await call('GET', '/api/account/webhook/deliveries', b.T);
    assert.equal(log.body.deliveries[0].status, 'pending'); assert.equal(log.body.deliveries[0].lastStatus, 500);

    // the server is back: the manual retry (or the worker, once due) delivers it
    rx.setAnswer(200);
    const retry = await call('POST', `/api/account/webhook/deliveries/${bad.body.deliveryId}/retry`, b.T);
    assert.equal(retry.body.ok, true);
    assert.equal((await WebhookEventModel.findById(bad.body.deliveryId).lean())!.status, 'delivered');
    // the worker picks up due events by itself
    await WebhookEventModel.updateOne({ _id: bad.body.deliveryId }, { $set: { status: 'pending', nextAttemptAt: Date.now() - 1 } });
    const before = rx.got.length;
    await container.webhooks.deliverDue();
    assert.equal(rx.got.length, before + 1);
    // somebody else's delivery cannot be retried
    const other = await buyer('hook2@test.com');
    assert.equal((await call('POST', `/api/account/webhook/deliveries/${bad.body.deliveryId}/retry`, other.T)).status, 404);

    // rotating the secret changes what future events are signed with
    const rot = await call('POST', '/api/account/webhook/secret', b.T);
    assert.notEqual(rot.body.secret, secret);
    await call('POST', '/api/account/webhook/test', b.T);
    const last = rx.got[rx.got.length - 1];
    assert.ok(verifySignature(rot.body.secret, last.headers, last.body));
    // clearing the address stops events being created
    assert.equal((await call('PUT', '/api/account/webhook', b.T, { url: null })).body.configured, false);
  } finally { rx.close(); }
});

test('webhooks: a wallet player who is only a preview never produces events', async () => {
  const { call, buyer, age, container } = h;
  const rx = await receiver();
  try {
    const b = await buyer('prev@test.com');
    await call('PUT', '/api/account/webhook', b.T, { url: rx.url });
    const pv = await call('POST', `/api/licenses/${b.lic}/preview-session`, b.T);
    const token = new URL(pv.body.playUrl).searchParams.get('session')!;
    const P = await h.player(token, 'preview_me');
    await call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'plum', amount: 30_000 }] });
    await age(40_000);
    await container.wheel.settleDue(Date.now());
    await container.webhooks.deliverDue();
    assert.equal(rx.got.filter(g => JSON.parse(g.body).type === 'round.settled').length, 0);
  } finally { rx.close(); }
});
