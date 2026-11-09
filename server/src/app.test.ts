import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { buildApp } from './app.js';
import { openDb } from './db.js';
import { GAMES } from './catalog.js';
import { playSpin } from './engine/spin.js';
import { playSlots } from './engine/slots.js';

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mgs-'));
  const app = await buildApp({ db: openDb(':memory:'), secret: 'test-secret', publicUrl: 'http://x.test', uploadsDir: dir });
  const call = async (method: string, url: string, token?: string, body?: any) => {
    const r = await app.inject({ method: method as any, url, headers: token ? { authorization: `Bearer ${token}` } : {}, payload: body });
    return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null, raw: r };
  };
  return { app, call };
}

test('RTP of default games is realistic (80%-100%)', () => {
  const N = 200_000;
  for (const slug of ['lucky-spin', 'lucky-77']) {
    const def = GAMES.find(g => g.slug === slug)!;
    let bet = 0, win = 0;
    for (let i = 0; i < N; i++) {
      bet += 100;
      win += slug === 'lucky-spin' ? playSpin(def.defaults.prizes, 100).win : playSlots(def.defaults.symbols, 100).win;
    }
    const rtp = win / bet;
    console.log(`${slug} RTP ~ ${(rtp * 100).toFixed(1)}%`);
    assert.ok(rtp > 0.8 && rtp < 1.0, `${slug} rtp ${rtp}`);
  }
});

test('full buyer -> license -> session -> player -> dashboard flow', async () => {
  const { app, call } = await setup();
  const reg = await call('POST', '/api/auth/register', undefined, { email: 'buyer@test.com', password: 'password123' });
  assert.equal(reg.status, 200);
  const T = reg.body.token;
  assert.equal(reg.body.user.balance, 10000);

  // buy two copies of the same game
  const b1 = await call('POST', '/api/store/lucky-spin/buy', T);
  const b2 = await call('POST', '/api/store/lucky-spin/buy', T);
  assert.equal(b1.status, 200);
  assert.match(b1.body.licenseKey, /^mgk_/);
  assert.notEqual(b1.body.licenseKey, b2.body.licenseKey);
  assert.equal(b2.body.balance, 10000 - 3000);
  const lic1 = b1.body.license.id, lic2 = b2.body.license.id;

  // can't overspend
  assert.equal((await call('POST', '/api/store/lucky-77/buy', T)).status, 200);
  assert.equal((await call('POST', '/api/store/lucky-77/buy', T)).status, 200);
  assert.equal((await call('POST', '/api/store/lucky-77/buy', T)).status, 402);

  // customize copy 1 only
  const cfg = await call('PUT', `/api/licenses/${lic1}/config`, T, { config: { title: 'Casino One', startingBalance: 500, 'theme.primary': '#00ff00', betOptions: '5,25' } });
  assert.equal(cfg.status, 200, JSON.stringify(cfg.body));
  assert.equal((await call('PUT', `/api/licenses/${lic1}/config`, T, { config: { 'theme.primary': 'red' } })).status, 400);
  // partial updates merge instead of wiping the other settings
  const part = await call('PUT', `/api/licenses/${lic1}/config`, T, { config: { currencyName: 'Gems' } });
  assert.equal(part.body.config.currencyName, 'Gems');
  assert.equal(part.body.config.title, 'Casino One');
  assert.equal(part.body.config.theme.primary, '#00ff00');
  await call('PUT', `/api/licenses/${lic1}/config`, T, { config: { currencyName: 'Coins' } });

  // wrong / missing key is rejected
  assert.equal((await call('POST', '/api/v1/sessions', 'mgk_nope', {})).status, 401);
  // the user (dashboard) token must NOT work as a license key
  assert.equal((await call('POST', '/api/v1/sessions', T, {})).status, 401);

  // buyer backend mints sessions with the secret key
  const s1 = await call('POST', '/api/v1/sessions', b1.body.licenseKey, {});
  const s2 = await call('POST', '/api/v1/sessions', b2.body.licenseKey, {});
  assert.equal(s1.status, 200);
  assert.match(s1.body.playUrl, /^http:\/\/x\.test\/g\/lucky-spin\/\?session=/);

  // same game, two different looks
  const boot1 = await call('GET', '/api/play/bootstrap', s1.body.sessionToken);
  const boot2 = await call('GET', '/api/play/bootstrap', s2.body.sessionToken);
  assert.equal(boot1.body.config.title, 'Casino One');
  assert.equal(boot2.body.config.title, 'Lucky Spin');
  assert.equal(boot1.body.config.theme.primary, '#00ff00');
  assert.equal(boot1.body.config.prizes[0].weight, undefined, 'odds must not leak to the client');
  assert.equal(boot1.body.player, null);

  // play requires username; usernames are unique per license, not global
  assert.equal((await call('POST', '/api/play/spin', s1.body.sessionToken, { bet: 5 })).status, 401);
  assert.equal((await call('POST', '/api/play/login', s1.body.sessionToken, { username: 'a' })).status, 400);
  const l1 = await call('POST', '/api/play/login', s1.body.sessionToken, { username: 'ali_01' });
  const l2 = await call('POST', '/api/play/login', s2.body.sessionToken, { username: 'ali_01' });
  assert.equal(l1.body.player.balance, 500);
  assert.equal(l2.body.player.balance, 1000);
  const P = l1.body.token;

  assert.equal((await call('POST', '/api/play/spin', P, { bet: 999 })).status, 400);
  let balance = 500, rounds = 0;
  for (let i = 0; i < 20; i++) {
    const r = await call('POST', '/api/play/spin', P, { bet: 25 });
    if (r.status === 402) break;
    assert.equal(r.status, 200);
    balance = balance - 25 + r.body.result.win;
    assert.equal(r.body.balance, balance, 'server balance math');
    rounds++;
  }
  // slots endpoint on a spin license is rejected
  assert.equal((await call('POST', '/api/play/slots', P, { bet: 25 })).status, 400);

  // dashboard sees the player and rounds; license 2 sees nothing
  const players = await call('GET', `/api/licenses/${lic1}/players`, T);
  assert.equal(players.body.players.length, 1);
  assert.equal(players.body.players[0].username, 'ali_01');
  assert.equal(players.body.players[0].rounds, rounds);
  const rs = await call('GET', `/api/licenses/${lic1}/rounds`, T);
  assert.equal(rs.body.rounds.length, rounds);
  assert.ok(rs.body.rounds[0].outcome.summary);
  const st = await call('GET', `/api/licenses/${lic1}/stats`, T);
  assert.equal(st.body.totals.rounds, rounds);
  assert.equal((await call('GET', `/api/licenses/${lic2}/rounds`, T)).body.rounds.length, 0);
  const csv = await call('GET', `/api/licenses/${lic1}/export.csv?kind=rounds`, T).catch(() => null);
  assert.ok(csv === null || csv.raw.statusCode === 200);

  // another buyer cannot read this license
  const other = await call('POST', '/api/auth/register', undefined, { email: 'other@test.com', password: 'password123' });
  assert.equal((await call('GET', `/api/licenses/${lic1}`, other.body.token)).status, 404);

  // key rotation invalidates the old key
  const rot = await call('POST', `/api/licenses/${lic1}/rotate-key`, T);
  assert.equal((await call('POST', '/api/v1/sessions', b1.body.licenseKey, {})).status, 401);
  assert.equal((await call('POST', '/api/v1/sessions', rot.body.licenseKey, {})).status, 200);

  // preset username skips the login screen
  const pre = await call('POST', '/api/v1/sessions', rot.body.licenseKey, { username: 'from_app' });
  const bootPre = await call('GET', '/api/play/bootstrap', pre.body.sessionToken);
  assert.equal(bootPre.body.player.username, 'from_app');
  assert.ok(bootPre.body.token);
  await app.close();
});

test('slots + ludo flows', async () => {
  const { app, call } = await setup();
  const T = (await call('POST', '/api/auth/register', undefined, { email: 'x@test.com', password: 'password123' })).body.token;
  const slot = await call('POST', '/api/store/lucky-77/buy', T);
  const ludo = await call('POST', '/api/store/ludo/buy', T);
  const ps = (await call('POST', '/api/play/login', (await call('POST', '/api/v1/sessions', slot.body.licenseKey, {})).body.sessionToken, { username: 'slotter' })).body.token;
  const r = await call('POST', '/api/play/slots', ps, { bet: 50 });
  assert.equal(r.status, 200);
  assert.equal(r.body.result.grid.length, 3);
  assert.equal(r.body.balance, 1000 - 50 + r.body.result.win);

  const pl = (await call('POST', '/api/play/login', (await call('POST', '/api/v1/sessions', ludo.body.licenseKey, {})).body.sessionToken, { username: 'rollie' })).body.token;
  const st = await call('POST', '/api/play/ludo/start', pl);
  assert.equal(st.body.balance, 900);
  const fin = await call('POST', '/api/play/ludo/finish', pl, { matchId: st.body.matchId, placement: 1 });
  assert.equal(fin.body.win, 350);
  assert.equal(fin.body.balance, 1250);
  assert.equal((await call('POST', '/api/play/ludo/finish', pl, { matchId: st.body.matchId, placement: 1 })).status, 404, 'cannot claim twice');
  await app.close();
});
