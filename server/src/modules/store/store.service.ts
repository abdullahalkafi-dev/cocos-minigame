import { rid } from '../../common/utils/crypto.js';
import { notFound, paymentRequired } from '../../common/errors.js';
import { inTransaction } from '../../infra/mongo.js';
import { GAMES, gameBySlug } from '../catalog/index.js';
import type { UserRepository } from '../users/user.repository.js';
import type { UserRec } from '../users/user.model.js';
import type { GameRepository } from '../games/game.repository.js';
import type { GameService } from '../games/game.service.js';

/** The store: what can be bought, and buying a game with demo credits. */
export function createStoreService(d: { users: UserRepository; gameRepo: GameRepository; games: GameService }) {
  return {
    list: () => ({ games: GAMES.map(g => ({ slug: g.slug, name: g.name, tagline: g.tagline, price: g.price, tech: g.tech })) }),

    async buy(user: UserRec, slug: string) {
      const def = gameBySlug(slug);
      if (!def) throw notFound('Unknown game', 'unknown_game');
      const id = rid('lic_', 7);
      const { game, balance } = await inTransaction(async s => {
        const paid = await d.users.adjustBalance(user._id, -def.price, s);
        if (!paid) throw paymentRequired('Not enough demo credits. Top up your wallet first.', 'insufficient_credits');
        const n = (await d.gameRepo.countByOwnerAndSlug(user._id, def.slug, s)) + 1;
        await d.users.addTx({ userId: user._id, delta: -def.price, reason: `Purchased ${def.name}`, createdAt: Date.now() }, s);
        const rec = { _id: id, userId: user._id, slug: def.slug, name: `${def.name} #${n}`, config: {}, allowedOrigins: [], status: 'active', price: def.price, createdAt: Date.now() };
        await d.gameRepo.create(rec, s);
        return { game: rec, balance: paid.balance };
      });
      return { license: d.games.view(game), balance };
    },
  };
}
export type StoreService = ReturnType<typeof createStoreService>;
