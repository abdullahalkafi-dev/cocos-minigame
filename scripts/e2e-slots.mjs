import { mintSession, open, sleep } from './lib/playtest.mjs';
const [base, key, user = ''] = process.argv.slice(2);
const url = await mintSession(base, key, user || undefined);
const g = await open(url, { w: 390, h: 844, scale: 2 });
await sleep(6000);
if (!user) { await g.page.fill('#mg-login input', 'slotter_' + Math.floor(Math.random() * 999)); await g.page.click('#mg-login button'); await sleep(3500); }
await g.shot('slots-1-idle');
await g.tap(0, -462);
await sleep(1200);
await g.shot('slots-2-spinning');
await sleep(4500);
await g.shot('slots-3-stopped');
await sleep(2500);
await g.shot('slots-4-after');
// a few more spins to try to hit a win
for (let i = 0; i < 6; i++) { await g.tap(0, -462); await sleep(5200); }
await g.shot('slots-5-later');
await g.close();
