// Proves buyer-uploaded images reach the game: uploads a logo, background and prize icon through the real API,
// saves them in the config and screenshots the game.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { mintSession, open, sleep } from './lib/playtest.mjs';
const seed = JSON.parse(fs.readFileSync('tmp/seed2.json', 'utf8'));
const base = 'http://localhost:3000';
const lic = seed.games[2]; // third lucky-spin copy (Candy Spin)
async function api(method, url, token, body) {
  const r = await fetch(base + url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(url + ' ' + j.error); return j;
}
const T = (await api('POST', '/api/auth/login', null, { email: seed.buyerEmail, password: seed.buyerPassword })).token;

// make three PNGs with a real browser canvas
const b = await chromium.launch(); const pg = await b.newPage();
const png = async (w, h, draw) => Buffer.from((await pg.evaluate(([w, h, draw]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); new Function('g', 'w', 'h', draw)(g, w, h); return c.toDataURL('image/png').split(',')[1]; }, [w, h, draw])), 'base64');
const logo = await png(400, 120, `g.fillStyle='#ffffff00';g.clearRect(0,0,w,h);g.font='bold 84px Arial';g.textBaseline='middle';g.fillStyle='#ffe066';g.strokeStyle='#7a1fa2';g.lineWidth=10;g.strokeText('CANDY',10,62);g.fillText('CANDY',10,62);`);
const bg = await png(720, 1280, `const gr=g.createLinearGradient(0,0,w,h);gr.addColorStop(0,'#ff9ad5');gr.addColorStop(1,'#7b2ff7');g.fillStyle=gr;g.fillRect(0,0,w,h);for(let i=0;i<60;i++){g.fillStyle='rgba(255,255,255,.18)';g.beginPath();g.arc(Math.random()*w,Math.random()*h,10+Math.random()*60,0,7);g.fill();}`);
const icon = await png(128, 128, `g.fillStyle='#fff';g.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?26:60;g.lineTo(64+Math.cos(a)*r,64+Math.sin(a)*r);}g.closePath();g.fill();g.strokeStyle='#f59e0b';g.lineWidth=6;g.stroke();`);
await b.close();

const up = async (buf, name) => { const fd = new FormData(); fd.append('file', new Blob([buf], { type: 'image/png' }), name); return (await api('POST', `/api/licenses/${lic.licenseId}/upload`, T, fd)).url; };
const [logoUrl, bgUrl, iconUrl] = [await up(logo, 'logo.png'), await up(bg, 'bg.png'), await up(icon, 'icon.png')];
console.log({ logoUrl, bgUrl, iconUrl });
const cur = await api('GET', `/api/licenses/${lic.licenseId}`, T);
const prizes = cur.config.prizes.map((p, i) => (i === 7 ? { ...p, label: 'MEGA', image: iconUrl } : i === 6 ? { ...p, image: iconUrl } : p));
await api('PUT', `/api/licenses/${lic.licenseId}/config`, T, { config: { 'images.logo': logoUrl, 'images.background': bgUrl, prizes } });
const url = await mintSession(base, lic.licenseKey, 'img_tester');
const g = await open(url, { w: 390, h: 844, scale: 2 });
await sleep(7000);
await g.shot('images-1');
await g.close();
// a non-image / oversize upload must be rejected
const bad = new FormData(); bad.append('file', new Blob(['<svg onload=alert(1)>'], { type: 'image/svg+xml' }), 'x.svg');
const r = await fetch(`${base}/api/licenses/${lic.licenseId}/upload`, { method: 'POST', headers: { Authorization: `Bearer ${T}` }, body: bad });
console.log('svg upload ->', r.status, (await r.json()).error);
