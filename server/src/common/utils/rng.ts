import crypto from 'node:crypto';

/** Cryptographically secure float in [0,1). Every game outcome comes from here. */
export function rng(): number {
  return crypto.randomInt(0, 2 ** 32) / 2 ** 32;
}

/** Picks an index with probability proportional to its weight. */
export function weightedIndex(weights: number[], rand: () => number = rng): number {
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return 0;
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r < 0) return i;
  }
  return weights.length - 1;
}
