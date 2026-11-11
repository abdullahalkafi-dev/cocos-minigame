// Copies the static dashboard build (dashboard/out) to the folder the server serves (server/public/app).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const from = path.join(root, 'dashboard/out');
const to = path.join(root, 'server/public/app');
if (!fs.existsSync(path.join(from, 'index.html'))) throw new Error('dashboard/out/index.html is missing: run "next build" first');
fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true });
console.log(`dashboard published to ${path.relative(root, to)}`);
