import { mintSession, open, sleep } from './lib/playtest.mjs';
const [base, key] = process.argv.slice(2);
const url = (await mintSession(base, key, 'ludo_winner')) + '&debug=1';
const g = await open(url, { w: 390, h: 844, scale: 2 });
await sleep(6000);
await g.tap(0, -402);
await sleep(2500);
const before = await g.page.evaluate(() => window.__game.ctx.hud.balance);
// jump to the end of a match where the human finished 1st
await g.page.evaluate(() => { window.__game.finished = ['blue']; window.__game.endMatch(); });
await sleep(2500);
await g.shot('ludo-win-modal');
const after = await g.page.evaluate(() => window.__game.ctx.hud.balance);
console.log(JSON.stringify({ balanceAfterFee: before, balanceAfterWin: after }));
await g.close();
