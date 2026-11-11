// Slices/optimises the client's artwork into the default asset set of the "lucky-wheel" game.
// node scripts/prep-wheel-assets.mjs "<folder with original PNGs>"
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
const src = process.argv[2];
const out = path.resolve(import.meta.dirname, '../server/public/defaults/lucky-wheel');
fs.mkdirSync(out, { recursive: true });
const f = n => path.join(src, n);
const save = async (img, name, q = 88) => { await img.webp({ quality: q, alphaQuality: 95 }).toFile(path.join(out, name)); };

// 1. find the circular hole of the frame (transparent region around the centre)
const fr = await sharp(f('Frame 1000015442.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = fr.info;
const alpha = (x, y) => fr.data[(y * W + x) * 4 + 3];
let cx = Math.round(W / 2), cy = Math.round(H * 0.46);
// flood-fill from the centre through transparent pixels
const seen = new Uint8Array(W * H); const stack = [[cx, cy]]; let minX = W, maxX = 0, minY = H, maxY = 0;
while (stack.length) {
  const [x, y] = stack.pop(); if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = y * W + x;
  if (seen[i] || alpha(x, y) > 20) continue; seen[i] = 1;
  if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}
const hole = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, r: Math.min(maxX - minX, maxY - minY) / 2 };
console.log('frame', W, H, 'hole', hole);

// 2. wheel frame (full) + rotating disc (circle cut out of "Wheel Spin")
await save(sharp(f('Frame 1000015442.png')).resize({ width: 1100 }), 'wheel-frame.webp');
const R = Math.round(hole.r + 6), D = R * 2;
const mask = Buffer.from(`<svg width="${D}" height="${D}"><circle cx="${R}" cy="${R}" r="${R}" fill="#fff"/></svg>`);
const disc = await sharp(f('Wheel Spin.png')).extract({ left: Math.round(hole.cx - R), top: Math.round(hole.cy - R), width: D, height: D }).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
// clean the disc: remove the hub (drawn separately) and the slivers of the frame's gems at the top/bottom
const raw = await sharp(disc).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const px = raw.data, DW = raw.info.width, c0 = DW / 2;
const copy = Buffer.from(px);
for (let y = 0; y < DW; y++) for (let x = 0; x < DW; x++) {
  const dx = x - c0, dy = y - c0, r = Math.hypot(dx, dy), i = (y * DW + x) * 4;
  if (r < R * 0.25) { px[i + 3] = 0; continue; }
  const ang = Math.atan2(dx, -dy) * 180 / Math.PI;          // 0 = top, clockwise
  const top = Math.abs(ang) < 16, bottom = Math.abs(Math.abs(ang) - 180) < 12;
  if (r > R * 0.86 && r <= R - 1 && (top || bottom)) {
    const k = (R * 0.84) / r, sx = Math.round(c0 + dx * k), sy = Math.round(c0 + dy * k), j = (sy * DW + sx) * 4;
    px[i] = copy[j]; px[i + 1] = copy[j + 1]; px[i + 2] = copy[j + 2]; px[i + 3] = copy[j + 3];
  }
}
await save(sharp(px, { raw: raw.info }).resize({ width: 900 }), 'wheel-disc.webp');
fs.writeFileSync(path.join(out, 'wheel-geometry.json'), JSON.stringify({ frameW: W, frameH: H, holeCx: hole.cx, holeCy: hole.cy, holeR: hole.r, discRadius: R, hubRatio: 0.25 }, null, 1));

// 3. everything else
await save(sharp(f('image 927.png')).resize({ width: 900 }), 'background.webp', 78);
await save(sharp(f('Wheel Container.png')), 'wheel-hub.webp');
await save(sharp(f('Frame 1000015347.png')), 'box-frame.webp');
await save(sharp(f('image 922.png')).resize({ width: 1100 }), 'ribbon.webp');
await save(sharp(f('Frame 35.png')), 'btn-back.webp');
await save(sharp(f('Frame 36.png')), 'btn-help.webp');
await save(sharp(f('Frame 63.png')), 'btn-ranking.webp');
await save(sharp(f('image 915.png')), 'icon-plum.webp');
await save(sharp(f('image 918.png')), 'icon-watermelon.webp');
await save(sharp(f('78.png')), 'icon-seven.webp');
await save(sharp(f('image 924.png')), 'mult-x2.webp');
await save(sharp(f('image 925.png')), 'mult-x8.webp');
await save(sharp(f('image 926.png')), 'badge-new.webp');
await save(sharp(f('Frame 1000015351.png')), 'chip-1.webp');
await save(sharp(f('bat-coin.png')), 'chip-2.webp');
await save(sharp(f('bat-coin-1.png')), 'chip-3.webp');
await save(sharp(f('bat-coin-2.png')), 'chip-4.webp');
await save(sharp(f('Frame 1000015356.png')), 'btn-repeat.webp');
// icon strip (sound / history / my bets): three equal slices
const strip = f('Frame 1000015333.png'); const sh = Math.floor(608 / 3);
for (const [i, n] of ['btn-sound', 'btn-history', 'btn-mybets'].entries()) await save(sharp(strip).extract({ left: 0, top: i * sh, width: 160, height: i === 2 ? 608 - 2 * sh : sh }), n + '.webp');
console.log(fs.readdirSync(out).map(n => `${n} ${(fs.statSync(path.join(out, n)).size / 1024).toFixed(0)}KB`).join('\n'));
