// Headless screenshot helper: node scripts/shot.mjs <url> <out.png> [waitMs] [width] [height]
import { chromium } from 'playwright';
const [url, out = 'shot.png', wait = '4000', w = '390', h = '844'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
page.on('console', m => console.log(`[console.${m.type()}]`, m.text()));
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('response', r => { if (r.status() >= 400) console.log('[http]', r.status(), r.url()); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();
