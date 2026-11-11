// Creates a demo buyer with two differently customized copies of Lucky Wheel 77, plus some players with real bets,
// by calling the real HTTP API.  Usage: node scripts/seed-demo.mjs [http://localhost:3000]
// (Do NOT run this against production: it creates a demo account.)
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const email = `demo+${Date.now().toString(36)}@minigame.studio`;
const password = 'demo-' + crypto.randomUUID().slice(0, 13);

async function call(method, url, token, body) {
  const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${j.error}`);
  return j;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const T = (await call('POST', '/api/auth/register', null, { email, password })).token;
await call('POST', '/api/wallet/topup', T);
const looks = [
  { title: 'Lucky Wheel 77', currencyName: 'Coins' },
  { title: 'Royal Wheel', currencyName: 'Gems', startingBalance: 250000, 'theme.secondary': '#22d3ee', 'theme.accent': '#22d3ee', 'theme.popup': '#0b2a4a',
    'texts.placeBets': 'Choose your fruit', 'timing.betSeconds': 14, 'timing.spinSeconds': 5, 'timing.resultSeconds': 5 },
];
const out = [];
for (const look of looks) {
  const b = await call('POST', '/api/store/lucky-wheel/buy', T);
  if (Object.keys(look).length > 2) await call('PUT', `/api/licenses/${b.license.id}/config`, T, { config: look });
  const sess = await call('POST', '/api/v1/sessions', b.licenseKey, {});
  out.push({ name: look.title, licenseId: b.license.id, licenseKey: b.licenseKey, playUrl: sess.playUrl });
}
// players with real bets on the first copy
const lic = out[0];
const players = [];
for (const u of ['ali_khan', 'sara_m', 'tom99']) {
  const s = await call('POST', '/api/v1/sessions', lic.licenseKey, { username: u });
  const boot = await call('GET', '/api/play/bootstrap', s.sessionToken);
  players.push(boot.token);
}
for (let round = 0; round < 2; round++) {
  const st = await call('GET', '/api/play/wheel/state', players[0]);
  const wait = st.round.betEnd - st.serverTime;
  if (wait < 4000) { await sleep(st.round.endAt - st.serverTime + 500); round--; continue; }
  for (const [i, tok] of players.entries()) {
    const targets = ['watermelon', 'seven', 'plum'];
    await call('POST', '/api/play/wheel/bet', tok, { bets: [{ target: targets[(i + round) % 3], amount: [30000, 300000, 1000000][i] }, { target: targets[(i + round + 1) % 3], amount: 30000 }] });
  }
  await sleep(st.round.endAt - st.serverTime + 800);
}
console.log(JSON.stringify({ base: BASE, buyerEmail: email, buyerPassword: password, games: out }, null, 2));
