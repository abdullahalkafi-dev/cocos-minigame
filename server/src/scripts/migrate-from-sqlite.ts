// One-off migration of the old SQLite database (before the MongoDB rebuild) into MongoDB.
//
//   npm run migrate:sqlite -w server -- /path/to/app.db
//
// Moves: buyers, their demo wallet history, games, players (with balances) and round results.
// Does not move: the unfinished round that may have been running, which is simply lost.
// Refuses to run if the target database already has users, so it can never overwrite live data.
import { DatabaseSync } from 'node:sqlite';
import { loadEnv } from '../config/env.js';
import { connectMongo, disconnectMongo } from '../infra/mongo.js';
import { UserModel, WalletTxModel } from '../modules/users/user.model.js';
import { GameModel } from '../modules/games/game.model.js';
import { PlayerModel } from '../modules/players/player.model.js';
import { LedgerModel } from '../modules/ledger/ledger.model.js';
import { ResultModel } from '../modules/results/result.model.js';

type Row = Record<string, any>;
const file = process.argv[2];
if (!file) { console.error('Usage: npm run migrate:sqlite -w server -- <path to app.db>'); process.exit(1); }

const env = loadEnv();
await connectMongo(env.mongoUri);
if (await UserModel.estimatedDocumentCount() > 0) {
  console.error('The MongoDB database already contains users. Refusing to migrate into a non-empty database.');
  await disconnectMongo(); process.exit(1);
}
await Promise.all([UserModel, WalletTxModel, GameModel, PlayerModel, LedgerModel, ResultModel].map(m => m.init()));

const db = new DatabaseSync(file, { readOnly: true });
const all = (sql: string) => db.prepare(sql).all() as Row[];

const users = all('SELECT * FROM users');
await UserModel.insertMany(users.map(u => ({
  _id: u.id, email: u.email, passSalt: u.pass_salt, passHash: u.pass_hash, balance: u.balance,
  apiKeyHash: u.api_key_hash ?? undefined, apiKeyPrefix: u.api_key_prefix ?? undefined, createdAt: u.created_at,
})));
const tx = all('SELECT * FROM wallet_tx');
if (tx.length) await WalletTxModel.insertMany(tx.map(t => ({ userId: t.user_id, delta: t.delta, reason: t.reason, createdAt: t.created_at })));

const games = all('SELECT * FROM licenses');
if (games.length) await GameModel.insertMany(games.map(g => ({
  _id: g.id, userId: g.user_id, slug: g.game_slug, name: g.name, config: JSON.parse(g.config || '{}'),
  allowedOrigins: g.allowed_origins ? String(g.allowed_origins).split(',') : [], status: g.status, price: g.price, createdAt: g.created_at,
})));

const players = all('SELECT * FROM players');
if (players.length) {
  await PlayerModel.insertMany(players.map(p => ({
    _id: p.id, gameId: p.license_id, externalId: p.username, displayName: p.username, balance: p.balance,
    isPreview: !!p.is_preview, createdAt: p.created_at, lastSeen: p.last_seen,
  })));
  // keep the rule "balance = sum of ledger" true for migrated players
  await LedgerModel.insertMany(players.filter(p => p.balance > 0).map(p => ({
    gameId: p.license_id, playerId: p.id, delta: p.balance, balanceAfter: p.balance, kind: 'credit',
    note: 'Balance migrated from the previous system', createdAt: Date.now(),
  })));
}

const preview = new Map(players.map(p => [p.id, !!p.is_preview]));
const rounds = all('SELECT * FROM rounds');
if (rounds.length) await ResultModel.insertMany(rounds.map(r => ({
  _id: r.id, gameId: r.license_id, playerId: r.player_id, slug: r.game_slug, bet: r.bet, win: r.win,
  outcome: JSON.parse(r.outcome || '{}'), isPreview: preview.get(r.player_id) ?? false, createdAt: r.created_at,
})));

console.log(`Migrated ${users.length} users, ${games.length} games, ${players.length} players, ${rounds.length} results.`);
await disconnectMongo();
