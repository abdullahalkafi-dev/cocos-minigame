import { Node, Sprite, tween, Vec3, Tween, Color, UITransform } from 'cc';
import { Game, GameCtx } from '../core/GameBase';
import { cached, drawImageFit, imageSync, makeFrame, panelFrame, radial, rr, sprite, Tex, vgrad } from '../core/Art';
import { animate, countTo, ensureOpacity, fmtNum, FONT, hex, mk, popIn, rand, shade, wait } from '../core/Util';
import { Button, glowRing, label, showModal } from '../core/Widgets';
import { Sfx } from '../core/Sfx';
import { emit } from '../core/Host';

interface Prize { label: string; multiplier: number; color: string; image?: string }

const CY = 90;          // wheel centre y
const R = 285;          // disc radius
const RIM = 318;        // outer rim radius

export class LuckySpin extends Game {
  private prizes!: Prize[];
  private disc!: Node;
  private pivot!: Node;
  private hub!: Node;
  private bulbs: Node[] = [];
  private recentRow!: Node;
  private chipNodes: { node: Node; bet: number; glow: Node }[] = [];
  private spinBtn!: Button;
  private bet = 0;
  private rot = 0;               // clockwise degrees
  private busy = false;
  private recent: { m: number; win: number }[] = [];
  private bulbTimer = 0;

  start() {
    const { stage, cfg, theme } = this.ctx;
    this.prizes = cfg.prizes as Prize[];
    const bets: number[] = cfg.betOptions;
    this.bet = bets.find(b => b <= this.ctx.player.balance) ?? bets[0];

    this.buildWheel(stage);
    this.buildPointer(stage);
    this.recentRow = mk('recent', stage, 0, -262);
    this.renderRecent();
    this.buildControls(stage, bets);
    this.idleAnim();
    // entrance
    stage.getChildByName('wheel')?.setScale(0.7, 0.7, 1);
    tween(stage.getChildByName('wheel')!).to(0.7, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    void theme;
  }

  // ---------------------------------------------------------------- wheel
  private buildWheel(stage: Node) {
    const { theme } = this.ctx;
    const wheel = mk('wheel', stage, 0, CY);
    // soft glow behind
    sprite(wheel, Tex.glow(), RIM * 2.7, RIM * 2.7, 0, 0, hex(theme.primary), 'halo');
    // rim
    sprite(wheel, this.rimFrame(), RIM * 2, RIM * 2, 0, 0, undefined, 'rim');
    // spinning disc
    this.disc = sprite(wheel, this.discFrame(), R * 2, R * 2, 0, 0, undefined, 'disc');
    // bulbs on the rim
    const n = 24, br = (RIM + R) / 2 + 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const b = sprite(wheel, Tex.dot(), 14, 14, Math.sin(a) * br, Math.cos(a) * br, hex(theme.secondary), 'bulb');
      sprite(b, Tex.glow(), 40, 40, 0, 0, hex(theme.secondary), 'bglow');
      this.bulbs.push(b);
    }
    // hub
    this.hub = mk('hub', wheel, 0, 0, 132, 132);
    sprite(this.hub, cached(`hub:${theme.secondary}:${theme.primary}`, 140, 140, (g, w, h) => {
      const c = w / 2;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(c, c + 5, 62, 0, 7); g.fill();
      g.fillStyle = radial(g, c - 14, c - 18, 4, 64, [[0, shade(theme.secondary, 0.65)], [0.5, theme.secondary], [1, shade(theme.secondary, -0.4)]]);
      g.beginPath(); g.arc(c, c, 62, 0, 7); g.fill();
      g.strokeStyle = shade(theme.secondary, -0.5); g.lineWidth = 3; g.stroke();
      g.fillStyle = radial(g, c, c, 0, 46, [[0, shade(theme.primary, 0.25)], [1, shade(theme.primary, -0.35)]]);
      g.beginPath(); g.arc(c, c, 44, 0, 7); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3; g.stroke();
    }), 140, 140);
    label(this.hub, 'SPIN', 30, '#ffffff', { outline: { c: shade(theme.primary, -0.6), w: 4 }, y: 1 });
    this.hub.on(Node.EventType.TOUCH_END, () => { Sfx.unlock(); void this.spin(); });
  }

  private rimFrame() {
    const { theme } = this.ctx;
    return cached(`rim:${theme.secondary}:${theme.background}`, RIM * 2, RIM * 2, (g, w) => {
      const c = w / 2;
      g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.arc(c, c + 8, RIM, 0, 7); g.fill();
      const gr = g.createLinearGradient(0, 0, w, w);
      gr.addColorStop(0, shade(theme.secondary, 0.55)); gr.addColorStop(0.45, theme.secondary); gr.addColorStop(1, shade(theme.secondary, -0.45));
      g.fillStyle = gr; g.beginPath(); g.arc(c, c, RIM, 0, 7); g.fill();
      g.strokeStyle = shade(theme.secondary, -0.55); g.lineWidth = 3; g.stroke();
      g.fillStyle = shade(theme.background, -0.3); g.beginPath(); g.arc(c, c, R + 8, 0, 7); g.fill();
      g.strokeStyle = shade(theme.secondary, 0.35); g.lineWidth = 2.5; g.beginPath(); g.arc(c, c, R + 8, 0, 7); g.stroke();
    });
  }

  private discFrame() {
    const prizes = this.prizes, N = prizes.length, seg = (Math.PI * 2) / N;
    const key = 'disc:' + prizes.map(p => `${p.label}|${p.color}|${p.image || ''}`).join(';');
    return cached(key, R * 2, R * 2, (g, w) => {
      const c = w / 2;
      g.translate(c, c);
      prizes.forEach((p, i) => {
        const a0 = -Math.PI / 2 + (i - 0.5) * seg, a1 = a0 + seg;
        g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R - 1, a0, a1); g.closePath();
        g.fillStyle = radial(g, 0, 0, 20, R, [[0, shade(p.color, -0.45)], [0.5, p.color], [1, shade(p.color, 0.22)]]);
        g.fill();
        if (i % 2) { g.fillStyle = 'rgba(0,0,0,.10)'; g.fill(); }
        g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3; g.stroke();
      });
      // labels
      prizes.forEach((p, i) => {
        g.save();
        g.rotate(i * seg);
        g.rotate(-Math.PI / 2);
        const im = p.image ? imageSync(p.image) : null;
        let right = R * 0.9;
        if (im) { drawImageFit(g, im, R * 0.74, -34, 68, 68, 'contain'); right = R * 0.72; }
        let fs = 46;
        g.font = `bold ${fs}px ${FONT}`;
        const maxW = right - R * 0.27;
        while (g.measureText(p.label).width > maxW && fs > 18) { fs -= 2; g.font = `bold ${fs}px ${FONT}`; }
        g.textAlign = 'right'; g.textBaseline = 'middle';
        g.lineJoin = 'round'; g.lineWidth = Math.max(4, fs / 7); g.strokeStyle = 'rgba(0,0,0,.55)';
        g.strokeText(p.label, right, 2);
        g.fillStyle = '#ffffff'; g.fillText(p.label, right, 2);
        g.restore();
      });
      // inner shadow near hub
      g.fillStyle = radial(g, 0, 0, 40, 95, [[0, 'rgba(0,0,0,.45)'], [1, 'rgba(0,0,0,0)']]);
      g.beginPath(); g.arc(0, 0, 95, 0, 7); g.fill();
    });
  }

  private buildPointer(stage: Node) {
    const { theme } = this.ctx;
    this.pivot = mk('pivot', stage, 0, CY + R + 8 + 80);
    sprite(this.pivot, cached(`ptr:${theme.secondary}`, 76, 116, (g, w, h) => {
      const cx = w / 2;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.moveTo(cx - 20, 38); g.lineTo(cx + 20, 38); g.lineTo(cx + 3, 114); g.lineTo(cx - 3, 114); g.closePath(); g.fill();
      g.fillStyle = vgrad(g, 20, 110, [[0, '#ff6b6b'], [1, '#c81e1e']]);
      g.beginPath(); g.moveTo(cx - 19, 34); g.lineTo(cx + 19, 34); g.lineTo(cx, 108); g.closePath(); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
      g.fillStyle = radial(g, cx - 5, 24, 2, 22, [[0, shade(theme.secondary, 0.6)], [1, shade(theme.secondary, -0.35)]]);
      g.beginPath(); g.arc(cx, 30, 22, 0, 7); g.fill(); g.strokeStyle = shade(theme.secondary, -0.5); g.lineWidth = 3; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(cx - 6, 22, 5, 0, 7); g.fill();
    }), 76, 116, 0, -28);
  }

  // ------------------------------------------------------------- controls
  private buildControls(stage: Node, bets: number[]) {
    const { theme, cfg } = this.ctx;
    label(stage, 'CHOOSE YOUR BET', 20, theme.text, { y: -316, outline: { c: '#00000066', w: 3 } }).node.getComponent(UITransform);
    const n = bets.length;
    const cw = Math.min(150, Math.floor(640 / n) - 12), ch = 62, gap = 12;
    const total = n * cw + (n - 1) * gap;
    bets.forEach((b, i) => {
      const x = -total / 2 + cw / 2 + i * (cw + gap);
      const node = mk('chip', stage, x, -368, cw, ch);
      const glow = glowRing(node, cw * 1.6, theme.secondary, 0, 0);
      sprite(node, cached(`chip:${cw}:${theme.primary}:${theme.secondary}`, cw, ch, (g, w, h) => {
        g.fillStyle = vgrad(g, 0, h, [[0, shade(theme.primary, 0.25)], [1, shade(theme.primary, -0.35)]]);
        rr(g, 3, 3, w - 6, h - 6, 18); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3; g.stroke();
      }), cw, ch);
      label(node, fmtNum(b), 28, '#ffffff', { y: 1, outline: { c: '#00000066', w: 3 } });
      node.on(Node.EventType.TOUCH_END, () => { if (this.busy) return; Sfx.unlock(); Sfx.click(); this.setBet(b); });
      this.chipNodes.push({ node, bet: b, glow });
    });
    this.setBet(this.bet, false);

    this.spinBtn = new Button(stage, {
      text: 'SPIN', w: 460, h: 104, x: 0, y: -470, c0: shade(theme.secondary, 0.25), c1: shade(theme.secondary, -0.25), textColor: '#2a1300', size: 52,
      onClick: () => this.spin(),
    });
    this.spinBtn.pulse(true);
    label(stage, `Win up to x${Math.max(...this.prizes.map(p => p.multiplier))} your bet`, 22, theme.text, { y: -548, bold: false, shadow: { c: '#00000088', dx: 0, dy: -2 } });
    void cfg;
  }

  private setBet(b: number, sound = true) {
    this.bet = b;
    this.chipNodes.forEach(c => {
      const on = c.bet === b;
      Tween.stopAllByTarget(c.node);
      tween(c.node).to(0.18, { scale: on ? new Vec3(1.1, 1.1, 1) : new Vec3(0.92, 0.92, 1) }, { easing: 'backOut' }).start();
      c.glow.active = on;
      ensureOpacity(c.node).opacity = on ? 255 : 170;
    });
    void sound;
  }

  private renderRecent() {
    this.recentRow.removeAllChildren();
    const { theme } = this.ctx;
    if (!this.recent.length) { label(this.recentRow, 'Spin the wheel to win!', 24, theme.text, { bold: false, shadow: { c: '#00000088', dx: 0, dy: -2 } }); return; }
    label(this.recentRow, 'LAST', 18, theme.text, { x: -300, align: 'left', outline: { c: '#00000066', w: 3 } });
    this.recent.forEach((r, i) => {
      const x = -230 + i * 92;
      const chip = mk('rc', this.recentRow, x + 40, 0, 84, 38);
      const win = r.win > 0;
      sprite(chip, panelFrame(84, 38, win ? '#14532d' : '#1f2937', win ? '#4ade80' : '#6b7280', 19, 0.9), 84, 38);
      label(chip, win ? `+${fmtNum(r.win)}` : '0', 20, win ? '#bbf7d0' : '#9ca3af', { w: 78, h: 28 });
      if (i === 0) popIn(chip, 0.35, 0.3);
    });
  }

  private idleAnim() {
    const { theme } = this.ctx;
    // bulbs: alternating pairs blink
    const tickBulbs = (fast: boolean) => {
      this.bulbTimer++;
      this.bulbs.forEach((b, i) => {
        const on = fast ? (i + this.bulbTimer) % 3 === 0 : (i + this.bulbTimer) % 2 === 0;
        b.getChildByName('bglow')!.active = on;
        b.getComponent(Sprite)!.color = on ? Color.WHITE : hex(shade(theme.secondary, -0.35));
      });
    };
    tween(this.ctx.stage).repeatForever(tween().delay(0.28).call(() => tickBulbs(this.busy))).start();
    tween(this.hub).repeatForever(tween().to(0.9, { scale: new Vec3(1.07, 1.07, 1) }, { easing: 'sineInOut' }).to(0.9, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })).start();
  }

  // ------------------------------------------------------------------ spin
  private setRot(deg: number) {
    this.rot = deg;
    this.disc.angle = -deg;
  }
  private segUnderPointer(): number {
    const N = this.prizes.length, seg = 360 / N;
    const a = ((-this.rot % 360) + 360) % 360;            // wheel angle (clockwise from top) of the point under the pointer
    return Math.floor((a + seg / 2) / seg) % N;
  }

  private async spin() {
    if (this.busy) return;
    const { api, hud } = this.ctx;
    if (hud.balance < this.bet) { hud.promptRefill(); return; }
    this.busy = true;
    this.spinBtn.setEnabled(false); this.spinBtn.pulse(false);
    const bet = this.bet;
    let res;
    try { res = await api.spin(bet); }
    catch (e) { this.busy = false; this.spinBtn.setEnabled(true); this.spinBtn.pulse(true); hud.handleError(e); return; }

    const result = res.result as { prizeIndex: number; label: string; multiplier: number; win: number };
    const startBal = hud.balance;
    hud.setBalance(startBal - bet);          // the bet leaves the balance right away
    Sfx.whoosh();
    await this.animateTo(result.prizeIndex);
    await this.celebrate(result, bet, res.balance);
    emit('round', { game: 'lucky-spin', bet, win: result.win, multiplier: result.multiplier, label: result.label, balance: res.balance });
    this.busy = false;
    this.spinBtn.setEnabled(true); this.spinBtn.pulse(true);
  }

  private async animateTo(index: number) {
    const N = this.prizes.length, seg = 360 / N;
    // wind-up: pull back a little
    const start0 = this.rot;
    await animate(0.38, 'sineOut', t => this.setRot(start0 - 14 * t));
    const start = this.rot;
    const jitter = rand(-0.34, 0.34) * seg;
    // final clockwise rotation so that segment `index` is under the pointer
    const want = ((-(index * seg) - jitter) % 360 + 360) % 360;
    const base = Math.ceil((start + 6 * 360) / 360) * 360;
    const final = base + want;
    let last = this.segUnderPointer();
    const dur = 5.4;
    await animate(dur, 'quartOut', t => {
      this.setRot(start + (final - start) * t);
      const cur = this.segUnderPointer();
      if (cur !== last) {
        last = cur;
        Sfx.tick();
        Tween.stopAllByTarget(this.pivot);
        this.pivot.angle = 24;
        tween(this.pivot).to(0.12, { angle: 0 }, { easing: 'quadOut' }).start();
      }
    });
    this.setRot(final % 360);
    Sfx.thud();
    tween(this.pivot).to(0.08, { angle: -9 }).to(0.2, { angle: 0 }, { easing: 'backOut' }).start();
  }

  private async celebrate(r: { prizeIndex: number; label: string; multiplier: number; win: number }, bet: number, finalBalance: number) {
    const { fx, hud, theme, uiLayer } = this.ctx;
    const maxMult = Math.max(...this.prizes.map(p => p.multiplier));
    this.recent.unshift({ m: r.multiplier, win: r.win });
    this.recent = this.recent.slice(0, 6);
    this.renderRecent();
    const wheelY = CY;

    if (r.win <= 0) {
      Sfx.lose();
      tween(this.disc.parent!).to(0.05, { position: new Vec3(-8, CY, 0) }).to(0.05, { position: new Vec3(8, CY, 0) }).to(0.05, { position: new Vec3(-5, CY, 0) }).to(0.05, { position: new Vec3(0, CY, 0) }).start();
      hud.setBalance(finalBalance);
      this.floatText('No win this time', '#e5e7eb');
      await wait(0.9);
      return;
    }

    const level = r.multiplier >= maxMult && maxMult >= 5 ? 3 : r.multiplier >= 3 ? 2 : 1;
    // glowing wedge on the winning segment
    this.flashWedge(r.prizeIndex);
    r.multiplier >= maxMult && maxMult >= 5 ? Sfx.jackpot() : Sfx.win(level);
    const colors = [theme.secondary, theme.primary, '#ffffff', this.prizes[r.prizeIndex].color, '#f43f5e', '#22d3ee'];
    fx.burst({ x: 0, y: wheelY + 40, count: 40 + level * 25, shape: 'confetti', colors, speed: [350, 900], angle: [40, 140], gravity: 1100, life: [1.4, 2.4] });
    fx.burst({ x: 0, y: wheelY, count: 14 + level * 8, shape: 'coin', speed: [300, 800], angle: [50, 130], gravity: 1300, life: [1.2, 2] });
    fx.burst({ x: 0, y: wheelY, count: 20, shape: 'spark', colors: [theme.secondary, '#ffffff'], speed: [150, 500], gravity: 0, life: [0.5, 0.9], size: [0.8, 1.6] });
    if (level >= 2) fx.rain({ width: 700, top: 640, count: 60 + level * 25, shape: 'confetti', colors, duration: 2.4 });
    if (level >= 3) { fx.rain({ width: 700, top: 640, count: 24, shape: 'coin', duration: 2.8 }); this.shake(); }

    // result card
    const card = mk('win', uiLayer, 0, 40, 600, 360);
    const dim = sprite(card, Tex.rect(), 3000, 3000, 0, 0, new Color(0, 0, 0, 130), 'dim');
    dim.setPosition(0, -40, 0);
    sprite(card, panelFrame(600, 360, '#14122b', theme.secondary, 40, 0.96), 600, 360);
    glowRing(card, 700, theme.secondary, 0, 0);
    label(card, level >= 3 ? 'JACKPOT!' : level === 2 ? 'BIG WIN!' : 'YOU WON!', level >= 3 ? 72 : 60, theme.secondary, { y: 118, outline: { c: shade(theme.secondary, -0.6), w: 6 } });
    const amount = label(card, '0', 92, '#ffffff', { y: 10, outline: { c: '#00000099', w: 6 } });
    label(card, `${r.label}  •  bet ${fmtNum(bet)}`, 28, '#e5e7eb', { y: -88, bold: false });
    label(card, String(this.ctx.cfg.currencyName || 'Coins').toUpperCase(), 24, theme.secondary, { y: -128 });
    popIn(card, 0.5, 0.4);
    Sfx.coin();
    hud.setBalance(finalBalance);
    await countTo(amount, 0, r.win, Math.min(1.8, 0.7 + r.win / 3000), fmtNum, 'quadOut');
    amount.node.setScale(1.25, 1.25, 1);
    tween(amount.node).to(0.4, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    fx.burst({ x: 0, y: 50, count: 30, shape: 'star', colors: [theme.secondary, '#ffffff'], speed: [200, 600], gravity: 200, life: [0.8, 1.4] });
    await wait(level >= 3 ? 2.6 : 1.7);
    const op = ensureOpacity(card);
    await new Promise<void>(res => { tween(op).to(0.3, { opacity: 0 }).call(() => res()).start(); });
    card.destroy();
    // wedge fades itself
  }

  private flashWedge(index: number) {
    const N = this.prizes.length, seg = (Math.PI * 2) / N;
    const f = makeFrame(R * 2, R * 2, (g, w) => {
      const c = w / 2; g.translate(c, c);
      const a0 = -Math.PI / 2 + (index - 0.5) * seg;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a0, a0 + seg); g.closePath();
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 8; g.stroke();
    }, 1);
    const wedge = sprite(this.disc, f, R * 2, R * 2, 0, 0, undefined, 'wedge');
    const op = ensureOpacity(wedge); op.opacity = 0;
    tween(op).to(0.18, { opacity: 255 }).to(0.18, { opacity: 80 }).to(0.18, { opacity: 255 }).to(0.18, { opacity: 80 }).to(0.18, { opacity: 255 }).to(0.5, { opacity: 0 }).call(() => wedge.destroy()).start();
  }

  private floatText(text: string, color: string) {
    const l = label(this.ctx.uiLayer, text, 40, color, { y: CY + 20, outline: { c: '#000000aa', w: 5 } });
    const op = ensureOpacity(l.node); op.opacity = 0;
    l.node.setScale(0.6, 0.6, 1);
    tween(l.node).to(0.25, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).by(0.9, { position: new Vec3(0, 50, 0) }).start();
    tween(op).to(0.2, { opacity: 255 }).delay(0.6).to(0.3, { opacity: 0 }).call(() => l.node.destroy()).start();
  }

  private shake() {
    const s = this.ctx.stage;
    const p = s.position.clone();
    tween(s).to(0.04, { position: new Vec3(p.x - 12, p.y + 6, 0) }).to(0.04, { position: new Vec3(p.x + 12, p.y - 6, 0) }).to(0.04, { position: new Vec3(p.x - 8, p.y + 4, 0) })
      .to(0.04, { position: new Vec3(p.x + 8, p.y - 4, 0) }).to(0.06, { position: p }).start();
  }
}
void showModal; void hex;
