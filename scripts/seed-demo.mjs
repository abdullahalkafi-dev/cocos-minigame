// Creates a demo buyer with 3 differently-customized copies of the SAME game + some players/rounds,
// by calling the real HTTP API. Usage: node scripts/seed-demo.mjs [http://localhost:3000]
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const email = `demo+${Date.now().toString(36)}@minigame.studio`;
const password = 'demo-' + crypto.randomUUID().slice(0, 13);

async function call(method, url, token, body) {
  const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${j.error}`);
  return j;
}

const reg = await call('POST', '/api/auth/register', null, { email, password });
const T = reg.token;
await call('POST', '/api/wallet/topup', T); await call('POST', '/api/wallet/topup', T);
const looks = [
  { title: 'Neon Wheel', currencyName: 'Gems', startingBalance: 500, betOptions: [5, 25, 50], 'theme.primary': '#06b6d4', 'theme.secondary': '#f472b6', 'theme.background': '#04122b' },
  { title: 'Gold Rush Spin', currencyName: 'Gold', startingBalance: 2000, betOptions: [50, 200, 500], 'theme.primary': '#b45309', 'theme.secondary': '#fde047', 'theme.background': '#1c1203' },
  { title: 'Candy Spin', currencyName: 'Candies', startingBalance: 100, betOptions: [1, 5, 10], 'theme.primary': '#ec4899', 'theme.secondary': '#a3e635', 'theme.background': '#3b0764' },
];
const out = [];
for (const look of looks) {
  const b = await call('POST', '/api/store/lucky-spin/buy', T);
  await call('PUT', `/api/licenses/${b.license.id}/config`, T, { config: look });
  const s = await call('POST', '/api/v1/sessions', b.licenseKey, {});
  out.push({ name: look.title, licenseId: b.license.id, licenseKey: b.licenseKey, playUrl: s.playUrl });
  // a few players with rounds so the dashboard has data
  for (const u of ['ali_khan', 'sara_m', 'tom99']) {
    const s2 = await call('POST', '/api/v1/sessions', b.licenseKey, { username: u });
    const boot = await call('GET', '/api/play/bootstrap', s2.sessionToken);
    for (let i = 0; i < 6 + Math.floor(Math.random() * 8); i++) {
      try { await call('POST', '/api/play/spin', boot.token, { bet: look.betOptions[0] }); } catch {}
    }
  }
}
// other games, each with its own look
const others = [
  { slug: 'lucky-77', look: { title: 'Royal 77', currencyName: 'Chips', startingBalance: 3000, betOptions: [10, 50, 100, 500] } },
  { slug: 'ludo', look: { title: 'Ludo Royale', currencyName: 'Coins', startingBalance: 1000, entryFee: 100 } },
];
for (const o of others) {
  await call('POST', '/api/wallet/topup', T);
  const b = await call('POST', `/api/store/${o.slug}/buy`, T);
  await call('PUT', `/api/licenses/${b.license.id}/config`, T, { config: o.look });
  const s = await call('POST', '/api/v1/sessions', b.licenseKey, {});
  out.push({ name: o.look.title, game: o.slug, licenseId: b.license.id, licenseKey: b.licenseKey, playUrl: s.playUrl });
}
console.log(JSON.stringify({ base: BASE, buyerEmail: email, buyerPassword: password, games: out }, null, 2));
