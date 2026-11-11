// Dynamic media: any asset slot can be a still image (PNG/JPG/WebP/GIF), an SVG, a sprite-sheet animation or a video.
// The buyer decides in the dashboard; the game just asks for a slot and gets something it can show.
import { Node, Sprite, SpriteFrame, Texture2D, Rect, UITransform, Size } from 'cc';
import { frameFromSource, loadImage } from './Art';
import { mk } from './Util';
import { Ticker } from './Ticker';

export interface AssetRef { url: string; cols?: number; rows?: number; fps?: number; loop?: boolean; blend?: 'normal' | 'add' }
export type MediaKind = 'image' | 'svg' | 'sheet' | 'video' | 'none';
export type Fit = 'stretch' | 'contain' | 'cover';

export function mediaKind(ref?: AssetRef | null): MediaKind {
  if (!ref || !ref.url) return 'none';
  const u = ref.url.split('?')[0].toLowerCase();
  if (/\.(mp4|webm|m4v|mov)$/.test(u)) return 'video';
  if (u.endsWith('.svg')) return ref.cols && ref.rows && ref.cols * ref.rows > 1 ? 'sheet' : 'svg';
  return ref.cols && ref.rows && ref.cols * ref.rows > 1 ? 'sheet' : 'image';
}

const stillCache = new Map<string, Promise<SpriteFrame | null>>();

/** Rasterise an SVG at a sharp resolution (browsers draw SVG images at any size). */
async function rasterSvg(url: string): Promise<HTMLCanvasElement | null> {
  const im = await loadImage(url);
  if (!im) return null;
  const nw = im.naturalWidth || 512, nh = im.naturalHeight || 512;
  const k = Math.min(2048 / Math.max(nw, nh), 4);
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(nw * k)); c.height = Math.max(2, Math.round(nh * k));
  c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
  return c;
}

/** A still SpriteFrame for an image/SVG slot (cached). Null if it cannot be loaded. */
export function stillFrame(ref?: AssetRef | null): Promise<SpriteFrame | null> {
  if (!ref?.url) return Promise.resolve(null);
  let p = stillCache.get(ref.url);
  if (!p) {
    p = (async () => {
      const k = mediaKind(ref);
      if (k === 'svg') { const c = await rasterSvg(ref.url); return c ? frameFromSource(c) : null; }
      const im = await loadImage(ref.url);
      return im ? frameFromSource(im) : null;
    })();
    stillCache.set(ref.url, p);
  }
  return p;
}

export interface MediaHandle { node: Node; kind: MediaKind; natural: Size; done: Promise<void>; destroy: () => void }

/**
 * Create a node that shows an asset slot. Works for every media kind.
 *  - image / svg: a sprite
 *  - sheet:       a sprite whose frame rectangle steps through cols x rows at `fps`
 *  - video:       frames are copied into a texture every tick (muted, inline). WebM with alpha keeps transparency.
 * `done` resolves when a non-looping animation/video finishes (immediately for stills).
 */
export async function spawnMedia(parent: Node, ref: AssetRef | null | undefined, box: { w: number; h: number; fit?: Fit; x?: number; y?: number; name?: string }): Promise<MediaHandle | null> {
  const kind = mediaKind(ref);
  if (kind === 'none' || !ref) return null;
  const node = mk(box.name ?? 'media', parent, box.x ?? 0, box.y ?? 0, box.w, box.h);
  const sp = node.addComponent(Sprite);
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  const ut = node.getComponent(UITransform)!;
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>(r => { resolveDone = r; });
  let stop: () => void = () => undefined;
  const fitTo = (nw: number, nh: number) => {
    const fit = box.fit ?? 'contain';
    if (fit === 'stretch') { ut.setContentSize(box.w, box.h); return; }
    const k = fit === 'cover' ? Math.max(box.w / nw, box.h / nh) : Math.min(box.w / nw, box.h / nh);
    ut.setContentSize(nw * k, nh * k);
  };
  const fail = () => { node.destroy(); resolveDone(); return null; };

  if (kind === 'image' || kind === 'svg') {
    const f = await stillFrame(ref);
    if (!f || !node.isValid) return fail();
    sp.spriteFrame = f;
    const r = f.originalSize; fitTo(r.width, r.height);
    resolveDone();
    return { node, kind, natural: new Size(r.width, r.height), done, destroy: () => node.destroy() };
  }

  if (kind === 'sheet') {
    const im = ref.url ? await loadImage(ref.url) : null;
    if (!im || !node.isValid) return fail();
    const cols = Math.max(1, ref.cols ?? 1), rows = Math.max(1, ref.rows ?? 1), total = cols * rows;
    const fw = im.naturalWidth / cols, fh = im.naturalHeight / rows;
    const sf = frameFromSource(im);
    sp.spriteFrame = sf;
    const setFrame = (i: number) => { sf.rect = new Rect((i % cols) * fw, Math.floor(i / cols) * fh, fw, fh); };
    setFrame(0); fitTo(fw, fh);
    const fps = ref.fps ?? 12, loop = ref.loop ?? true;
    let t = 0, last = -1;
    stop = Ticker.add(dt => {
      if (!node.isValid) { resolveDone(); return true; }
      t += dt;
      let i = Math.floor(t * fps);
      if (i >= total) { if (!loop) { resolveDone(); return true; } i %= total; }
      if (i !== last) { last = i; setFrame(i); }
    });
    return { node, kind, natural: new Size(fw, fh), done, destroy: () => { stop(); node.destroy(); resolveDone(); } };
  }

  // video
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous'; v.muted = true; v.playsInline = true; v.loop = ref.loop ?? true; v.preload = 'auto';
  (v as any).disablePictureInPicture = true;
  const ok = await new Promise<boolean>(res => {
    v.onloadeddata = () => res(true); v.onerror = () => res(false);
    setTimeout(() => res(v.readyState >= 2), 8000);
    v.src = ref.url;
  });
  if (!ok || !node.isValid || !v.videoWidth) return fail();
  const k = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
  const cw = Math.max(2, Math.round(v.videoWidth * k)), ch = Math.max(2, Math.round(v.videoHeight * k));
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d')!;
  const tex = new Texture2D();
  tex.reset({ width: cw, height: ch });
  tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  const sf = new SpriteFrame(); sf.texture = tex;
  sp.spriteFrame = sf;
  fitTo(cw, ch);
  let lastT = -1;
  const push = () => { g.clearRect(0, 0, cw, ch); g.drawImage(v, 0, 0, cw, ch); tex.uploadData(cv); };
  v.addEventListener('ended', () => { resolveDone(); });
  try { await v.play(); } catch { /* autoplay blocked: still show the first frame */ }
  push();
  stop = Ticker.add(() => {
    if (!node.isValid) { v.pause(); v.removeAttribute('src'); v.load(); resolveDone(); return true; }
    if (v.readyState >= 2 && v.currentTime !== lastT) { lastT = v.currentTime; push(); }
    if (v.ended && !v.loop) { resolveDone(); return true; }
  });
  return { node, kind, natural: new Size(cw, ch), done, destroy: () => { stop(); v.pause(); node.destroy(); resolveDone(); } };
}

/** Convenience for assets that must be a still (icons, frames). Falls back to the first frame of video/sheets. */
export async function spawnSprite(parent: Node, ref: AssetRef | null | undefined, w: number, h: number, x = 0, y = 0, fit: Fit = 'contain', name = 'spr'): Promise<Node | null> {
  const m = await spawnMedia(parent, ref, { w, h, x, y, fit, name });
  return m ? m.node : null;
}
