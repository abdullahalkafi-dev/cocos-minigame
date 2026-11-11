// Regression test: tapping a chip must highlight THAT chip and bet with it.  node scripts/e2e-chips.mjs <host> <apiKey> <gameId> [loads]
import { mintSession, open, sleep } from './lib/playtest.mjs';
const [base, key, gameId, loads = '4'] = process.argv.slice(2);
let bad = 0;
for (let n = 0; n < +loads; n++) {
  const g = await open((await mintSession(base, key, gameId, 'chip_tester' + n)) + '&debug=1', { w: 390, h: 844, scale: 1 });
  await sleep(8000);
  const info = await g.page.evaluate(() => { const gm = window.__game; return gm.chipNodes.map(c => c.node.name).join(','); });
  // chip centres (stage x) from the game itself
  const xs = await g.page.evaluate(() => window.__game.chipNodes.map(c => c.node.position.x));
  for (const i of [2, 0, 3, 1]) {
    await g.tapB(xs[i], 100); await sleep(350);
    const r = await g.page.evaluate(() => { const gm = window.__game; return { selected: gm.selected, glowOn: gm.chipNodes.map((c, k) => (c.glow.active ? c.node.name : null)).filter(Boolean), betValue: gm.chips[gm.selected].value }; });
    const ok = r.glowOn.length === 1 && r.glowOn[0] === 'chip' + i && r.selected === i;
    if (!ok) { bad++; console.log(`load ${n}: tapped chip${i} -> selected=${r.selected} highlighted=${r.glowOn} (order ${info})`); }
  }
  await g.close();
}
console.log(bad ? `FAIL: ${bad} mismatches` : 'OK: every tap highlights and uses the chip you tapped');
process.exit(bad ? 1 : 0);
