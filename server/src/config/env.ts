import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** `server/` folder (this file lives in server/src/config). */
export const SERVER_ROOT = path.resolve(import.meta.dirname, '../..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

export interface Env {
  nodeEnv: string;
  port: number;
  /** Public address used inside the play links handed to clients, no trailing slash. */
  publicUrl: string;
  dataDir: string;
  uploadsDir: string;
  mongoUri: string;
  /** Redis is optional: without it the app falls back to an in-memory cache (single instance only). */
  redisUrl?: string;
  /** Signs session / player / dashboard tokens. */
  secret: string;
  /** Folder with the built games, dashboard, SDK, docs and default artwork. */
  publicDir: string;
}

function loadSecret(dataDir: string): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(dataDir, 'secret.key');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(file, 'utf8').trim();
}

export function loadEnv(): Env {
  try { process.loadEnvFile(path.join(REPO_ROOT, '.env')); } catch { /* no .env file: use real environment variables */ }
  const port = Number(process.env.PORT || 3000);
  // relative paths in .env are relative to the repository root, whatever folder the server is started from
  const dataDir = path.resolve(REPO_ROOT, process.env.DATA_DIR || 'server/data');
  fs.mkdirSync(dataDir, { recursive: true });
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port,
    publicUrl: (process.env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, ''),
    dataDir,
    uploadsDir: process.env.UPLOADS_DIR || path.join(dataDir, 'uploads'),
    mongoUri,
    redisUrl: process.env.REDIS_URL || undefined,
    secret: loadSecret(dataDir),
    publicDir: path.join(SERVER_ROOT, 'public'),
  };
}
