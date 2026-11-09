import { rng, weightedIndex } from '../util.js';

export interface SlotSymbol { id: string; label: string; multiplier: number; weight: number; color?: string; image?: string }
/** Row index per reel for each payline (3 reels x 3 rows). */
export const PAYLINES: number[][] = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
export interface LineWin { line: number; symbol: number; win: number }
export interface SlotResult { grid: number[][]; lines: LineWin[]; win: number; jackpot: boolean }

/** grid[reel][row] = symbol index */
export function playSlots(symbols: SlotSymbol[], bet: number, rand: () => number = rng): SlotResult {
  const weights = symbols.map(s => s.weight);
  const grid = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => weightedIndex(weights, rand)));
  return evaluateSlots(symbols, grid, bet);
}
export function evaluateSlots(symbols: SlotSymbol[], grid: number[][], bet: number): SlotResult {
  const stake = bet / PAYLINES.length;
  const lines: LineWin[] = [];
  PAYLINES.forEach((row, li) => {
    const s = row.map((r, reel) => grid[reel][r]);
    if (s[0] === s[1] && s[1] === s[2]) {
      lines.push({ line: li, symbol: s[0], win: Math.floor(stake * symbols[s[0]].multiplier) });
    }
  });
  const win = lines.reduce((a, l) => a + l.win, 0);
  const top = symbols.reduce((m, s, i) => (s.multiplier > symbols[m].multiplier ? i : m), 0);
  return { grid, lines, win, jackpot: lines.some(l => l.symbol === top) };
}
