import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, HOME_COL, ORDER, START_IDX, SAFE, absIdx, gridPos, legalMoves, applyMove, newTokens, pickMove, isFinished, HOME, YARD, capturesAt, Tok } from '../assets/scripts/games/ludoRules';

// one step = neighbouring cell; the four board corners are crossed diagonally (as on a real Ludo board)
const manhattan = (a: number[], b: number[]) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

test('board geometry: 52 unique cells, each step moves to a neighbouring cell', () => {
  assert.equal(TRACK.length, 52);
  assert.equal(new Set(TRACK.map(c => c.join(','))).size, 52);
  for (let i = 0; i < 52; i++) assert.equal(manhattan(TRACK[i], TRACK[(i + 1) % 52]), 1, `step ${i}`);
});
test('every colour path is continuous from start to home', () => {
  for (const c of ORDER) {
    for (let p = 0; p < HOME; p++) {
      const a = gridPos(c, p, 0), b = gridPos(c, p + 1, 0);
      if (p + 1 === HOME) { assert.ok(manhattan(a, b) <= 1.6, `${c} last step`); continue; }
      assert.equal(manhattan(a, b), 1, `${c} p=${p}`);
    }
    // the last outer cell touches the first home-column cell
    assert.equal(manhattan(gridPos(c, 50, 0), HOME_COL[c][0]), 1);
  }
});
test('start cells are safe and 8 cells ahead are stars', () => {
  for (const c of ORDER) { assert.ok(SAFE.has(START_IDX[c])); assert.ok(SAFE.has((START_IDX[c] + 8) % 52)); }
});
test('only a 6 leaves the yard; exact roll needed to finish', () => {
  const t = newTokens();
  assert.equal(legalMoves(t, 'red', 3).length, 0);
  assert.equal(legalMoves(t, 'red', 6).length, 4);
  const r = t.find(x => x.color === 'red' && x.id === 0)!;
  r.p = 54;
  const m = legalMoves(t, 'red', 3).map(x => x.tok.id);
  assert.ok(!m.includes(0), 'overshoot not allowed');
  assert.ok(legalMoves(t, 'red', 2).some(x => x.tok.id === 0 && x.finishes));
});
test('capture on normal cell, none on safe cell or home column', () => {
  const t = newTokens();
  const red = t.find(x => x.color === 'red' && x.id === 0)!;
  const green = t.find(x => x.color === 'green' && x.id === 0)!;
  red.p = 2;                                   // abs 2
  green.p = (2 - START_IDX.green + 52) % 52;   // green sitting on abs 2
  assert.equal(absIdx('green', green.p), 2);
  const mv = legalMoves(t, 'red', 6).find(x => x.tok === red && x.to === 8);
  assert.ok(mv);
  // abs 8 is a safe star: no capture there
  green.p = (8 - START_IDX.green + 52) % 52;
  assert.equal(capturesAt(t, 'red', 8).length, 0);
  green.p = (5 - START_IDX.green + 52) % 52;   // abs 5, normal cell
  assert.equal(capturesAt(t, 'red', 5).length, 1);
  applyMove(t, { tok: red, from: 2, to: 5, captures: capturesAt(t, 'red', 5), finishes: false, enters: false });
  assert.equal(green.p, YARD);
  assert.equal(red.p, 5);
});

test('simulated 4-bot games always finish with a legal winner', () => {
  for (let g = 0; g < 300; g++) {
    const toks: Tok[] = newTokens();
    const finished: string[] = [];
    let turn = Math.floor(Math.random() * 4), steps = 0;
    while (finished.length < 3 && steps++ < 20000) {
      const c = ORDER[turn % 4];
      if (!isFinished(toks, c)) {
        let sixes = 0;
        for (;;) {
          const roll = 1 + Math.floor(Math.random() * 6);
          sixes = roll === 6 ? sixes + 1 : 0;
          if (sixes === 3) break;
          const moves = legalMoves(toks, c, roll);
          if (moves.length) {
            const m = pickMove(toks, c, moves, 'normal');
            applyMove(toks, m);
            if (isFinished(toks, c)) { finished.push(c); break; }
            if (roll === 6 || m.captures.length || m.finishes) continue;
            break;
          }
          if (roll === 6) continue;
          break;
        }
      }
      turn++;
    }
    assert.equal(finished.length, 3, 'game must end');
    assert.equal(new Set(finished).size, 3);
    // sanity: no two tokens of different colours share a non-safe outer cell
    const seen = new Map<number, string>();
    for (const t of toks) { const a = absIdx(t.color, t.p); if (a < 0 || SAFE.has(a)) continue; const prev = seen.get(a); assert.ok(!prev || prev === t.color, 'overlap of different colours on a normal cell'); seen.set(a, t.color); }
  }
});
