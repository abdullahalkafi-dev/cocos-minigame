// Plays the wheel in a headless browser and writes screenshots of each phase:
//   node scripts/e2e-wheel.mjs <host> <apiKey> <gameId> [username]
import { mintSession, open, sleep } from './lib/playtest.mjs';
const [base, key, gameId, user = 'wheel_tester'] = process.argv.slice(2);
const g = await open((await mintSession(base, key, gameId, user)) + '&debug=1', { w: 390, h: 844, scale: 2 });
await sleep(9000);
const left = () => g.page.evaluate(() => { const r = window.__game.st.round, n = window.__game.now(); return { phase: n < r.betEnd ? 'betting' : n < r.spinEnd ? 'spinning' : 'result', toBet: r.betEnd - n, toSpin: r.spinEnd - n, toEnd: r.endAt - n }; });
const until = async (pred, label) => { for (let i = 0; i < 400; i++) { const s = await left(); if (pred(s)) return s; await sleep(100); } throw new Error('timeout ' + label); };
await until(s => s.phase === 'betting' && s.toBet > 9000, 'new betting phase');
await g.shot('wheel-1-betting');
await g.tapB(0, 250); await sleep(350); await g.tapB(0, 250); await sleep(350); await g.tapB(-215, 250);
await sleep(900);
await g.shot('wheel-2-bets');
await until(s => s.phase === 'betting' && s.toBet < 4000, 'urgent'); await g.shot('wheel-3-urgent');
await until(s => s.phase === 'spinning', 'spin'); await sleep(900); await g.shot('wheel-4-spin-early');
await sleep(1500); await g.shot('wheel-5-spin-fast');
await until(s => s.phase === 'result', 'result'); await sleep(700); await g.shot('wheel-6-result');
await sleep(1400); await g.shot('wheel-7-result-icon');
await sleep(2500); await g.shot('wheel-8-winners');
console.log('errors:', g.errors.length);
await g.close();
