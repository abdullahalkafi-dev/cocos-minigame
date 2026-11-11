import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || path.resolve(import.meta.dirname, '../data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export function openDb(file = path.join(DATA_DIR, 'app.db')) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, pass_salt TEXT NOT NULL, pass_hash TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS wallet_tx (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS licenses (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), game_slug TEXT NOT NULL, name TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE, key_prefix TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}',
      allowed_origins TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', price INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY, license_id TEXT NOT NULL REFERENCES licenses(id), username TEXT NOT NULL,
      balance INTEGER NOT NULL, is_preview INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL,
      UNIQUE(license_id, username));
    CREATE TABLE IF NOT EXISTS rounds (
      id TEXT PRIMARY KEY, license_id TEXT NOT NULL, player_id TEXT NOT NULL, game_slug TEXT NOT NULL,
      bet INTEGER NOT NULL, win INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'done',
      outcome TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS wheel_rounds (
      id TEXT PRIMARY KEY, license_id TEXT NOT NULL, no INTEGER NOT NULL,
      start_at INTEGER NOT NULL, bet_end INTEGER NOT NULL, spin_end INTEGER NOT NULL, end_at INTEGER NOT NULL,
      result_target TEXT NOT NULL, segment INTEGER NOT NULL, extra TEXT NOT NULL DEFAULT '[]',
      snapshot TEXT NOT NULL, settled INTEGER NOT NULL DEFAULT 0, UNIQUE(license_id, no));
    CREATE TABLE IF NOT EXISTS wheel_bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, round_id TEXT NOT NULL, player_id TEXT NOT NULL, target TEXT NOT NULL,
      amount INTEGER NOT NULL, win INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_wbets_round ON wheel_bets(round_id);
    CREATE INDEX IF NOT EXISTS idx_wbets_player ON wheel_bets(player_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_wrounds_license ON wheel_rounds(license_id, no DESC);
    CREATE INDEX IF NOT EXISTS idx_rounds_license ON rounds(license_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_players_license ON players(license_id);
  `);
  return db;
}
export type Db = ReturnType<typeof openDb>;

export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
