// Helpers for driving a built game headlessly (Playwright + Chromium).
import { chromium } from 'playwright';

export async function mintSession(base, licenseKey, username) {
  const r = await fetch(`${base}/api/v1/sessions`, { method: 'POST', headers: { Authorization: `Bearer ${licenseKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(username ? { username } : {}) });
  const j = await r.json();
  if (!r.ok) throw new Error(`session failed: ${j.error}`);
  return j.playUrl;
}

export async function open(url, { w = 390, h = 844, scale = 1, log = true } = {}) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  const errors = [];
  if (log) {
    page.on('console', m => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning' ? !/GL Driver|GPU stall/.test(t) : /\[game\]|boot/.test(t)) console.log(`[${m.type()}]`, t.slice(0, 300)); });
  }
  page.on('pageerror', e => { errors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('response', r => { if (r.status() >= 400) console.log('[http]', r.status(), r.url().slice(0, 120)); });
  await page.goto(url, { waitUntil: 'load' });
  const vh = h;
  // design coords (720 x 1280, y up, FIXED_HEIGHT) -> screen px
  const vw = 1280 * w / h; const fit = Math.min(1, (vw - 8) / 720);
  const toScreen = (x, y) => [w / 2 + x * fit * (vh / 1280), vh / 2 - y * fit * (vh / 1280)];
  return {
    browser, page, errors, toScreen,
    tap: async (x, y) => { const [sx, sy] = toScreen(x, y); await page.mouse.click(sx, sy); },
    shot: async (name) => { await page.screenshot({ path: `tmp/${name}.png` }); console.log('shot', name); },
    close: () => browser.close(),
  };
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
