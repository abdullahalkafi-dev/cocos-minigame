import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../catalog/index.js';
import { drawOutcome, makeSnapshot, settleBets } from './wheel.engine.js';

test('default odds: every option pays back about 85-100% of what is bet', () => {
  const def = GAMES[0].defaults;
  const N = 300_000;
  const wins: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    const o = drawOutcome(def);
    for (const h of [o.target, ...o.extra]) wins[h] = (wins[h] ?? 0) + 1;
  }
  for (const t of def.targets) {
    const rtp = (wins[t.id] / N) * t.multiplier;
    console.log(`${t.id} RTP ~ ${(rtp * 100).toFixed(1)}%`);
    assert.ok(rtp > 0.85 && rtp < 1.0, `${t.id} rtp ${rtp}`);
  }
});

test('settlement pays multiplier x stake on every hit and nothing on misses', () => {
  const snap = makeSnapshot(GAMES[0].defaults);
  const bets = [
    { id: 1, playerId: 'a', target: 'seven', amount: 100 },
    { id: 2, playerId: 'a', target: 'plum', amount: 50 },
    { id: 3, playerId: 'b', target: 'watermelon', amount: 10 },
  ];
  const r = settleBets(snap, ['seven', 'watermelon'], bets);
  assert.deepEqual(r.perBet.map(b => b.win), [800, 0, 20]);
  assert.deepEqual(r.perPlayer.get('a'), { bet: 150, win: 800, parts: ['Lucky 77 100', 'Prune 50'] });
  assert.equal(r.resultText, 'Lucky 77 + Watermelon');
});
