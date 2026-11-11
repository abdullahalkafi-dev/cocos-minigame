// The complete story, through real UIs:
//  buyer signs up -> buys the SAME game twice -> customizes only one copy in the dashboard
//  -> two different "client websites" (ONE account API key, a different game ID each) embed them
//  -> a player bets on each site and a round settles -> the buyer sees each game's own players/results.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.argv[2] || 'http://localhost:3000';
const email = `full+${Date.now().toString(36)}@test.dev`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto(BASE + '/register');
await page.fill('input[type=email]', email);
await page.fill('input[type=password]', 'a-long-password');
await page.click('button.primary');
await page.waitForURL(BASE + '/api-key');
await page.waitForSelector('.secret');
const apiKey = (await page.textContent('.secret')).trim();
console.log('1. signed up as', email, '| API key shown once:', apiKey.slice(0, 8) + '...');

const ids = [];
for (let i = 0; i < 2; i++) {
  await page.goto(BASE + '/store');
  await page.getByRole('button', { name: /Buy this game/ }).click();
  await page.waitForSelector('.secret');
  await page.getByRole('button', { name: /Customize my game/ }).click();
  await page.waitForURL(/\/game\?id=lic_/);
  ids.push(new URL(page.url()).searchParams.get('id'));
}
console.log('2. bought 2 copies:', ids.join(', '));

// customize only the second copy through the form
await page.goto(`${BASE}/games/${ids[1]}/customize`);
await page.waitForSelector('.fields');
const field = label => page.locator('.fields > div', { has: page.locator(`label.lbl:text-is("${label}")`) }).locator('input').first();
await field('Game title').fill('Tropical Wheel');
await field('Currency name').fill('Pearls');
await page.click('.snav button:has-text("Colors")');
await page.locator('.fields > div', { has: page.locator('label.lbl:text-is("Gold / highlight")') }).locator('input.mono').fill('#22d3ee');
await page.getByRole('button', { name: 'Save changes' }).click();
await page.waitForSelector('text=Saved');
console.log('3. customized copy #2 (Tropical Wheel / Pearls / cyan)');
await page.waitForTimeout(3000);

const sites = ids.map((_, i) => spawn(process.execPath, ['samples/client-website/server.mjs'], { env: { ...process.env, MINIGAME_API_KEY: apiKey, MINIGAME_GAME_ID: ids[i], MINIGAME_HOST: BASE, PORT: String(4101 + i) }, stdio: 'ignore' }));
await sleep(1500);

const names = ['maria_01', 'jonas_77'];
await Promise.all(names.map(async (name, i) => {
  const pg = await ctx.newPage();
  await pg.setViewportSize({ width: 1100, height: 860 });
  pg.on('pageerror', e => errors.push(e.message));
  await pg.goto(`http://localhost:${4101 + i}/?user=${name}`);   // the site (not the player) says who is playing
  await pg.waitForTimeout(9000);
  const box = await pg.locator('#game iframe').boundingBox();
  const vw = 1280 * box.width / box.height, s = Math.min(1, (vw - 8) / 720), H = 1280 / s;
  const px = (x, y) => [box.x + box.width / 2 + x * s * box.height / 1280, box.y + box.height / 2 - y * s * box.height / 1280];
  const [bx, by] = px(0, -H / 2 + 250);
  await pg.mouse.click(bx, by); await pg.waitForTimeout(500); await pg.mouse.click(bx, by);
  await pg.waitForTimeout(36000);                    // one full round (bet + spin + result)
  await pg.screenshot({ path: `tmp/full-site-${i + 1}.png` });
  const ev = await pg.textContent('#log');
  console.log(`5. ${name} played on site ${i + 1}; events: ${ev.split('\n').filter(Boolean).slice(0, 4).map(l => l.split('  ')[1]).join(', ')}`);
  await pg.close();
}));
sites.forEach(p => p.kill());

for (let i = 0; i < 2; i++) {
  await page.goto(`${BASE}/games/${ids[i]}/players`);
  await page.waitForTimeout(1500);
  const txt = await page.textContent('.page');
  const ok = txt.includes(names[i]) && !txt.includes(names[1 - i]);
  console.log(`6. dashboard copy #${i + 1}: shows ${names[i]}: ${txt.includes(names[i])}, hides ${names[1 - i]}: ${!txt.includes(names[1 - i])} ${ok ? 'OK' : 'FAIL'}`);
  await page.screenshot({ path: `tmp/full-players-${i + 1}.png`, fullPage: true });
}
console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
await browser.close();
