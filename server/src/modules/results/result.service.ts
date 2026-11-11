import type { ClientSession } from 'mongoose';
import type { PlayerRepository } from '../players/player.repository.js';
import type { GameRec } from '../games/game.model.js';
import type { ResultRepository } from './result.repository.js';
import type { ResultRec } from './result.model.js';

const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const iso = (ms: number) => new Date(ms).toISOString();

/** Round results: written when a round settles, read by the dashboard (statistics, players, results, CSV). */
export function createResultService(d: { repo: ResultRepository; players: PlayerRepository }) {
  const names = async (ids: string[]) => new Map((await d.players.byIds([...new Set(ids)])).map(p => [p._id, p]));
  return {
    record: (recs: ResultRec[], session?: ClientSession) => d.repo.insertMany(recs, session),
    existingIds: (ids: string[], session?: ClientSession) => d.repo.existingIds(ids, session),

    /** Per-game totals shown on the "My games" cards. */
    async statsForGames(gameIds: string[]) {
      const [totals, players] = await Promise.all([d.repo.totalsByGames(gameIds), d.players.countByGames(gameIds)]);
      return new Map(gameIds.map(id => {
        const t = totals.get(id);
        return [id, { players: players.get(id) ?? 0, rounds: t?.rounds ?? 0, bet: t?.bet ?? 0, win: t?.win ?? 0 }];
      }));
    },

    async dashboard(game: GameRec) {
      const [stats, top, daily] = await Promise.all([this.statsForGames([game._id]), d.repo.topWinners(game._id), d.repo.daily(game._id)]);
      const t = stats.get(game._id)!;
      const who = await names(top.map(x => x._id));
      return {
        totals: { ...t, rtp: t.bet ? t.win / t.bet : 0 },
        topWinners: top.map(x => ({ username: who.get(x._id)?.displayName ?? '?', win: x.win, rounds: x.rounds })),
        daily: daily.map(x => ({ day: x._id, rounds: x.rounds, bet: x.bet, win: x.win })),
      };
    },

    async players(game: GameRec) {
      const [list, agg] = await Promise.all([d.players.listByGame(game._id), d.repo.perPlayer(game._id)]);
      return list.map(p => {
        const a = agg.get(p._id);
        return {
          id: p._id, playerId: p.externalId, username: p.displayName, balance: p.balance, created_at: p.createdAt, last_seen: p.lastSeen,
          rounds: a?.rounds ?? 0, totalBet: a?.bet ?? 0, totalWin: a?.win ?? 0,
        };
      });
    },

    async rounds(game: GameRec, o: { limit: number; offset: number; player?: string }) {
      let playerId: string | undefined;
      if (o.player) {
        const p = await d.players.byExternal(game._id, o.player);
        if (!p) return [];
        playerId = p._id;
      }
      const rows = await d.repo.list(game._id, { limit: o.limit, offset: o.offset, playerId });
      const who = await names(rows.map(r => r.playerId));
      return rows.map(r => ({ id: r._id, username: who.get(r.playerId)?.displayName ?? '?', bet: r.bet, win: r.win, outcome: r.outcome, created_at: r.createdAt }));
    },

    async csv(game: GameRec, kind: 'players' | 'rounds') {
      if (kind === 'players') {
        const rows = await this.players(game);
        return 'player_id,name,balance,rounds,total_bet,total_win,first_seen,last_seen\n' + rows.map(r =>
          [r.playerId, r.username, r.balance, r.rounds, r.totalBet, r.totalWin, iso(r.created_at), iso(r.last_seen)].map(csvCell).join(',')).join('\n');
      }
      const rows = await d.repo.all(game._id);
      const who = await names(rows.map(r => r.playerId));
      return 'time,player_id,name,bet,win,result\n' + rows.map(r => {
        const p = who.get(r.playerId);
        return [iso(r.createdAt), p?.externalId, p?.displayName, r.bet, r.win, r.outcome?.summary].map(csvCell).join(',');
      }).join('\n');
    },
  };
}
export type ResultService = ReturnType<typeof createResultService>;
