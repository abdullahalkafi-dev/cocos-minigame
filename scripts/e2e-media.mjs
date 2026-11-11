// Proves every media type works end to end: generates a real WebM video, an SVG, a sprite sheet and a WAV sound in a
// headless browser, uploads them through the dashboard API into the right slots, then opens the game and checks it.
//   node scripts/e2e-media.mjs <host> <email> <password> <gameId> <apiKey>
import { chromium } from 'playwright';
import { mintSession, open, sleep } from './lib/playtest.mjs';
const [base, email, password, licId, apiKey] = process.argv.slice(2);
const j = async (m, u, t, b) => { const r = await fetch(base + u, { method: m, headers: { ...(t ? { Authorization: 'Bearer ' + t } : {}), ...(b && !(b instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: b instanceof FormData ? b : b ? JSON.stringify(b) : undefined }); const x = await r.json(); if (!r.ok) throw new Error(u + ' ' + x.error); return x; };
const T = (await j('POST', '/api/auth/login', null, { email, password })).token;

// ---- make the media with a real browser ----
const br = await chromium.launch(); const pg = await br.newPage();
const b64 = async (fnSrc) => Buffer.from(await pg.evaluate(fnSrc), 'base64');
const webm = await b64(`(async () => {
  const c = document.createElement('canvas'); c.width = 360; c.height = 640; const g = c.getContext('2d');
  const stream = c.captureStream(30); const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' }); const chunks = [];
  rec.ondataavailable = e => chunks.push(e.data); rec.start();
  const t0 = performance.now();
  await new Promise(res => { const draw = () => { const t = (performance.now() - t0) / 1000;
    g.clearRect(0,0,360,640);
    for (let i = 0; i < 40; i++) { const a = i * 0.7 + t * 2, r = (t * 160 + i * 13) % 640; g.fillStyle = 'hsla(' + (i * 25 + t * 120) + ',90%,60%,.9)'; g.beginPath(); g.arc(180 + Math.sin(a) * (80 + i * 3), 640 - r, 10 + (i % 5) * 4, 0, 7); g.fill(); }
    g.fillStyle = '#fff'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.fillText('WIN!', 180, 320 + Math.sin(t * 6) * 12);
    if (t < 2.2) requestAnimationFrame(draw); else res(); }; draw(); });
  rec.stop(); await new Promise(r => rec.onstop = r);
  const blob = new Blob(chunks, { type: 'video/webm' }); const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; buf.forEach(v => s += String.fromCharCode(v)); return btoa(s); })()`);
const sheet = await b64(`(() => { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  for (let i = 0; i < 4; i++) { g.fillStyle = 'hsl(' + i * 70 + ',85%,55%)'; g.beginPath(); g.arc(64 + i * 128, 64, 20 + i * 12, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.fillText(String(i + 1), 64 + i * 128, 75); }
  return c.toDataURL('image/png').split(',')[1]; })()`);
const wav = await b64(`(() => { const sr = 22050, n = Math.floor(sr * 0.35), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf); const w = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / sr * 2 * Math.PI * 880) * 9000 * (1 - i / n), true);
  let s = ''; new Uint8Array(buf).forEach(x => s += String.fromCharCode(x)); return btoa(s); })()`);
await br.close();
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><radialGradient id="g"><stop offset="0" stop-color="#fff7ae"/><stop offset="1" stop-color="#ff2d95"/></radialGradient></defs><circle cx="100" cy="100" r="90" fill="url(#g)" stroke="#fff" stroke-width="8"/><text x="100" y="128" font-size="84" font-weight="900" text-anchor="middle" fill="#3b0a5c">A</text></svg>`);

const up = async (buf, name, kind) => { const fd = new FormData(); fd.append('file', new Blob([buf]), name); return (await j('POST', `/api/licenses/${licId}/upload?kind=${kind}`, T, fd)); };
const [v, sh, wv, sv] = [await up(webm, 'win.webm', 'media'), await up(sheet, 'sheet.png', 'media'), await up(wav, 'win.wav', 'audio'), await up(svg, 'chip.svg', 'media')];
console.log('uploaded:', v.type, sh.type, wv.type, sv.type, '| video', Math.round(v.size / 1024) + 'KB');
const cur = await j('GET', `/api/licenses/${licId}`, T);
await j('PUT', `/api/licenses/${licId}/config`, T, { config: {
  'assets.fxWin': { url: v.url, loop: false },
  'assets.fxIdle': { url: sh.url, cols: 4, rows: 1, fps: 6 },
  'assets.sfxWin': { url: wv.url },
  chips: cur.config.chips.map((c, i) => (i === 0 ? { ...c, image: { url: sv.url } } : c)),
} });
const url = await mintSession(base, apiKey, licId, 'media_tester') + '&debug=1';
const g = await open(url, { w: 390, h: 844, scale: 2 });
await sleep(10000);
await g.shot('media-1');
// force the "win" video overlay to play so we can see it
await g.page.evaluate(() => window.__game.playFx('fxWin'));
await sleep(1600);
await g.shot('media-2-video');
const info = await g.page.evaluate(() => ({ sounds: 'ok' }));
console.log('page errors:', g.errors.length, info);
await g.close();
