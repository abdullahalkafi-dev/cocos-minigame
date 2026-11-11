// Lucky Wheel rules as pure functions: no database, no clock, easy to test.
// The outcome of a round is drawn (crypto RNG) when the round is created and never sent to clients before betting closes.
import { weightedIndex } from '../../common/utils/rng.js';

export interface WheelTiming { betSeconds: number; spinSeconds: number; resultSeconds: number }
export interface Snapshot {
  targets: { id: string; label: string; multiplier: number; lucky: boolean }[];
  segments: { target: string }[];
  timing: WheelTiming;
}
export type Phase = 'betting' | 'spinning' | 'result';

/** Freezes the rules a round is played with, so later config edits never change a round in progress. */
export function makeSnapshot(cfg: any): Snapshot {
  return {
    targets: cfg.targets.map((t: any) => ({ id: t.id, label: t.label, multiplier: Number(t.multiplier), lucky: !!t.lucky })),
    segments: cfg.segments.map((s: any) => ({ target: s.target })),
    timing: { betSeconds: cfg.timing.betSeconds, spinSeconds: cfg.timing.spinSeconds, resultSeconds: cfg.timing.resultSeconds },
  };
}

/** Draws the winning wedge, and sometimes a bonus second option when the lucky option hits. */
export function drawOutcome(cfg: any, rand?: () => number) {
  const segs = cfg.segments as { target: string; weight?: number }[];
  const segment = weightedIndex(segs.map(s => s.weight ?? 1), rand);
  const target = segs[segment].target;
  const t = cfg.targets.find((x: any) => x.id === target);
  const extra: string[] = [];
  const r = rand ?? (() => Math.random());
  if (t?.lucky && r() < Number(cfg.bonus?.chance ?? 0)) {
    const others = cfg.targets.filter((x: any) => x.id !== target);
    if (others.length) extra.push(others[Math.floor(r() * others.length)].id);
  }
  return { segment, target, extra };
}

export const phaseOf = (r: { betEnd: number; spinEnd: number }, now: number): Phase =>
  (now < r.betEnd ? 'betting' : now < r.spinEnd ? 'spinning' : 'result');

export interface BetLike { id: unknown; playerId: string; target: string; amount: number }

/** Pays every bet of a finished round: per-bet winnings and a per-player summary. */
export function settleBets(snap: Snapshot, hits: string[], bets: BetLike[]) {
  const label = (id: string) => snap.targets.find(t => t.id === id)?.label ?? id;
  const perBet: { id: unknown; win: number }[] = [];
  const perPlayer = new Map<string, { bet: number; win: number; parts: string[] }>();
  for (const b of bets) {
    const mult = snap.targets.find(t => t.id === b.target)?.multiplier ?? 0;
    const win = hits.includes(b.target) ? Math.floor(b.amount * mult) : 0;
    perBet.push({ id: b.id, win });
    const p = perPlayer.get(b.playerId) ?? { bet: 0, win: 0, parts: [] };
    p.bet += b.amount; p.win += win; p.parts.push(`${label(b.target)} ${b.amount}`);
    perPlayer.set(b.playerId, p);
  }
  return { perBet, perPlayer, resultText: hits.map(label).join(' + '), label };
}
