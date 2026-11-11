import crypto from 'node:crypto';
import type { ClientSession } from 'mongoose';
import { AppError, badRequest, paymentRequired } from '../../common/errors.js';
import { decryptSecret } from '../../common/utils/crypto.js';
import { inTransaction, isDuplicateKey } from '../../infra/mongo.js';
import type { Bus } from '../../infra/bus.js';
import type { GameRec } from '../games/game.model.js';
import type { GameService } from '../games/game.service.js';
import type { LedgerService } from '../ledger/ledger.service.js';
import type { PlayerRec } from '../players/player.model.js';
import type { UserRepository } from '../users/user.repository.js';
import type { UserRec } from '../users/user.model.js';
import { signPayload } from '../webhooks/webhook.service.js';
import type { WebhookService } from '../webhooks/webhook.service.js';
import { assertSafeWebhookUrl } from '../webhooks/webhook.url.js';
import type { SeamlessOpRec, SeamlessOpType } from './seamless.model.js';
import type { SeamlessRepository } from './seamless.repository.js';

/** Wait before the 2nd, 3rd ... attempt of a stored operation. After the last one it is marked failed and the buyer is told. */
export const SEAMLESS_RETRY_MS = [5_000, 30_000, 120_000, 600_000, 1_800_000, 7_200_000, 21_600_000, 43_200_000];
const MAX_ATTEMPTS = SEAMLESS_RETRY_MS.length + 1;
const LEASE_MS = 30_000;

type Outcome =
  | { ok: true; status: number; balance?: number }
  | { ok: false; kind: 'insufficient' | 'rejected' | 'unavailable'; status?: number; error: string; balance?: number };

/**
 * Seamless wallet: the client's system keeps the money and we ask it, one request per movement:
 *   debit   a bet's stake      credit  a win      rollback  undo a debit we are not sure about      balance / ping
 * All requests go to one address per account, signed like webhooks, and carry a `reference` the client must treat
 * as an idempotency key. Debits are synchronous (a bet waits for the answer); credits and rollbacks are stored and
 * retried until they succeed.
 */
export function createSeamlessService(d: {
  repo: SeamlessRepository; users: UserRepository; games: GameService; webhooks: WebhookService; ledger: LedgerService; bus: Bus; allowPrivate: boolean; secret: string;
}) {
  const owner = async (g: GameRec) => (await d.users.byId(g.userId))!;

  async function send(u: UserRec, g: GameRec | null, type: string, body: Record<string, unknown>, reference: string, timeoutMs: number): Promise<Outcome> {
    if (!u.walletUrl) return { ok: false, kind: 'unavailable', error: 'No wallet endpoint is set for this account' };
    try {
      await assertSafeWebhookUrl(u.walletUrl, d.allowPrivate);
      const secret = u.webhookSecret ? decryptSecret(u.webhookSecret, d.secret) : await d.webhooks.ensureSecret(u);
      const text = JSON.stringify({ type, gameId: g?._id ?? null, livemode: g ? g.mode !== 'test' : true, reference, ...body });
      const ts = Math.floor(Date.now() / 1000);
      const res = await fetch(u.walletUrl, {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'Content-Type': 'application/json', 'User-Agent': 'MiniGameStudio-Wallet/1',
          'X-Minigame-Event': 'wallet.' + type, 'X-Minigame-Delivery': reference, 'X-Minigame-Timestamp': String(ts),
          'X-Minigame-Signature': 'v1=' + signPayload(secret, ts, text),
        },
        body: text,
      });
      let json: any = null;
      try { json = await res.json(); } catch { /* not JSON */ }
      const balance = Number.isSafeInteger(json?.balance) && json.balance >= 0 ? (json.balance as number) : undefined;
      if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status, balance };
      if (res.status === 402 || json?.code === 'insufficient_balance') return { ok: false, kind: 'insufficient', status: res.status, error: 'Not enough coins', balance };
      if (res.status >= 400 && res.status < 500) return { ok: false, kind: 'rejected', status: res.status, error: `Your wallet answered HTTP ${res.status}${json?.code ? ' ' + json.code : ''}` };
      return { ok: false, kind: 'unavailable', status: res.status, error: `Your wallet answered HTTP ${res.status}` };
    } catch (e: any) {
      return { ok: false, kind: 'unavailable', error: e?.name === 'TimeoutError' ? `No answer within ${timeoutMs / 1000} seconds` : String(e?.message ?? e).slice(0, 200) };
    }
  }

  const ref = (prefix: string, ...parts: string[]) => `${prefix}:${parts.join(':')}`;

  const service = {
    // ------------------------------------------------------------ settings (dashboard)
    config: (u: UserRec) => ({ url: u.walletUrl ?? null }),
    async setUrl(u: UserRec, url: unknown) {
      if (url === null || url === '') { await d.users.setWebhook(u._id, { walletUrl: null }); return { url: null }; }
      if (typeof url !== 'string' || url.length > 500) throw badRequest('Enter a full address such as https://example.com/minigame-wallet', 'invalid_wallet_url');
      const safe = await assertSafeWebhookUrl(url.trim(), d.allowPrivate);
      await d.webhooks.ensureSecret(u);
      await d.users.setWebhook(u._id, { walletUrl: safe.toString() });
      return { url: safe.toString() };
    },
    /** "Test" button: sends a ping and reports what the client's server answered. */
    async test(u: UserRec) {
      if (!u.walletUrl) throw badRequest('Set your wallet address first', 'wallet_endpoint_missing');
      const r = await send(u, null, 'ping', {}, 'ping:' + crypto.randomUUID(), 8000);
      return r.ok ? { ok: true, status: r.status } : { ok: false, status: r.status ?? null, error: r.error };
    },
    async operations(u: UserRec) {
      const rows = await d.repo.recent(u._id);
      return { operations: rows.map(o => ({ reference: o._id, type: o.type, playerId: o.externalId, amount: o.amount, status: o.status, attempts: o.attempts, lastError: o.lastError ?? null, createdAt: o.createdAt })) };
    },

    // ------------------------------------------------------------ used while playing
    /** The player's balance in the client's system, or null when it does not answer. */
    async balanceOf(g: GameRec, p: PlayerRec): Promise<number | null> {
      const r = await send(await owner(g), g, 'balance', { playerId: p.externalId }, ref('balance', p._id, String(Date.now())), 3000);
      return r.ok && r.balance !== undefined ? r.balance : null;
    },

    /** Takes the stake of a bet. Throws 402 when the client says the player has too little, 503 when it cannot say. */
    async debit(g: GameRec, p: PlayerRec, amount: number, reference: string, note?: string): Promise<{ balance: number }> {
      const r = await send(await owner(g), g, 'debit', { playerId: p.externalId, amount, note }, reference, 5000);
      if (r.ok) {
        if (r.balance !== undefined) return { balance: r.balance };
        await service.rollback(g, p, reference, amount, 'invalid response');
        throw new AppError(502, 'Your wallet did not report a balance', 'wallet_invalid_response');
      }
      if (r.kind === 'insufficient') throw paymentRequired('Not enough balance', 'insufficient_balance');
      if (r.kind === 'rejected') throw new AppError(502, 'The wallet refused this bet', 'wallet_rejected');
      // we do not know whether the stake was taken: make sure it is given back if it was
      await service.rollback(g, p, reference, amount, 'uncertain debit', true);
      throw new AppError(503, 'The wallet is not answering. No coins were taken. Please try again.', 'wallet_unavailable');
    },

    /** Gives a stake back. Tried once now, then kept and retried until the client's wallet acknowledges. */
    async rollback(g: GameRec, p: PlayerRec, reference: string, amount: number, note: string, skipNow = false) {
      const u = await owner(g);
      if (!skipNow) {
        const r = await send(u, g, 'rollback', { playerId: p.externalId, amount, note }, reference, 5000);
        if (r.ok) return;
      }
      await d.repo.create({
        _id: 'rb:' + reference, userId: u._id, gameId: g._id, playerId: p._id, externalId: p.externalId, type: 'rollback', amount, note,
        status: 'pending', attempts: skipNow ? 0 : 1, nextAttemptAt: Date.now() + (skipNow ? 2_000 : SEAMLESS_RETRY_MS[0]), createdAt: Date.now(),
      });
    },

    /** Stores the payout of a win (inside the settlement transaction). The worker sends it. */
    enqueueCredit: (g: GameRec, p: PlayerRec, amount: number, reference: string, note: string, session: ClientSession) =>
      d.repo.create({
        _id: reference, userId: g.userId, gameId: g._id, playerId: p._id, externalId: p.externalId, type: 'credit', amount, note,
        status: 'pending', attempts: 0, nextAttemptAt: Date.now(), createdAt: Date.now(),
      }, session),

    // ------------------------------------------------------------ the worker
    async attempt(op: SeamlessOpRec) {
      const u = await d.users.byId(op.userId);
      const game = await d.games.get(op.gameId);
      const attempts = op.attempts + 1;
      const r = u && game
        ? await send(u, game, op.type, { playerId: op.externalId, amount: op.amount, note: op.note }, op.type === 'rollback' ? op._id.slice(3) : op._id, 8000)
        : ({ ok: false, kind: 'rejected', error: 'The game or the account no longer exists' } as Outcome);
      if (r.ok) {
        if (op.type === 'credit' && r.balance !== undefined) {
          try {
            await inTransaction(s => d.ledger.record({ gameId: op.gameId, playerId: op.playerId, delta: op.amount, kind: 'win', reference: op._id, note: op.note ?? undefined, balanceAfter: r.balance! }, s));
          } catch (e) { if (!isDuplicateKey(e)) throw e; }
          d.bus.emit('balance', op.playerId, r.balance);
        }
        await d.repo.update(op._id, { status: 'done', attempts, lastError: null, doneAt: Date.now() });
        return;
      }
      const final = attempts >= MAX_ATTEMPTS || r.kind === 'rejected';
      await d.repo.update(op._id, final
        ? { status: 'failed', attempts, lastError: r.error }
        : { status: 'pending', attempts, lastError: r.error, nextAttemptAt: Date.now() + SEAMLESS_RETRY_MS[attempts - 1] });
      if (final && u && game) {
        await d.webhooks.enqueue(u._id, game._id, 'wallet.operation_failed', {
          type: op.type, playerId: op.externalId, amount: op.amount, reference: op.type === 'rollback' ? op._id.slice(3) : op._id, error: r.error,
        }, { id: 'evt_' + op._id.replace(/[^A-Za-z0-9_-]/g, '_'), livemode: game.mode !== 'test' });
      }
    },

    async deliverDue(now = Date.now()) {
      for (const { _id } of await d.repo.dueIds(now)) {
        const op = await d.repo.lease(_id, now, LEASE_MS);
        if (op) { try { await service.attempt(op); } catch (e) { console.error('seamless op', _id, e); } }
      }
    },
  };
  return service;
}
export type SeamlessService = ReturnType<typeof createSeamlessService>;
export type { SeamlessOpType };
