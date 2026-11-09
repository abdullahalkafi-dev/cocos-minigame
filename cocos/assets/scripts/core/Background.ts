import { Node, Sprite, tween, Vec3, UITransform, Color } from 'cc';
import { cached, drawImageFit, loadImage, radial, sprite, Tex, vgrad, remoteFrame } from './Art';
import { ensureOpacity, hex, mk, rand, shade } from './Util';

/** Animated themed background that always covers the visible area. */
export class Background {
  node: Node;
  private layers: Node[] = [];
  constructor(parent: Node, private cfg: any, private vw: number, private vh: number) {
    this.node = mk('bg', parent, 0, 0, vw, vh);
    this.build();
  }

  private async build() {
    const t = this.cfg.theme;
    const bg = t.background as string, p = t.primary as string, s = t.secondary as string;
    const base = sprite(this.node, cached(`bg:${bg}:${p}`, 256, 512, (g, w, h) => {
      g.fillStyle = vgrad(g, 0, h, [[0, shade(bg, 0.12)], [0.55, bg], [1, shade(bg, -0.45)]]); g.fillRect(0, 0, w, h);
      g.fillStyle = radial(g, w / 2, h * 0.3, 0, w * 0.9, [[0, hexA(p, 0.5)], [1, hexA(p, 0)]]); g.fillRect(0, 0, w, h);
    }, 1), this.vw, this.vh, 0, 0, undefined, 'base');
    this.layers.push(base);

    const url = this.cfg.images?.background as string | undefined;
    if (url) {
      const im = await loadImage(url);
      if (im && this.node.isValid) {
        const n = sprite(this.node, remoteFrame(im), this.vw, this.vh, 0, 0, undefined, 'photo');
        n.getComponent(Sprite)!.sizeMode = Sprite.SizeMode.CUSTOM;
        this.photo = { node: n, w: im.width, h: im.height };
        this.fitPhoto();
        sprite(this.node, Tex.rect(), this.vw + 40, this.vh + 40, 0, 0, new Color(0, 0, 0, 110), 'dim');
        this.layers.push(n);
      }
    }
    // floating bokeh
    for (let i = 0; i < 14; i++) {
      const size = rand(90, 260);
      const x = rand(-420, 420), y = rand(-640, 640);
      const col = i % 2 ? p : s;
      const n = sprite(this.node, Tex.glow(), size, size, x, y, hex(col), 'bokeh');
      const op = ensureOpacity(n); op.opacity = Math.round(rand(25, 70));
      const d = rand(5, 10);
      tween(n).repeatForever(tween()
        .to(d, { position: new Vec3(x + rand(-80, 80), y + rand(60, 220), 0) }, { easing: 'sineInOut' })
        .to(d, { position: new Vec3(x, y, 0) }, { easing: 'sineInOut' })).start();
    }
  }
  private photo: { node: Node; w: number; h: number } | null = null;
  private fitPhoto() {
    if (!this.photo) return;
    const s = Math.max(this.vw / this.photo.w, this.vh / this.photo.h);
    this.photo.node.getComponent(UITransform)!.setContentSize(this.photo.w * s, this.photo.h * s);
  }
  relayout(vw: number, vh: number) {
    this.vw = vw; this.vh = vh;
    this.node.getComponent(UITransform)!.setContentSize(vw, vh);
    this.layers.forEach(l => { if (l.name === 'base') l.getComponent(UITransform)!.setContentSize(vw, vh); });
    this.node.getChildByName('dim')?.getComponent(UITransform)?.setContentSize(vw + 40, vh + 40);
    this.fitPhoto();
  }
}

function hexA(c: string, a: number) {
  const col = hex(c);
  return `rgba(${col.r},${col.g},${col.b},${a})`;
}
