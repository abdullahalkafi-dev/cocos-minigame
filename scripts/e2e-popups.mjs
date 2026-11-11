// Opens every popup of the wheel game and screenshots it.  node scripts/e2e-popups.mjs <host> <licenseKey>
import { mintSession, open, sleep } from './lib/playtest.mjs';
const [base, key] = process.argv.slice(2);
const url = await mintSession(base, key, 'popup_tester') + '&debug=1';
const g = await open(url, { w: 390, h: 844, scale: 2 });
await sleep(9000);
// place a couple of bets so "My bets" has content
await g.tap(0, -400); await sleep(400);
const run = async (name, fn, wait = 1200) => { await g.page.evaluate(fn); await sleep(wait); await g.shot('pop-' + name); await g.page.evaluate(() => window.__game.closePopup()); await sleep(300); };
await run('howto', () => window.__game.openHowTo());
await run('history', () => window.__game.openHistory());
await run('mybets', () => window.__game.openMyBets(), 1800);
await run('ranking', () => window.__game.openRanking(), 1800);
await run('winners', () => window.__game.openWinners({ winners: [{ username: 'ali_khan', bet: 300000, win: 2400000 }, { username: 'sara_m', bet: 30000, win: 60000 }, { username: 'tom99', bet: 1000000, win: 2000000 }], my: { bet: 30000, win: 60000 } }, 20));
await g.shot('pop-final');
console.log('errors:', g.errors.length);
await g.close();
