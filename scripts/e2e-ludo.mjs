import { mintSession, open, sleep } from './lib/playtest.mjs';
const [base, key, speed = '1', mode = 'watch'] = process.argv.slice(2);
const url = (await mintSession(base, key, 'ludo_tester')) + '&debug=1';
const g = await open(url, { w: 390, h: 844, scale: 2 });
await sleep(7000);
await g.shot('ludo-1-idle');
await g.tap(0, -402);                 // PLAY
await sleep(2500);
await g.shot('ludo-2-started');
if (mode === 'watch') {
  // Human taps the dice and picks a token via screen clicks is hard to script; show the idle "your turn" state
  await g.tap(0, -396); await sleep(1500);
  await g.shot('ludo-3-rolled');
  await sleep(2000);
  await g.shot('ludo-4-pick');
} else {
  await g.page.evaluate(s => { cc.director.getScheduler().setTimeScale(+s); window.__game.auto = true; const f = window.__game.diceTap; if (f) { window.__game.diceTap = null; f(); } }, speed);
  for (let i = 0; i < 40; i++) {
    await sleep(8000);
    const over = await g.page.evaluate(() => !window.__game.active);
    if (i % 3 === 0) await g.shot('ludo-play-' + i);
    if (over) break;
  }
  await sleep(3000);
  await g.shot('ludo-end');
}
await g.close();
