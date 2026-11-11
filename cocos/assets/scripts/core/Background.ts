import { Node, UITransform } from 'cc';
import { cached, radial, sprite, vgrad } from './Art';
import { hex, mk, shade } from './Util';
import { spawnMedia, MediaHandle } from './Media';

/** Full-bleed background: a theme gradient with the buyer's background media (image / SVG / video) on top, always covering the screen. */
export class Background {
  node: Node;
  private media: MediaHandle | null = null;
  private base!: Node;
  constructor(parent: Node, private cfg: any, private vw: number, private vh: number) {
    this.node = mk('bg', parent, 0, 0, vw, vh);
    this.build();
  }
  private async build() {
    const bg = this.cfg.theme.background as string, p = this.cfg.theme.primary as string;
    const c = hex(p);
    this.base = sprite(this.node, cached(`bg:${bg}:${p}`, 256, 512, (g, w, h) => {
      g.fillStyle = vgrad(g, 0, h, [[0, shade(bg, 0.1)], [0.55, bg], [1, shade(bg, -0.5)]]); g.fillRect(0, 0, w, h);
      g.fillStyle = radial(g, w / 2, h * 0.3, 0, w * 0.9, [[0, `rgba(${c.r},${c.g},${c.b},.45)`], [1, `rgba(${c.r},${c.g},${c.b},0)`]]); g.fillRect(0, 0, w, h);
    }, 1), this.vw, this.vh, 0, 0, undefined, 'base');
    const ref = this.cfg.assets?.background;
    if (ref?.url) {
      this.media = await spawnMedia(this.node, ref, { w: this.vw, h: this.vh, fit: 'cover', name: 'photo' });
    }
  }
  relayout(vw: number, vh: number) {
    this.vw = vw; this.vh = vh;
    this.node.getComponent(UITransform)!.setContentSize(vw, vh);
    if (this.base) this.base.getComponent(UITransform)!.setContentSize(vw, vh);
    // re-cover with the media's natural aspect
    const m = this.media;
    if (m && m.node.isValid) {
      const k = Math.max(vw / m.natural.width, vh / m.natural.height);
      m.node.getComponent(UITransform)!.setContentSize(m.natural.width * k, m.natural.height * k);
    }
  }
}
