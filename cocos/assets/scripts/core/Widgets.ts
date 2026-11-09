import { Node, Label, LabelOutline, LabelShadow, Sprite, UITransform, tween, Vec3, UIOpacity, BlockInputEvents, Color, Tween } from 'cc';
import { buttonFrame, panelFrame, sprite, Tex } from './Art';
import { FONT, hex, mk, popIn, ensureOpacity, wait } from './Util';
import { Sfx } from './Sfx';

export interface LabelOpts {
  x?: number; y?: number; bold?: boolean; align?: 'left' | 'center' | 'right';
  outline?: { c: string; w: number }; shadow?: { c: string; dx: number; dy: number; blur?: number };
  w?: number; h?: number; wrap?: boolean; lineHeight?: number; name?: string;
}
export function label(parent: Node, text: string, size: number, color = '#ffffff', o: LabelOpts = {}): Label {
  const n = mk(o.name ?? 'label', parent, o.x ?? 0, o.y ?? 0);
  const ut = n.getComponent(UITransform)!;
  const l = n.addComponent(Label);
  l.useSystemFont = true;
  l.fontFamily = FONT;
  l.isBold = o.bold ?? true;
  l.fontSize = size;
  l.lineHeight = o.lineHeight ?? Math.round(size * 1.25);
  l.color = hex(color);
  l.horizontalAlign = o.align === 'left' ? Label.HorizontalAlign.LEFT : o.align === 'right' ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.CENTER;
  l.verticalAlign = Label.VerticalAlign.CENTER;
  if (o.wrap && o.w) {
    ut.setContentSize(o.w, o.h ?? size * 2);
    l.overflow = Label.Overflow.RESIZE_HEIGHT;
    l.enableWrapText = true;
  }
  if (o.align === 'left') ut.anchorX = 0;
  if (o.align === 'right') ut.anchorX = 1;
  l.string = text;
  if (o.outline) { const ol = n.addComponent(LabelOutline); ol.color = hex(o.outline.c); ol.width = o.outline.w; }
  if (o.shadow) { const sh = n.addComponent(LabelShadow); sh.color = hex(o.shadow.c); sh.offset.set(o.shadow.dx, o.shadow.dy); sh.blur = o.shadow.blur ?? 2; }
  return l;
}

export interface BtnOpts {
  text: string; w: number; h: number; c0: string; c1: string; textColor?: string; size?: number; radius?: number;
  x?: number; y?: number; onClick: () => void | Promise<void>;
}
export class Button {
  node: Node; face: Node; label: Label; enabled = true;
  private spr: Sprite;
  constructor(parent: Node, private o: BtnOpts) {
    this.node = mk('button', parent, o.x ?? 0, o.y ?? 0, o.w, o.h);
    this.face = sprite(this.node, buttonFrame(o.w, o.h, o.c0, o.c1, o.radius ?? Math.min(22, o.h / 2)), o.w, o.h, 0, 0, undefined, 'face');
    this.spr = this.face.getComponent(Sprite)!;
    this.label = label(this.node, o.text, o.size ?? Math.round(o.h * 0.42), o.textColor ?? '#ffffff', { y: 3, shadow: { c: '#00000066', dx: 0, dy: -2, blur: 2 } });
    this.node.on(Node.EventType.TOUCH_START, () => { if (this.enabled) { Tween.stopAllByTarget(this.face); tween(this.face).to(0.07, { scale: new Vec3(0.94, 0.94, 1) }).start(); } });
    const release = () => { Tween.stopAllByTarget(this.face); tween(this.face).to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start(); };
    this.node.on(Node.EventType.TOUCH_CANCEL, release);
    this.node.on(Node.EventType.TOUCH_END, () => {
      release();
      if (!this.enabled) return;
      Sfx.unlock(); Sfx.click();
      void o.onClick();
    });
  }
  setText(t: string) { this.label.string = t; }
  setEnabled(b: boolean) {
    this.enabled = b;
    this.spr.color = b ? Color.WHITE : new Color(120, 120, 130, 255);
    ensureOpacity(this.label.node).opacity = b ? 255 : 150;
  }
  pulse(on: boolean) {
    Tween.stopAllByTarget(this.node);
    this.node.setScale(1, 1, 1);
    if (on) tween(this.node).repeatForever(tween().to(0.7, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'sineInOut' }).to(0.7, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })).start();
  }
}

export interface ModalBtn { text: string; primary?: boolean; onClick?: () => void | Promise<void>; keepOpen?: boolean }
export interface ModalOpts { title: string; body?: string; buttons: ModalBtn[]; w?: number; h?: number; accent?: string; extra?: (panel: Node) => void; }
export function showModal(parent: Node, o: ModalOpts, theme: { primary: string; secondary: string; background: string }): { close: () => void; node: Node } {
  const root = mk('modal', parent, 0, 0, 3000, 3000);
  const ov = sprite(root, Tex.rect(), 3000, 3000, 0, 0, new Color(0, 0, 0, 175), 'overlay');
  root.addComponent(BlockInputEvents);
  const op = ensureOpacity(ov); op.opacity = 0;
  tween(op).to(0.2, { opacity: 255 }).start();
  const w = o.w ?? 580, h = o.h ?? 440;
  const panel = mk('panel', root, 0, 0, w, h);
  sprite(panel, panelFrame(w, h, '#14122b', o.accent ?? theme.secondary, 34, 0.97), w, h);
  label(panel, o.title, 40, o.accent ?? theme.secondary, { y: h / 2 - 66, outline: { c: '#00000088', w: 3 } });
  if (o.body) label(panel, o.body, 26, '#e5e7eb', { y: o.extra ? h / 2 - 150 : 30, w: w - 90, wrap: true, bold: false, lineHeight: 34 });
  o.extra?.(panel);
  const bh = 78, gap = 16;
  const n = o.buttons.length;
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    tween(panel).to(0.15, { scale: new Vec3(0.85, 0.85, 1) }).start();
    tween(op).to(0.15, { opacity: 0 }).call(() => root.destroy()).start();
  };
  o.buttons.forEach((b, i) => {
    const y = -h / 2 + 62 + (n - 1 - i) * (bh + gap);
    new Button(panel, {
      text: b.text, w: w - 90, h: bh, x: 0, y,
      c0: b.primary ? theme.secondary : '#4b5563', c1: b.primary ? theme.primary : '#1f2937', textColor: b.primary ? '#1b1030' : '#ffffff',
      onClick: async () => { if (!b.keepOpen) close(); await b.onClick?.(); },
    });
  });
  popIn(panel, 0.4, 0.6);
  return { close, node: root };
}

export function toast(parent: Node, text: string, theme: { secondary: string }) {
  const w = 560, h = 64;
  const n = mk('toast', parent, 0, -470, w, h);
  sprite(n, panelFrame(w, h, '#14122b', theme.secondary, 32, 0.95), w, h);
  label(n, text, 24, '#ffffff', { w: w - 40, h: 40 });
  const op = ensureOpacity(n); op.opacity = 0;
  n.setScale(0.9, 0.9, 1);
  tween(n).to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
  tween(op).to(0.2, { opacity: 255 }).delay(2.2).to(0.3, { opacity: 0 }).call(() => n.destroy()).start();
}

/** Pulsing glow behind something. */
export function glowRing(parent: Node, size: number, color: string, x = 0, y = 0): Node {
  const n = sprite(parent, Tex.glow(), size, size, x, y, hex(color), 'glow');
  const op = ensureOpacity(n);
  tween(op).repeatForever(tween().to(0.9, { opacity: 120 }, { easing: 'sineInOut' }).to(0.9, { opacity: 255 }, { easing: 'sineInOut' })).start();
  return n;
}

export { wait };
