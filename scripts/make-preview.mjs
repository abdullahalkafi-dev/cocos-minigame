// Takes a real screenshot of the game and stores it as the store preview image.  node scripts/make-preview.mjs <host>
import sharp from 'sharp';
import { mintSession, open, sleep } from './lib/playtest.mjs';
const base = process.argv[2] || 'http://localhost:3000';
const j = async (m, u, t, b) => { const r = await fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); const x = await r.json(); if (!r.ok) throw new Error(u + ' ' + x.error); return x; };
const T = (await j('POST', '/api/auth/register', null, { email: `preview+${Date.now()}@test.dev`, password: 'preview-pass-1' })).token;
const b = await j('POST', '/api/store/lucky-wheel/buy', T);
const g = await open(await mintSession(base, b.licenseKey, 'preview'), { w: 390, h: 844, scale: 2 });
await sleep(9500);
await g.tap(0, -400); await sleep(300); await g.tap(-215, -400); await sleep(1500);
await g.shot('preview-raw');
await g.close();
await sharp('tmp/preview-raw.png').resize({ width: 560 }).webp({ quality: 82 }).toFile('server/public/defaults/lucky-wheel/preview.webp');
console.log('preview saved');
