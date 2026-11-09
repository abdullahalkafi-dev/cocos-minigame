import { rng, weightedIndex } from '../util.js';

export interface SpinPrize { label: string; multiplier: number; weight: number; color?: string; image?: string }
export interface SpinResult { prizeIndex: number; label: string; multiplier: number; win: number }

export function playSpin(prizes: SpinPrize[], bet: number, rand: () => number = rng): SpinResult {
  const idx = weightedIndex(prizes.map(p => p.weight), rand);
  const p = prizes[idx];
  return { prizeIndex: idx, label: p.label, multiplier: p.multiplier, win: Math.floor(bet * p.multiplier) };
}
