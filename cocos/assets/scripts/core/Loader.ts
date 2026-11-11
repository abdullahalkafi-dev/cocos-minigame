import { Node, Sprite, tween, Vec3, UITransform } from 'cc';
import { cached, panelFrame, rr, sprite, Tex } from './Art';
import { ensureOpacity, hex, mk, shade } from './Util';
import { label } from './Widgets';
import { Theme } from './Hud';

/** Branded loading screen (themed, with a progress bar) shown while the game builds its scene. */
export class Loader {
  private root: Node;
  private fill: Node;
  private pct: ReturnType<typeof label>;
  private target = 0; private shown = 0;
  private barW = 380;

  constructor(parent: Node, title: string, theme: Theme) {
    this.root = mk('loader', parent, 0, 0, 3000, 3000);
    const glow = sprite(this.root, Tex.glow(), 760, 760, 0, 90, hex(theme.primary), 'glow');
    tween(ensureOpacity(glow)).repeatForever(tween().to(1.2, { opacity: 90 }, { easing: 'sineInOut' }).to(1.2, { opacity: 230 }, { easing: 'sineInOut' })).start();
    const orb = sprite(this.root, Tex.coin(theme.secondary), 110, 110, 0, 110, undefined, 'orb');
    tween(orb).repeatForever(tween().to(0.9, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'sineInOut' }).to(0.9, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })).start();
    tween(orb).repeatForever(tween().by(2.4, { angle: -360 })).start();
    label(this.root, title, 46, theme.secondary, { y: -10, w: 640, h: 60, outline: { c: shade(theme.secondary, -0.6), w: 5 } });
    const w = this.barW, h = 16;
    const bar = mk('bar', this.root, 0, -80, w, h);
    sprite(bar, cached('loadbar:bg', w, h, (g) => { g.fillStyle = 'rgba(255,255,255,.18)'; rr(g, 0, 0, w, h, h / 2); g.fill(); }), w, h);
    this.fill = mk('fill', bar, -w / 2, 0, 0, h);
    this.fill.getComponent(UITransform)!.anchorX = 0;
    const fs = sprite(this.fill, cached('loadbar:fill:' + theme.secondary, 64, h, (g) => {
      const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, shade(theme.secondary, 0.3)); gr.addColorStop(1, theme.secondary);
      g.fillStyle = gr; rr(g, 0, 0, 64, h, h / 2); g.fill();
    }), 0, h);
    fs.getComponent(UITransform)!.anchorX = 0; fs.setPosition(0, 0, 0);
    this.fillSprite = fs;
    this.pct = label(this.root, '0%', 22, '#ffffff', { y: -124, bold: false });
    this.root.setSiblingIndex(999);
  }
  private fillSprite: Node;
  /** 0..1; the bar eases toward it. */
  set(p: number) { this.target = Math.max(this.target, Math.min(1, p)); this.step(); }
  private step() {
    const ease = () => {
      if (!this.root.isValid) return;
      this.shown += (this.target - this.shown) * 0.2;
      if (Math.abs(this.target - this.shown) < 0.004) this.shown = this.target;
      this.fillSprite.getComponent(UITransform)!.setContentSize(Math.max(0, this.barW * this.shown), 16);
      this.pct.string = `${Math.round(this.shown * 100)}%`;
      if (this.shown < this.target) tween(this.root).delay(0.03).call(ease).start();
    };
    ease();
  }
  /** Fade out and remove. */
  done() {
    this.set(1);
    tween(ensureOpacity(this.root)).delay(0.25).to(0.45, { opacity: 0 }).call(() => this.root.destroy()).start();
  }
}
