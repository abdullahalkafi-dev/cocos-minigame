// Plays the wheel in a headless browser and writes screenshots: node scripts/e2e-wheel.mjs <host> <licenseKey> [username]
import { mintSession, open, sleep } from './lib/playtest.mjs';
const [base, key, user = 'wheel_tester'] = process.argv.slice(2);
const url = await mintSession(base, key, user);
const g = await open(url, { w: 390, h: 844, scale: 2 });
await sleep(9000);
await g.shot('wheel-1-betting');
// tap the middle box twice (design coords: boxes around y=-390)
await g.tap(0, -390); await sleep(500); await g.tap(0, -390); await sleep(500);
await g.tap(-215, -390);
await sleep(1200);
await g.shot('wheel-2-bets');
const st = await g.page.evaluate(() => 0);
await sleep(24000);
await g.shot('wheel-3-spin');
await sleep(9000);
await g.shot('wheel-4-result');
await sleep(4000);
await g.shot('wheel-5-after');
console.log('errors:', g.errors.length);
await g.close();
