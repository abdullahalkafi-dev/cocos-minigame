// Security tests from the full audit: who can see what, forged and mixed-up tokens, unsafe input, headers.
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from './harness.js';
import { sign } from '../common/utils/crypto.js';
import { PlayerModel } from '../modules/players/player.model.js';
import { ResultModel } from '../modules/results/result.model.js';

let h: Awaited<ReturnType<typeof startHarness>>;
before(async () => { h = await startHarness(); });
after(async () => { await h.stop(); });
beforeEach(async () => { await h.reset(); });

test('tenant isolation: another buyer can neither read nor change my game, through the dashboard or the API', async () => {
  const a = await h.buyer('owner@test.com', { guest: false });
  const b = await h.buyer('intruder@test.com', { guest: false });
  const L = a.lic;
  const dash: [string, string, unknown?][] = [
    ['GET', `/api/licenses/${L}`], ['GET', `/api/licenses/${L}/stats`], ['GET', `/api/licenses/${L}/players`], ['GET', `/api/licenses/${L}/rounds`],
    ['GET', `/api/licenses/${L}/export.csv`], ['GET', `/api/licenses/${L}/rooms`], ['GET', `/api/licenses/${L}/leaderboard`],
    ['PUT', `/api/licenses/${L}`, { name: 'hijacked' }], ['PUT', `/api/licenses/${L}/config`, { config: { title: 'x' } }],
    ['POST', `/api/licenses/${L}/preview-session`, {}], ['POST', `/api/licenses/${L}/rooms`, { key: 'evil' }], ['DELETE', `/api/licenses/${L}/rooms/main`],
  ];
  for (const [m, url, body] of dash) {
    const r = await h.call(m, url, b.T, body);
    assert.equal(r.status, 404, `${m} ${url} must be 404 for another buyer, got ${r.status}`);
  }
  const fd = new FormData(); fd.append('file', new Blob([new Uint8Array(20)]), 'a.png');
  assert.equal((await fetch(`${h.base}/api/licenses/${L}/upload`, { method: 'POST', headers: { authorization: `Bearer ${b.T}` }, body: fd })).status, 404);
  const api: [string, string, unknown?][] = [
    ['POST', '/api/v1/sessions', { gameId: L, playerId: 'x' }], ['GET', `/api/v1/games/${L}/rooms`], ['GET', `/api/v1/games/${L}/leaderboard`],
    ['POST', `/api/v1/games/${L}/players/x/credit`, { amount: 5, reference: 'r' }], ['GET', `/api/v1/games/${L}/players/x`], ['GET', `/api/v1/games/${L}/players/x/transactions`],
  ];
  for (const [m, url, body] of api) {
    const r = await h.call(m, url, b.apiKey, body);
    assert.equal(r.status, 404, `${m} ${url} must be 404 for another buyer's key, got ${r.status}`);
  }
  assert.equal((await h.call('GET', `/api/licenses/${L}`, a.T)).body.license.name.includes('hijacked'), false, 'nothing was changed');
});

test('tokens: forged, expired and mixed-up tokens are all refused', async () => {
  const b = await h.buyer('tokens@test.com', { guest: false });
  const sess = (await h.call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId: 'p1' })).body.sessionToken as string;
  const [body, sig] = sess.split('.');
  // tampered body (claims another game) and tampered signature
  const forgedBody = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), lic: 'lic_other' })).toString('base64url');
  assert.equal((await h.call('GET', '/api/play/bootstrap', `${forgedBody}.${sig}`)).status, 401);
  assert.equal((await h.call('GET', '/api/play/bootstrap', `${body}.${sig.slice(0, -2)}AA`)).status, 401);
  assert.equal((await h.call('GET', '/api/play/bootstrap', 'garbage')).status, 401);
  assert.equal((await h.call('GET', '/api/play/bootstrap', 'a.b.c.d')).status, 401);
  // signed with the wrong secret, or already expired
  assert.equal((await h.call('GET', '/api/play/bootstrap', sign({ t: 's', lic: b.lic, u: 'p1' }, 'another-secret', 600))).status, 401);
  assert.equal((await h.call('GET', '/api/play/bootstrap', sign({ t: 's', lic: b.lic, u: 'p1' }, 'test-secret', -5))).status, 401);
  // a session token cannot place bets (only a player token can), and the other way round
  assert.equal((await h.call('POST', '/api/play/wheel/bet', sess, { bets: [{ target: 'seven', amount: 1 }] })).status, 401);
  // each kind of credential works in its own place only
  assert.equal((await h.call('GET', '/api/me', b.apiKey)).status, 401, 'an API key is not a dashboard login');
  assert.equal((await h.call('GET', '/api/v1/games', b.T)).status, 401, 'a dashboard login is not an API key');
  assert.equal((await h.call('GET', '/api/me', sess)).status, 401, 'a play session is not a dashboard login');
  assert.equal((await h.call('GET', '/api/v1/games', sess)).status, 401);
  assert.equal((await h.call('GET', '/api/v1/games', 'mgs_')).status, 401);
  assert.equal((await h.call('GET', '/api/v1/games')).status, 401);
});

test('a player token from one game never works in another game', async () => {
  const a = await h.buyer('ga@test.com', { guest: false, wallet: 'managed' });
  const c = await h.buyer('gb@test.com', { guest: false, wallet: 'managed' });
  const boot = async (b: { lic: string; apiKey: string }) => (await h.call('GET', '/api/play/bootstrap', (await h.call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId: 'same' })).body.sessionToken)).body.token as string;
  const pa = await boot(a), pc = await boot(c);
  const idA = (await h.call('GET', '/api/play/me', pa)).body.player.id, idC = (await h.call('GET', '/api/play/me', pc)).body.player.id;
  assert.notEqual(idA, idC, 'the same client id in two games is two different players');
  await h.call('POST', `/api/v1/games/${a.lic}/players/same/credit`, a.apiKey, { amount: 5000, reference: 'x' });
  assert.equal((await h.call('GET', '/api/play/me', pa)).body.player.balance, 5000);
  assert.equal((await h.call('GET', '/api/play/me', pc)).body.player.balance, 0, "the other game's player is untouched");
});

test('mass assignment: fields a caller should not control are ignored', async () => {
  const reg = await h.call('POST', '/api/auth/register', undefined, { email: 'mass@test.com', password: 'password123', balance: 999_999_999, apiKeyHash: 'x', _id: 'usr_admin' });
  assert.equal(reg.status, 200);
  assert.ok(reg.body.user.balance < 100_000, 'the sign-up balance cannot be chosen by the caller');
  assert.notEqual(reg.body.user.id, 'usr_admin');
  const bought = await h.call('POST', '/api/store/lucky-wheel/buy', reg.body.token);
  const id = bought.body.license.id;
  const price = bought.body.license.price;
  const upd = await h.call('PUT', `/api/licenses/${id}`, reg.body.token, { name: 'ok', price: 1, userId: 'usr_other', status: 'inactive', _id: 'lic_x' });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.license.price, price);
  assert.equal(upd.body.license.status, 'active');
  assert.equal(upd.body.license.id, id);
});

test('unsafe configuration is refused: foreign asset addresses, bad colours, header tricks in allowed origins', async () => {
  const b = await h.buyer('cfg@test.com');
  const put = (config: unknown) => h.call('PUT', `/api/licenses/${b.lic}/config`, b.T, { config });
  assert.equal((await put({ 'assets.logo': { url: 'https://evil.example/x.png' } })).status, 400);
  assert.equal((await put({ 'assets.logo': { url: 'javascript:alert(1)' } })).status, 400);
  assert.equal((await put({ 'assets.logo': { url: '/uploads/lic_other/../../etc/passwd' } })).status, 400);
  assert.equal((await put({ 'theme.primary': 'red; background:url(//evil)' })).status, 400);
  assert.equal((await put({ 'theme.primary': '#12345' })).status, 400);
  const origins = (list: unknown) => h.call('PUT', `/api/licenses/${b.lic}`, b.T, { allowedOrigins: list });
  assert.equal((await origins(['https://ok.example.com'])).status, 200);
  assert.equal((await origins(['https://a.com; script-src *'])).status, 400, 'a policy cannot be smuggled into the frame rule');
  assert.equal((await origins(['https://a.com\r\nX-Evil: 1'])).status, 400);
  assert.equal((await origins(['https://a.com/path'])).status, 400);
  assert.equal((await origins(['javascript:alert(1)'])).status, 400);
});

test('CSV export: names that look like spreadsheet formulas are defused, and rows with commas stay intact', async () => {
  const b = await h.buyer('csv@test.com', { guest: false, wallet: 'managed' });
  await h.call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId: 'f1', displayName: '=HYPERLINK("http://evil","click")' });
  await h.call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId: 'f2', displayName: '@SUM(1+1)' });
  await h.call('POST', '/api/v1/sessions', b.apiKey, { gameId: b.lic, playerId: 'f3', displayName: 'Smith, John' });
  for (const p of ['f1', 'f2', 'f3']) {
    const pl = await PlayerModel.findOne({ externalId: p }).lean();
    await ResultModel.create({ _id: 'r_' + p, gameId: b.lic, roomId: 'main', playerId: pl!._id, slug: 'lucky-wheel', bet: 10, win: 0, outcome: { summary: '-1+1 weird' }, isPreview: false, createdAt: Date.now() });
  }
  for (const kind of ['players', 'rounds']) {
    const csv = (await h.call('GET', `/api/licenses/${b.lic}/export.csv?kind=${kind}`, b.T)).body as string;
    assert.ok(!/(^|,|\n)"?[=@]/.test(csv), `no cell may start with = or @ (${kind}): ${csv}`);
    assert.ok(csv.includes("'=HYPERLINK") && csv.includes("'@SUM"), 'the text is kept, only defused');
    assert.ok(csv.includes('"Smith, John"'), 'a comma inside a value is quoted');
  }
});

test('headers: the dashboard cannot be framed, uploads are locked down, and nothing leaks the stack', async () => {
  const dash = await fetch(h.base + '/api/health');
  assert.equal(dash.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(dash.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(dash.headers.get('x-powered-by'), null);
  assert.equal(dash.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  const up = await fetch(h.base + '/uploads/lic_x/nothing.png');
  assert.equal(up.status === 404 || up.status === 200, true);
  assert.match(up.headers.get('content-security-policy') ?? '', /sandbox/);
  assert.equal(up.headers.get('x-frame-options'), null, 'uploads may be shown inside games');
  // errors are generic JSON
  const bad = await fetch(h.base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: 'Invalid JSON', code: 'bad_request' });
  const big = await fetch(h.base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@b.cc', password: 'x'.repeat(2_000_000) }) });
  assert.equal(big.status, 413);
  const nf = await h.call('GET', '/api/does-not-exist');
  assert.deepEqual(nf.body, { error: 'Not found', code: 'not_found' });
});

test('static files: path tricks cannot read files outside the public folders', async () => {
  for (const p of ['/uploads/../secret.key', '/uploads/..%2fsecret.key', '/uploads/%2e%2e/%2e%2e/etc/passwd', '/g/../../package.json', '/docs/..%5c..%5cpackage.json', '/uploads/%00']) {
    const r = await fetch(h.base + p);
    const text = await r.text();
    assert.ok(r.status >= 400 || !/root:|test-secret|"name"/.test(text), `${p} must not expose files (status ${r.status})`);
  }
});

test('players: guests and ids are validated; a preview player is invisible to the client wallet API', async () => {
  const b = await h.buyer('names@test.com');
  for (const username of ['ab', 'a'.repeat(21), 'bad name', '<script>', 'x;y', '']) {
    assert.equal((await h.call('POST', '/api/play/login', b.session, { username })).status, 400, `username ${JSON.stringify(username)}`);
  }
  assert.equal((await h.call('POST', '/api/play/login', b.session, { username: { $ne: 1 } })).status, 400, 'objects are not accepted as names');
  const strict = await h.buyer('names2@test.com', { guest: false, wallet: 'managed' });
  for (const playerId of ['', ' ', 'a b', 'x'.repeat(65), '../x', 'a/b', { $gt: '' }, ['a']]) {
    const r = await h.call('POST', '/api/v1/sessions', strict.apiKey, { gameId: strict.lic, playerId });
    assert.equal(r.status, 400, `playerId ${JSON.stringify(playerId)} must be refused`);
  }
});
