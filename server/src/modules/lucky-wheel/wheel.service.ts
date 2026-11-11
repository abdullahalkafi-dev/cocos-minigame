// Lucky Wheel round engine on top of the database.
// Every ROOM of a game has ONE shared round clock: betting -> spin -> result -> next round. Bets are taken and paid
// through the ledger (or the client's wallet) and a round is paid out exactly once however many servers or tabs ask:
// payouts run in small batches under a lease, and every payment has a unique reference, so an interrupted payout
// simply continues where it stopped.
import { AppError, badRequest, conflict, paymentRequired } from '../../common/errors.js';
import { rid } from '../../common/utils/crypto.js';
import { MAX_AMOUNT } from '../../config/constants.js';
import { inTransaction } from '../../infra/mongo.js';
import type { Cache } from '../../infra/cache.js';
import type { GameRec } from '../games/game.model.js';
import type { GameService } from '../games/game.service.js';
import type { LedgerService } from '../ledger/ledger.service.js';
import type { PlayerRec } from '../players/player.model.js';
import type { PlayerRepository } from '../players/player.repository.js';
import type { ResultRec } from '../results/result.model.js';
import type { ResultService } from '../results/result.service.js';
import type { RoomRec } from '../rooms/room.model.js';
import type { RoomService } from '../rooms/room.service.js';
import type { SeamlessService } from '../seamless/seamless.service.js';
import type { WebhookService } from '../webhooks/webhook.service.js';
import { drawOutcome, makeSnapshot, phaseOf, settleBets, type WheelTiming } from './wheel.engine.js';
import type { WheelRoundRec } from './wheel.model.js';
import type { WheelRepository } from './wheel.repository.js';
import type { WheelHub } from './wheel.hub.js';

const CONTINUOUS_GAP_MS = 3000;
const IDLE_ROUND_KEEP_MS = 3 * 86400_000;
const MAX_WEBHOOK_PLAYERS = 1000;
const PAYOUT_BATCH = 100;
const PAYOUT_LEASE_MS = 120_000;
const curKey = (gameId: string, roomId: string) => `wheel:cur:${gameId}:${roomId}`;
const histKey = (gameId: string, roomId: string) => `wheel:hist:${gameId}:${roomId}`;
const rankKey = (gameId: string, roomId: string) => `wheel:rank:${gameId}:${roomId}`;
const chunks = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export interface Winner { username: string; bet: number; win: number }
/** Who won a round (top 3, for real players and for dashboard-preview players separately) and what every player got. */
export interface SettleInfo { roundNo: number; winners: { real: Winner[]; preview: Winner[] }; perPlayer: Map<string, { bet: number; win: number }> }

export function createWheelService(d: {
  repo: WheelRepository; ledger: LedgerService; results: ResultService; players: PlayerRepository; cache: Cache;
  games: GameService; webhooks: WebhookService; rooms: RoomService; seamless: SeamlessService;
}) {
  let hub: WheelHub | null = null;

  const service = {
    /** The live hub (WebSocket push) hears about every bet and every payout. Set once at start-up. */
    attachHub(h: WheelHub) { hub = h; },

    /** The round that is running now in a room. The next one is created (and the previous one paid) when time is up. */
    async currentRound(game: GameRec, room: RoomRec, cfg: any, now: number): Promise<WheelRoundRec> {
      const gameId = game._id, roomId = room.key;
      const cached = await d.cache.getJson<WheelRoundRec>(curKey(gameId, roomId));
      if (cached && now < cached.endAt) return cached;
      const last = await d.repo.lastRound(gameId, roomId);
      if (last && now < last.endAt) { await d.cache.setJson(curKey(gameId, roomId), last, (last.endAt - now) / 1000); return last; }

      await service.settleDue(now, { gameId, roomId });
      const t = cfg.timing as WheelTiming;
      const start = last && now - last.endAt < CONTINUOUS_GAP_MS ? last.endAt : now;   // keep the clock continuous when busy
      const out = drawOutcome(cfg);
      const rec: WheelRoundRec = {
        _id: rid('wr_', 8), gameId, roomId, no: last ? last.no + 1 : 1001, startAt: start,
        betEnd: start + t.betSeconds * 1000, spinEnd: start + (t.betSeconds + t.spinSeconds) * 1000,
        endAt: start + (t.betSeconds + t.spinSeconds + t.resultSeconds) * 1000,
        resultTarget: out.target, segment: out.segment, extra: out.extra, snapshot: makeSnapshot(cfg), settled: false,
        walletMode: d.games.playerSettings(game).walletMode,
      };
      const created = (await d.repo.insertRound(rec)) ? rec : (await d.repo.lastRound(gameId, roomId))!;   // lost the race: use the winner's round
      await d.cache.setJson(curKey(gameId, roomId), created, Math.max(1, (created.endAt - now) / 1000));
      return created;
    },

    /** Pays every round whose spin has finished (optionally only one room's). Safe to call any time and from any server. */
    async settleDue(now: number, where: { gameId?: string; roomId?: string } = {}) {
      for (const r of await d.repo.dueRounds(now, where)) {
        try { await service.settleRound(r); } catch (e) { console.error('settle failed for round', r._id, e); }
      }
    },

    /** Who won a round and what each player got, rebuilt from the stored bets (used after a restart or on another server). */
    async settleInfoFor(round: WheelRoundRec): Promise<SettleInfo> {
      const rows = await d.repo.totalsByPlayer(round._id);
      const who = new Map((await d.players.byIds(rows.map(r => r._id))).map(p => [p._id, p]));
      const top = (preview: boolean) => rows.filter(r => r.win > 0 && !!who.get(r._id) && who.get(r._id)!.isPreview === preview).sort((a, b) => b.win - a.win).slice(0, 3)
        .map(r => ({ username: who.get(r._id)!.displayName, bet: r.bet, win: r.win }));
      return { roundNo: round.no, winners: { real: top(false), preview: top(true) }, perPlayer: new Map(rows.map(r => [r._id, { bet: r.bet, win: r.win }])) };
    },

    async settleRound(r: WheelRoundRec) {
      const leased = await d.repo.lease(r._id, Date.now(), PAYOUT_LEASE_MS);
      if (!leased) return;                                                  // somebody else is paying it, or already did
      const game = await d.games.get(r.gameId);
      if (!game) { await d.repo.finalize(r._id); return; }
      const mode = r.walletMode ?? d.games.playerSettings(game).walletMode;   // the system the bets were taken from, even if the setting changed since
      const bets = await d.repo.betsOfRound(r._id);
      const hits = [r.resultTarget, ...r.extra];

      if (bets.length) {
        const { perBet, perPlayer, resultText } = settleBets(r.snapshot, hits, bets.map(b => ({ id: b._id, playerId: b.playerId, target: b.target, amount: b.amount })));
        const winOf = new Map(perBet.map(b => [String(b.id), b.win]));
        const betsOf = new Map<string, typeof bets>();
        for (const b of bets) betsOf.set(b.playerId, [...(betsOf.get(b.playerId) ?? []), b]);
        const who = new Map((await d.players.byIds([...perPlayer.keys()])).map(p => [p._id, p]));

        // payouts in small batches: each batch is one short transaction, and anything already paid is skipped
        for (const batch of chunks([...perPlayer.keys()], PAYOUT_BATCH)) {
          await d.repo.extendLease(r._id, Date.now() + PAYOUT_LEASE_MS);
          await inTransaction(async s => {
            const winRef = (pid: string) => `win:${r._id}:${pid}`;
            const winners = batch.filter(pid => perPlayer.get(pid)!.win > 0).map(winRef);
            // a payout that runs again (after a crash) skips what is already stored or paid
            const paid = mode === 'seamless' ? await d.seamless.storedCredits(winners, s) : await d.ledger.paidReferences(r.gameId, winners, s);
            const resultIds = batch.map(pid => `rnd:${r._id}:${pid}`);
            const haveResult = await d.results.existingIds(resultIds, s);
            const rows: ResultRec[] = [];
            for (const pid of batch) {
              const p = perPlayer.get(pid)!;
              await d.repo.markBets((betsOf.get(pid) ?? []).map(b => ({ id: b._id, win: winOf.get(String(b._id)) ?? 0 })), s);
              if (p.win > 0 && !paid.has(winRef(pid))) {
                if (mode === 'seamless') await d.seamless.enqueueCredit(game, who.get(pid)!, p.win, winRef(pid), `Round ${r.no}`, s);
                else {
                  const res = await d.ledger.post({ gameId: r.gameId, playerId: pid, delta: p.win, kind: 'win', reference: winRef(pid), note: `Round ${r.no}` }, s);
                  if (res) hub?.setBalance(pid, res.balance, false);   // shown to the player with the round summary
                }
              }
              if (!haveResult.has(`rnd:${r._id}:${pid}`)) rows.push({
                _id: `rnd:${r._id}:${pid}`, gameId: r.gameId, roomId: r.roomId, playerId: pid, slug: 'lucky-wheel', bet: p.bet, win: p.win, isPreview: !!who.get(pid)?.isPreview,
                outcome: { summary: `Round ${r.no}: ${resultText}. Bet ${p.parts.join(', ')}`, round: r.no, result: hits }, createdAt: r.spinEnd,
              });
            }
            await d.results.record(rows, s);
          });
        }

        // tell the buyer's server (real players only; previews are the buyer testing in the dashboard). A fixed id makes it once-only.
        const real = [...perPlayer.keys()].filter(pid => !who.get(pid)?.isPreview);
        if (real.length) {
          await d.webhooks.enqueue(game.userId, r.gameId, 'round.settled', {
            game: 'lucky-wheel', room: r.roomId, round: r.no, result: hits, playerCount: real.length, truncated: real.length > MAX_WEBHOOK_PLAYERS,
            players: real.slice(0, MAX_WEBHOOK_PLAYERS).map(pid => ({ playerId: who.get(pid)!.externalId, bet: perPlayer.get(pid)!.bet, win: perPlayer.get(pid)!.win })),
          }, { id: `evt_round_${r._id}`, livemode: game.mode !== 'test' });
        }
      }

      await d.repo.finalize(r._id);
      await d.cache.del(histKey(r.gameId, r.roomId), rankKey(r.gameId, r.roomId));
      if (hub) hub.onSettled(r, await service.settleInfoFor(r));
    },

    /** Places bets for the running round of a room and returns the new balance. */
    async placeBets(game: GameRec, room: RoomRec, cfg: any, player: PlayerRec, bets: { target: string; amount: number }[], now: number) {
      const round = await service.currentRound(game, room, cfg, now);
      if (phaseOf(round, now) !== 'betting' || now > round.betEnd - 250) throw conflict('Betting is closed for this round', 'betting_closed');
      const maxPer = Number(cfg.limits?.maxPerTarget) || Infinity;
      const mode = round.walletMode ?? d.games.playerSettings(game).walletMode;
      // the buyer changed where the coins live while this round was running: its bets must stay in one system, so wait for the next round
      if (mode !== d.games.playerSettings(game).walletMode) throw conflict('The wallet settings changed. Betting opens again in the next round.', 'wallet_mode_changed');
      let total = 0;
      const add = new Map<string, number>();
      for (const b of bets) {
        if (!round.snapshot.targets.some(t => t.id === b.target)) throw badRequest('Unknown bet option', 'unknown_option');
        if (!Number.isSafeInteger(b.amount) || b.amount <= 0 || b.amount > MAX_AMOUNT) throw badRequest('Invalid amount', 'invalid_amount');
        total += b.amount; add.set(b.target, (add.get(b.target) ?? 0) + b.amount);
        if (total > MAX_AMOUNT) throw badRequest('Invalid amount', 'invalid_amount');
      }
      const checkMax = async (s?: import('mongoose').ClientSession) => {
        for (const [target, amount] of add) {
          if ((await d.repo.sumFor(round._id, player._id, target, s)) + amount > maxPer) throw badRequest('Maximum bet for this option reached', 'max_bet');
        }
      };
      const rows = [...add].map(([target, amount]) => ({ gameId: game._id, roomId: room.key, roundId: round._id, playerId: player._id, target, amount, win: 0, settled: false, createdAt: now }));

      let result: { balance: number; round: number };
      try {
        if (mode === 'seamless') {
          await checkMax();
          const reference = `bet:${round._id}:${player._id}:${rid('', 5)}`;
          const paid = await d.seamless.debit(game, player, total, reference, `Round ${round.no}`);
          try {
            result = await inTransaction(async s => {
              await checkMax(s);
              await d.ledger.record({ gameId: game._id, playerId: player._id, delta: -total, kind: 'bet', reference, note: `Round ${round.no}`, balanceAfter: paid.balance }, s);
              await d.repo.insertBets(rows, s);
              return { balance: paid.balance, round: round.no };
            });
          } catch (e) { await d.seamless.rollback(game, player, reference, total, 'bet could not be stored'); throw e; }
        } else {
          result = await inTransaction(async s => {
            await checkMax(s);
            const paid = await d.ledger.post({ gameId: game._id, playerId: player._id, delta: -total, kind: 'bet', note: `Round ${round.no}` }, s);
            if (!paid) throw paymentRequired('Not enough balance');
            await d.repo.insertBets(rows, s);
            return { balance: paid.balance, round: round.no };
          });
        }
      } catch (e) {
        if (e instanceof AppError && e.code === 'insufficient_balance' && mode !== 'demo') service.notifyNeedsCoins(game, room, player).catch(err => console.error('needs_coins', err));
        throw e;
      }
      hub?.onBet(game._id, room.key, player._id, add, result.balance);
      return result;
    },

    /** Tells the buyer's server that a player ran out of coins (at most once per player and five minutes). */
    async notifyNeedsCoins(game: GameRec, room: RoomRec, player: PlayerRec) {
      const release = await d.cache.lock(`needs:${game._id}:${player._id}`, 5 * 60_000);   // never released: it expires by itself
      if (!release) return;
      await d.webhooks.enqueue(game.userId, game._id, 'player.needs_coins', { playerId: player.externalId, room: room.key, balance: player.balance }, { livemode: game.mode !== 'test' });
    },

    /** Everything the game client needs to draw the screen right now, read from the database (the fallback when WebSocket push is not available). */
    async state(game: GameRec, room: RoomRec, cfg: any, player: PlayerRec, now: number) {
      let round = await service.currentRound(game, room, cfg, now);
      if (now >= round.spinEnd) { await service.settleDue(now, { gameId: game._id, roomId: room.key }); round = (await d.repo.roundById(round._id)) ?? round; }
      const phase = phaseOf(round, now);
      const hits = [round.resultTarget, ...round.extra];
      const [pot, mine, history, fresh] = await Promise.all([
        d.repo.potByTarget(round._id), d.repo.mineByTarget(round._id, player._id), service.history(game._id, room.key), d.players.byId(player._id),
      ]);
      let summary: unknown = null;
      if (round.settled) {
        const info = await service.settleInfoFor(round);
        summary = { winners: player.isPreview ? info.winners.preview : info.winners.real, my: info.perPlayer.get(player._id) ?? { bet: 0, win: 0 } };
      }
      void d.rooms.touch(game._id, room.key, [player._id]);
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

    async history(gameId: string, roomId: string) {
      const hit = await d.cache.getJson<{ no: number; hits: string[] }[]>(histKey(gameId, roomId));
      if (hit) return hit;
      const list = (await d.repo.history(gameId, roomId)).map(h => ({ no: h.no, hits: [h.resultTarget, ...h.extra] }));
      await d.cache.setJson(histKey(gameId, roomId), list, 30);
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

    /** Leaderboard by total winnings inside a room. Real players and dashboard-preview players are ranked separately. */
    async ranking(game: GameRec, room: RoomRec, player: PlayerRec, limit = 20) {
      let rows = await d.cache.getJson<{ _id: string; win: number; bet: number }[]>(rankKey(game._id, room.key));
      if (!rows) { rows = await d.repo.rankingRows(game._id, room.key); await d.cache.setJson(rankKey(game._id, room.key), rows, 3); }
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
