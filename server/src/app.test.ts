import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { buildApp } from './app.js';
import { openDb } from './db.js';
import { GAMES } from './catalog.js';
import { drawOutcome } from './wheel.js';

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mgs-'));
  const db = openDb(':memory:');
  const app = await buildApp({ db, secret: 'test-secret', publicUrl: 'http://x.test', uploadsDir: dir });
  const call = async (method: string, url: string, token?: string, body?: any) => {
    const r = await app.inject({ method: method as any, url, headers: token ? { authorization: `Bearer ${token}` } : {}, payload: body });
    return { status: r.statusCode, body: r.body && r.headers['content-type']?.toString().includes('json') ? JSON.parse(r.body) : r.body, headers: r.headers };
  };
  const upload = async (licId: string, token: string, kind: string, bytes: Buffer, name = 'f.bin') => {
    const b = '----t' + Math.random().toString(16).slice(2);
    const head = Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
    const tail = Buffer.from(`\r\n--${b}--\r\n`);
    const r = await app.inject({ method: 'POST', url: `/api/licenses/${licId}/upload?kind=${kind}`, headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/form-data; boundary=${b}` }, payload: Buffer.concat([head, bytes, tail]) });
    return { status: r.statusCode, body: JSON.parse(r.body) };
  };
  const buyer = async (email = 'b@test.com') => {
    const reg = await call('POST', '/api/auth/register', undefined, { email, password: 'password123' });
    const T = reg.body.token;
    const apiKey = reg.body.apiKey as string;            // ONE key per account, returned once at sign-up
    const bought = await call('POST', '/api/store/lucky-wheel/buy', T);
    const sess = await call('POST', '/api/v1/sessions', apiKey, { gameId: bought.body.license.id });
    return { T, lic: bought.body.license.id, apiKey, session: sess.body.sessionToken };
  };
  const player = async (session: string, username: string) => (await call('POST', '/api/play/login', session, { username })).body.token as string;
  /** pretend `ms` milliseconds have passed for every round */
  const age = (ms: number) => db.exec(`UPDATE wheel_rounds SET start_at=start_at-${ms}, bet_end=bet_end-${ms}, spin_end=spin_end-${ms}, end_at=end_at-${ms}`);
  return { app, call, upload, buyer, player, age, db };
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(40)]);
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(40)]);
const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(40)]);
const SVG_OK = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4" fill="red"/></svg>');

test('default odds: every option pays back about 85-100% of what is bet', () => {
  const def = GAMES[0].defaults;
  const N = 300_000; const count: Record<string, number> = {};
  const wins: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    const o = drawOutcome(def);
    for (const h of [o.target, ...o.extra]) wins[h] = (wins[h] ?? 0) + 1;
    count[o.target] = (count[o.target] ?? 0) + 1;
  }
  for (const t of def.targets) {
    const rtp = (wins[t.id] / N) * t.multiplier;
    console.log(`${t.id} RTP ~ ${(rtp * 100).toFixed(1)}%`);
    assert.ok(rtp > 0.85 && rtp < 1.0, `${t.id} rtp ${rtp}`);
  }
});

test('wheel: bet -> settle -> history / my bets / ranking / dashboard', async () => {
  const { call, buyer, player, age, db } = await setup();
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
  age(21_000);
  const spin = await call('GET', '/api/play/wheel/state', P);
  assert.equal(spin.body.round.phase, 'spinning');
  assert.ok(spin.body.round.result.hits.length >= 1);
  assert.equal((await call('POST', '/api/play/wheel/bet', P, { bets: [{ target: 'seven', amount: 1 }] })).status, 409);

  // after the spin: paid, history filled, new round started
  age(7_000);
  const after = await call('GET', '/api/play/wheel/state', P);
  const r = db.prepare('SELECT result_target, extra FROM wheel_rounds WHERE no = ?').get(st.body.round.no) as any;
  const got = [r.result_target, ...JSON.parse(r.extra)];
  const expectedWin = (got.includes('seven') ? 30000 * 8 : 0) + (got.includes('watermelon') ? 300000 * 2 : 0);
  assert.equal(after.body.balance, start - 330000 + expectedWin, 'payout math');
  assert.equal(after.body.history[0].no, st.body.round.no);

  const mine = await call('GET', '/api/play/wheel/mybets', P);
  assert.equal(mine.body.bets.length, 2);
  assert.equal(mine.body.bets.reduce((a: number, x: any) => a + x.win, 0), expectedWin);
  const rank = await call('GET', '/api/play/wheel/ranking', P);
  assert.equal(rank.body.me.username, 'ali_01');

  // the buyer's dashboard sees the player and the round
  const rounds = await call('GET', `/api/licenses/${b.lic}/rounds`, b.T);
  assert.equal(rounds.body.rounds.length, 1);
  assert.equal(rounds.body.rounds[0].bet, 330000);
  assert.equal(rounds.body.rounds[0].win, expectedWin);
  const players = await call('GET', `/api/licenses/${b.lic}/players`, b.T);
  assert.equal(players.body.players[0].username, 'ali_01');

  // settling twice never pays twice
  await call('GET', '/api/play/wheel/state', P);
  const again = await call('GET', '/api/play/wheel/state', P);
  assert.equal(again.body.balance, start - 330000 + expectedWin);
});

test('one account API key + game ID: isolation, errors, rotation', async () => {
  const { call, buyer, player } = await setup();
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

test('customization: validation, merge, defaults fall back', async () => {
  const { call, buyer } = await setup();
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
  // a changed round length is used by new rounds
  const boot = await call('GET', '/api/play/bootstrap', b.session);
  assert.equal(boot.body.config.timing.betSeconds, 12);
});

test('media uploads: each slot kind accepts only what it should, unsafe files are rejected', async () => {
  const { call, upload, buyer } = await setup();
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
  assert.match(String(served.headers['content-security-policy']), /sandbox/);
  assert.equal(served.headers['x-content-type-options'], 'nosniff');
  // and can then be used as an asset (including sprite-sheet metadata)
  const set = await call('PUT', `/api/licenses/${b.lic}/config`, b.T, { config: { 'assets.fxWin': { url: png.body.url, cols: 4, rows: 2, fps: 12 } } });
  assert.equal(set.status, 200); assert.equal(set.body.config.assets.fxWin.cols, 4);
  // another buyer cannot upload into this license
  const other = await call('POST', '/api/auth/register', undefined, { email: 'o@test.com', password: 'password123' });
  assert.equal((await upload(b.lic, other.body.token, 'image', PNG)).status, 404);
});
