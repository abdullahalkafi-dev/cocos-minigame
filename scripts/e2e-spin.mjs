import { mintSession, open, sleep } from './lib/playtest.mjs';
const [base, key, user = ''] = process.argv.slice(2);
const url = await mintSession(base, key, user || undefined);
const g = await open(url, { w: 390, h: 844, scale: 2 });
await sleep(6000);
await g.shot('spin-0-login');
if (!user) {
  await g.page.fill('#mg-login input', 'tester_' + Math.floor(Math.random() * 999));
  await g.page.click('#mg-login button');
  await sleep(3500);
}
await g.shot('spin-1-idle');
await g.tap(0, -470);       // SPIN button
await sleep(1500);
await g.shot('spin-2-spinning');
await sleep(7500);
await g.shot('spin-3-result');
await sleep(3500);
await g.shot('spin-4-after');
await g.close();
