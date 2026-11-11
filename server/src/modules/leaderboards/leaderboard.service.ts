import { badRequest } from '../../common/errors.js';
import { PLAYER_ID_RE, ROOM_KEY_RE } from '../../config/constants.js';
import type { Cache } from '../../infra/cache.js';
import type { GameRec } from '../games/game.model.js';
import type { PlayerRepository } from '../players/player.repository.js';
import type { LeaderboardMetric, ResultRepository } from '../results/result.repository.js';

export type Period = 'day' | 'week' | 'month' | 'all';
const METRICS: LeaderboardMetric[] = ['winnings', 'wagered', 'biggest_win', 'net'];
const PERIODS: Period[] = ['day', 'week', 'month', 'all'];
const VALUE: Record<LeaderboardMetric, 'won' | 'wagered' | 'biggestWin' | 'net'> = { winnings: 'won', wagered: 'wagered', biggest_win: 'biggestWin', net: 'net' };

/** Start of the current day / week (Monday) / month in UTC, in ms. */
export function periodStart(period: Period, now = new Date()): number | undefined {
  if (period === 'all') return undefined;
  const y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate();
  if (period === 'day') return Date.UTC(y, m, d);
  if (period === 'month') return Date.UTC(y, m, 1);
  return Date.UTC(y, m, d - ((now.getUTCDay() + 6) % 7));
}

/** Rankings a client can show in its own app: per game or per room, for a day, week, month or all time. */
export function createLeaderboardService(d: { results: ResultRepository; players: PlayerRepository; cache: Cache }) {
  return {
    async get(game: GameRec, q: { room?: unknown; period?: unknown; metric?: unknown; limit?: unknown; playerId?: unknown }) {
      const period = (q.period ?? 'all') as Period, metric = (q.metric ?? 'winnings') as LeaderboardMetric;
      if (!PERIODS.includes(period)) throw badRequest(`period must be one of ${PERIODS.join(', ')}`, 'invalid_period');
      if (!METRICS.includes(metric)) throw badRequest(`metric must be one of ${METRICS.join(', ')}`, 'invalid_metric');
      const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
      const room = typeof q.room === 'string' && q.room ? q.room : undefined;
      const ext = typeof q.playerId === 'string' && q.playerId ? q.playerId : undefined;
      if (room && !ROOM_KEY_RE.test(room)) throw badRequest('room must be the key of one of your rooms', 'invalid_room');
      if (ext && !PLAYER_ID_RE.test(ext)) throw badRequest('playerId must be 1-64 characters: letters, numbers and _ . : @ -', 'invalid_player_id');
      const since = periodStart(period);

      const key = `lb:${game._id}:${room ?? '*'}:${period}:${metric}:${limit}:${ext ?? ''}`;
      const hit = await d.cache.getJson<unknown>(key);
      if (hit) return hit;

      const rows = await d.results.leaderboard(game._id, { roomId: room, since, metric, limit });
      const who = new Map((await d.players.byIds(rows.map(r => r._id))).map(p => [p._id, p]));
      const entry = (r: (typeof rows)[number], rank: number) => ({
        rank, playerId: who.get(r._id)?.externalId ?? null, displayName: who.get(r._id)?.displayName ?? null, avatarUrl: who.get(r._id)?.avatarUrl ?? null,
        value: r[VALUE[metric]], won: r.won, wagered: r.wagered, biggestWin: r.biggestWin, rounds: r.rounds,
      });
      let me: unknown = null;
      if (ext) {
        const p = await d.players.byExternal(game._id, ext);
        const ranked = p ? await d.results.rankOf(game._id, p._id, { roomId: room, since, metric }) : null;
        if (p && ranked) {
          me = {
            rank: ranked.rank, playerId: p.externalId, displayName: p.displayName, avatarUrl: p.avatarUrl ?? null, value: ranked.row[VALUE[metric]],
            won: ranked.row.won, wagered: ranked.row.wagered, biggestWin: ranked.row.biggestWin, rounds: ranked.row.rounds,
          };
        }
      }
      const out = { room: room ?? null, period, metric, updatedAt: Date.now(), entries: rows.map((r, i) => entry(r, i + 1)), me };
      await d.cache.setJson(key, out, 5);
      return out;
    },
  };
}
export type LeaderboardService = ReturnType<typeof createLeaderboardService>;
