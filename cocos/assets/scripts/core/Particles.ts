import { _decorator, Component, Node, Sprite, UIOpacity, UITransform } from 'cc';
import { Tex } from './Art';
import { hex, mk, pick, rand } from './Util';

const { ccclass } = _decorator;

export type Shape = 'confetti' | 'dot' | 'star' | 'coin' | 'spark';
export interface BurstOpts {
  x: number; y: number; count: number; shape?: Shape; colors?: string[];
  speed?: [number, number]; angle?: [number, number]; gravity?: number;
  life?: [number, number]; size?: [number, number]; spin?: number; drag?: number; fadeStart?: number;
}
interface P { n: Node; sp: Sprite; op: UIOpacity; vx: number; vy: number; g: number; life: number; max: number; vr: number; s0: number; s1: number; drag: number; fade: number }

@ccclass('ParticleLayer')
export class ParticleLayer extends Component {
  private live: P[] = [];
  private pool: Node[] = [];

  private frame(shape: Shape) {
    switch (shape) {
      case 'confetti': return Tex.confetti();
      case 'star': return Tex.star();
      case 'coin': return Tex.coin();
      case 'spark': return Tex.spark();
      default: return Tex.dot();
    }
  }
  private take(): Node {
    const n = this.pool.pop();
    if (n) { n.active = true; return n; }
    const nn = mk('p', this.node, 0, 0, 20, 20);
    const s = nn.addComponent(Sprite);
    s.sizeMode = Sprite.SizeMode.CUSTOM;
    nn.addComponent(UIOpacity);
    return nn;
  }

  burst(o: BurstOpts) {
    const shape = o.shape ?? 'confetti';
    const colors = o.colors ?? ['#fbbf24', '#f43f5e', '#22d3ee', '#a3e635', '#c084fc'];
    const [s0, s1] = o.speed ?? [250, 700];
    const [a0, a1] = o.angle ?? [0, 360];
    const [l0, l1] = o.life ?? [0.9, 1.7];
    const [z0, z1] = o.size ?? [0.7, 1.2];
    const frame = this.frame(shape);
    const base = shape === 'confetti' ? [18, 10] : shape === 'coin' ? [34, 34] : shape === 'spark' ? [48, 48] : shape === 'star' ? [30, 30] : [14, 14];
    for (let i = 0; i < o.count; i++) {
      if (this.live.length > 420) break;
      const n = this.take();
      const sp = n.getComponent(Sprite)!;
      const op = n.getComponent(UIOpacity)!;
      sp.spriteFrame = frame;
      sp.color = shape === 'coin' ? hex('#ffffff') : hex(pick(colors));
      op.opacity = 255;
      const sz = rand(z0, z1);
      n.setPosition(o.x, o.y, 0);
      n.angle = rand(0, 360);
      n.getComponent(UITransform)!.setContentSize(base[0], base[1]);
      const ang = (rand(a0, a1) * Math.PI) / 180, spd = rand(s0, s1);
      const life = rand(l0, l1);
      n.setScale(0.2, 0.2, 1);
      this.live.push({
        n, sp, op, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, g: o.gravity ?? 900, life, max: life,
        vr: rand(-1, 1) * (o.spin ?? 540), s0: sz, s1: sz * (shape === 'spark' ? 0.2 : 1), drag: o.drag ?? 0.6, fade: o.fadeStart ?? 0.35,
      });
    }
  }

  /** Confetti/coins falling from the top across the screen. */
  rain(opts: { width: number; top: number; count: number; shape?: Shape; colors?: string[]; duration?: number }) {
    const dur = opts.duration ?? 2.2;
    const per = Math.max(1, Math.round(opts.count / 12));
    let spawned = 0;
    const step = () => {
      if (!this.isValid) return;
      for (let i = 0; i < per && spawned < opts.count; i++, spawned++) {
        this.burst({
          x: rand(-opts.width / 2, opts.width / 2), y: opts.top + 40, count: 1, shape: opts.shape ?? 'confetti', colors: opts.colors,
          speed: [40, 160], angle: [250, 290], gravity: 380, life: [2.2, 3.4], spin: 360, drag: 0.1, fadeStart: 0.2,
        });
      }
      if (spawned < opts.count) this.scheduleOnce(step, dur / 12);
    };
    step();
  }

  update(dt: number) {
    if (!this.live.length) return;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.n.active = false; this.pool.push(p.n);
        this.live[i] = this.live[this.live.length - 1]; this.live.pop();
        continue;
      }
      const k = 1 - p.life / p.max;
      p.vx *= 1 - p.drag * dt; p.vy -= p.g * dt; p.vy *= 1 - p.drag * dt * 0.4;
      const pos = p.n.position;
      p.n.setPosition(pos.x + p.vx * dt, pos.y + p.vy * dt, 0);
      p.n.angle += p.vr * dt;
      const s = (p.s0 + (p.s1 - p.s0) * k) * Math.min(1, k * 8 + 0.2);
      p.n.setScale(s, s, 1);
      const remain = p.life / p.max;
      p.op.opacity = remain < p.fade ? Math.round(255 * (remain / p.fade)) : 255;
    }
  }

  clear() {
    this.live.forEach(p => { p.n.active = false; this.pool.push(p.n); });
    this.live.length = 0;
  }
}
