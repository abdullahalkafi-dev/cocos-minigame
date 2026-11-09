import { Node, Sprite, SpriteFrame, tween, Vec3, Tween, Color, UITransform, Label } from 'cc';
import { Game } from '../core/GameBase';
import { cached, makeFrame, panelFrame, radial, rr, sprite, star, Tex, vgrad } from '../core/Art';
import { animate, ensureOpacity, fmtNum, hex, lerp, mk, popIn, rand, secureInt, shade, wait } from '../core/Util';
import { Button, glowRing, label, showModal } from '../core/Widgets';
import { Sfx } from '../core/Sfx';
import { emit } from '../core/Host';
import {
  Color as LColor, ORDER, TRACK, HOME_COL, SAFE, START_IDX, YARD_SPOTS, HOME, YARD, Tok, Move, BotLevel,
  gridPos, legalMoves, applyMove, newTokens, pickMove, isFinished,
} from './ludoRules';

const CELL = 40;
const BY = 52;                    // board centre y
const BS = CELL * 15;             // board size (600)
const gx = (c: number) => (c - 7) * CELL;
const gy = (r: number) => BY + (7 - r) * CELL;
const HUMAN: LColor = 'blue';
const BOT_NAMES: Record<LColor, string> = { red: 'Riya', green: 'Gus', yellow: 'Yuki', blue: 'You' };
const YARD_ORIGIN: Record<LColor, [number, number]> = { red: [0, 0], green: [9, 0], yellow: [9, 9], blue: [0, 9] };
const CHIP_POS: Record<LColor, [number, number]> = { red: [-190, 412], green: [190, 412], yellow: [190, -296], blue: [-190, -296] };

interface Chip { node: Node; glow: Node; dots: Node[] }

export class Ludo extends Game {
  private colors!: Record<LColor, string>;
  private level: BotLevel = 'normal';
  private fee = 0;
  private toks: Tok[] = newTokens();
  private nodes = new Map<Tok, Node>();
  private tokenLayer!: Node;
  private boardNode!: Node;
  private chips = {} as Record<LColor, Chip>;
  private yardGlow = {} as Record<LColor, Node>;
  private dice!: Node;
  private diceSprite!: Sprite;
  private diceRing!: Node;
  private status!: Label;
  private playBtn!: Button;
  private active = false;
  private diceTap: (() => void) | null = null;
  private pickTap: ((t: Tok) => void) | null = null;
  private selectable = new Set<Tok>();
  private matchId = '';
  private finished: LColor[] = [];
  private current: LColor = HUMAN;
  /** test hook (only reachable with ?debug=1): let the bot logic also play the human seat */
  auto = false;

  start() {
    const { stage, cfg } = this.ctx;
    if (new URLSearchParams(location.search).has('debug')) (window as any).__game = this;
    this.colors = cfg.colors as Record<LColor, string>;
    this.level = (cfg.botLevel as BotLevel) || 'normal';
    this.fee = Number(cfg.entryFee) || 0;
    this.buildBoard(stage);
    this.buildChips(stage);
    this.buildDice(stage);
    this.status = label(stage, '', 28, '#ffffff', { y: -492, w: 640, h: 40, outline: { c: '#000000aa', w: 4 } });
    this.playBtn = new Button(stage, {
      text: this.fee > 0 ? `PLAY  •  ${fmtNum(this.fee)} ${cfg.currencyName}` : 'PLAY', w: 480, h: 100, x: 0, y: -402,
      c0: shade(this.ctx.theme.secondary, 0.25), c1: shade(this.ctx.theme.secondary, -0.25), textColor: '#2a1300', size: 40,
      onClick: () => this.beginMatch(),
    });
    this.playBtn.pulse(true);
    this.dice.active = false;
    this.say(`Win 1st place to take x${cfg.firstMultiplier} your entry`);
    this.layoutTokens(false);
    const b = this.boardNode;
    b.setScale(0.8, 0.8, 1);
    tween(b).to(0.6, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
  }

  // ---------------------------------------------------------------- board
  private buildBoard(stage: Node) {
    const { theme } = this.ctx;
    const c = this.colors;
    this.boardNode = mk('board', stage, 0, 0);
    sprite(this.boardNode, Tex.glow(), BS * 1.5, BS * 1.5, 0, BY, hex(theme.primary), 'halo');
    sprite(this.boardNode, this.boardFrame(), BS + 24, BS + 24, 0, BY, undefined, 'board');
    // yard glow (shows whose turn it is)
    ORDER.forEach(col => {
      const [x0, y0] = YARD_ORIGIN[col];
      const n = sprite(this.boardNode, Tex.glow(), CELL * 8, CELL * 8, gx(x0 + 2.5), gy(y0 + 2.5), hex(c[col]), 'yglow');
      n.active = false;
      this.yardGlow[col] = n;
    });
    this.tokenLayer = mk('tokens', this.boardNode, 0, 0);
    ORDER.forEach(col => this.toks.filter(t => t.color === col).forEach(t => this.nodes.set(t, this.makeToken(t))));
  }

  private boardFrame(): SpriteFrame {
    const c = this.colors, cs = CELL, pad = 12;
    const key = 'ludoboard:' + ORDER.map(k => c[k]).join(',');
    return cached(key, BS + pad * 2, BS + pad * 2, (g) => {
      g.translate(pad, pad);
      g.fillStyle = 'rgba(0,0,0,.4)'; rr(g, 4, 10, BS, BS, 30); g.fill();
      g.fillStyle = '#f7f2e8'; rr(g, 0, 0, BS, BS, 30); g.fill();
      g.strokeStyle = '#2b2140'; g.lineWidth = 6; g.stroke();
      // yards
      ORDER.forEach(col => {
        const [x0, y0] = YARD_ORIGIN[col];
        g.fillStyle = vgrad(g, y0 * cs, (y0 + 6) * cs, [[0, shade(c[col], 0.12)], [1, shade(c[col], -0.25)]]);
        rr(g, x0 * cs + 3, y0 * cs + 3, 6 * cs - 6, 6 * cs - 6, 22); g.fill();
        g.fillStyle = 'rgba(255,255,255,.92)'; rr(g, (x0 + 1) * cs, (y0 + 1) * cs, 4 * cs, 4 * cs, 20); g.fill();
        YARD_SPOTS[col].forEach(([sx, sy]) => {
          g.fillStyle = radial(g, (sx + 0.5) * cs, (sy + 0.5) * cs, 2, cs * 0.62, [[0, shade(c[col], 0.5)], [1, c[col]]]);
          g.beginPath(); g.arc((sx + 0.5) * cs, (sy + 0.5) * cs, cs * 0.6, 0, 7); g.fill();
          g.strokeStyle = shade(c[col], -0.35); g.lineWidth = 3; g.stroke();
        });
      });
      const cell = (col: number, row: number, fill: string) => {
        g.fillStyle = fill; g.fillRect(col * cs + 1.5, row * cs + 1.5, cs - 3, cs - 3);
        g.strokeStyle = 'rgba(60,40,90,.28)'; g.lineWidth = 1.5; g.strokeRect(col * cs + 1.5, row * cs + 1.5, cs - 3, cs - 3);
      };
      TRACK.forEach(([col, row]) => cell(col, row, '#fffdf8'));
      ORDER.forEach(k => HOME_COL[k].forEach(([col, row]) => cell(col, row, shade(c[k], 0.38))));
      ORDER.forEach(k => { const [col, row] = TRACK[START_IDX[k]]; cell(col, row, c[k]); });
      // stars on safe cells
      SAFE.forEach(i => {
        const [col, row] = TRACK[i];
        const isStart = ORDER.some(k => START_IDX[k] === i);
        g.fillStyle = isStart ? 'rgba(255,255,255,.9)' : 'rgba(110,90,150,.6)';
        star(g, col * cs + cs / 2, row * cs + cs / 2 + 1, cs * 0.3, 5, 0.5); g.fill();
      });
      // centre
      const tri = (pts: number[][], fill: string) => {
        g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * cs, y * cs) : g.moveTo(x * cs, y * cs))); g.closePath();
        g.fillStyle = fill; g.fill(); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.stroke();
      };
      tri([[6, 6], [6, 9], [7.5, 7.5]], c.red);
      tri([[6, 6], [9, 6], [7.5, 7.5]], c.green);
      tri([[9, 6], [9, 9], [7.5, 7.5]], c.yellow);
      tri([[6, 9], [9, 9], [7.5, 7.5]], c.blue);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(7.5 * cs, 7.5 * cs, 6, 0, 7); g.fill();
    });
  }

  // --------------------------------------------------------------- tokens
  private pawnFrame(col: LColor): SpriteFrame {
    const c = this.colors[col];
    return cached(`pawn:${c}`, 46, 56, (g) => {
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(23, 50, 17, 5.5, 0, 0, 7); g.fill();
      g.fillStyle = vgrad(g, 20, 50, [[0, shade(c, 0.1)], [1, shade(c, -0.45)]]);
      g.beginPath(); g.moveTo(8, 48); g.quadraticCurveTo(8, 38, 15, 28); g.lineTo(31, 28); g.quadraticCurveTo(38, 38, 38, 48); g.closePath(); g.fill();
      g.strokeStyle = shade(c, -0.6); g.lineWidth = 2; g.stroke();
      g.fillStyle = radial(g, 18, 14, 2, 17, [[0, shade(c, 0.7)], [0.45, c], [1, shade(c, -0.45)]]);
      g.beginPath(); g.arc(23, 19, 14, 0, 7); g.fill(); g.strokeStyle = shade(c, -0.6); g.lineWidth = 2; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2.5; g.beginPath(); g.arc(23, 19, 10.5, 0.2, Math.PI * 1.5); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(17, 12, 5, 3, -0.6, 0, 7); g.fill();
    });
  }
  private makeToken(t: Tok): Node {
    const n = mk(`tok-${t.color}-${t.id}`, this.tokenLayer, 0, 0, 46, 46);
    const ring = sprite(n, Tex.glow(), 100, 100, 0, 4, Color.WHITE, 'ring');
    ring.active = false;
    sprite(n, this.pawnFrame(t.color), 46, 56, 0, 12, undefined, 'pawn');
    const [px, py] = gridPos(t.color, t.p, t.id);
    n.setPosition(gx(px), gy(py), 0);
    n.on(Node.EventType.TOUCH_END, () => { if (this.pickTap && this.selectable.has(t)) this.pickTap(t); });
    return n;
  }

  private tokenTarget(t: Tok, group: Tok[], i: number): [number, number, number] {
    const [px, py] = gridPos(t.color, t.p, t.id);
    let ox = 0, oy = 0, sc = 1;
    if (group.length > 1 && t.p >= 0 && t.p < HOME) {
      const n = group.length; sc = n > 2 ? 0.72 : 0.82;
      const offs = n === 2 ? [[-9, 0], [9, 0]] : n === 3 ? [[-10, -6], [10, -6], [0, 9]] : [[-10, -8], [10, -8], [-10, 8], [10, 8]];
      [ox, oy] = offs[i % offs.length];
    }
    return [gx(px) + ox, gy(py) + oy, sc];
  }
  /** Place all tokens on their cells, spreading tokens that share a cell. */
  private layoutTokens(animatedMove: boolean) {
    const groups = new Map<string, Tok[]>();
    this.toks.forEach(t => { const [px, py] = gridPos(t.color, t.p, t.id); const k = `${px.toFixed(2)},${py.toFixed(2)}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(t); });
    const targets: { t: Tok; x: number; y: number; s: number }[] = [];
    groups.forEach(g => g.forEach((t, i) => { const [x, y, s] = this.tokenTarget(t, g, i); targets.push({ t, x, y, s }); }));
    targets.forEach(({ t, x, y, s }) => {
      const n = this.nodes.get(t)!;
      if (!animatedMove) { n.setPosition(x, y, 0); n.setScale(s, s, 1); return; }
      const p0 = n.position.clone(), s0 = n.scale.x;
      void animate(0.18, 'sineOut', k => { if (n.isValid) { n.setPosition(lerp(p0.x, x, k), lerp(p0.y, y, k), 0); n.setScale(lerp(s0, s, k), lerp(s0, s, k), 1); } });
    });
    this.sortZ(targets.map(x => ({ n: this.nodes.get(x.t)!, y: x.y })));
  }
  private sortZ(list: { n: Node; y: number }[]) {
    list.sort((a, b) => b.y - a.y).forEach((e, i) => e.n.setSiblingIndex(i));
  }

  // ---------------------------------------------------------------- chips
  private buildChips(stage: Node) {
    const { theme } = this.ctx;
    ORDER.forEach(col => {
      const [x, y] = CHIP_POS[col];
      const node = mk(`chip-${col}`, stage, x, y, 300, 66);
      const glow = glowRing(node, 380, this.colors[col], 0, 0); glow.active = false;
      sprite(node, panelFrame(300, 66, '#0b0818', this.colors[col], 33, 0.75), 300, 66);
      sprite(node, cached(`av:${this.colors[col]}`, 46, 46, (g, w, h) => {
        g.fillStyle = radial(g, 16, 14, 2, 24, [[0, shade(this.colors[col], 0.6)], [1, this.colors[col]]]); g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 1.5, 0, 7); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 3; g.stroke();
      }), 46, 46, -118, 0);
      label(node, BOT_NAMES[col][0], 24, '#ffffff', { x: -118, y: 1 });
      label(node, BOT_NAMES[col], 24, '#ffffff', { x: -86, y: 8, align: 'left' });
      label(node, col === HUMAN ? 'Player' : 'Bot', 14, '#b8b2d0', { x: -86, y: -14, align: 'left', bold: false });
      const dots: Node[] = [];
      for (let i = 0; i < 4; i++) {
        const d = sprite(node, Tex.dot(), 16, 16, 40 + i * 22, 0, hex('#ffffff'), 'dot');
        ensureOpacity(d).opacity = 70;
        dots.push(d);
      }
      this.chips[col] = { node, glow, dots };
    });
    void theme;
  }
  private updateChips() {
    ORDER.forEach(col => {
      const home = this.toks.filter(t => t.color === col && t.p === HOME).length;
      this.chips[col].dots.forEach((d, i) => {
        d.getComponent(Sprite)!.color = i < home ? hex(this.colors[col]) : Color.WHITE;
        ensureOpacity(d).opacity = i < home ? 255 : 70;
      });
    });
  }
  private setTurn(col: LColor | null) {
    ORDER.forEach(k => {
      const on = k === col;
      const ch = this.chips[k];
      ch.glow.active = on;
      Tween.stopAllByTarget(ch.node);
      tween(ch.node).to(0.2, { scale: on ? new Vec3(1.1, 1.1, 1) : new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
      ensureOpacity(ch.node).opacity = col === null || on ? 255 : 150;
      const yg = this.yardGlow[k]; yg.active = on;
      Tween.stopAllByTarget(ensureOpacity(yg));
      if (on) tween(ensureOpacity(yg)).repeatForever(tween().to(0.6, { opacity: 90 }).to(0.6, { opacity: 255 })).start();
    });
    if (col) this.diceRing.getComponent(Sprite)!.color = hex(this.colors[col]);
  }

  // ----------------------------------------------------------------- dice
  private diceFrame(n: number): SpriteFrame {
    return cached(`die:${n}`, 120, 120, (g) => {
      g.fillStyle = 'rgba(0,0,0,.4)'; rr(g, 12, 18, 96, 96, 22); g.fill();
      g.fillStyle = vgrad(g, 6, 108, [[0, '#ffffff'], [1, '#d9d4e8']]); rr(g, 10, 8, 100, 100, 22); g.fill();
      g.strokeStyle = '#9a90b8'; g.lineWidth = 3; g.stroke();
      const pos: Record<number, number[][]> = {
        1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
        5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
      };
      pos[n].forEach(([dx, dy]) => {
        g.fillStyle = radial(g, 58 + dx * 24 - 3, 58 + dy * 24 - 3, 1, 11, [[0, '#6b5b95'], [1, '#1b1030']]);
        g.beginPath(); g.arc(60 + dx * 24, 58 + dy * 24, 9.5, 0, 7); g.fill();
      });
    });
  }
  private buildDice(stage: Node) {
    this.dice = mk('dice', stage, 0, -396, 130, 130);
    this.diceRing = sprite(this.dice, Tex.glow(), 230, 230, 0, 0, hex(this.colors.blue), 'dring');
    this.diceSprite = sprite(this.dice, this.diceFrame(6), 120, 120, 0, 0, undefined, 'die').getComponent(Sprite)!;
    this.dice.on(Node.EventType.TOUCH_END, () => { if (this.diceTap) { Sfx.unlock(); const f = this.diceTap; this.diceTap = null; f(); } });
  }
  private async rollDice(value: number) {
    Sfx.dice();
    const d = this.diceSprite.node;
    Tween.stopAllByTarget(d);
    for (let i = 0; i < 9; i++) {
      this.diceSprite.spriteFrame = this.diceFrame(1 + Math.floor(Math.random() * 6));
      d.angle = rand(-25, 25);
      const y = Math.sin((i / 9) * Math.PI) * 26;
      d.setPosition(rand(-6, 6), y, 0);
      await wait(0.065);
    }
    this.diceSprite.spriteFrame = this.diceFrame(value);
    d.angle = 0; d.setPosition(0, 0, 0);
    d.setScale(1.3, 1.3, 1);
    tween(d).to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    Sfx.thud();
  }

  private say(t: string) {
    this.status.string = t;
    this.status.node.setScale(0.9, 0.9, 1);
    tween(this.status.node).to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
  }

  // ---------------------------------------------------------------- match
  private async beginMatch() {
    if (this.active) return;
    const { api, hud } = this.ctx;
    if (hud.balance < this.fee) { hud.promptRefill(); return; }
    this.playBtn.setEnabled(false);
    try {
      const r = await api.ludoStart();
      this.matchId = r.matchId;
      hud.setBalance(r.balance);
    } catch (e) { this.playBtn.setEnabled(true); hud.handleError(e); return; }
    this.toks = newTokens();
    // rebuild token nodes
    this.nodes.forEach(n => n.destroy()); this.nodes.clear();
    this.toks.forEach(t => this.nodes.set(t, this.makeToken(t)));
    this.layoutTokens(false);
    this.finished = [];
    this.active = true;
    this.playBtn.node.active = false; this.playBtn.pulse(false);
    this.dice.active = true;
    this.updateChips();
    Sfx.win(0);
    await this.matchLoop();
  }

  private async matchLoop() {
    let turn = ORDER.indexOf(HUMAN);
    while (this.active) {
      const col = ORDER[turn % 4];
      turn++;
      if (isFinished(this.toks, col)) continue;
      await this.takeTurn(col);
      if (!this.active) return;
      if (this.finished.includes(HUMAN) || this.finished.length >= 3) { await this.endMatch(); return; }
    }
  }

  private async takeTurn(col: LColor) {
    const human = col === HUMAN;
    this.current = col;
    this.setTurn(col);
    let sixes = 0;
    for (;;) {
      if (!this.active) return;
      let roll: number;
      if (human && this.auto) {
        await wait(0.25);
      } else if (human) {
        this.say('Your turn: tap the dice!');
        this.pulseDice(true);
        await new Promise<void>(res => { this.diceTap = res; });
        this.pulseDice(false);
      } else {
        this.say(`${BOT_NAMES[col]} is rolling…`);
        await wait(0.55);
      }
      roll = secureInt(1, 6);
      await this.rollDice(roll);
      sixes = roll === 6 ? sixes + 1 : 0;
      if (sixes === 3) { this.say(`${human ? 'Three 6s in a row, turn lost' : BOT_NAMES[col] + ' rolled three 6s: turn lost'}`); await wait(1.1); return; }
      const moves = legalMoves(this.toks, col, roll);
      if (!moves.length) {
        this.say(`${human ? 'You' : BOT_NAMES[col]} rolled ${roll}: no move`);
        await wait(0.9);
        if (roll === 6) continue;
        return;
      }
      let mv: Move;
      if (human && this.auto) {
        mv = pickMove(this.toks, col, moves, 'normal');
      } else if (human) {
        if (moves.length === 1) { mv = moves[0]; await wait(0.35); }
        else { this.say(`You rolled ${roll}: pick a token`); mv = await this.humanPick(moves); }
      } else {
        this.say(`${BOT_NAMES[col]} rolled ${roll}`);
        await wait(0.55);
        mv = pickMove(this.toks, col, moves, this.level);
      }
      const extra = await this.performMove(mv, roll);
      if (isFinished(this.toks, col)) {
        this.finished.push(col);
        this.say(`${human ? 'You' : BOT_NAMES[col]} finished ${ordinal(this.finished.length)}!`);
        await wait(0.9);
        return;
      }
      if (!extra) return;
      this.say(roll === 6 ? 'Rolled a 6: roll again!' : 'Bonus turn!');
      await wait(0.5);
    }
  }

  private pulseDice(on: boolean) {
    Tween.stopAllByTarget(this.dice);
    this.dice.setScale(1, 1, 1);
    if (on) tween(this.dice).repeatForever(tween().to(0.5, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'sineInOut' }).to(0.5, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })).start();
  }

  private humanPick(moves: Move[]): Promise<Move> {
    return new Promise(res => {
      this.selectable = new Set(moves.map(m => m.tok));
      moves.forEach(m => {
        const n = this.nodes.get(m.tok)!;
        const ring = n.getChildByName('ring')!;
        ring.active = true;
        Tween.stopAllByTarget(ring);
        tween(ensureOpacity(ring)).repeatForever(tween().to(0.4, { opacity: 110 }).to(0.4, { opacity: 255 })).start();
        const pawn = n.getChildByName('pawn')!;
        tween(pawn).repeatForever(tween().to(0.25, { position: new Vec3(0, 20, 0) }, { easing: 'sineOut' }).to(0.25, { position: new Vec3(0, 12, 0) }, { easing: 'sineIn' })).start();
      });
      this.pickTap = (tok: Tok) => {
        const m = moves.find(x => x.tok === tok);
        if (!m) return;
        this.pickTap = null;
        this.selectable.clear();
        moves.forEach(mm => {
          const n = this.nodes.get(mm.tok)!;
          const ring = n.getChildByName('ring')!; ring.active = false; Tween.stopAllByTarget(ensureOpacity(ring));
          const pawn = n.getChildByName('pawn')!; Tween.stopAllByTarget(pawn); pawn.setPosition(0, 12, 0);
        });
        Sfx.click();
        res(m);
      };
    });
  }

  /** Animate a move and apply it. Returns true if the mover earns an extra turn. */
  private async performMove(m: Move, roll: number): Promise<boolean> {
    const { fx } = this.ctx;
    const n = this.nodes.get(m.tok)!;
    const col = m.tok.color;
    // hop along the path
    const steps: number[] = [];
    if (m.enters) steps.push(0); else for (let p = m.from + 1; p <= m.to; p++) steps.push(p);
    // make the moving token render on top
    n.setSiblingIndex(this.tokenLayer.children.length - 1);
    n.setScale(1, 1, 1);
    for (const p of steps) {
      const [px, py] = gridPos(col, p, m.tok.id);
      const from = n.position.clone(), tx = gx(px), ty = gy(py);
      Sfx.step();
      await animate(m.enters ? 0.32 : 0.14, 'sineInOut', k => {
        if (!n.isValid) return;
        n.setPosition(lerp(from.x, tx, k), lerp(from.y, ty, k) + Math.sin(k * Math.PI) * (m.enters ? 34 : 12), 0);
        const s = 1 + Math.sin(k * Math.PI) * 0.22; n.setScale(s, s, 1);
      });
    }
    const captured = m.captures.slice();
    applyMove(this.toks, m);
    // capture effects
    if (captured.length) {
      Sfx.capture();
      const [px, py] = gridPos(col, m.to, m.tok.id);
      fx.burst({ x: gx(px), y: gy(py), count: 22, shape: 'star', colors: [this.colors[col], '#ffffff', '#fbbf24'], speed: [150, 500], gravity: 500, life: [0.5, 1] });
      this.shake();
      await Promise.all(captured.map(async c => {
        const cn = this.nodes.get(c)!;
        const [yx, yy] = gridPos(c.color, YARD, c.id);
        const a = cn.position.clone(), tx = gx(yx), ty = gy(yy);
        cn.setSiblingIndex(this.tokenLayer.children.length - 1);
        await animate(0.7, 'quadInOut', k => {
          if (!cn.isValid) return;
          cn.setPosition(lerp(a.x, tx, k), lerp(a.y, ty, k) + Math.sin(k * Math.PI) * 120, 0);
          cn.angle = k * 360; const s = 1 + Math.sin(k * Math.PI) * 0.3; cn.setScale(s, s, 1);
        });
        cn.angle = 0;
      }));
    }
    if (m.finishes) {
      Sfx.win(1);
      const [px, py] = gridPos(col, HOME, m.tok.id);
      fx.burst({ x: gx(px), y: gy(py), count: 40, shape: 'confetti', colors: [this.colors[col], '#ffffff', '#fbbf24'], speed: [200, 600], gravity: 600, life: [0.9, 1.6] });
      fx.burst({ x: gx(px), y: gy(py), count: 10, shape: 'coin', speed: [200, 500], gravity: 900, life: [1, 1.6] });
    } else if (!captured.length) Sfx.thud();
    this.layoutTokens(true);
    this.updateChips();
    await wait(0.25);
    return roll === 6 || captured.length > 0 || m.finishes;
  }

  private shake() {
    const b = this.boardNode;
    tween(b).to(0.04, { position: new Vec3(-7, 3, 0) }).to(0.04, { position: new Vec3(7, -3, 0) }).to(0.04, { position: new Vec3(-4, 2, 0) }).to(0.05, { position: new Vec3(0, 0, 0) }).start();
  }

  // ------------------------------------------------------------------ end
  private async endMatch() {
    const { api, hud, fx, theme } = this.ctx;
    this.active = false;
    this.setTurn(null);
    this.diceTap = null;
    // placement: finishing order; whoever is left is last
    const order = this.finished.slice();
    ORDER.forEach(c => { if (!order.includes(c)) order.push(c); });
    const placement = order.indexOf(HUMAN) + 1;
    let win = 0;
    try {
      const r = await api.ludoFinish(this.matchId, placement);
      win = r.win; hud.setBalance(r.balance);
    } catch (e) { hud.handleError(e); }
    emit('round', { game: 'ludo', bet: this.fee, win, placement, balance: hud.balance });
    placement === 1 ? Sfx.jackpot() : placement === 2 ? Sfx.win(2) : Sfx.lose();
    if (placement <= 2) {
      fx.burst({ x: 0, y: 150, count: 90, shape: 'confetti', speed: [350, 900], angle: [40, 140], gravity: 1000, life: [1.4, 2.4] });
      fx.rain({ width: 700, top: 640, count: 80, shape: 'confetti', duration: 2.6 });
      if (placement === 1) fx.rain({ width: 700, top: 640, count: 24, shape: 'coin', duration: 2.8 });
    }
    const title = placement === 1 ? 'You won!' : placement === 4 ? 'Better luck next time' : `You finished ${ordinal(placement)}`;
    const body = win > 0 ? `Prize: +${fmtNum(win)} ${this.ctx.cfg.currencyName}` : `No prize this time. Entry was ${fmtNum(this.fee)}.`;
    this.dice.active = false;
    showModal(this.ctx.uiLayer, {
      title, body, h: 440,
      buttons: [
        { text: 'Play again', primary: true, onClick: () => { this.playBtn.node.active = true; this.playBtn.setEnabled(true); void this.beginMatch(); } },
        { text: 'Close', onClick: () => { this.playBtn.node.active = true; this.playBtn.setEnabled(true); this.playBtn.pulse(true); this.say('Ready for another match?'); } },
      ],
    }, theme);
  }
}

const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
void makeFrame; void UITransform; void popIn; void YARD; void START_IDX; void secureInt;
