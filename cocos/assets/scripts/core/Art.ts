// Procedural art: every texture is drawn with Canvas 2D at runtime, so games ship with no
// image files and every colour comes from the buyer's config.
import { ImageAsset, SpriteFrame, Texture2D, Sprite, Node, UITransform, Color } from 'cc';
import { mk, rgba, shade } from './Util';

export type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

export function frameFromSource(src: HTMLCanvasElement | HTMLImageElement): SpriteFrame {
  const img = new ImageAsset(src as any);
  const tex = new Texture2D();
  tex.image = img;
  tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
  const sf = new SpriteFrame();
  sf.texture = tex;
  return sf;
}

export function makeFrame(w: number, h: number, draw: Draw, scale = 2): SpriteFrame {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * scale));
  c.height = Math.max(1, Math.ceil(h * scale));
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  draw(g, w, h);
  return frameFromSource(c);
}

const cache = new Map<string, SpriteFrame>();
export function cached(key: string, w: number, h: number, draw: Draw, scale = 2): SpriteFrame {
  let f = cache.get(key);
  if (!f) { f = makeFrame(w, h, draw, scale); cache.set(key, f); }
  return f;
}

/** Add a Sprite with a given frame, sized w x h. */
export function sprite(parent: Node, frame: SpriteFrame, w: number, h: number, x = 0, y = 0, tint?: Color, name = 'spr'): Node {
  const n = mk(name, parent, x, y, w, h);
  const s = n.addComponent(Sprite);
  s.sizeMode = Sprite.SizeMode.CUSTOM;
  s.spriteFrame = frame;
  n.getComponent(UITransform)!.setContentSize(w, h);
  if (tint) s.color = tint;
  return n;
}

// ---------- remote images (buyer uploads) ----------
const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
const loadedImgs = new Map<string, HTMLImageElement>();
/** Already-loaded image (after loadImage resolved), or null. */
export const imageSync = (url: string): HTMLImageElement | null => loadedImgs.get(url) ?? null;
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  let p = imgCache.get(url);
  if (!p) {
    p = new Promise(res => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => { loadedImgs.set(url, im); res(im); };
      im.onerror = () => res(null);
      im.src = url;
    });
    imgCache.set(url, p);
  }
  return p;
}
export function remoteFrame(im: HTMLImageElement): SpriteFrame { return frameFromSource(im); }

// ---------- canvas helpers ----------
export function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rad, y);
  g.arcTo(x + w, y, x + w, y + h, rad);
  g.arcTo(x + w, y + h, x, y + h, rad);
  g.arcTo(x, y + h, x, y, rad);
  g.arcTo(x, y, x + w, y, rad);
  g.closePath();
}
export function vgrad(g: CanvasRenderingContext2D, y0: number, y1: number, stops: [number, string][]): CanvasGradient {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  return gr;
}
export function radial(g: CanvasRenderingContext2D, x: number, y: number, r0: number, r1: number, stops: [number, string][]): CanvasGradient {
  const gr = g.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  return gr;
}
/** Draw image covering a box (object-fit: cover) or contained. */
export function drawImageFit(g: CanvasRenderingContext2D, im: HTMLImageElement, x: number, y: number, w: number, h: number, mode: 'cover' | 'contain' = 'contain') {
  const s = mode === 'cover' ? Math.max(w / im.width, h / im.height) : Math.min(w / im.width, h / im.height);
  const dw = im.width * s, dh = im.height * s;
  g.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
export function star(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, points = 5, inner = 0.5) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI / points) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * inner;
    g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.closePath();
}

// ---------- shared textures ----------
export const Tex = {
  dot: () => cached('dot', 32, 32, (g, w, h) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2); g.fill(); }),
  rect: () => cached('rect', 16, 16, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }),
  confetti: () => cached('confetti', 18, 10, (g, w, h) => { g.fillStyle = '#fff'; rr(g, 0, 0, w, h, 2); g.fill(); }),
  star: () => cached('star', 40, 40, (g, w, h) => { g.fillStyle = '#fff'; star(g, w / 2, h / 2, w / 2 - 2, 5, 0.45); g.fill(); }),
  glow: () => cached('glow', 128, 128, (g, w, h) => {
    g.fillStyle = radial(g, w / 2, h / 2, 0, w / 2, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.45)'], [1, 'rgba(255,255,255,0)']]);
    g.fillRect(0, 0, w, h);
  }, 1),
  spark: () => cached('spark', 48, 48, (g, w, h) => {
    g.fillStyle = radial(g, w / 2, h / 2, 0, w / 2, [[0, '#fff'], [0.25, 'rgba(255,255,255,.7)'], [1, 'rgba(255,255,255,0)']]);
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(w / 2, 2); g.lineTo(w / 2 + 3, h / 2); g.lineTo(w / 2, h - 2); g.lineTo(w / 2 - 3, h / 2); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(2, h / 2); g.lineTo(w / 2, h / 2 - 3); g.lineTo(w - 2, h / 2); g.lineTo(w / 2, h / 2 + 3); g.closePath(); g.fill();
  }, 1),
  coin: (color = '#fbbf24') => cached('coin' + color, 64, 64, (g, w, h) => {
    const c = w / 2;
    g.fillStyle = radial(g, c - 8, c - 10, 2, c, [[0, shade(color, 0.6)], [0.55, color], [1, shade(color, -0.35)]]);
    g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = shade(color, -0.45); g.lineWidth = 2; g.stroke();
    g.strokeStyle = shade(color, 0.5); g.lineWidth = 2.5; g.beginPath(); g.arc(c, c, c - 9, 0, Math.PI * 2); g.stroke();
    g.fillStyle = shade(color, -0.25); star(g, c, c + 1, 16, 5, 0.5); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(c - 11, c - 14, 9, 4, -0.7, 0, Math.PI * 2); g.fill();
  }),
};

/** Glossy rounded button face. */
export function buttonFrame(w: number, h: number, c0: string, c1: string, radius = 18): SpriteFrame {
  return cached(`btn:${w}x${h}:${c0}:${c1}:${radius}`, w, h, (g) => {
    const pad = 3;
    // shadow plate
    g.fillStyle = shade(c1, -0.5);
    rr(g, pad, pad + 5, w - pad * 2, h - pad * 2 - 2, radius); g.fill();
    // body
    g.fillStyle = vgrad(g, 0, h, [[0, c0], [1, c1]]);
    rr(g, pad, pad, w - pad * 2, h - pad * 2 - 5, radius); g.fill();
    g.strokeStyle = rgba('#ffffff', 0.35); g.lineWidth = 2; g.stroke();
    // gloss
    g.save(); rr(g, pad, pad, w - pad * 2, h - pad * 2 - 5, radius); g.clip();
    g.fillStyle = vgrad(g, pad, h * 0.55, [[0, 'rgba(255,255,255,.42)'], [1, 'rgba(255,255,255,0)']]);
    g.fillRect(pad, pad, w - pad * 2, (h - 10) * 0.5);
    g.restore();
  });
}
export function panelFrame(w: number, h: number, fill: string, border: string, radius = 24, alpha = 0.92): SpriteFrame {
  return cached(`panel:${w}x${h}:${fill}:${border}:${radius}:${alpha}`, w, h, (g) => {
    g.fillStyle = rgba(fill, alpha); rr(g, 2, 2, w - 4, h - 4, radius); g.fill();
    g.strokeStyle = border; g.lineWidth = 3; g.stroke();
  });
}
