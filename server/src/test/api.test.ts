import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from './harness.js';
import { WheelRoundModel } from '../modules/lucky-wheel/wheel.model.js';
import { PlayerModel } from '../modules/players/player.model.js';

let h: Awaited<ReturnType<typeof startHarness>>;
before(async () => { h = await startHarness(); });
after(async () => { await h.stop(); });
beforeEach(async () => { await h.reset(); });

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(40)]);
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(40)]);
const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(40)]);
const SVG_OK = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4" fill="red"/></svg>');

test('wheel: bet -> settle -> history / my bets / ranking / dashboard, and the ledger adds up', async () => {
  const { call, buyer, player, age, ledgerSum } = h;
  const b = await buyer();
  const P = await player(b.session, 'ali_01');
  const st = await call('GET', '/api/play/wheel/state', P);
  assert.equal(st.status, 200);
  assert.equal(st.body.round.phase, 'betting');
  assert.equal(st.body.round.result, null, 'outcome must not be revealed while betting');
  assert.ok(!JSON.stringify(st.body).includes('segment'), 'no segment index while betting');
  const start = st.body.balance;

  assert.equal((await call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'nope', amount: 1000 }] })).status, 400);
  assert.equal((await call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'seven', amount: -5 }] })).status, 400);
  assert.equal((await call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'seven', amount: start + 1 }] })).status, 402);
  const bet = await call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'seven', amount: 30000 }, { target: 'watermelon', amount: 300000 }] });
  assert.equal(bet.status, 200);
  assert.equal(bet.body.balance, start - 330000);
  const st2 = await call('GET', '/api/play/wheel/state', P);
  assert.equal(st2.body.mine.seven, 30000);
  assert.equal(st2.body.pot.watermelon, 300000);
  assert.equal(st2.body.round.no, st.body.round.no);

  // move into the spin phase: result is now visible, betting is closed
  await age(21_000);
  const spin = await call('GET', '/api/play/wheel/state', P);
  assert.equal(spin.body.round.phase, 'spinning');
  assert.ok(spin.body.round.result.hits.length >= 1);
  assert.equal((await call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'seven', amount: 1 }] })).status, 409);

  // after the spin: paid, history filled
  await age(7_000);
  const after = await call('GET', '/api/play/wheel/state', P);
  const r = (await WheelRoundModel.findOne({ no: st.body.round.no }).lean())!;
  const got = [r.resultTarget, ...r.extra];
  const expectedWin = (got.includes('seven') ? 30000 * 8 : 0) + (got.includes('watermelon') ? 300000 * 2 : 0);
  assert.equal(after.body.balance, start - 330000 + expectedWin, 'payout math');
  assert.equal(after.body.history[0].no, st.body.round.no);

  const mine = await call('GET', '/api/play/wheel/mybets', P);
  assert.equal(mine.body.bets.length, 2);
  assert.equal(mine.body.bets.reduce((a: number, x: any) => a + x.win, 0), expectedWin);
  assert.equal((await call('GET', '/api/play/wheel/ranking', P)).body.me.username, 'ali_01');

  // the buyer's dashboard sees the player and the round
  const rounds = await call('GET', `/api/licenses/${b.lic}/rounds`, b.T);
  assert.equal(rounds.body.rounds.length, 1);
  assert.equal(rounds.body.rounds[0].bet, 330000);
  assert.equal(rounds.body.rounds[0].win, expectedWin);
  const players = await call('GET', `/api/licenses/${b.lic}/players`, b.T);
  assert.equal(players.body.players[0].username, 'ali_01');

  // settling again never pays twice
  await call('GET', '/api/play/wheel/state', P);
  assert.equal((await call('GET', '/api/play/wheel/state', P)).body.balance, start - 330000 + expectedWin);

  // the ledger explains every coin: starting balance, bets and wins add up to the balance
  const p = (await PlayerModel.findOne({ externalId: 'ali_01' }).lean())!;
  assert.equal(await h.ledgerSum(p._id), p.balance);
});

test('money safety: parallel bets never overspend and parallel settlement pays once', async () => {
  const { call, buyer, player, age, container } = h;
  const b = await buyer();
  const P = await player(b.session, 'racer');
  const start = (await call('GET', '/api/play/wheel/state', P)).body.balance as number;

  // 8 bets of 40% of the balance at the same moment: at most 2 can succeed
  const amount = Math.floor(start * 0.4);
  const results = await Promise.all(Array.from({ length: 8 }, () => call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'plum', amount }] })));
  const ok = results.filter(r => r.status === 200).length;
  assert.equal(ok, 2, 'exactly two bets fit in the balance');
  assert.ok(results.every(r => r.status === 200 || r.status === 402), results.map(r => r.status).join());
  const p = (await PlayerModel.findOne({ externalId: 'racer' }).lean())!;
  assert.equal(p.balance, start - ok * amount);

  // five servers/tabs settle the same round at the same time
  await age(40_000);
  await Promise.all(Array.from({ length: 5 }, () => container.wheel.settleDue(null, Date.now())));
  const settled = (await PlayerModel.findOne({ externalId: 'racer' }).lean())!;
  assert.equal(await h.ledgerSum(settled._id), settled.balance, 'ledger still adds up');
  const round = (await WheelRoundModel.findOne({}).sort({ no: 1 }).lean())!;
  const hit = [round.resultTarget, ...round.extra].includes('plum');
  assert.equal(settled.balance, start - ok * amount + (hit ? ok * amount * 2 : 0), 'paid exactly once');
});

test('one account API key + game ID: isolation, errors, rotation', async () => {
  const { call, buyer, player } = h;
  const a = await buyer('a@test.com'), c = await buyer('c@test.com');
  assert.match(a.apiKey, /^mgs_/);
  assert.notEqual(a.apiKey, c.apiKey);

  // same username in two different games is fine; bets stay inside their game
  const Pa = await player(a.session, 'same_name'), Pc = await player(c.session, 'same_name');
  await call('POST', '/api/play/wheel/bet', Pa, { bets: [{ target: 'plum', amount: 30000 }] });
  const stC = await call('GET', '/api/play/wheel/state', Pc);
  assert.equal(stC.body.pot.plum, undefined, 'other game does not see the bet');
  assert.equal(stC.body.balance, 5_000_000);
  assert.equal((await call('GET', `/api/licenses/${a.lic}`, c.T)).status, 404, 'dashboard isolation');

  // API errors
  assert.equal((await call('POST', '/api/v1/sessions', undefined, { gameId: a.lic })).status, 401, 'no key');
  assert.equal((await call('POST', '/api/v1/sessions', 'mgs_nope', { gameId: a.lic })).status, 401, 'wrong key');
  assert.equal((await call('POST', '/api/v1/sessions', a.T, { gameId: a.lic })).status, 401, 'dashboard token is not an API key');
  assert.equal((await call('POST', '/api/v1/sessions', a.apiKey, {})).status, 400, 'gameId is required');
  assert.equal((await call('POST', '/api/v1/sessions', a.apiKey, { gameId: c.lic })).status, 404, "cannot use someone else's game id");
  assert.equal((await call('POST', '/api/v1/sessions', a.apiKey, { gameId: a.lic, username: 'x' })).status, 400, 'bad username');
  assert.equal((await call('POST', '/api/v1/sessions', 'mgs_nope', { gameId: a.lic })).body.code, 'invalid_api_key', 'errors carry a machine-readable code');

  // the same key serves every game of the account
  const second = await call('POST', '/api/store/lucky-wheel/buy', a.T);
  const games = await call('GET', '/api/v1/games', a.apiKey);
  assert.equal(games.body.games.length, 2);
  const s2 = await call('POST', '/api/v1/sessions', a.apiKey, { gameId: second.body.license.id, username: 'from_app' });
  assert.equal(s2.status, 200);
  assert.match(s2.body.playUrl, /^http:\/\/x\.test\/g\/lucky-wheel\/\?session=/);
  const boot = await call('GET', '/api/play/bootstrap', s2.body.sessionToken);
  assert.equal(boot.body.player.username, 'from_app', 'username from the API skips the login screen');
  assert.ok(boot.body.config.assets.background.url.startsWith('http://x.test/defaults/'), 'asset urls are absolute');
  assert.equal(boot.body.config.segments[0].weight, undefined, 'odds do not leak');

  // rotation: old key dies, new key works for the same games
  const info = await call('GET', '/api/account/api-key', a.T);
  assert.equal(info.body.hasKey, true); assert.equal(info.body.prefix, a.apiKey.slice(0, 12));
  const rot = await call('POST', '/api/account/api-key', a.T);
  assert.equal((await call('POST', '/api/v1/sessions', a.apiKey, { gameId: a.lic })).status, 401);
  assert.equal((await call('POST', '/api/v1/sessions', rot.body.apiKey, { gameId: a.lic })).status, 200);
  assert.equal((await call('POST', '/api/v1/sessions', c.apiKey, { gameId: c.lic })).status, 200, 'other accounts unaffected');
});

test('buyer account: sign-up validation, wallet, store', async () => {
  const { call } = h;
  assert.equal((await call('POST', '/api/auth/register', undefined, { email: 'nope', password: 'password123' })).status, 400);
  assert.equal((await call('POST', '/api/auth/register', undefined, { email: 'x@test.com', password: 'short' })).status, 400);
  const reg = await call('POST', '/api/auth/register', undefined, { email: 'x@test.com', password: 'password123' });
  assert.equal(reg.status, 200);
  assert.equal((await call('POST', '/api/auth/register', undefined, { email: 'X@test.com', password: 'password123' })).status, 409, 'emails are unique, case-insensitive');
  assert.equal((await call('POST', '/api/auth/login', undefined, { email: 'x@test.com', password: 'wrong-password' })).status, 401);
  const login = await call('POST', '/api/auth/login', undefined, { email: 'x@test.com', password: 'password123' });
  assert.equal(login.status, 200);
  const T = login.body.token;
  assert.equal((await call('GET', '/api/me', undefined)).status, 401);
  assert.equal((await call('GET', '/api/me', T)).body.user.balance, 10_000);
  assert.equal((await call('POST', '/api/store/lucky-wheel/buy', T)).body.balance, 7_000);
  assert.equal((await call('POST', '/api/store/lucky-wheel/buy', T)).body.balance, 4_000);
  assert.equal((await call('POST', '/api/store/lucky-wheel/buy', T)).body.balance, 1_000);
  const broke = await call('POST', '/api/store/lucky-wheel/buy', T);
  assert.equal(broke.status, 402);
  assert.equal((await call('POST', '/api/wallet/topup', T)).body.user.balance, 6_000);
  assert.equal((await call('POST', '/api/store/nope/buy', T)).status, 404);
  assert.equal((await call('GET', '/api/licenses', T)).body.licenses.length, 3);
});

test('customization: validation, merge, defaults fall back', async () => {
  const { call, buyer } = h;
  const b = await buyer();
  const put = (config: any) => call('PUT', `/api/licenses/${b.lic}/config`, b.T, { config });
  assert.equal((await put({ 'theme.primary': 'red' })).status, 400);
  assert.equal((await put({ 'assets.background': { url: 'https://evil.example/x.png' } })).status, 400);
  assert.equal((await put({ 'assets.background': { url: '/uploads/lic_other/../../etc/passwd' } })).status, 400);
  assert.equal((await put({ 'timing.betSeconds': 1 })).status, 400);
  assert.equal((await put({ segments: [{ target: 'seven' }, { target: 'ghost' }, { target: 'plum' }, { target: 'plum' }] })).status, 400, 'segment must reference an option');
  assert.equal((await put({ targets: [{ id: 'A!', label: 'x', multiplier: 2 }, { id: 'b', label: 'y', multiplier: 3 }] })).status, 400);
  const ok = await put({ title: 'My Wheel', currencyName: 'Gems', 'timing.betSeconds': 12, 'texts.howToPlay': ['one', 'two'] });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.config.title, 'My Wheel');
  assert.equal(ok.body.config.texts.howToPlay.length, 2);
  assert.equal(ok.body.config.texts.goodLuckTitle, 'GOOD LUCK', 'untouched texts keep defaults');
  // an empty asset means "use the default"
  const cleared = await put({ 'assets.background': { url: '' } });
  assert.match(cleared.body.config.assets.background.url, /^\/defaults\/lucky-wheel\//);
  // a second partial save keeps the first
  assert.equal((await put({ currencyName: 'Pearls' })).body.config.title, 'My Wheel');
  // a changed round length is used by new rounds (game record cache is cleared on save)
  const boot = await call('GET', '/api/play/bootstrap', b.session);
  assert.equal(boot.body.config.timing.betSeconds, 12);
  // settings
  assert.equal((await call('PUT', `/api/licenses/${b.lic}`, b.T, { allowedOrigins: ['https://shop.example.com'] })).status, 200);
  assert.equal((await call('PUT', `/api/licenses/${b.lic}`, b.T, { allowedOrigins: ['https://shop.example.com/path'] })).status, 400);
  assert.equal((await call('PUT', `/api/licenses/${b.lic}`, b.T, { name: '' })).status, 400);
});

test('media uploads: each slot kind accepts only what it should, unsafe files are rejected', async () => {
  const { call, upload, buyer } = h;
  const b = await buyer();
  const png = await upload(b.lic, b.T, 'image', PNG, 'a.png');
  assert.equal(png.status, 200); assert.equal(png.body.type, 'image'); assert.match(png.body.url, /^\/uploads\/lic_[\w-]+\/[\w-]+\.png$/);
  assert.equal((await upload(b.lic, b.T, 'image', SVG_OK, 'a.svg')).body.type, 'svg');
  assert.equal((await upload(b.lic, b.T, 'media', MP4, 'v.mp4')).body.type, 'video');
  assert.equal((await upload(b.lic, b.T, 'video', WEBM, 'v.webm')).body.type, 'video');
  assert.equal((await upload(b.lic, b.T, 'audio', MP3, 'a.mp3')).body.type, 'audio');
  // wrong kind for the slot
  assert.equal((await upload(b.lic, b.T, 'image', MP4, 'v.mp4')).status, 400);
  assert.equal((await upload(b.lic, b.T, 'audio', PNG, 'a.png')).status, 400);
  assert.equal((await upload(b.lic, b.T, 'video', PNG, 'a.png')).status, 400);
  // dangerous / unknown
  for (const bad of [
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><a xlink:href="javascript:alert(1)"><rect/></a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>',
  ]) assert.equal((await upload(b.lic, b.T, 'image', Buffer.from(bad), 'x.svg')).status, 400, bad);
  assert.equal((await upload(b.lic, b.T, 'image', Buffer.from('MZ this is an exe pretending to be a picture........'), 'x.png')).status, 400);
  // uploaded files are served with a locked-down CSP and nosniff
  const served = await call('GET', png.body.url);
  assert.equal(served.status, 200);
  assert.match(String(served.headers.get('content-security-policy')), /sandbox/);
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  // and can then be used as an asset (including sprite-sheet metadata)
  const set = await call('PUT', `/api/licenses/${b.lic}/config`, b.T, { config: { 'assets.fxWin': { url: png.body.url, cols: 4, rows: 2, fps: 12 } } });
  assert.equal(set.status, 200); assert.equal(set.body.config.assets.fxWin.cols, 4);
  // another buyer cannot upload into this license
  const other = await call('POST', '/api/auth/register', undefined, { email: 'o@test.com', password: 'password123' });
  assert.equal((await upload(b.lic, other.body.token, 'image', PNG)).status, 404);
});
