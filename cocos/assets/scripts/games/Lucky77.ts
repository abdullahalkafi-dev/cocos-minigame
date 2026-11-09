import { Node, Sprite, SpriteFrame, tween, Vec3, Tween, Color, Mask, Graphics, UITransform, Label } from 'cc';
import { Game } from '../core/GameBase';
import { cached, drawImageFit, imageSync, panelFrame, radial, rr, sprite, Tex, vgrad, star } from '../core/Art';
import { animate, countTo, ensureOpacity, fmtNum, FONT, hex, mk, popIn, pick, rand, shade, wait } from '../core/Util';
import { Button, glowRing, label } from '../core/Widgets';
import { Sfx } from '../core/Sfx';
import { emit } from '../core/Host';

interface Sym { label: string; multiplier: number; color: string; image?: string }
interface LineWin { line: number; symbol: number; win: number }

const C = 172;            // cell size
const GAP = 10;
const WIN_Y = 80;         // reel window centre y
const PAYLINES: number[][] = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
const LINE_COLORS = ['#fde047', '#22d3ee', '#f472b6', '#a3e635', '#fb923c'];
const cellX = (reel: number) => (reel - 1) * (C + GAP);
const cellY = (row: number) => (1 - row) * C;

export class Lucky77 extends Game {
  private syms!: Sym[];
  private frames: SpriteFrame[] = [];
  private grid: number[][] = [];                // grid[reel][row] currently shown
  private reels: { node: Node; strip: Node }[] = [];
  private overlay!: Node;                       // win lines + highlights
  private bulbs: Node[] = [];
  private winLabel!: Label;
  private betLabel!: Label;
  private spinBtn!: Button;
  private bets: number[] = [];
  private betIdx = 0;
  private busy = false;
  private tickN = 0;
  private jackpotMode = false;

  start() {
    const { stage, cfg } = this.ctx;
    this.syms = cfg.symbols as Sym[];
    this.bets = cfg.betOptions as number[];
    this.betIdx = Math.max(0, this.bets.findIndex(b => b <= this.ctx.player.balance));
    this.frames = this.syms.map((s, i) => this.symbolFrame(s, i));
    // opening grid: random but stable
    this.grid = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => Math.floor(Math.random() * this.syms.length)));

    this.buildMachine(stage);
    this.buildControls(stage);
    this.refreshBet();
    this.chaseLights();
    const m = stage.getChildByName('machine')!;
    m.setScale(0.75, 0.75, 1);
    tween(m).to(0.7, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
  }

  // ------------------------------------------------------------ symbol art
  private symbolFrame(s: Sym, idx: number) {
    const im = s.image ? imageSync(s.image) : null;
    const size = C - 14;
    return cached(`sym:${idx}:${s.label}:${s.color}:${s.image || ''}`, size, size, (g, w, h) => {
      // glass tile
      g.fillStyle = vgrad(g, 0, h, [[0, 'rgba(255,255,255,.16)'], [1, 'rgba(255,255,255,.04)']]);
      rr(g, 3, 3, w - 6, h - 6, 24); g.fill();
      g.fillStyle = radial(g, w / 2, h / 2, 6, w * 0.55, [[0, hexA(s.color, 0.55)], [1, hexA(s.color, 0)]]);
      g.fillRect(0, 0, w, h);
      g.save(); g.translate(w / 2, h / 2);
      if (im) drawImageFit(g, im, -w * 0.38, -h * 0.38, w * 0.76, h * 0.76, 'contain');
      else drawSymbol(g, s, w * 0.36);
      g.restore();
    });
  }

  // ----------------------------------------------------------- machine UI
  private buildMachine(stage: Node) {
    const { theme } = this.ctx;
    const machine = mk('machine', stage, 0, WIN_Y);
    const W = C * 3 + GAP * 2, H = C * 3;
    const BW = W + 96, BH = H + 96;
    sprite(machine, Tex.glow(), BW * 1.7, BH * 1.5, 0, 0, hex(theme.primary), 'halo');
    // body
    sprite(machine, cached(`mbody:${theme.secondary}:${theme.primary}:${theme.background}`, BW, BH, (g) => {
      g.fillStyle = 'rgba(0,0,0,.45)'; rr(g, 8, 18, BW - 16, BH - 16, 48); g.fill();
      const gr = g.createLinearGradient(0, 0, BW, BH);
      gr.addColorStop(0, shade(theme.secondary, 0.55)); gr.addColorStop(0.5, theme.secondary); gr.addColorStop(1, shade(theme.secondary, -0.5));
      g.fillStyle = gr; rr(g, 4, 4, BW - 8, BH - 8, 48); g.fill();
      g.strokeStyle = shade(theme.secondary, -0.6); g.lineWidth = 4; g.stroke();
      g.fillStyle = vgrad(g, 0, BH, [[0, shade(theme.primary, -0.1)], [1, shade(theme.primary, -0.65)]]);
      rr(g, 30, 30, BW - 60, BH - 60, 34); g.fill();
      g.strokeStyle = shade(theme.secondary, 0.3); g.lineWidth = 3; g.stroke();
      // recessed window
      g.fillStyle = '#0a0612'; rr(g, (BW - W) / 2 - 10, (BH - H) / 2 - 10, W + 20, H + 20, 20); g.fill();
    }), BW, BH, 0, 0, undefined, 'body');

    // reel window with mask
    const win = mk('window', machine, 0, 0, W, H);
    win.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    sprite(win, cached(`wbg`, W, H, (g, w, h) => {
      g.fillStyle = vgrad(g, 0, h, [[0, '#f5f0ff'], [0.5, '#ffffff'], [1, '#d9d2ee']]); g.fillRect(0, 0, w, h);
    }, 1), W, H, 0, 0, new Color(40, 30, 60, 255), 'wbg');
    for (let i = 0; i < 3; i++) {
      const rn = mk('reel' + i, win, cellX(i), 0, C, H);
      sprite(rn, cached('rbg', C, H, (g, w, h) => { g.fillStyle = vgrad(g, 0, h, [[0, '#2a1d44'], [0.5, '#1a1230'], [1, '#2a1d44']]); g.fillRect(0, 0, w, h); }, 1), C, H, 0, 0, undefined, 'rbg');
      const strip = mk('strip', rn, 0, 0);
      this.reels.push({ node: rn, strip });
      this.layoutStrip(i, this.grid[i]);
    }
    // glass overlay: depth shading + separators + gloss
    sprite(win, cached(`wover:${C}`, W, H, (g, w, h) => {
      g.fillStyle = vgrad(g, 0, h, [[0, 'rgba(0,0,0,.7)'], [0.22, 'rgba(0,0,0,0)'], [0.78, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.7)']]); g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,215,120,.55)';
      for (let i = 1; i < 3; i++) g.fillRect(i * (C + GAP) - GAP / 2 - 3, 0, 6, h);
      g.fillStyle = vgrad(g, 0, h * 0.5, [[0, 'rgba(255,255,255,.22)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, w, h * 0.45);
    }), W, H, 0, 0, undefined, 'glass');

    // win lines + cell highlights live above the mask
    this.overlay = mk('overlay', machine, 0, 0);

    // marquee bulbs
    const n = 30, perim = 2 * (BW - 70 + BH - 70);
    for (let i = 0; i < n; i++) {
      const p = this.perimPoint(i / n, BW - 54, BH - 54);
      const b = sprite(machine, Tex.dot(), 14, 14, p[0], p[1], Color.WHITE, 'bulb');
      sprite(b, Tex.glow(), 38, 38, 0, 0, hex('#fff3b0'), 'bglow');
      this.bulbs.push(b);
    }
    void perim;

    // top plaque
    const maxM = Math.max(...this.syms.map(s => s.multiplier));
    const plaque = mk('plaque', machine, 0, BH / 2 + 8, 440, 84);
    sprite(plaque, cached(`plaque:${theme.secondary}:${theme.primary}`, 440, 84, (g, w, h) => {
      g.fillStyle = 'rgba(0,0,0,.4)'; rr(g, 6, 12, w - 12, h - 12, 28); g.fill();
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, shade(theme.secondary, 0.5)); gr.addColorStop(1, shade(theme.secondary, -0.35));
      g.fillStyle = gr; rr(g, 4, 4, w - 8, h - 20, 28); g.fill(); g.strokeStyle = shade(theme.secondary, -0.6); g.lineWidth = 3; g.stroke();
      g.fillStyle = vgrad(g, 10, h, [[0, shade(theme.primary, -0.2)], [1, shade(theme.primary, -0.6)]]); rr(g, 14, 14, w - 28, h - 40, 20); g.fill();
    }), 440, 84, 0, 0);
    label(plaque, `JACKPOT  ${fmtNum(maxM)}x`, 38, theme.secondary, { y: 3, outline: { c: '#000000aa', w: 5 } });
  }

  private perimPoint(t: number, w: number, h: number): [number, number] {
    // point on a rectangle perimeter, t in [0,1), clockwise from top-left
    const per = 2 * (w + h); let d = t * per;
    const x0 = -w / 2, y0 = h / 2;
    if (d < w) return [x0 + d, y0];
    d -= w; if (d < h) return [x0 + w, y0 - d];
    d -= h; if (d < w) return [x0 + w - d, y0 - h];
    d -= w; return [x0, y0 - h + d];
  }

  private layoutStrip(reelIdx: number, rows: number[], travel?: number[]) {
    const { strip } = this.reels[reelIdx];
    strip.removeAllChildren();
    strip.setPosition(0, 0, 0);
    // item t=0..2 are bottom, mid, top row; extra items above
    const items: number[] = [rows[2], rows[1], rows[0]];
    if (travel) items.push(...travel);
    items.forEach((symIdx, t) => {
      const sp = sprite(strip, this.frames[symIdx], C - 14, C - 14, 0, t * C - C, undefined, 's');
      void sp;
    });
  }

  private buildControls(stage: Node) {
    const { theme } = this.ctx;
    // bet stepper
    const minus = new Button(stage, { text: '–', w: 96, h: 80, x: -250, y: -352, c0: '#6b7280', c1: '#1f2937', size: 54, onClick: () => this.stepBet(-1) });
    const plus = new Button(stage, { text: '+', w: 96, h: 80, x: 250, y: -352, c0: '#6b7280', c1: '#1f2937', size: 54, onClick: () => this.stepBet(1) });
    void minus; void plus;
    const bp = mk('betpanel', stage, 0, -352, 360, 96);
    sprite(bp, panelFrame(360, 96, '#000000', theme.secondary, 30, 0.5), 360, 96);
    label(bp, 'TOTAL BET', 18, theme.secondary, { y: 28 });
    this.betLabel = label(bp, '0', 46, '#ffffff', { y: -10, outline: { c: '#000000aa', w: 4 } });

    // last win
    const wp = mk('winpanel', stage, 0, -262, 360, 54);
    sprite(wp, panelFrame(360, 54, '#000000', 'rgba(255,255,255,0.25)', 27, 0.4), 360, 54);
    label(wp, 'WIN', 20, theme.secondary, { x: -140, align: 'left' });
    this.winLabel = label(wp, '0', 34, '#ffffff', { x: 150, align: 'right', outline: { c: '#000000aa', w: 4 } });
    sprite(wp, Tex.coin(theme.secondary), 30, 30, -80, 0);

    this.spinBtn = new Button(stage, {
      text: 'SPIN', w: 460, h: 104, x: 0, y: -462, c0: shade(theme.secondary, 0.25), c1: shade(theme.secondary, -0.25), textColor: '#2a1300', size: 52,
      onClick: () => this.spin(),
    });
    this.spinBtn.pulse(true);
    label(stage, '5 paylines • 3 in a row wins', 22, theme.text, { y: -546, bold: false, shadow: { c: '#00000088', dx: 0, dy: -2 } });
  }

  private get bet() { return this.bets[this.betIdx]; }
  private stepBet(d: number) {
    if (this.busy) return;
    this.betIdx = Math.max(0, Math.min(this.bets.length - 1, this.betIdx + d));
    this.refreshBet();
  }
  private refreshBet() {
    this.betLabel.string = fmtNum(this.bet);
    this.betLabel.node.setScale(1.2, 1.2, 1);
    tween(this.betLabel.node).to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
  }

  private chaseLights() {
    const { theme } = this.ctx;
    const step = () => {
      this.tickN++;
      const fast = this.busy || this.jackpotMode;
      this.bulbs.forEach((b, i) => {
        const on = fast ? (i + this.tickN) % 3 === 0 : (i + Math.floor(this.tickN / 2)) % 2 === 0;
        b.getChildByName('bglow')!.active = on;
        b.getComponent(Sprite)!.color = on ? hex(this.jackpotMode ? '#ffffff' : theme.secondary) : hex(shade(theme.secondary, -0.55));
      });
    };
    tween(this.ctx.stage).repeatForever(tween().delay(0.22).call(step)).start();
  }

  // ----------------------------------------------------------------- spin
  private async spin() {
    if (this.busy) return;
    const { api, hud } = this.ctx;
    const bet = this.bet;
    if (hud.balance < bet) { hud.promptRefill(); return; }
    this.busy = true; this.spinBtn.setEnabled(false); this.spinBtn.pulse(false);
    this.clearWin();
    let res;
    try { res = await api.slots(bet); }
    catch (e) { this.busy = false; this.spinBtn.setEnabled(true); this.spinBtn.pulse(true); hud.handleError(e); return; }
    const result = res.result as { grid: number[][]; lines: LineWin[]; win: number; jackpot: boolean };
    hud.setBalance(hud.balance - bet);
    this.winLabel.string = '0';
    Sfx.whoosh();

    await Promise.all(this.reels.map((_, i) => this.spinReel(i, result.grid[i])));
    this.grid = result.grid;

    await this.showWins(result, bet, res.balance);
    emit('round', { game: 'lucky-77', bet, win: result.win, jackpot: result.jackpot, lines: result.lines.length, balance: res.balance });
    this.busy = false; this.spinBtn.setEnabled(true); this.spinBtn.pulse(true);
  }

  private async spinReel(i: number, rows: number[]) {
    await wait(i * 0.12);
    const extra = 14 + i * 7;                                   // symbols to travel past
    const travel: number[] = [];
    for (let k = 0; k < extra; k++) travel.push(Math.floor(Math.random() * this.syms.length));
    // final three on top of the travel list: bottom, mid, top
    travel.push(rows[2], rows[1], rows[0]);
    travel.push(Math.floor(Math.random() * this.syms.length)); // headroom for the bounce
    this.layoutStrip(i, this.grid[i], travel);
    const { strip } = this.reels[i];
    const L = 3 + travel.length - 1;                            // items excluding headroom
    const dist = (L - 3) * C;
    const dur = 1.35 + i * 0.5;
    let lastCell = 0;
    await animate(dur, 'linear', t => {
      strip.setPosition(0, -dist * easeSpin(t), 0);
      const cell = Math.floor((dist * easeSpin(t)) / C);
      if (i === 0 && cell !== lastCell) { lastCell = cell; if (cell % 2 === 0) Sfx.tick(); }
    });
    // little bounce at the stop
    await animate(0.12, 'sineOut', t => strip.setPosition(0, -dist - 22 * t, 0));
    Sfx.reelStop();
    await animate(0.16, 'backOut', t => strip.setPosition(0, -dist - 22 * (1 - t), 0));
    this.layoutStrip(i, rows);
    this.ctx.fx.burst({ x: cellX(i), y: WIN_Y - C * 1.5 + 4, count: 5, shape: 'spark', colors: ['#ffffff'], speed: [30, 120], angle: [60, 120], gravity: 0, life: [0.25, 0.45], size: [0.5, 0.9] });
  }

  private clearWin() {
    this.overlay.removeAllChildren();
    this.jackpotMode = false;
  }

  private async showWins(result: { grid: number[][]; lines: LineWin[]; win: number; jackpot: boolean }, bet: number, finalBalance: number) {
    const { hud, fx, theme, uiLayer } = this.ctx;
    if (result.win <= 0) {
      Sfx.lose();
      hud.setBalance(finalBalance);
      await wait(0.25);
      return;
    }
    // highlight winning cells + lines
    const g = mk('lines', this.overlay).addComponent(Graphics);
    g.lineCap = Graphics.LineCap.ROUND; g.lineJoin = Graphics.LineJoin.ROUND;
    const cellsDone = new Set<string>();
    result.lines.forEach(lw => {
      const row = PAYLINES[lw.line];
      const col = LINE_COLORS[lw.line % LINE_COLORS.length];
      const pts = row.map((r, reel) => [cellX(reel), cellY(r)] as [number, number]);
      g.lineWidth = 18; g.strokeColor = hex(col, 70);
      g.moveTo(pts[0][0] - C * 0.5, pts[0][1]); pts.forEach(p => g.lineTo(p[0], p[1])); g.lineTo(pts[2][0] + C * 0.5, pts[2][1]); g.stroke();
      g.lineWidth = 6; g.strokeColor = hex(col, 255);
      g.moveTo(pts[0][0] - C * 0.5, pts[0][1]); pts.forEach(p => g.lineTo(p[0], p[1])); g.lineTo(pts[2][0] + C * 0.5, pts[2][1]); g.stroke();
      pts.forEach(([x, y]) => {
        const key = `${x},${y}`;
        if (cellsDone.has(key)) return; cellsDone.add(key);
        const hl = sprite(this.overlay, panelFrame(C - 6, C - 6, '#ffffff', col, 26, 0.12), C - 6, C - 6, x, y, undefined, 'hl');
        const op = ensureOpacity(hl);
        tween(op).repeatForever(tween().to(0.35, { opacity: 90 }).to(0.35, { opacity: 255 })).start();
        const win = sprite(this.overlay, Tex.glow(), C * 1.5, C * 1.5, x, y, hex(col), 'cg');
        ensureOpacity(win).opacity = 140;
        fx.burst({ x, y: y + WIN_Y, count: 8, shape: 'star', colors: [col, '#ffffff'], speed: [80, 260], gravity: 100, life: [0.6, 1.0] });
      });
    });
    const maxM = Math.max(...this.syms.map(s => s.multiplier));
    const jackpot = result.jackpot || result.lines.some(l => this.syms[l.symbol].multiplier >= maxM);
    const level = jackpot ? 3 : result.win >= bet * 5 ? 2 : 1;
    this.jackpotMode = jackpot;
    jackpot ? Sfx.jackpot() : Sfx.win(level);
    const colors = [theme.secondary, '#ffffff', '#f43f5e', '#22d3ee', theme.primary];
    fx.burst({ x: 0, y: WIN_Y + 60, count: 26 + level * 22, shape: 'coin', speed: [350, 850], angle: [55, 125], gravity: 1400, life: [1.2, 2.0] });
    fx.burst({ x: 0, y: WIN_Y + 60, count: 30 + level * 25, shape: 'confetti', colors, speed: [350, 900], angle: [45, 135], gravity: 1100, life: [1.4, 2.4] });
    if (level >= 2) fx.rain({ width: 700, top: 640, count: 50 + level * 25, shape: 'confetti', colors, duration: 2.4 });
    if (jackpot) { fx.rain({ width: 700, top: 640, count: 30, shape: 'coin', duration: 3 }); this.shake(); }
    hud.setBalance(finalBalance);
    void countTo(this.winLabel, 0, result.win, Math.min(1.8, 0.7 + result.win / 3000), fmtNum);

    if (level >= 2) {
      const card = mk('win', uiLayer, 0, 40, 620, 340);
      sprite(card, Tex.rect(), 3000, 3000, 0, -40, new Color(0, 0, 0, 120), 'dim');
      sprite(card, panelFrame(620, 340, '#14122b', theme.secondary, 40, 0.96), 620, 340);
      glowRing(card, 740, theme.secondary);
      label(card, jackpot ? 'JACKPOT!' : 'BIG WIN!', jackpot ? 80 : 66, theme.secondary, { y: 104, outline: { c: shade(theme.secondary, -0.6), w: 6 } });
      const amt = label(card, '0', 96, '#ffffff', { y: -10, outline: { c: '#000000aa', w: 6 } });
      label(card, `${result.lines.length} winning line${result.lines.length > 1 ? 's' : ''}`, 28, '#e5e7eb', { y: -100, bold: false });
      popIn(card, 0.5, 0.4);
      await countTo(amt, 0, result.win, Math.min(2, 0.8 + result.win / 3000), fmtNum);
      await wait(jackpot ? 2.6 : 1.6);
      const op = ensureOpacity(card);
      await new Promise<void>(res => { tween(op).to(0.3, { opacity: 0 }).call(() => res()).start(); });
      card.destroy();
    } else {
      await wait(1.4);
    }
    this.jackpotMode = false;
  }

  private shake() {
    const s = this.ctx.stage;
    const p = s.position.clone();
    tween(s).to(0.04, { position: new Vec3(p.x - 14, p.y + 7, 0) }).to(0.04, { position: new Vec3(p.x + 14, p.y - 7, 0) }).to(0.04, { position: new Vec3(p.x - 9, p.y + 5, 0) })
      .to(0.04, { position: new Vec3(p.x + 9, p.y - 5, 0) }).to(0.06, { position: p }).start();
  }
}

// kick off quickly, then decelerate progressively into the stop
function easeSpin(t: number): number {
  const s = 1 - Math.pow(1 - t, 3.2);
  const k = Math.min(1, t / 0.1);
  return s * (k * k * (3 - 2 * k));
}

function hexA(c: string, a: number) {
  const col = hex(c);
  return `rgba(${col.r},${col.g},${col.b},${a})`;
}

// ---------- default symbol artwork (drawn at runtime, coloured from config) ----------
function drawSymbol(g: CanvasRenderingContext2D, s: Sym, r: number) {
  const key = s.label.trim().toLowerCase();
  g.lineJoin = 'round';
  if (key === '7' || key === 'seven') {
    g.font = `900 ${r * 2.2}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = r * 0.22; g.strokeStyle = '#7f1d1d'; g.strokeText('7', 0, r * 0.08);
    g.lineWidth = r * 0.1; g.strokeStyle = '#fde68a'; g.strokeText('7', 0, r * 0.08);
    g.fillStyle = vgrad(g, -r, r, [[0, '#ff8a8a'], [0.5, s.color], [1, '#991b1b']]); g.fillText('7', 0, r * 0.08);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(-r * 0.15, -r * 0.55, r * 0.5, r * 0.12, -0.2, 0, 7); g.fill();
  } else if (key === 'diamond' || key === 'gem') {
    const pts = [[-0.9, -0.3], [-0.5, -0.8], [0.5, -0.8], [0.9, -0.3], [0, 0.95]];
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * r, y * r) : g.moveTo(x * r, y * r))); g.closePath();
    g.fillStyle = vgrad(g, -r, r, [[0, '#e0f7ff'], [0.45, s.color], [1, '#0c4a6e']]); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = r * 0.07; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = r * 0.04;
    g.beginPath(); g.moveTo(-0.9 * r, -0.3 * r); g.lineTo(0.9 * r, -0.3 * r); g.moveTo(-0.5 * r, -0.8 * r); g.lineTo(-0.2 * r, -0.3 * r); g.lineTo(0, 0.95 * r); g.moveTo(0.5 * r, -0.8 * r); g.lineTo(0.2 * r, -0.3 * r); g.lineTo(0, 0.95 * r); g.moveTo(-0.2 * r, -0.3 * r); g.lineTo(0, -0.8 * r); g.lineTo(0.2 * r, -0.3 * r); g.stroke();
  } else if (key === 'bar') {
    g.fillStyle = vgrad(g, -r * 0.6, r * 0.6, [[0, '#3f3f46'], [1, '#09090b']]); rr(g, -r * 1.0, -r * 0.62, r * 2, r * 1.24, r * 0.2); g.fill();
    g.strokeStyle = '#fbbf24'; g.lineWidth = r * 0.1; g.stroke();
    g.font = `900 ${r * 0.95}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = vgrad(g, -r * 0.4, r * 0.4, [[0, '#ffffff'], [1, '#a3a3a3']]); g.fillText('BAR', 0, r * 0.05);
  } else if (key === 'bell') {
    g.fillStyle = vgrad(g, -r, r, [[0, '#fff3b0'], [0.5, s.color], [1, '#a16207']]);
    g.beginPath(); g.moveTo(0, -r * 0.95); g.bezierCurveTo(r * 0.5, -r * 0.95, r * 0.55, -r * 0.3, r * 0.65, r * 0.25); g.bezierCurveTo(r * 0.75, r * 0.5, r * 0.95, r * 0.55, r * 0.95, r * 0.7);
    g.lineTo(-r * 0.95, r * 0.7); g.bezierCurveTo(-r * 0.95, r * 0.55, -r * 0.75, r * 0.5, -r * 0.65, r * 0.25); g.bezierCurveTo(-r * 0.55, -r * 0.3, -r * 0.5, -r * 0.95, 0, -r * 0.95); g.fill();
    g.strokeStyle = '#854d0e'; g.lineWidth = r * 0.06; g.stroke();
    g.fillStyle = '#92400e'; g.beginPath(); g.arc(0, r * 0.88, r * 0.22, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(-r * 0.25, -r * 0.3, r * 0.1, r * 0.35, 0.2, 0, 7); g.fill();
  } else if (key === 'cherry' || key === 'cherries') {
    g.strokeStyle = '#166534'; g.lineWidth = r * 0.1; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-r * 0.45, r * 0.25); g.quadraticCurveTo(-r * 0.2, -r * 0.7, r * 0.15, -r * 0.95); g.moveTo(r * 0.5, r * 0.3); g.quadraticCurveTo(r * 0.35, -r * 0.6, r * 0.15, -r * 0.95); g.stroke();
    g.fillStyle = '#16a34a'; g.beginPath(); g.ellipse(r * 0.4, -r * 0.85, r * 0.38, r * 0.17, -0.25, 0, 7); g.fill();
    [[-0.45, 0.35], [0.5, 0.4]].forEach(([x, y]) => {
      g.fillStyle = radial(g, x * r - r * 0.15, y * r - r * 0.2, r * 0.05, r * 0.5, [[0, '#fecaca'], [0.35, s.color], [1, '#7f1d1d']]);
      g.beginPath(); g.arc(x * r, y * r, r * 0.46, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(x * r - r * 0.15, y * r - r * 0.2, r * 0.1, r * 0.06, -0.6, 0, 7); g.fill();
    });
  } else if (key === 'lemon') {
    g.save(); g.rotate(-0.4);
    g.fillStyle = radial(g, -r * 0.2, -r * 0.25, r * 0.1, r, [[0, '#fff9c4'], [0.5, s.color], [1, '#a16207']]);
    g.beginPath(); g.ellipse(0, 0, r * 0.95, r * 0.68, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(-r * 0.95, 0, r * 0.12, r * 0.1, 0, 0, 7); g.ellipse(r * 0.95, 0, r * 0.12, r * 0.1, 0, 0, 7); g.fill();
    g.strokeStyle = '#a16207'; g.lineWidth = r * 0.05; g.beginPath(); g.ellipse(0, 0, r * 0.95, r * 0.68, 0, 0, 7); g.stroke();
    g.restore();
    g.fillStyle = '#22c55e'; g.beginPath(); g.ellipse(r * 0.55, -r * 0.72, r * 0.38, r * 0.16, -0.7, 0, 7); g.fill();
  } else {
    // generic custom symbol: coloured medallion with its label
    g.fillStyle = radial(g, -r * 0.2, -r * 0.3, r * 0.1, r * 1.05, [[0, shade(s.color, 0.55)], [0.5, s.color], [1, shade(s.color, -0.5)]]);
    g.beginPath(); g.arc(0, 0, r * 0.95, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = r * 0.08; g.stroke();
    let fs = r * 0.85; g.font = `900 ${fs}px ${FONT}`;
    while (g.measureText(s.label).width > r * 1.55 && fs > 12) { fs -= 2; g.font = `900 ${fs}px ${FONT}`; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = fs * 0.18; g.strokeStyle = 'rgba(0,0,0,.5)';
    g.strokeText(s.label, 0, 2); g.fillStyle = '#fff'; g.fillText(s.label, 0, 2);
  }
}
void star; void pick; void rand; void UITransform; void Tween;
