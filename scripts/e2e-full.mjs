// The complete story, through real UIs:
//  buyer signs up -> buys the SAME game twice -> customizes only one copy in the dashboard
//  -> two different "client websites" (each holding its own secret key) embed them
//  -> a player plays on each site -> the buyer sees the players/results in the dashboard.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3000';
const email = `full+${Date.now().toString(36)}@test.dev`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

// 1. sign up
await page.goto(BASE + '/register');
await page.fill('input[type=email]', email);
await page.fill('input[type=password]', 'a-long-password');
await page.click('button.primary');
await page.waitForURL(BASE + '/');
console.log('1. signed up as', email);

// 2. buy Lucky Spin twice, capture each secret key from the modal
const keys = [], ids = [];
for (let i = 0; i < 2; i++) {
  await page.goto(BASE + '/');
  await page.locator('.game-card', { hasText: 'Lucky Spin' }).getByRole('button', { name: 'Buy game' }).click();
  await page.waitForSelector('.secret');
  keys.push((await page.textContent('.secret')).trim());
  await page.getByRole('button', { name: /Customize my game/ }).click();
  await page.waitForURL(/\/games\/lic_.*\/customize/);
  ids.push(page.url().match(/games\/(lic_[^/]+)/)[1]);
}
console.log('2. bought 2 copies:', ids.join(', '), '| keys start', keys.map(k => k.slice(0, 12)).join(' / '));

// 3. customize ONLY the second copy through the dashboard form
await page.goto(`${BASE}/games/${ids[1]}/customize`);
await page.waitForSelector('.form-section');
const title = page.locator('.field', { hasText: 'Game title' }).locator('input');
await title.fill('Tropical Fortune');
const cur = page.locator('.field', { hasText: 'Currency name' }).locator('input');
await cur.fill('Pearls');
const primary = page.locator('.field', { hasText: 'Primary color' }).locator('input.mono');
await primary.fill('#0891b2');
const accent = page.locator('.field', { hasText: 'Accent color' }).locator('input.mono');
await accent.fill('#fb7185');
const bgc = page.locator('.field', { hasText: 'Background color' }).locator('input.mono');
await bgc.fill('#042f3a');
await page.getByRole('button', { name: 'Save changes' }).click();
await page.waitForSelector('text=All changes saved');
console.log('3. customized copy #2 (Tropical Fortune / Pearls / teal)');
await page.waitForTimeout(6000);
await page.screenshot({ path: 'tmp/full-1-customize.png' });

// 4. two client websites, each with its own key
const sites = [];
for (let i = 0; i < 2; i++) {
  const port = 4101 + i;
  const p = spawn(process.execPath, ['samples/client-website/server.mjs'], { env: { ...process.env, MINIGAME_KEY: keys[i], MINIGAME_HOST: BASE, PORT: String(port) }, stdio: 'ignore' });
  sites.push({ p, port });
}
await sleep(1500);

// 5. a player on each site
const names = ['maria_01', 'jonas_77'];
for (let i = 0; i < 2; i++) {
  const pg = await ctx.newPage();
  await pg.setViewportSize({ width: 1100, height: 860 });
  pg.on('pageerror', e => errors.push(e.message));
  await pg.goto(`http://localhost:${sites[i].port}/`);
  const frame = pg.frameLocator('#game iframe');
  await frame.locator('#mg-login input').fill(names[i]);
  await frame.locator('#mg-login button').click();
  await pg.waitForTimeout(5000);
  // spin by clicking the SPIN button in the canvas (centre-bottom of the iframe)
  const box = await pg.locator('#game iframe').boundingBox();
  const h = box.height, vwScale = Math.min(1, ((1280 * box.width / h) - 8) / 720), s = (h / 1280) * vwScale;
  for (let k = 0; k < 2; k++) {
    await pg.mouse.click(box.x + box.width / 2, box.y + h / 2 + 470 * s);
    await pg.waitForTimeout(9500);
  }
  await pg.screenshot({ path: `tmp/full-site-${i + 1}.png` });
  console.log(`5. ${names[i]} played on site ${i + 1}`);
  const ev = await pg.textContent('#log');
  console.log('   events seen by the site:', ev.split('\n').filter(Boolean).slice(0, 3).map(l => l.split('  ')[1]).join(', '));
  await pg.close();
}
sites.forEach(s => s.p.kill());

// 6. the buyer's dashboard shows each game's own players
for (let i = 0; i < 2; i++) {
  await page.goto(`${BASE}/games/${ids[i]}/players`);
  await page.waitForTimeout(1500);
  const txt = await page.textContent('main');
  const ok = txt.includes(names[i]) && !txt.includes(names[1 - i]);
  console.log(`6. dashboard copy #${i + 1}: shows ${names[i]}: ${txt.includes(names[i])}, does NOT show ${names[1 - i]}: ${!txt.includes(names[1 - i])} ${ok ? 'OK' : 'FAIL'}`);
  await page.screenshot({ path: `tmp/full-players-${i + 1}.png`, fullPage: true });
}
console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
await browser.close();
