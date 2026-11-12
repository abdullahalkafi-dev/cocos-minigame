// Features added after questions from a client's developer (see docs/operations/audit-log.md, "Provider questions").
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { startHarness } from './harness.js';
import { RoomModel } from '../modules/rooms/room.model.js';
import { MAX_ROOMS_PER_GAME } from '../config/constants.js';

let h: Awaited<ReturnType<typeof startHarness>>;
before(async () => { h = await startHarness(); });
after(async () => { await h.stop(); });
beforeEach(async () => { await h.reset(); });
const api = (b: { lic: string }, p = '') => `/api/v1/games/${b.lic}${p}`;

async function managed(email: string, coins = 100_000) {
  const b = await h.buyer(email, { guest: false, wallet: 'managed' });
  await h.call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId: 'p1' });
  await h.call('POST', api(b, '/players/p1/credit'), b.apiKey, { amount: coins, reference: 'seed' });
  return b;
}
const play = async (b: { lic: string; apiKey: string }, room?: string, playerId = 'p1') => {
  const s = await h.call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId, ...(room ? { room } : {}) });
  return (await h.call('GET', '/api/play/bootstrap', s.body.sessionToken)).body.token as string;
};

test('round history API, bets by option, and room + round in the ledger', async () => {
  const b = await managed('hist@test.com');
  const P = await play(b);
  await h.call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'seven', amount: 1000 }, { target: 'plum', amount: 2000 }, { target: 'seven', amount: 500 }] });
  await h.age(40_000);
  await h.container.wheel.settleDue(Date.now());

  const hist = await h.call('GET', api(b, '/players/p1/rounds'), b.apiKey);
  assert.equal(hist.status, 200);
  assert.equal(hist.body.rounds.length, 1);
  const r = hist.body.rounds[0];
  assert.equal(r.room, 'main'); assert.equal(r.round, 1001); assert.equal(r.bet, 3500); assert.equal(r.net, r.win - 3500);
  assert.ok(r.result.length >= 1 && typeof r.time === 'number');
  const by = Object.fromEntries(r.bets.map((x: any) => [x.option, x]));
  assert.equal(by.seven.amount, 1500, 'two bets on one option are added together'); assert.equal(by.plum.amount, 2000);
  assert.ok(r.bets.every((x: any) => typeof x.label === 'string'));
  assert.equal(r.bets.reduce((a: number, x: any) => a + x.win, 0), r.win, 'the wins by option add up to the round win');

  // the ledger says where each bet and win happened
  const tx = (await h.call('GET', api(b, '/players/p1/transactions'), b.apiKey)).body.transactions;
  const bet = tx.find((t: any) => t.type === 'bet');
  assert.equal(bet.room, 'main'); assert.equal(bet.round, 1001);
  const credit = tx.find((t: any) => t.type === 'credit');
  assert.equal(credit.room, null); assert.equal(credit.round, null);
  if (r.win > 0) { const win = tx.find((t: any) => t.type === 'win'); assert.equal(win.room, 'main'); assert.equal(win.round, 1001); }

  // paging, room filter and validation
  assert.equal((await h.call('GET', api(b, '/players/p1/rounds?room=vip'), b.apiKey)).body.rounds.length, 0);
  assert.equal((await h.call('GET', api(b, `/players/p1/rounds?before=${r.time}`), b.apiKey)).body.rounds.length, 0, 'before is exclusive');
  assert.equal((await h.call('GET', api(b, '/players/p1/rounds?before=abc'), b.apiKey)).body.code, 'invalid_before');
  assert.equal((await h.call('GET', api(b, '/players/p1/rounds?room=Bad%20Room'), b.apiKey)).body.code, 'invalid_room');
  assert.equal((await h.call('GET', api(b, '/players/nobody/rounds'), b.apiKey)).status, 404);
  assert.equal((await h.call('GET', api(b, '/players/p1/rounds'), undefined)).status, 401);
  const other = await h.buyer('hist2@test.com', { guest: false });
  assert.equal((await h.call('GET', api(b, '/players/p1/rounds'), other.apiKey)).status, 404, 'another account cannot read these rounds');
});

test('round.settled webhook lists the bets of each player by option', async () => {
  const got: any[] = [];
  const server = http.createServer((req, res) => { let s = ''; req.on('data', c => { s += c; }); req.on('end', () => { got.push(JSON.parse(s)); res.writeHead(200).end(); }); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  try {
    const b = await managed('hook@test.com');
    await h.call('PUT', '/api/account/webhook', b.T, { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/h` });
    const P = await play(b);
    await h.call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'seven', amount: 1000 }, { target: 'plum', amount: 2000 }] });
    await h.age(40_000);
    await h.container.wheel.settleDue(Date.now());
    await h.container.webhooks.deliverDue();
    const ev = got.find(e => e.type === 'round.settled');
    assert.ok(ev);
    const p = ev.data.players[0];
    assert.deepEqual(p.bets.map((x: any) => x.option).sort(), ['plum', 'seven']);
    assert.equal(p.bets.reduce((a: number, x: any) => a + x.amount, 0), p.bet);
    assert.equal(p.bets.reduce((a: number, x: any) => a + x.win, 0), p.win);
  } finally { server.close(); }
});

test('session startingBalance: managed games only, applied once, to a new player only', async () => {
  const b = await h.buyer('start@test.com', { guest: false, wallet: 'managed' });
  const sess = (body: object) => h.call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, ...body });
  const first = await sess({ playerId: 'new1', startingBalance: 100 });
  assert.equal(first.status, 200); assert.equal(first.body.playerCreated, true);
  assert.equal((await h.call('GET', api(b, '/players/new1'), b.apiKey)).body.balance, 100);
  const again = await sess({ playerId: 'new1', startingBalance: 100 });
  assert.equal(again.body.playerCreated, false);
  assert.equal((await h.call('GET', api(b, '/players/new1'), b.apiKey)).body.balance, 100, 'a second session does not add coins again');
  const tx = (await h.call('GET', api(b, '/players/new1/transactions'), b.apiKey)).body.transactions;
  assert.deepEqual(tx.map((t: any) => [t.type, t.amount]), [['starting', 100]]);
  let i = 0;
  for (const bad of [-1, 1.5, '100', 1e13, null]) assert.equal((await sess({ playerId: 'bad' + i++, startingBalance: bad })).status, 400, `startingBalance ${String(bad)}`);
  // not allowed in demo mode (the game's own starting balance applies there)
  const demo = await h.buyer('start2@test.com', { guest: false });
  assert.equal((await h.call('POST', '/api/v1/sessions', demo.apiKey, { gameId: demo.lic, playerId: 'a', startingBalance: 5 })).body.code, 'starting_balance_not_supported');
});

test('rooms: metadata, one room, paging, and delete-when-empty', async () => {
  const b = await managed('rooms2@test.com');
  const mk = (body: object) => h.call('POST', api(b, '/rooms'), b.apiKey, body);
  const r = await mk({ key: 'u-42', name: 'Maria table', capacity: 5, deleteWhenEmptyMinutes: 30, metadata: { createdBy: 'user_42', code: 'K7Q9' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.metadata, { createdBy: 'user_42', code: 'K7Q9' }); assert.equal(r.body.deleteWhenEmptyMinutes, 30);
  assert.equal((await h.call('GET', api(b, '/rooms/u-42'), b.apiKey)).body.online, 0);
  assert.equal((await h.call('GET', api(b, '/rooms/nope'), b.apiKey)).status, 404);
  assert.equal((await h.call('GET', api(b, '/rooms/main'), b.apiKey)).body.key, 'main');

  // metadata is validated
  assert.equal((await mk({ key: 'm1', metadata: { a: 5 } })).status, 400);
  assert.equal((await mk({ key: 'm2', metadata: { 'bad key!': 'x' } })).status, 400);
  assert.equal((await mk({ key: 'm3', metadata: Object.fromEntries(Array.from({ length: 11 }, (_, i) => ['k' + i, 'v'])) })).status, 400);
  assert.equal((await mk({ key: 'm4', metadata: ['x'] })).status, 400);
  assert.equal((await mk({ key: 'm5', deleteWhenEmptyMinutes: 0 })).status, 400);
  assert.equal((await h.call('PUT', api(b, '/rooms/u-42'), b.apiKey, { metadata: { note: 'changed' }, deleteWhenEmptyMinutes: null })).body.deleteWhenEmptyMinutes, null);

  // paging
  for (let i = 0; i < 4; i++) await mk({ key: 'p' + i });
  const page = (await h.call('GET', api(b, '/rooms?limit=3&offset=2'), b.apiKey)).body;
  assert.equal(page.rooms.length, 3); assert.equal(page.total, 6); assert.equal(page.offset, 2);

  // delete-when-empty: kept while somebody is there or while it is young, deleted once empty long enough
  await h.call('PUT', api(b, '/rooms/u-42'), b.apiKey, { deleteWhenEmptyMinutes: 30 });
  assert.equal(await h.container.rooms.cleanup(Date.now()), 0, 'a young room stays');
  await RoomModel.updateOne({ key: 'u-42' }, { $set: { lastActiveAt: Date.now() - 31 * 60_000 } });
  await h.container.rooms.touch(b.lic, 'u-42', ['someone']);          // a visitor: the room counts as in use right now
  await new Promise(r => setTimeout(r, 200));
  assert.equal(await h.container.rooms.cleanup(Date.now()), 0, 'a room with a visitor stays');
  await h.container.cache.flush();                                     // the visitor leaves ...
  await RoomModel.updateOne({ key: 'u-42' }, { $set: { lastActiveAt: Date.now() - 31 * 60_000 } });   // ... and 31 minutes pass
  assert.equal(await h.container.rooms.cleanup(Date.now()), 1, 'empty for more than 30 minutes: deleted');
  assert.equal((await h.call('GET', api(b, '/rooms/u-42'), b.apiKey)).status, 404);
  assert.equal((await h.call('GET', api(b, '/rooms/main'), b.apiKey)).status, 200, 'main is never deleted');
});

test('a game can have thousands of rooms', () => {
  assert.ok(MAX_ROOMS_PER_GAME >= 5000);
});
