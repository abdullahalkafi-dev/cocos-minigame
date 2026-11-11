import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildApp } from './app.js';
import { DATA_DIR, openDb } from './db.js';

const root = path.resolve(import.meta.dirname, '..');
function loadSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const f = path.join(DATA_DIR, 'secret.key');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(f, 'utf8').trim();
}

const port = Number(process.env.PORT || 3000);
const publicUrl = (process.env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, '');
const app = await buildApp({
  db: openDb(), secret: loadSecret(), publicUrl,
  uploadsDir: process.env.UPLOADS_DIR || path.join(DATA_DIR, 'uploads'),
  gamesDir: path.join(root, 'public/games'),
  webRoot: path.join(root, 'public/app'),
  sdkDir: path.join(root, 'public/sdk'),
  docsDir: path.join(root, 'public/docs'),
  defaultsDir: path.join(root, 'public/defaults'),
  logger: true,
});
await app.listen({ port, host: '0.0.0.0' });
console.log(`MiniGame Studio running at ${publicUrl}`);
