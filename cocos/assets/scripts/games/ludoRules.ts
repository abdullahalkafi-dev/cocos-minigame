// Pure Ludo rules (no engine imports) so they can be unit-tested outside Cocos.
export type Color = 'red' | 'green' | 'yellow' | 'blue';
/** Clockwise seating: red top-left, green top-right, yellow bottom-right, blue bottom-left. */
export const ORDER: Color[] = ['red', 'green', 'yellow', 'blue'];
export const START_IDX: Record<Color, number> = { red: 0, green: 13, yellow: 26, blue: 39 };
export const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const HOME = 56;                           // progress value of a finished token
export const YARD = -1;

/** The 52 outer cells, clockwise, as [col, row] on a 15x15 grid. Index 0 is red's start. */
export const TRACK: [number, number][] = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0], [8, 0],
  [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7], [14, 8],
  [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14], [6, 14],
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7], [0, 6],
];
export const HOME_COL: Record<Color, [number, number][]> = {
  red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  green: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
};
export const YARD_SPOTS: Record<Color, [number, number][]> = {
  red: [[1.4, 1.4], [3.6, 1.4], [1.4, 3.6], [3.6, 3.6]],
  green: [[10.4, 1.4], [12.6, 1.4], [10.4, 3.6], [12.6, 3.6]],
  yellow: [[10.4, 10.4], [12.6, 10.4], [10.4, 12.6], [12.6, 12.6]],
  blue: [[1.4, 10.4], [3.6, 10.4], [1.4, 12.6], [3.6, 12.6]],
};
const FINISH_BASE: Record<Color, [number, number]> = { red: [6.25, 7], green: [7, 6.25], yellow: [7.75, 7], blue: [7, 7.75] };

export interface Tok { color: Color; id: number; p: number }

/** Absolute track index (0..51) for a token on the outer track, else -1. */
export function absIdx(color: Color, p: number): number {
  return p >= 0 && p <= 50 ? (START_IDX[color] + p) % 52 : -1;
}
/** Grid position (continuous cell-centre coordinates) of a token. */
export function gridPos(color: Color, p: number, id: number): [number, number] {
  if (p < 0) return YARD_SPOTS[color][id];
  if (p <= 50) return TRACK[(START_IDX[color] + p) % 52];
  if (p <= 55) return HOME_COL[color][p - 51];
  const b = FINISH_BASE[color];
  const off = (id - 1.5) * 0.3;
  return color === 'red' || color === 'yellow' ? [b[0], b[1] + off] : [b[0] + off, b[1]];
}

export interface Move { tok: Tok; from: number; to: number; captures: Tok[]; finishes: boolean; enters: boolean }

export function legalMoves(tokens: Tok[], color: Color, roll: number): Move[] {
  const mine = tokens.filter(t => t.color === color);
  const out: Move[] = [];
  for (const t of mine) {
    let to: number;
    if (t.p === YARD) { if (roll !== 6) continue; to = 0; }
    else { to = t.p + roll; if (to > HOME) continue; }
    out.push({ tok: t, from: t.p, to, captures: capturesAt(tokens, color, to), finishes: to === HOME, enters: t.p === YARD });
  }
  return out;
}
/** Opponent tokens that would be captured by landing on progress `to`. */
export function capturesAt(tokens: Tok[], color: Color, to: number): Tok[] {
  const a = absIdx(color, to);
  if (a < 0 || SAFE.has(a)) return [];
  return tokens.filter(o => o.color !== color && absIdx(o.color, o.p) === a);
}
/** True if an opponent token could reach abs cell `a` with a single roll of 1..6. */
export function inDanger(tokens: Tok[], color: Color, a: number): boolean {
  if (a < 0 || SAFE.has(a)) return false;
  return tokens.some(o => {
    if (o.color === color) return false;
    const oa = absIdx(o.color, o.p);
    if (oa < 0) return false;
    const d = (a - oa + 52) % 52;
    return d >= 1 && d <= 6;
  });
}
export function applyMove(tokens: Tok[], m: Move) {
  m.tok.p = m.to;
  m.captures.forEach(c => { c.p = YARD; });
}

export type BotLevel = 'easy' | 'normal' | 'hard';
export function scoreMove(tokens: Tok[], color: Color, m: Move): number {
  let s = 0;
  if (m.finishes) s += 100;
  if (m.captures.length) s += 80 + m.captures.reduce((a, c) => a + c.p, 0) * 0.5;
  if (m.enters) s += 45;
  const a = absIdx(color, m.to);
  if (a >= 0 && SAFE.has(a)) s += 20;
  if (m.to > 50) s += 15;
  s += m.to * 0.3;
  if (a >= 0 && inDanger(tokens, color, a) && !m.captures.length) s -= 35;
  const cur = absIdx(color, m.from);
  if (cur >= 0 && inDanger(tokens, color, cur)) s += 25;
  return s;
}
export function pickMove(tokens: Tok[], color: Color, moves: Move[], level: BotLevel, rnd: () => number = Math.random): Move {
  if (moves.length === 1) return moves[0];
  if (level === 'easy' && rnd() < 0.55) return moves[Math.floor(rnd() * moves.length)];
  const noise = level === 'hard' ? 2 : 14;
  let best = moves[0], bestS = -Infinity;
  for (const m of moves) {
    const sc = scoreMove(tokens, color, m) + rnd() * noise;
    if (sc > bestS) { bestS = sc; best = m; }
  }
  return best;
}
export const isFinished = (tokens: Tok[], color: Color) => tokens.filter(t => t.color === color).every(t => t.p === HOME);
export const newTokens = (): Tok[] => ORDER.flatMap(color => [0, 1, 2, 3].map(id => ({ color, id, p: YARD })));
