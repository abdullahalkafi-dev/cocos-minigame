import { AppError, badRequest, conflict, notFound } from '../../common/errors.js';
import { DISPLAY_NAME_MAX, MAX_AMOUNT, PLAYER_ID_RE } from '../../config/constants.js';
import { inTransaction, isDuplicateKey } from '../../infra/mongo.js';
import type { GameService } from '../games/game.service.js';
import type { GameRec } from '../games/game.model.js';
import type { LedgerService } from '../ledger/ledger.service.js';
import type { PlayerService } from '../players/player.service.js';
import type { PlayerRec } from '../players/player.model.js';
import type { UserRec } from '../users/user.model.js';

type Direction = 'credit' | 'debit';
const REFERENCE_RE = /^[A-Za-z0-9_.:@-]{1,100}$/;

/**
 * The managed wallet: the client's server adds coins when it sells them (credit) and removes them for a
 * cash-out (debit). Every call carries a `reference` that makes it safe to retry: the same reference always
 * gives the same answer and never moves money twice.
 */
export function createWalletService(d: { games: GameService; players: PlayerService; ledger: LedgerService }) {
  const playerView = (p: PlayerRec) => ({ playerId: p.externalId, displayName: p.displayName, balance: p.balance, createdAt: p.createdAt, lastSeen: p.lastSeen });

  const gameOf = async (account: UserRec, gameId: string): Promise<GameRec> => {
    const g = await d.games.ownedBy(account._id, gameId);
    if (!g) throw notFound('Game not found for this API key', 'game_not_found');
    return g;
  };
  const managedGame = async (account: UserRec, gameId: string) => {
    const g = await gameOf(account, gameId);
    if (d.games.playerSettings(g).walletMode !== 'managed') {
      throw conflict("This game uses the demo wallet. Set its wallet mode to 'managed' in the dashboard (Settings) to control coins from your server.", 'wallet_not_enabled');
    }
    return g;
  };
  const checkPlayerId = (id: string) => {
    if (!PLAYER_ID_RE.test(id)) throw badRequest('playerId must be 1-64 characters: letters, numbers and _ . : @ -', 'invalid_player_id');
    return id;
  };

  const service = {
    async getPlayer(account: UserRec, gameId: string, playerId: string) {
      const g = await gameOf(account, gameId);
      const p = await d.players.byExternal(g._id, checkPlayerId(playerId));
      if (!p || p.isPreview) throw notFound('This player has not been seen in this game yet', 'player_not_found');
      return playerView(p);
    },

    async move(account: UserRec, gameId: string, playerId: string, dir: Direction, body: Record<string, unknown>) {
      const g = await managedGame(account, gameId);
      const pid = checkPlayerId(playerId);
      const { amount, reference, note, displayName } = body;
      if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 1 || amount > MAX_AMOUNT) {
        throw badRequest(`amount must be a whole number between 1 and ${MAX_AMOUNT.toLocaleString('en-US')}`, 'invalid_amount');
      }
      if (typeof reference !== 'string' || !REFERENCE_RE.test(reference)) {
        throw badRequest('reference is required: a unique id for this operation (1-100 characters: letters, numbers and _ . : @ -). Retrying with the same reference never moves money twice.', 'reference_required');
      }
      if (note !== undefined && (typeof note !== 'string' || note.length > 200)) throw badRequest('note must be at most 200 characters', 'invalid_note');
      let name: string | undefined;
      if (displayName !== undefined) {
        if (typeof displayName !== 'string' || !displayName.trim() || displayName.length > DISPLAY_NAME_MAX) throw badRequest(`displayName must be 1-${DISPLAY_NAME_MAX} characters`, 'invalid_displayName');
        name = displayName.trim();
      }
      const delta = dir === 'credit' ? amount : -amount;

      // the same reference answers the same way: it is how a retry stays safe
      const replay = async (): Promise<ReturnType<typeof answer> | null> => {
        const prior = await d.ledger.byReference(g._id, reference);
        if (!prior) return null;
        const who = await d.players.byExternal(g._id, pid);
        if (!who || prior.playerId !== who._id || prior.delta !== delta || prior.kind !== dir) {
          throw conflict('This reference was already used for a different operation. Use a new reference for a new operation.', 'reference_conflict');
        }
        return answer(pid, prior.balanceAfter, String(prior._id), true);
      };
      const answer = (playerId: string, balance: number, transactionId: string, duplicate: boolean) => ({ playerId, balance, transactionId, duplicate });

      const earlier = await replay();
      if (earlier) return earlier;

      const player = dir === 'credit'
        ? await d.players.getOrCreate(g._id, pid, { preview: false, startingBalance: 0, displayName: name })
        : await d.players.byExternal(g._id, pid);
      if (!player || player.isPreview) throw notFound('This player has not been seen in this game yet', 'player_not_found');

      let posted: { balance: number; id: string } | null;
      try {
        posted = await inTransaction(s => d.ledger.post({ gameId: g._id, playerId: player._id, delta, kind: dir, reference, note: note as string | undefined }, s));
      } catch (e) {
        if (isDuplicateKey(e)) { const raced = await replay(); if (raced) return raced; }   // two identical requests at the same moment
        throw e;
      }
      if (!posted) throw new AppError(402, 'Insufficient balance', 'insufficient_balance', { balance: player.balance });
      return answer(pid, posted.balance, posted.id, false);
    },

    /** The player's ledger, newest first. Includes the coins the game itself moved (bets and wins). */
    async transactions(account: UserRec, gameId: string, playerId: string, q: { limit?: unknown; before?: unknown }) {
      const g = await gameOf(account, gameId);
      const p = await d.players.byExternal(g._id, checkPlayerId(playerId));
      if (!p || p.isPreview) throw notFound('This player has not been seen in this game yet', 'player_not_found');
      const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
      const before = typeof q.before === 'string' && /^[a-f0-9]{24}$/.test(q.before) ? q.before : undefined;
      const rows = await d.ledger.history(p._id, limit, before);
      const items = rows.map(r => ({ id: String(r._id), type: r.kind, amount: r.delta, balanceAfter: r.balanceAfter, reference: r.reference ?? null, note: r.note ?? null, createdAt: r.createdAt }));
      return { playerId: p.externalId, balance: p.balance, transactions: items, nextBefore: rows.length === limit ? items[items.length - 1].id : null };
    },
  };
  return service;
}
export type WalletService = ReturnType<typeof createWalletService>;
