// Lucky Wheel round engine on top of the database.
// A game has ONE shared round clock: betting -> spin -> result -> next round. Bets are taken and paid through the
// ledger inside database transactions, and a round is settled exactly once however many servers or tabs ask.
import { badRequest, conflict, paymentRequired } from '../../common/errors.js';
import { rid } from '../../common/utils/crypto.js';
import { inTransaction } from '../../infra/mongo.js';
import type { Cache } from '../../infra/cache.js';
import type { GameRec } from '../games/game.model.js';
import type { GameService } from '../games/game.service.js';
import type { WebhookService } from '../webhooks/webhook.service.js';
import type { LedgerService } from '../ledger/ledger.service.js';
import type { PlayerRec } from '../players/player.model.js';
import type { PlayerRepository } from '../players/player.repository.js';
import type { ResultRec } from '../results/result.model.js';
import type { ResultService } from '../results/result.service.js';
import { drawOutcome, makeSnapshot, phaseOf, settleBets, type WheelTiming } from './wheel.engine.js';
import type { WheelRoundRec } from './wheel.model.js';
import type { WheelRepository } from './wheel.repository.js';

const CONTINUOUS_GAP_MS = 3000;
const MAX_WEBHOOK_PLAYERS = 1000;
const IDLE_ROUND_KEEP_MS = 3 * 86400_000;
const curKey = (gameId: string) => `wheel:cur:${gameId}`;
const histKey = (gameId: string) => `wheel:hist:${gameId}`;
const rankKey = (gameId: string) => `wheel:rank:${gameId}`;

export function createWheelService(d: {
  repo: WheelRepository; ledger: LedgerService; results: ResultService; players: PlayerRepository; cache: Cache;
  games: GameService; webhooks: WebhookService;
}) {
  const service = {
    /** The round that is running now. The next one is created (and the previous one paid) when time is up. */
    async currentRound(gameId: string, cfg: any, now: number): Promise<WheelRoundRec> {
      const cached = await d.cache.getJson<WheelRoundRec>(curKey(gameId));
      if (cached && now < cached.endAt) return cached;
      const last = await d.repo.lastRound(gameId);
      if (last && now < last.endAt) { await d.cache.setJson(curKey(gameId), last, (last.endAt - now) / 1000); return last; }

      await service.settleDue(gameId, now);
      const t = cfg.timing as WheelTiming;
      const start = last && now - last.endAt < CONTINUOUS_GAP_MS ? last.endAt : now;   // keep the clock continuous when busy
      const out = drawOutcome(cfg);
      const rec: WheelRoundRec = {
        _id: rid('wr_', 8), gameId, no: last ? last.no + 1 : 1001, startAt: start,
        betEnd: start + t.betSeconds * 1000, spinEnd: start + (t.betSeconds + t.spinSeconds) * 1000,
        endAt: start + (t.betSeconds + t.spinSeconds + t.resultSeconds) * 1000,
        resultTarget: out.target, segment: out.segment, extra: out.extra, snapshot: makeSnapshot(cfg), settled: false,
      };
      const created = (await d.repo.insertRound(rec)) ? rec : (await d.repo.lastRound(gameId))!;   // lost the race: use the winner's round
      await d.cache.setJson(curKey(gameId), created, Math.max(1, (created.endAt - now) / 1000));
      return created;
    },

    /** Pays every round whose spin has finished. Safe to call any time and from any server. */
    async settleDue(gameId: string | null, now: number) {
      for (const r of await d.repo.dueRounds(gameId, now)) {
        try { await service.settleRound(r); } catch (e) { console.error('settle failed for round', r._id, e); }
      }
    },

    async settleRound(r: WheelRoundRec) {
      await inTransaction(async s => {
        if (!(await d.repo.claim(r._id, s))) return;            // somebody else already paid it
        const bets = await d.repo.betsOfRound(r._id, s);
        if (!bets.length) return;
        const hits = [r.resultTarget, ...r.extra];
        const { perBet, perPlayer, resultText } = settleBets(r.snapshot, hits, bets.map(b => ({ id: b._id, playerId: b.playerId, target: b.target, amount: b.amount })));
        await d.repo.markBets(perBet, s);
        const who = new Map((await d.players.byIds([...perPlayer.keys()])).map(p => [p._id, p]));
        const rows: ResultRec[] = [];
        for (const [playerId, p] of perPlayer) {
          if (p.win > 0) await d.ledger.post({ gameId: r.gameId, playerId, delta: p.win, kind: 'win', reference: `win:${r._id}:${playerId}`, note: `Round ${r.no}` }, s);
          rows.push({
            _id: rid('rnd_', 8), gameId: r.gameId, playerId, slug: 'lucky-wheel', bet: p.bet, win: p.win, isPreview: !!who.get(playerId)?.isPreview,
            outcome: { summary: `Round ${r.no}: ${resultText}. Bet ${p.parts.join(', ')}`, round: r.no, result: hits }, createdAt: r.spinEnd,
          });
        }
        await d.results.record(rows, s);
        // tell the buyer's server (only real players; previews are the buyer testing in the dashboard)
        const game = await d.games.get(r.gameId);
        const real = rows.filter(x => !x.isPreview);
        if (game && real.length) {
          await d.webhooks.enqueue(game.userId, r.gameId, 'round.settled', {
            game: 'lucky-wheel', round: r.no, result: hits, playerCount: real.length, truncated: real.length > MAX_WEBHOOK_PLAYERS,
            players: real.slice(0, MAX_WEBHOOK_PLAYERS).map(x => ({ playerId: who.get(x.playerId)!.externalId, bet: x.bet, win: x.win })),
          }, s);
        }
      });
      await d.cache.del(histKey(r.gameId), rankKey(r.gameId));
    },

    /** Places bets for the running round and returns the new balance. */
    async placeBets(game: GameRec, cfg: any, player: PlayerRec, bets: { target: string; amount: number }[], now: number) {
      const round = await service.currentRound(game._id, cfg, now);
      if (phaseOf(round, now) !== 'betting' || now > round.betEnd - 250) throw conflict('Betting is closed for this round', 'betting_closed');
      const maxPer = Number(cfg.limits?.maxPerTarget) || Infinity;
      let total = 0;
      const add = new Map<string, number>();
      for (const b of bets) {
        if (!round.snapshot.targets.some(t => t.id === b.target)) throw badRequest('Unknown bet option', 'unknown_option');
        if (!Number.isInteger(b.amount) || b.amount <= 0) throw badRequest('Invalid amount', 'invalid_amount');
        total += b.amount; add.set(b.target, (add.get(b.target) ?? 0) + b.amount);
      }
      return inTransaction(async s => {
        for (const [target, amount] of add) {
          if ((await d.repo.sumFor(round._id, player._id, target, s)) + amount > maxPer) throw badRequest('Maximum bet for this option reached', 'max_bet');
        }
        const paid = await d.ledger.post({ gameId: game._id, playerId: player._id, delta: -total, kind: 'bet', note: `Round ${round.no}` }, s);
        if (!paid) throw paymentRequired('Not enough balance');
        await d.repo.insertBets([...add].map(([target, amount]) => ({
          gameId: game._id, roundId: round._id, playerId: player._id, target, amount, win: 0, settled: false, createdAt: now,
        })), s);
        return { balance: paid.balance, round: round.no };
      });
    },

    /** Everything the game client needs to draw the screen right now. */
    async state(game: GameRec, cfg: any, player: PlayerRec, now: number) {
      let round = await service.currentRound(game._id, cfg, now);
      if (now >= round.spinEnd) { await service.settleDue(game._id, now); round = (await d.repo.roundById(round._id)) ?? round; }
      const phase = phaseOf(round, now);
      const hits = [round.resultTarget, ...round.extra];
      const [pot, mine, history, fresh] = await Promise.all([
        d.repo.potByTarget(round._id), d.repo.mineByTarget(round._id, player._id), service.history(game._id), d.players.byId(player._id),
      ]);
      let summary: unknown = null;
      if (round.settled) {
        const won = await d.repo.winnersOfRound(round._id);
        const who = new Map((await d.players.byIds(won.map(w => w._id))).map(p => [p._id, p]));
        const winners = won.filter(w => !!who.get(w._id) && who.get(w._id)!.isPreview === player.isPreview).slice(0, 3)
          .map(w => ({ username: who.get(w._id)!.displayName, bet: w.bet, win: w.win }));
        summary = { winners, my: await d.repo.playerRoundTotals(round._id, player._id) };
      }
      return {
        serverTime: now,
        balance: fresh?.balance ?? player.balance,
        round: {
          no: round.no, phase, startAt: round.startAt, betEnd: round.betEnd, spinEnd: round.spinEnd, endAt: round.endAt,
          // the outcome is only revealed once betting is closed
          result: phase !== 'betting' ? { target: round.resultTarget, segment: round.segment, hits } : null,
          summary,
        },
        timing: round.snapshot.timing, pot, mine, history,
      };
    },

    async history(gameId: string) {
      const hit = await d.cache.getJson<{ no: number; hits: string[] }[]>(histKey(gameId));
      if (hit) return hit;
      const list = (await d.repo.history(gameId)).map(h => ({ no: h.no, hits: [h.resultTarget, ...h.extra] }));
      await d.cache.setJson(histKey(gameId), list, 30);
      return list;
    },

    async myBets(player: PlayerRec) {
      const bets = await d.repo.myBets(player._id);
      const rounds = new Map((await d.repo.roundsByIds([...new Set(bets.map(b => b.roundId))])).map(r => [r._id, r]));
      return bets.map(b => {
        const r = rounds.get(b.roundId);
        return { no: r?.no ?? 0, time: r?.startAt ?? b.createdAt, target: b.target, label: r?.snapshot.targets.find(t => t.id === b.target)?.label ?? b.target, amount: b.amount, win: b.win };
      });
    },

    /** Leaderboard by total winnings. Real players and dashboard-preview players are ranked separately. */
    async ranking(game: GameRec, player: PlayerRec, limit = 20) {
      let rows = await d.cache.getJson<{ _id: string; win: number; bet: number }[]>(rankKey(game._id));
      if (!rows) { rows = await d.repo.rankingRows(game._id); await d.cache.setJson(rankKey(game._id), rows, 3); }
      const who = new Map((await d.players.byIds(rows.map(r => r._id))).map(p => [p._id, p]));
      const ranked = rows.filter(r => who.get(r._id)?.isPreview === player.isPreview).sort((a, b) => b.win - a.win || b.bet - a.bet);
      const idx = ranked.findIndex(r => r._id === player._id);
      return {
        list: ranked.slice(0, limit).map((r, i) => ({ rank: i + 1, username: who.get(r._id)!.displayName, win: r.win, me: r._id === player._id })),
        me: { rank: idx >= 0 ? idx + 1 : null, username: player.displayName, win: idx >= 0 ? ranked[idx].win : 0 },
      };
    },

    prune: (now: number) => d.repo.pruneIdle(now - IDLE_ROUND_KEEP_MS),
  };
  return service;
}
export type WheelService = ReturnType<typeof createWheelService>;
