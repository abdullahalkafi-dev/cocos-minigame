// Lucky Wheel round engine.
// A license has ONE shared round clock: betting -> spin -> result -> next round. The outcome of a round is drawn
// (crypto RNG) when the round is created and is never sent to clients before betting closes. Payouts are credited
// when the spin ends. Everything is derived from the buyer's config, so odds/layout/timing are fully dynamic.
import { Db, tx } from './db.js';
import { rid, weightedIndex } from './util.js';

type Row = Record<string, any>;
export interface WheelTiming { betSeconds: number; spinSeconds: number; resultSeconds: number }
export interface Snapshot { targets: { id: string; label: string; multiplier: number; lucky: boolean }[]; segments: { target: string }[]; timing: WheelTiming }

const q = (db: Db) => ({
  get: (sql: string, ...p: any[]) => db.prepare(sql).get(...p) as Row | undefined,
  all: (sql: string, ...p: any[]) => db.prepare(sql).all(...p) as Row[],
  run: (sql: string, ...p: any[]) => db.prepare(sql).run(...p),
});

export function makeSnapshot(cfg: any): Snapshot {
  return {
    targets: cfg.targets.map((t: any) => ({ id: t.id, label: t.label, multiplier: Number(t.multiplier), lucky: !!t.lucky })),
    segments: cfg.segments.map((s: any) => ({ target: s.target })),
    timing: { betSeconds: cfg.timing.betSeconds, spinSeconds: cfg.timing.spinSeconds, resultSeconds: cfg.timing.resultSeconds },
  };
}

/** Draws the outcome of a round from the config. */
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

/** Current round of a license; creates the next one when the previous one is over. */
export function ensureRound(db: Db, licenseId: string, cfg: any, now: number): Row {
  const Q = q(db);
  const last = Q.get('SELECT * FROM wheel_rounds WHERE license_id = ? ORDER BY no DESC LIMIT 1', licenseId);
  if (last && now < last.end_at) return last;
  const t = cfg.timing as WheelTiming;
  const start = last && now - last.end_at < 3000 ? last.end_at : now;        // keep the clock continuous when busy
  const out = drawOutcome(cfg);
  const row = {
    id: rid('wr_', 8), license_id: licenseId, no: last ? last.no + 1 : 1001, start_at: start,
    bet_end: start + t.betSeconds * 1000, spin_end: start + (t.betSeconds + t.spinSeconds) * 1000,
    end_at: start + (t.betSeconds + t.spinSeconds + t.resultSeconds) * 1000,
    result_target: out.target, segment: out.segment, extra: JSON.stringify(out.extra), snapshot: JSON.stringify(makeSnapshot(cfg)),
  };
  Q.run('INSERT OR IGNORE INTO wheel_rounds (id,license_id,no,start_at,bet_end,spin_end,end_at,result_target,segment,extra,snapshot) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    row.id, row.license_id, row.no, row.start_at, row.bet_end, row.spin_end, row.end_at, row.result_target, row.segment, row.extra, row.snapshot);
  return Q.get('SELECT * FROM wheel_rounds WHERE license_id = ? AND no = ?', licenseId, row.no)!;
}

/** Pays every round whose spin has finished. Safe to call any time (idempotent). */
export function settleDue(db: Db, licenseId: string | null, now: number) {
  const Q = q(db);
  const due = licenseId
    ? Q.all('SELECT * FROM wheel_rounds WHERE settled = 0 AND license_id = ? AND spin_end <= ?', licenseId, now)
    : Q.all('SELECT * FROM wheel_rounds WHERE settled = 0 AND spin_end <= ? LIMIT 200', now);
  for (const r of due) tx(db, () => {
    const fresh = Q.get('SELECT settled FROM wheel_rounds WHERE id = ?', r.id)!;
    if (fresh.settled) return;
    const snap: Snapshot = JSON.parse(r.snapshot);
    const hits: string[] = [r.result_target, ...JSON.parse(r.extra)];
    const label = (id: string) => snap.targets.find(t => t.id === id)?.label ?? id;
    const bets = Q.all('SELECT * FROM wheel_bets WHERE round_id = ?', r.id);
    const perPlayer = new Map<string, { bet: number; win: number; parts: string[] }>();
    for (const b of bets) {
      const mult = snap.targets.find(t => t.id === b.target)?.multiplier ?? 0;
      const win = hits.includes(b.target) ? Math.floor(b.amount * mult) : 0;
      Q.run('UPDATE wheel_bets SET win = ? WHERE id = ?', win, b.id);
      const p = perPlayer.get(b.player_id) ?? { bet: 0, win: 0, parts: [] };
      p.bet += b.amount; p.win += win; p.parts.push(`${label(b.target)} ${b.amount}`);
      perPlayer.set(b.player_id, p);
    }
    const resultText = hits.map(label).join(' + ');
    for (const [pid, p] of perPlayer) {
      if (p.win > 0) Q.run('UPDATE players SET balance = balance + ? WHERE id = ?', p.win, pid);
      Q.run('INSERT INTO rounds (id,license_id,player_id,game_slug,bet,win,status,outcome,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        rid('rnd_', 8), r.license_id, pid, 'lucky-wheel', p.bet, p.win, 'done',
        JSON.stringify({ summary: `Round ${r.no}: ${resultText}. Bet ${p.parts.join(', ')}`, round: r.no, result: hits }), r.spin_end);
    }
    Q.run('UPDATE wheel_rounds SET settled = 1 WHERE id = ?', r.id);
  });
}

/** Drop settled rounds that nobody bet on once they are older than 3 days (history only needs recent ones). */
export function pruneRounds(db: Db, now: number) {
  q(db).run('DELETE FROM wheel_rounds WHERE settled = 1 AND spin_end < ? AND id NOT IN (SELECT DISTINCT round_id FROM wheel_bets)', now - 3 * 86400_000);
}

export type Phase = 'betting' | 'spinning' | 'result';
export const phaseOf = (r: Row, now: number): Phase => (now < r.bet_end ? 'betting' : now < r.spin_end ? 'spinning' : 'result');

/** Place bets for the current round. Returns the new balance. */
export function placeBets(db: Db, licenseId: string, cfg: any, player: Row, bets: { target: string; amount: number }[], now: number) {
  const Q = q(db);
  settleDue(db, licenseId, now);
  const round = ensureRound(db, licenseId, cfg, now);
  if (phaseOf(round, now) !== 'betting' || now > round.bet_end - 250) throw Object.assign(new Error('Betting is closed for this round'), { statusCode: 409 });
  const snap: Snapshot = JSON.parse(round.snapshot);
  const maxPer = Number(cfg.limits?.maxPerTarget) || Infinity;
  return tx(db, () => {
    const fresh = Q.get('SELECT balance FROM players WHERE id = ?', player.id)!;
    let total = 0;
    const add = new Map<string, number>();
    for (const b of bets) {
      if (!snap.targets.some(t => t.id === b.target)) throw Object.assign(new Error('Unknown bet option'), { statusCode: 400 });
      if (!Number.isInteger(b.amount) || b.amount <= 0) throw Object.assign(new Error('Invalid amount'), { statusCode: 400 });
      total += b.amount; add.set(b.target, (add.get(b.target) ?? 0) + b.amount);
    }
    if (total > fresh.balance) throw Object.assign(new Error('Not enough balance'), { statusCode: 402 });
    for (const [target, amount] of add) {
      const cur = Q.get('SELECT COALESCE(SUM(amount),0) s FROM wheel_bets WHERE round_id = ? AND player_id = ? AND target = ?', round.id, player.id, target)!.s as number;
      if (cur + amount > maxPer) throw Object.assign(new Error('Maximum bet for this option reached'), { statusCode: 400 });
    }
    for (const [target, amount] of add) Q.run('INSERT INTO wheel_bets (round_id,player_id,target,amount,created_at) VALUES (?,?,?,?,?)', round.id, player.id, target, amount, now);
    Q.run('UPDATE players SET balance = balance - ?, last_seen = ? WHERE id = ?', total, now, player.id);
    return { balance: fresh.balance - total, round: round.no };
  });
}

/** Everything the client needs to render the game right now. */
export function wheelState(db: Db, licenseId: string, cfg: any, player: Row, now: number) {
  const Q = q(db);
  settleDue(db, licenseId, now);
  const round = ensureRound(db, licenseId, cfg, now);
  const phase = phaseOf(round, now);
  const revealed = phase !== 'betting';
  const snap: Snapshot = JSON.parse(round.snapshot);
  const pot: Record<string, number> = {}, mine: Record<string, number> = {};
  Q.all('SELECT target, SUM(amount) s FROM wheel_bets WHERE round_id = ? GROUP BY target', round.id).forEach(r => { pot[r.target] = r.s; });
  Q.all('SELECT target, SUM(amount) s FROM wheel_bets WHERE round_id = ? AND player_id = ? GROUP BY target', round.id, player.id).forEach(r => { mine[r.target] = r.s; });
  const hits = [round.result_target, ...JSON.parse(round.extra)];
  const hist = Q.all('SELECT no, result_target, extra FROM wheel_rounds WHERE license_id = ? AND settled = 1 ORDER BY no DESC LIMIT 48', licenseId)
    .map(h => ({ no: h.no, hits: [h.result_target, ...JSON.parse(h.extra)] }));
  // once a round is paid: who won (shown in the winners popup) and what this player got
  let summary: any = null;
  if (round.settled) {
    const winners = Q.all(`SELECT p.username, SUM(b.amount) bet, SUM(b.win) win FROM wheel_bets b JOIN players p ON p.id = b.player_id
                           WHERE b.round_id = ? AND p.is_preview = ? GROUP BY b.player_id HAVING win > 0 ORDER BY win DESC LIMIT 3`, round.id, player.is_preview ?? 0);
    const my = Q.get('SELECT COALESCE(SUM(amount),0) bet, COALESCE(SUM(win),0) win FROM wheel_bets WHERE round_id = ? AND player_id = ?', round.id, player.id)!;
    summary = { winners, my };
  }
  const myNow = Q.get('SELECT balance FROM players WHERE id = ?', player.id)!;
  return {
    serverTime: now,
    balance: myNow.balance,
    round: {
      no: round.no, phase, startAt: round.start_at, betEnd: round.bet_end, spinEnd: round.spin_end, endAt: round.end_at,
      // the outcome is only revealed once betting is closed
      result: revealed ? { target: round.result_target, segment: round.segment, hits } : null,
      summary,
    },
    timing: snap.timing, pot, mine, history: hist,
  };
}

export function myBets(db: Db, playerId: string, limit = 30) {
  return q(db).all(`SELECT r.no, r.start_at, b.target, b.amount, b.win, r.snapshot FROM wheel_bets b JOIN wheel_rounds r ON r.id = b.round_id
                    WHERE b.player_id = ? AND r.settled = 1 ORDER BY b.id DESC LIMIT ?`, playerId, limit)
    .map(b => ({ no: b.no, time: b.start_at, target: b.target, label: (JSON.parse(b.snapshot) as Snapshot).targets.find(t => t.id === b.target)?.label ?? b.target, amount: b.amount, win: b.win }));
}

export function ranking(db: Db, licenseId: string, player: Row, limit = 20) {
  const Q = q(db);
  const rows = Q.all(`SELECT p.id, p.username, SUM(b.win) win, SUM(b.amount) bet FROM wheel_bets b JOIN wheel_rounds r ON r.id = b.round_id JOIN players p ON p.id = b.player_id
                      WHERE r.license_id = ? AND r.settled = 1 AND p.is_preview = ? GROUP BY p.id ORDER BY win DESC, bet DESC`, licenseId, player.is_preview ?? 0);
  const list = rows.slice(0, limit).map((r, i) => ({ rank: i + 1, username: r.username, win: r.win, me: r.id === player.id }));
  const idx = rows.findIndex(r => r.id === player.id);
  return { list, me: { rank: idx >= 0 ? idx + 1 : null, username: player.username, win: idx >= 0 ? rows[idx].win : 0 } };
}
