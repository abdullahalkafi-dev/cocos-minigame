import { Node, UITransform, Layers, Color, tween, Label, UIOpacity, Vec3 } from 'cc';

export const UI_LAYER = Layers.Enum.UI_2D;
export const FONT = 'Trebuchet MS, Arial Rounded MT Bold, Arial, sans-serif';

/** Create a UI node (layer UI_2D + UITransform) under parent at x,y. */
export function mk(name: string, parent: Node | null, x = 0, y = 0, w = 0, h = 0): Node {
  const n = new Node(name);
  n.layer = UI_LAYER;
  if (parent) parent.addChild(n);
  n.setPosition(x, y, 0);
  const t = n.addComponent(UITransform);
  if (w || h) t.setContentSize(w, h);
  return n;
}

/** Parses #rgb, #rrggbb, #rrggbbaa, rgb(...) and rgba(...) into a Color. */
export function hex(c: string, a = 255): Color {
  const s = (c || '').trim();
  let m = /^#?([0-9a-f]{3})$/i.exec(s);
  if (m) { const [r, g, b] = m[1].split('').map(ch => parseInt(ch + ch, 16)); return new Color(r, g, b, a); }
  m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
  if (m) {
    const n = parseInt(m[1], 16);
    return new Color((n >> 16) & 255, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) : a);
  }
  const r = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (r) return new Color(Math.round(+r[1]), Math.round(+r[2]), Math.round(+r[3]), r[4] !== undefined ? Math.round(+r[4] * 255) : a);
  return new Color(255, 255, 255, a);
}
export function rgba(c: string, a: number): string {
  const col = hex(c);
  return `rgba(${col.r},${col.g},${col.b},${a})`;
}
/** Mix a #rrggbb color toward white (amt>0) or black (amt<0). */
export function shade(c: string, amt: number): string {
  const col = hex(c);
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  const f = (v: number) => Math.round((t - v) * p + v);
  return `rgb(${f(col.r)},${f(col.g)},${f(col.b)})`;
}
export function shadeHex(c: string, amt: number): string {
  const col = hex(c);
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  const f = (v: number) => Math.round((t - v) * p + v).toString(16).padStart(2, '0');
  return `#${f(col.r)}${f(col.g)}${f(col.b)}`;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const fmtNum = (n: number) => Math.round(n).toLocaleString('en-US');

/** Promise-based delay driven by the engine's tween scheduler. */
export function wait(sec: number): Promise<void> {
  return new Promise(res => { tween({}).delay(sec).call(() => res()).start(); });
}

/** Run a tween on a plain object and resolve when finished. */
export function animate(duration: number, easing: string, onUpdate: (t: number) => void): Promise<void> {
  return new Promise(res => {
    const o = { t: 0 };
    tween(o).to(duration, { t: 1 }, { easing: easing as any, onUpdate: () => onUpdate(o.t) })
      .call(() => { onUpdate(1); res(); }).start();
  });
}

export function ensureOpacity(n: Node): UIOpacity {
  return n.getComponent(UIOpacity) || n.addComponent(UIOpacity);
}

/** Count a label's number from a to b. */
export function countTo(label: Label, from: number, to: number, dur: number, fmt: (n: number) => string = fmtNum, easing = 'quadOut'): Promise<void> {
  return animate(dur, easing, t => { if (label.isValid) label.string = fmt(lerp(from, to, t)); });
}

export function popIn(n: Node, dur = 0.35, from = 0.2) {
  n.setScale(from, from, 1);
  tween(n).to(dur, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
}
