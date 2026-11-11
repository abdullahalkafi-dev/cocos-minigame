// Short visual effects of the Lucky Wheel (all of them decoration: they never change game state).
import { Sprite, Tween, UITransform, Vec3, tween } from 'cc';
import { spawnSprite } from '../../core/Media';
import { Sfx } from '../../core/Sfx';
import { ensureOpacity, hex, mk, rand, wait } from '../../core/Util';
import { label } from '../../core/Widgets';
import { sprite, Tex } from '../../core/Art';
import type { WheelScene } from './types';

export class WheelEffects {
  constructor(private s: WheelScene) {}

  /** Expanding ring when betting closes. */
  ripple() {
    const wheel = this.s.disc.parent!;
    const n = sprite(wheel, Tex.glow(), this.s.hubR * 1.4, this.s.hubR * 1.4, this.s.disc.position.x, this.s.disc.position.y, hex(this.s.ctx.theme.secondary), 'ripple');
    const op = ensureOpacity(n); op.opacity = 230;
    tween(n).to(0.7, { scale: new Vec3(4.5, 4.5, 1) }, { easing: 'quadOut' }).call(() => n.destroy()).start();
    tween(op).to(0.7, { opacity: 0 }).start();
  }

  spinBurst() {
    this.s.ctx.fx.burst({ x: this.s.disc.parent!.position.x + this.s.disc.position.x, y: this.s.wy + this.s.disc.position.y, count: 26, shape: 'spark', colors: [this.s.ctx.theme.secondary, '#ffffff'], speed: [200, 520], gravity: 0, life: [0.4, 0.8], size: [0.6, 1.4] });
  }

  /** The top gem flashes each time a wedge passes it. */
  pulseGem(speed: number) {
    const g = this.s.gemGlow; if (!g) return;
    Tween.stopAllByTarget(g);
    g.setScale(1.7, 1.7, 1); tween(g).to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
    if (speed > 0.12) this.s.ctx.fx.burst({ x: 0, y: this.s.wy + this.s.gemLocalY - 6, count: 2, shape: 'spark', colors: ['#ffffff', this.s.ctx.theme.secondary], speed: [60, 200], angle: [200, 340], gravity: 300, life: [0.25, 0.5], size: [0.3, 0.7] });
  }

  /** The winning symbol pops out of the wheel, then flies into the history ribbon. */
  async popResultIcon(hits: string[]) {
    const { theme, uiLayer } = this.s.ctx;
    const t = this.s.targets.find(x => x.id === hits[0]); if (!t) return;
    const n = await spawnSprite(uiLayer, t.icon, 170, 170, 0, this.s.wy + 20, 'contain', 'resicon'); if (!n) return;
    const name = hits.map(h => this.s.targets.find(x => x.id === h)?.label ?? h).join(' + ');
    const mult = this.s.targets.find(x => x.id === hits[0])?.multiplier ?? 0;
    const lb = label(uiLayer, `${name}  x${mult}`, 34, theme.secondary, { y: this.s.wy - 122, outline: { c: '#2a0a5a', w: 5 } });
    const nop = ensureOpacity(n), lop = ensureOpacity(lb.node); nop.opacity = 0; lop.opacity = 0;
    n.setScale(0.2, 0.2, 1); lb.node.setScale(0.6, 0.6, 1);
    tween(n).to(0.5, { scale: new Vec3(1.5, 1.5, 1) }, { easing: 'backOut' }).start();
    tween(nop).to(0.2, { opacity: 255 }).start();
    tween(lb.node).to(0.4, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start(); tween(lop).to(0.25, { opacity: 255 }).start();
    await wait(1.2);
    if (!n.isValid) return;
    tween(lop).to(0.3, { opacity: 0 }).call(() => lb.node.destroy()).start();
    tween(n).to(0.5, { position: new Vec3(-252, this.s.bot + 382, 0), scale: new Vec3(0.3, 0.3, 1) }, { easing: 'quadInOut' }).call(() => n.destroy()).start();
    tween(nop).delay(0.3).to(0.2, { opacity: 0 }).start();
  }

  /** Winning stacks fly to the balance as coins; losing stacks fade away. */
  settleStacks(hits: string[]) {
    const { theme, fx } = this.s.ctx;
    this.s.boxes.forEach((b, id) => {
      if (b.lastCount === 0) return;
      if (hits.includes(id)) {
        const px = b.node.position.x, py = b.node.position.y;
        for (let k = 0; k < 7; k++) {
          const c = sprite(this.s.ctx.uiLayer, Tex.coin(theme.secondary), 34, 34, px - b.w * 0.3 + rand(-14, 14), py + rand(-10, 10), undefined, 'flycoin');
          c.setScale(0, 0, 1);
          tween(c).delay(k * 0.07).to(0.15, { scale: new Vec3(1, 1, 1) }).to(0.7, { position: new Vec3(-190, this.s.bot + 62, 0), scale: new Vec3(0.6, 0.6, 1) }, { easing: 'quadIn' }).call(() => { c.destroy(); if (k % 3 === 0) Sfx.coin(); }).start();
        }
        fx.burst({ x: px, y: py, count: 8, shape: 'star', colors: [theme.secondary, '#ffffff'], speed: [100, 300], gravity: 200, life: [0.4, 0.8] });
        tween(b.stack).to(0.25, { scale: new Vec3(1.25, 1.25, 1) }).to(0.3, { scale: new Vec3(0, 0, 1) }).start();
      } else {
        tween(b.stack).to(0.5, { position: new Vec3(b.stack.position.x, b.stack.position.y - 18, 0) }).start();
        tween(ensureOpacity(b.stack)).to(0.5, { opacity: 0 }).start();
      }
    });
  }

  floatText(text: string, color: string) {
    const l = label(this.s.ctx.uiLayer, text, 64, color, { y: this.s.bot + 390, outline: { c: '#2a0a5a', w: 6 } });
    const op = ensureOpacity(l.node); op.opacity = 0;
    l.node.setScale(0.5, 0.5, 1);
    tween(l.node).to(0.3, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'backOut' }).by(1.3, { position: new Vec3(0, 90, 0) }).start();
    tween(op).to(0.2, { opacity: 255 }).delay(1.1).to(0.3, { opacity: 0 }).call(() => l.node.destroy()).start();
  }

  flyChip(id: string) {
    const b = this.s.boxes.get(id), c = this.s.chipNodes[this.s.selected];
    if (!b || !c) return;
    const img = c.node.getChildByName('img');
    const n = mk('fly', this.s.ctx.uiLayer, c.node.position.x, c.node.position.y, 70, 70);
    const sp = img?.getComponent(Sprite);
    if (sp?.spriteFrame) { const s = n.addComponent(Sprite); s.sizeMode = Sprite.SizeMode.CUSTOM; s.spriteFrame = sp.spriteFrame; n.getComponent(UITransform)!.setContentSize(70, 70); }
    else sprite(n, Tex.coin(this.s.ctx.theme.secondary), 56, 56);
    tween(n).to(0.38, { position: new Vec3(b.node.position.x + (Math.random() - 0.5) * 50, b.node.position.y + (Math.random() - 0.5) * 20, 0), scale: new Vec3(0.55, 0.55, 1) }, { easing: 'quadOut' })
      .call(() => { n.destroy(); b.node.setScale(1.04, 1.04, 1); tween(b.node).to(0.15, { scale: new Vec3(1, 1, 1) }).start(); }).start();
  }
}
