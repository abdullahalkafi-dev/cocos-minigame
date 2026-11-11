// Lucky Wheel 77. A shared round clock (betting -> spin -> result) lives on the server; this client only renders it.
// Every graphic, sound, text, odd and timing comes from the buyer's configuration (asset slots + database).
import { Node, Sprite, UITransform, Label, tween, Vec3, Color, Tween, SpriteFrame, Graphics } from 'cc';
import { Game } from '../../core/GameBase';
import { WheelState } from '../../core/Api';
import { cached, makeFrame, panelFrame, radial, rr, sprite, Tex, vgrad } from '../../core/Art';
import { AssetRef, MediaHandle, spawnMedia, spawnSprite, stillFrame } from '../../core/Media';
import { Ticker } from '../../core/Ticker';
import { LiveFeed } from '../../core/Live';
import { Sfx } from '../../core/Sfx';
import { emit } from '../../core/Host';
import { clamp, countTo, ensureOpacity, fmtNum, hex, mk, popIn, rand, shade, wait } from '../../core/Util';
import { Button, glowRing, label, toast } from '../../core/Widgets';
import { short } from './format';
import { WheelEffects } from './effects';
import { WheelPopups } from './popups';
import type { BoxView, ChipCfg, Target } from './types';


export class LuckyWheel extends Game {
  private cfg: any;
  targets: Target[] = [];                      // read by effects and popups
  private segs: { target: string }[] = [];
  private chips: ChipCfg[] = [];
  T: any;                                          // texts
  private effects!: WheelEffects;
  private popups!: WheelPopups;
  private st!: WheelState;
  private offset = 0;                              // serverTime - Date.now()
  private roundNo = 0;
  selected = 0;
  private mine: Record<string, number> = {};
  private lastBets: Record<string, number> = {};
  private inflight = 0;
  private queue: Promise<unknown> = Promise.resolve();

  // wheel
  disc!: Node;
  private discR = 170;
  private hubLabel!: Label;
  private rot = 0;                                 // clockwise degrees, current
  private spinFrom = 0;
  private spinTotal = 0;
  private spinFor = 0;                             // round number the spin parameters belong to
  private lastSeg = -1;
  private wedge: Node | null = null;
  private frameNode!: Node;

  // ui
  private roundLabel!: Label;
  private statusLabel!: Label;
  private balLabel!: Label;
  boxes = new Map<string, BoxView>();
  chipNodes: { node: Node; glow: Node }[] = [];
  private ribbon!: Node;
  private ribbonRow!: Node;
  private lastHistoryTop = -1;
  private resultDone = 0;                          // round number whose result presentation ran
  private summaryDone = 0;
  private pollAcc = 0;
  private live: LiveFeed | null = null;              // WebSocket push; polling is only the fallback
  private polling = false;
  private soundBtn: Node | null = null;
  top = 640; bot = -640; wy = 150;
  // life and motion
  private ghost: Node | null = null;
  private ring!: Graphics;
  hubR = 46;
  gemLocalY = 0;
  gemGlow: Node | null = null;
  private moteAcc = 0; private gemAcc = 0;
  private lastPhase = '';
  private shownBal = 0;
  private boxPot = new Map<string, number>();
  private betSecs = 20;

  async start() {
    const { cfg, stage } = this.ctx;
    this.top = this.ctx.vh / 2; this.bot = -this.ctx.vh / 2; this.wy = (this.top - 190 + this.bot + 440) / 2 + 10;
    if (new URLSearchParams(location.search).has('debug')) (window as any).__game = this;
    this.cfg = cfg; this.T = cfg.texts;
    this.targets = cfg.targets; this.segs = cfg.segments; this.chips = cfg.chips;
    this.effects = new WheelEffects(this);
    this.popups = new WheelPopups({ ctx: this.ctx, T: this.T, targets: this.targets, history: () => this.st.history });
    this.st = await this.ctx.api.wheelState();
    this.betSecs = this.st.timing.betSeconds;
    this.ctx.loader?.set(0.12);
    this.syncClock(this.st.serverTime, Date.now(), Date.now());

    // custom sounds from the audio slots (anything not supplied uses a synthesized sound)
    const a = cfg.assets;
    ([['spin', 'sfxSpin'], ['tick', 'sfxTick'], ['chip', 'sfxChip'], ['win', 'sfxWin'], ['lose', 'sfxLose']] as const).forEach(([n, slot]) => a[slot]?.url && Sfx.setCustom(n, a[slot].url));
    if (a.music?.url) void Sfx.startMusic(a.music.url);

    await this.build(stage);
    this.ctx.hud.onBalance((v, animate) => this.showBalance(v, animate));
    this.applyState(this.st);
    // the server pushes the state: no need to ask every second while the live connection works
    this.live = new LiveFeed(this.ctx.api, st => { this.st = st; this.applyState(st); }, offset => { this.offset = offset; });
    this.live.start();
    Ticker.add(dt => { this.tick(dt); });
    // a second ticker for polling keeps working even while animations run
    return;
  }

  private now() { return Date.now() + this.offset; }
  private syncClock(serverTime: number, t0: number, t1: number) { this.offset = serverTime - (t0 + t1) / 2; }
  private A(slot: string): AssetRef | undefined { return this.cfg.assets[slot]; }

  // ------------------------------------------------------------------ build
  private async build(stage: Node) {
    const { theme } = this.ctx;
    // ambient effect behind the wheel
    void spawnMedia(stage, this.A('fxIdle'), { w: 720, h: 720, y: this.wy, fit: 'contain', name: 'fxIdle' });

    const L = this.ctx.loader;
    await this.buildWheel(stage); L?.set(0.5);
    await this.buildTopBar(stage); L?.set(0.65);
    await this.buildBoxes(stage); L?.set(0.8);
    await this.buildRibbon(stage); L?.set(0.88);
    await this.buildBottom(stage); L?.set(1);
    this.statusLabel = label(stage, '', 24, theme.text, { y: this.bot + 452, w: 600, h: 34, outline: { c: '#000000aa', w: 4 } });
    const m = stage.getChildByName('wheel')!; m.setScale(0.8, 0.8, 1);
    tween(m).to(0.8, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
  }

  private async buildWheel(stage: Node) {
    const g = this.cfg.wheelGeom ?? { cx: 0.4997, cy: 0.481, r: 0.2672 };
    const FW = 700;
    const wheel = mk('wheel', stage, 0, this.wy);
    const [frame, disc, hub] = await Promise.all([
      spawnMedia(wheel, this.A('wheelFrame'), { w: FW, h: FW, name: 'frame' }),
      spawnMedia(wheel, this.A('wheelDisc'), { w: 10, h: 10, name: 'disc' }),
      spawnMedia(wheel, this.A('wheelHub'), { w: 10, h: 10, name: 'hub' }),
    ]);
    // the disc must sit UNDER the frame: reorder after creation
    const fsz = frame ? frame.node.getComponent(UITransform)!.contentSize : { width: FW, height: FW * 0.85 };
    const ox = (g.cx - 0.5) * fsz.width, oy = (0.5 - g.cy) * fsz.height;
    this.discR = g.r * fsz.width * 1.015;
    if (disc) {
      this.disc = disc.node;
      disc.node.getComponent(UITransform)!.setContentSize(this.discR * 2, this.discR * 2);
      disc.node.setPosition(ox, oy, 0);
      disc.node.setSiblingIndex(0);
      this.addIcons(disc.node);
    } else {
      this.disc = mk('disc', wheel, ox, oy, this.discR * 2, this.discR * 2);   // no disc art: draw plain wedges
      sprite(this.disc, this.fallbackDisc(), this.discR * 2, this.discR * 2);
      this.disc.setSiblingIndex(0);
      this.addIcons(this.disc);
    }
    if (frame) this.frameNode = frame.node;
    if (hub) {
      const hd = this.discR * 0.53;
      hub.node.getComponent(UITransform)!.setContentSize(hd, hd);
      hub.node.setPosition(ox, oy, 0);
    }
    this.hubR = this.discR * 0.53;
    this.hubLabel = label(wheel, '', 44, '#ffffff', { x: ox, y: oy - 1, outline: { c: '#5a2d00', w: 5 } });
    wheel.on(Node.EventType.TOUCH_END, () => { Sfx.unlock(); });

    // ---- life (does not change the artwork): sunburst rays, breathing glow, motion ghost, countdown ring, gem glint ----
    const { theme } = this.ctx;
    const raysFrame = cached('rays:' + theme.secondary, 512, 512, (gg) => {
      gg.translate(256, 256);
      for (let i = 0; i < 14; i++) {
        gg.save(); gg.rotate((i / 14) * Math.PI * 2);
        const lg = gg.createLinearGradient(0, 0, 250, 0);
        lg.addColorStop(0, 'rgba(255,255,255,.55)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
        gg.fillStyle = lg; gg.beginPath(); gg.moveTo(0, 0); gg.lineTo(252, -34); gg.lineTo(252, 34); gg.closePath(); gg.fill(); gg.restore();
      }
    }, 1);
    const rays = sprite(wheel, raysFrame, this.discR * 4.2, this.discR * 4.2, ox, oy, hex(theme.secondary), 'rays');
    ensureOpacity(rays).opacity = 70;
    tween(rays).repeatForever(tween().by(80, { angle: -360 })).start();
    const breath = sprite(wheel, Tex.glow(), fsz.width * 1.3, fsz.height * 1.2, 0, 0, hex(theme.primary), 'breath');
    tween(ensureOpacity(breath)).repeatForever(tween().to(2.2, { opacity: 90 }, { easing: 'sineInOut' }).to(2.2, { opacity: 210 }, { easing: 'sineInOut' })).start();
    const sd = this.disc.getComponent(Sprite)?.spriteFrame;
    if (sd) {
      const gh = mk('ghost', wheel, ox, oy, this.discR * 2, this.discR * 2);
      const gs = gh.addComponent(Sprite); gs.sizeMode = Sprite.SizeMode.CUSTOM; gs.spriteFrame = sd;
      ensureOpacity(gh).opacity = 0; this.ghost = gh;
    }
    rays.setSiblingIndex(0); breath.setSiblingIndex(1); if (this.ghost) this.ghost.setSiblingIndex(2); this.disc.setSiblingIndex(3);
    const rn = mk('ring', wheel, ox, oy);
    this.ring = rn.addComponent(Graphics);
    this.gemLocalY = fsz.height * 0.405;
    this.gemGlow = sprite(wheel, Tex.glow(), 150, 150, 0, this.gemLocalY, hex('#e9d5ff'), 'gemglow');
    tween(ensureOpacity(this.gemGlow)).repeatForever(tween().to(1.3, { opacity: 50 }, { easing: 'sineInOut' }).to(1.3, { opacity: 150 }, { easing: 'sineInOut' })).start();
  }

  /** Wedge colors when a buyer's disc art is missing (keeps the game playable). */
  private fallbackDisc(): SpriteFrame {
    const N = this.segs.length, R = this.discR;
    return makeFrame(R * 2, R * 2, (g, w) => {
      const c = w / 2; g.translate(c, c);
      const cols = ['#f59e0b', '#3b6db5'];
      this.segs.forEach((_, i) => {
        const a0 = -Math.PI / 2 + (i - 0.5) * (Math.PI * 2 / N);
        g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R - 1, a0, a0 + Math.PI * 2 / N); g.closePath();
        g.fillStyle = i === 0 ? '#e0409c' : cols[i % 2]; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
      });
    });
  }

  private async addIcons(disc: Node) {
    const N = this.segs.length, segAng = 360 / N, size = this.discR * 0.42, rad = this.discR * 0.66;
    await Promise.all(this.segs.map(async (s, i) => {
      const t = this.targets.find(x => x.id === s.target);
      const a = i * segAng;
      const n = await spawnSprite(disc, t?.icon, size, size, Math.sin(a * Math.PI / 180) * rad, Math.cos(a * Math.PI / 180) * rad, 'contain', 'seg');
      if (n) n.angle = -a;
    }));
  }

  private async buildTopBar(stage: Node) {
    const { theme } = this.ctx;
    let bi = 0;
    const mkBtn = async (slot: string, x: number, y: number, size: number, fn: () => void) => {
      const n = await spawnSprite(stage, this.A(slot), size, size, x, y);
      if (!n) return null;
      n.setScale(0, 0, 1); tween(n).delay(0.25 + 0.07 * bi++).to(0.4, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
      n.on(Node.EventType.TOUCH_START, () => n.setScale(0.9, 0.9, 1));
      n.on(Node.EventType.TOUCH_CANCEL, () => n.setScale(1, 1, 1));
      n.on(Node.EventType.TOUCH_END, () => { n.setScale(1, 1, 1); Sfx.unlock(); Sfx.click(); fn(); });
      return n;
    };
    await mkBtn('btnBack', -292, this.top - 62, 76, () => emit('exit', {}));
    this.roundLabel = label(stage, '', 22, theme.text, { x: -240, y: this.top - 62, align: 'left', bold: false, outline: { c: '#00000099', w: 3 } });
    const logo = await spawnSprite(stage, this.A('logo'), 240, 70, -190, this.top - 140, 'contain', 'logo');
    void logo;
    await mkBtn('btnHelp', 218, this.top - 62, 76, () => this.popups.howTo());
    this.soundBtn = await mkBtn('btnSound', 296, this.top - 62, 76, () => {
      Sfx.setMuted(!Sfx.muted);
      if (this.soundBtn) ensureOpacity(this.soundBtn).opacity = Sfx.muted ? 110 : 255;
    });
    if (this.soundBtn && Sfx.muted) ensureOpacity(this.soundBtn).opacity = 110;
    await mkBtn('btnHistory', 296, this.top - 144, 76, () => this.popups.history());
    await mkBtn('btnMyBets', 296, this.top - 226, 76, () => this.popups.myBets());
    await mkBtn('btnRanking', -292, this.top - 162, 84, () => this.popups.ranking());
  }

  private async buildBoxes(stage: Node) {
    const { theme } = this.ctx;
    const n = this.targets.length;
    const cols = n <= 4 ? n : 3, rows = Math.ceil(n / cols);
    const gap = 14, bw = Math.min(222, Math.floor((690 - gap * (cols - 1)) / cols)), bh = Math.round(bw * 0.64);
    const baseY = this.bot + 250 + (rows - 1) * (bh + 10) / 2;
    await Promise.all(this.targets.map(async (t, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const inRow = Math.min(cols, n - r * cols);
      const x = (c - (inRow - 1) / 2) * (bw + gap), y = baseY - r * (bh + 10);
      const node = mk('box-' + t.id, stage, x, y, bw, bh);
      const glow = sprite(node, Tex.glow(), bw * 1.7, bh * 1.9, 0, 0, hex(theme.secondary), 'glow'); glow.active = false;
      const fr = await spawnSprite(node, this.A('boxFrame'), bw, bh, 0, 0, 'stretch', 'frame');
      void fr;
      const pot = label(node, '0', 17, '#f5e9ff', { y: bh * 0.34, bold: false });
      await spawnSprite(node, t.icon, bh * 0.56, bh * 0.56, -bw * 0.2, 2, 'contain', 'icon');
      await spawnSprite(node, t.badge, bw * 0.34, bh * 0.3, bw * 0.19, 2, 'contain', 'badge');
      const mine = label(node, '0', 20, '#ffffff', { y: -bh * 0.33, outline: { c: '#00000099', w: 3 } });
      const stack = mk('stack', node, -bw * 0.34, -bh * 0.24);
      node.on(Node.EventType.TOUCH_START, () => node.setScale(0.97, 0.97, 1));
      node.on(Node.EventType.TOUCH_CANCEL, () => node.setScale(1, 1, 1));
      node.on(Node.EventType.TOUCH_END, () => { node.setScale(1, 1, 1); Sfx.unlock(); void this.placeBet(t.id); });
      this.boxes.set(t.id, { node, w: bw, h: bh, pot, mine, glow, stack, lastCount: 0 });
      node.setPosition(x, y - 90, 0); ensureOpacity(node).opacity = 0;
      tween(node).delay(0.35 + i * 0.1).to(0.5, { position: new Vec3(x, y, 0) }, { easing: 'backOut' }).start();
      tween(ensureOpacity(node)).delay(0.35 + i * 0.1).to(0.3, { opacity: 255 }).start();
    }));
  }

  private async buildRibbon(stage: Node) {
    this.ribbon = mk('ribbon', stage, 0, this.bot + 378);
    await spawnSprite(this.ribbon, this.A('ribbon'), 700, 96, 0, 0, 'stretch', 'band');
    this.ribbonRow = mk('row', this.ribbon, 0, 4);
    const nw = await spawnSprite(this.ribbon, this.A('badgeNew'), 74, 50, -318, 34, 'contain', 'new');
    if (nw) tween(nw).repeatForever(tween().to(0.8, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'sineInOut' }).to(0.8, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })).start();
  }

  private async buildBottom(stage: Node) {
    const { theme, player, hud } = this.ctx;
    // avatar + name + balance
    const av = mk('avatar', stage, -300, this.bot + 84, 84, 84);
    const custom = await spawnSprite(av, this.A('avatar'), 84, 84, 0, 0, 'cover', 'img');
    if (!custom) {
      sprite(av, cached('avatar:' + theme.primary, 84, 84, (g, w, h) => {
        g.fillStyle = radial(g, 30, 24, 4, 50, [[0, shade(theme.primary, 0.5)], [1, theme.primary]]); g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 3, 0, 7); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 4; g.stroke();
      }), 84, 84);
      label(av, String(player.username[0] || '?').toUpperCase(), 40, '#ffffff', {});
    }
    label(stage, player.username.length > 12 ? player.username.slice(0, 11) + '…' : player.username, 20, '#ffffff', { x: -250, y: this.bot + 108, align: 'left', bold: true, outline: { c: '#00000099', w: 3 } });
    const pill = mk('balance', stage, -190, this.bot + 62, 168, 36);
    sprite(pill, panelFrame(168, 36, '#1c0b52', theme.secondary, 18, 0.9), 168, 36);
    sprite(pill, Tex.coin(theme.secondary), 26, 26, -66, 0);
    this.balLabel = label(pill, '0', 19, '#ffffff', { x: -2, align: 'center', bold: true });
    const plus = mk('plus', pill, 66, 0, 30, 30);
    sprite(plus, cached('plus:' + theme.accent, 30, 30, (g, w, h) => {
      g.fillStyle = '#22d3ee'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 1, 0, 7); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(8, 15); g.lineTo(22, 15); g.moveTo(15, 8); g.lineTo(15, 22); g.stroke();
    }), 30, 30);
    plus.on(Node.EventType.TOUCH_END, () => { Sfx.unlock(); Sfx.click(); hud.promptRefill(); });

    // chips
    const n = this.chips.length, size = n > 4 ? 88 : 100, step = size + 8;
    const x0 = 360 - 24 - size / 2 - (n - 1) * step;
    await Promise.all(this.chips.map(async (c, i) => {
      const node = mk('chip' + i, stage, x0 + i * step, this.bot + 88, size, size);
      const glow = sprite(node, Tex.glow(), size * 1.6, size * 1.6, 0, 0, hex(theme.secondary), 'glow'); glow.active = false;
      tween(ensureOpacity(glow)).repeatForever(tween().to(0.6, { opacity: 130 }, { easing: 'sineInOut' }).to(0.6, { opacity: 255 }, { easing: 'sineInOut' })).start();
      node.setScale(0, 0, 1); tween(node).delay(0.5 + i * 0.08).to(0.45, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
      const img = await spawnSprite(node, c.image, size, size, 0, 0, 'contain', 'img');
      if (!img) sprite(node, Tex.coin(theme.secondary), size * 0.9, size * 0.9, 0, 0);
      label(node, short(c.value), Math.round(size * 0.27), '#ffffff', { y: 1, outline: { c: '#1a0840', w: 4 } });
      node.on(Node.EventType.TOUCH_END, () => { Sfx.unlock(); Sfx.click(); this.selectChip(i); });
      this.chipNodes[i] = { node, glow };      // by index: images finish loading in any order
    }));
    this.selectChip(Math.max(0, this.chips.findIndex(c => c.value <= hud.balance)), false);

    // repeat bet
    const rep = await spawnSprite(stage, this.A('btnRepeat'), 128, 86, 276, this.bot + 522, 'contain', 'repeat');
    if (rep) {
      rep.on(Node.EventType.TOUCH_START, () => rep.setScale(0.94, 0.94, 1));
      rep.on(Node.EventType.TOUCH_CANCEL, () => rep.setScale(1, 1, 1));
      rep.on(Node.EventType.TOUCH_END, () => { rep.setScale(1, 1, 1); Sfx.unlock(); Sfx.click(); void this.repeatBets(); });
    } else {
      new Button(stage, { text: this.T.repeatBet, w: 130, h: 70, x: 276, y: this.bot + 522, c0: shade(theme.primary, 0.2), c1: shade(theme.primary, -0.3), size: 22, onClick: () => this.repeatBets() });
    }
  }

  private selectChip(i: number, sound = true) {
    this.selected = i;
    this.chipNodes.forEach((c, k) => {
      const on = k === i;
      c.glow.active = on;
      const im = c.node.getChildByName('img');
      if (im) { Tween.stopAllByTarget(im); im.setPosition(0, 0, 0); if (on) tween(im).repeatForever(tween().to(0.7, { position: new Vec3(0, 5, 0) }, { easing: 'sineInOut' }).to(0.7, { position: new Vec3(0, 0, 0) }, { easing: 'sineInOut' })).start(); }
      Tween.stopAllByTarget(c.node);
      tween(c.node).to(0.15, { position: new Vec3(c.node.position.x, on ? this.bot + 104 : this.bot + 88, 0), scale: on ? new Vec3(1.12, 1.12, 1) : new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    });
    if (sound) this.ctx.fx.burst({ x: this.chipNodes[i].node.position.x, y: this.bot + 100, count: 6, shape: 'spark', colors: [this.ctx.theme.secondary, '#ffffff'], speed: [60, 180], gravity: 0, life: [0.3, 0.6], size: [0.4, 0.9] });
  }

  private showBalance(v: number, animate: boolean) {
    if (!this.balLabel) return;
    const from = this.shownBal; this.shownBal = v;
    if (!animate || from === v) { this.balLabel.string = fmtNum(v); return; }
    void countTo(this.balLabel, from, v, clamp(0.35 + Math.abs(v - from) / 4_000_000, 0.35, 1.2), fmtNum);
    this.balLabel.node.setScale(1.2, 1.2, 1); tween(this.balLabel.node).to(0.35, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
  }

  // ------------------------------------------------------------------ state sync
  private async refresh() {
    if (this.polling) return;
    this.polling = true;
    try {
      const t0 = Date.now();
      const st = await this.ctx.api.wheelState();
      this.syncClock(st.serverTime, t0, Date.now());
      this.st = st;
      this.applyState(st);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401) this.ctx.hud.handleError(e);
    }
    this.polling = false;
  }

  private applyState(st: WheelState) {
    const r = st.round;
    if (r.no !== this.roundNo) this.onNewRound(st);
    const rl = `${this.T.roundLabel}: ${r.no}`;
    if (this.roundLabel.string !== rl) { this.roundLabel.string = rl; this.roundLabel.node.setScale(1.25, 1.25, 1); tween(this.roundLabel.node).to(0.35, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start(); }
    // pot / my bets
    for (const t of this.targets) {
      const b = this.boxes.get(t.id); if (!b) continue;
      const nv = st.pot[t.id] ?? 0, ov = this.boxPot.get(t.id) ?? 0;
      if (nv !== ov) { this.boxPot.set(t.id, nv); void countTo(b.pot, ov, nv, 0.5, fmtNum); }
      if (!this.inflight) { this.mine[t.id] = st.mine[t.id] ?? 0; }
      this.refreshBox(t.id);
    }
    if (!this.inflight && (r.phase !== 'betting' || this.ctx.hud.balance !== st.balance) && !(r.phase === 'result' && !r.summary)) this.ctx.hud.setBalance(st.balance, r.phase === 'result');
    this.renderHistory(st.history);
  }

  private onNewRound(st: WheelState) {
    // remember what was bet last round for "Repeat bet"
    if (this.roundNo && Object.values(this.mine).some(v => v > 0)) this.lastBets = { ...this.mine };
    this.roundNo = st.round.no;
    this.mine = {}; this.lastSeg = -1;
    this.boxes.forEach(b => { b.glow.active = false; Tween.stopAllByTarget(b.glow); b.stack.setScale(1, 1, 1); ensureOpacity(b.stack).opacity = 255; b.stack.setPosition(-b.w * 0.34, -b.h * 0.24, 0); });
    this.hubLabel.color = hex('#ffffff');
    if (this.wedge) { this.wedge.destroy(); this.wedge = null; }
    // the wheel is at rest at its last angle; remember it as the start of the next spin
    this.spinFrom = ((this.rot % 360) + 360) % 360;
  }

  private refreshBox(id: string) {
    const b = this.boxes.get(id); if (!b) return;
    const v = this.mine[id] ?? 0;
    b.mine.string = v > 0 ? fmtNum(v) : '0';
    b.mine.node.setPosition(v > 0 ? 14 : 0, b.mine.node.position.y, 0);
    // a stack of chips that grows with the bet
    const minChip = this.chips[0]?.value || 1;
    const count = v > 0 ? clamp(Math.ceil(Math.log2(v / minChip + 1)), 1, 6) : 0;
    if (count === b.lastCount) return;
    const grew = count > b.lastCount;
    b.lastCount = count;
    b.stack.removeAllChildren();
    if (!count) return;
    let ci = 0; this.chips.forEach((c, k) => { if (c.value <= v) ci = k; });
    const frame = this.chipNodes[ci]?.node.getChildByName('img')?.getComponent(Sprite)?.spriteFrame ?? Tex.coin(this.ctx.theme.secondary);
    for (let k = 0; k < count; k++) {
      const n = mk('c', b.stack, (k % 2) * 3 - 1.5, k * 6, 38, 38);
      const sp = n.addComponent(Sprite); sp.sizeMode = Sprite.SizeMode.CUSTOM; sp.spriteFrame = frame;
      if (grew && k === count - 1) popIn(n, 0.35, 0.3);
    }
  }

  // ------------------------------------------------------------------ frame loop
  private tick(dt: number) {
    if (!this.st) return;
    this.pollAcc += dt;
    if (this.pollAcc >= (this.live?.healthy ? 15 : 1)) { this.pollAcc = 0; void this.refresh(); }   // 15 s: a safety net while the push works
    const r = this.st.round, now = this.now();
    const phase = now < r.betEnd ? 'betting' : now < r.spinEnd ? 'spinning' : 'result';

    // countdown in the hub: number + a draining ring that turns red in the last seconds
    if (phase === 'betting') {
      const left = Math.max(0, Math.ceil((r.betEnd - now) / 1000));
      const urgent = left <= 5;
      if (this.hubLabel.string !== String(left)) {
        this.hubLabel.string = String(left);
        this.hubLabel.color = urgent ? hex('#ffe0e0') : hex('#ffffff');
        if (urgent && left > 0) { Sfx.tick(); this.hubLabel.node.setScale(1.35, 1.35, 1); tween(this.hubLabel.node).to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start(); }
      }
      this.drawRing(clamp((r.betEnd - now) / (Math.max(1, this.betSecs) * 1000), 0, 1), urgent);
      this.setStatus(this.T.placeBets);
    } else {
      if (this.hubLabel.string !== '') this.hubLabel.string = '';
      if (this.lastPhase === 'betting') { this.effects.ripple(); this.ring.clear(); }
      this.setStatus(phase === 'spinning' ? this.T.noMoreBets : '');
    }
    this.lastPhase = phase;

    // ambient life: drifting motes and a glint on the top gem
    this.moteAcc += dt; this.gemAcc += dt;
    if (this.moteAcc > 0.55) { this.moteAcc = 0; this.ctx.fx.burst({ x: rand(-310, 310), y: this.wy + rand(-230, 280), count: 1, shape: 'spark', colors: [this.ctx.theme.secondary, '#ffffff'], speed: [8, 30], angle: [60, 120], gravity: -4, life: [2.2, 3.6], size: [0.35, 0.8], drag: 0.1 }); }
    if (this.gemAcc > 3.4) { this.gemAcc = 0; this.ctx.fx.burst({ x: rand(-26, 26), y: this.wy + this.gemLocalY + rand(-14, 14), count: 4, shape: 'spark', colors: ['#ffffff', '#e9d5ff'], speed: [20, 90], gravity: 0, life: [0.4, 0.8], size: [0.5, 1.1] }); }

    // spin
    if (phase !== 'betting' && r.result) {
      if (this.spinFor !== r.no) this.prepareSpin(r.no, r.result.segment);
      const p = Math.min(1, Math.max(0, (now - r.betEnd) / (r.spinEnd - r.betEnd)));
      const W = 0.06;                                   // anticipation: a small backward swing before take-off
      let rot: number, speed = 0;
      if (p < W) rot = this.spinFrom - 11 * Math.sin(Math.PI * p / W);
      else {
        const q = (p - W) / (1 - W);
        rot = this.spinFrom + this.spinTotal * (1 - Math.pow(1 - q, 4));
        if (q > 0.93) rot += 2.4 * Math.sin(Math.PI * (q - 0.93) / 0.07);   // settle nudge at the end
        speed = Math.pow(1 - q, 3);
      }
      this.setRot(rot);
      if (this.ghost) { ensureOpacity(this.ghost).opacity = Math.round(150 * Math.min(1, speed * 1.4)); this.ghost.angle = this.disc.angle + 7 * speed; }
      if (this.lastSeg === -1 && p < 0.02) { Sfx.playCustom('spin') || Sfx.whoosh(); this.effects.spinBurst(); }
      const idx = this.segUnderPointer();
      if (idx !== this.lastSeg) {
        if (this.lastSeg !== -1 && p < 0.97) { Sfx.playCustom('tick', 0.6) || Sfx.tick(); this.effects.pulseGem(speed); }
        this.lastSeg = idx;
      }
    }
    if (phase === 'result' && r.result && this.resultDone !== r.no) { this.resultDone = r.no; this.onResult(); }
    if (phase === 'result' && r.summary && this.summaryDone !== r.no) { this.summaryDone = r.no; void this.onSummary(); }
    if (phase === 'result' && !r.summary && now - r.spinEnd > 350 && this.pollAcc > 0.4 && !this.live?.healthy) { this.pollAcc = 1; }   // fetch the payout summary quickly
  }

  private segAngle() { return 360 / this.segs.length; }
  private setRot(deg: number) { this.rot = deg; if (this.disc?.isValid) this.disc.angle = -deg; }
  private segUnderPointer() {
    const N = this.segs.length, seg = this.segAngle();
    const a = ((-this.rot % 360) + 360) % 360;
    return Math.floor((a + seg / 2) / seg) % N;
  }
  private prepareSpin(no: number, segment: number) {
    this.spinFor = no;
    const seg = this.segAngle();
    // same landing for every player: a deterministic offset inside the wedge derived from the round number
    const jitter = (((no * 2654435761) >>> 0) % 1000 / 1000 - 0.5) * seg * 0.6;
    const target = (((-(segment * seg + jitter)) % 360) + 360) % 360;
    const from = ((this.rot % 360) + 360) % 360;
    this.spinFrom = from;
    this.spinTotal = (5 + (no % 2)) * 360 + (((target - from) % 360) + 360) % 360;
  }

  // ------------------------------------------------------------------ motion helpers
  private setStatus(text: string) {
    if (this.statusLabel.string === text) return;
    this.statusLabel.string = text;
    const op = ensureOpacity(this.statusLabel.node); Tween.stopAllByTarget(op); op.opacity = 0;
    tween(op).to(0.25, { opacity: 255 }).start();
  }
  private drawRing(frac: number, urgent: boolean) {
    const g = this.ring, rad = this.hubR * 0.5 + 10;
    g.clear();
    g.lineCap = Graphics.LineCap.ROUND;
    g.lineWidth = 9; g.strokeColor = new Color(0, 0, 0, 90); g.circle(0, 0, rad); g.stroke();
    if (frac <= 0.001) return;
    g.lineWidth = 7; g.strokeColor = urgent ? hex('#ff5d5d') : hex(this.ctx.theme.secondary);
    g.arc(0, 0, rad, Math.PI / 2, Math.PI / 2 - frac * Math.PI * 2, true); g.stroke();
  }

  // ------------------------------------------------------------------ result
  private onResult() {
    const r = this.st.round.result!;
    Sfx.thud();
    // wedge highlight
    const N = this.segs.length, seg = (Math.PI * 2) / N, R = this.discR;
    const f = makeFrame(R * 2, R * 2, (g, w) => {
      const c = w / 2; g.translate(c, c);
      const a0 = -Math.PI / 2 + (r.segment - 0.5) * seg;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R - 2, a0, a0 + seg); g.closePath();
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fill(); g.strokeStyle = '#fff6b0'; g.lineWidth = 6; g.stroke();
    }, 1);
    this.wedge = sprite(this.disc, f, R * 2, R * 2, 0, 0, undefined, 'wedge');
    const op = ensureOpacity(this.wedge);
    tween(op).repeatForever(tween().to(0.35, { opacity: 90 }).to(0.35, { opacity: 255 })).start();
    // winning boxes pulse
    r.hits.forEach(id => {
      const b = this.boxes.get(id); if (!b) return;
      b.glow.active = true;
      tween(ensureOpacity(b.glow)).repeatForever(tween().to(0.4, { opacity: 120 }).to(0.4, { opacity: 255 })).start();
      b.node.setScale(1.06, 1.06, 1); tween(b.node).to(0.4, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    });
    const lucky = r.hits.some(h => this.targets.find(t => t.id === h)?.lucky);
    this.ctx.fx.burst({ x: 0, y: 150, count: lucky ? 50 : 22, shape: 'spark', colors: [this.ctx.theme.secondary, '#ffffff'], speed: [150, 520], gravity: 0, life: [0.5, 1], size: [0.8, 1.6] });
    void this.effects.popResultIcon(r.hits);
    this.effects.settleStacks(r.hits);
  }

  private async onSummary() {
    const r = this.st.round, sum = r.summary!;
    const { hud, theme, fx } = this.ctx;
    hud.setBalance(this.st.balance, true);
    const myWin = sum.my.win;
    const lucky = r.result!.hits.some(h => this.targets.find(t => t.id === h)?.lucky);
    emit('round', { game: 'lucky-wheel', round: r.no, bet: sum.my.bet, win: myWin, hits: r.result!.hits, balance: this.st.balance });
    if (sum.my.bet > 0) {
      if (myWin > 0) {
        if (!Sfx.playCustom('win')) lucky ? Sfx.jackpot() : Sfx.win(2);
        fx.burst({ x: 0, y: -380, count: 26, shape: 'coin', speed: [300, 800], angle: [60, 120], gravity: 1300, life: [1, 1.8] });
        fx.burst({ x: 0, y: -380, count: 40, shape: 'confetti', colors: [theme.secondary, '#fff', '#f43f5e', '#22d3ee'], speed: [300, 800], angle: [50, 130], gravity: 1000, life: [1.2, 2] });
        this.effects.floatText(`+${fmtNum(myWin)}`, theme.secondary);
        void this.playFx(lucky ? 'fxJackpot' : 'fxWin');
      } else if (!Sfx.playCustom('lose')) Sfx.lose();
    }
    if (sum.winners.length) {
      const left = Math.max(2500, r.endAt - this.now() - 700);
      await wait(1.1);
      if (this.roundNo === r.no) this.popups.winners(sum, Math.min(left, 6000) / 1000);
    }
  }

  private async playFx(slot: 'fxWin' | 'fxJackpot') {
    const ref = this.A(slot);
    const alt = slot === 'fxJackpot' && !ref?.url ? this.A('fxWin') : ref;
    if (!alt?.url) return;
    const h: MediaHandle | null = await spawnMedia(this.ctx.uiLayer, { ...alt, loop: false }, { w: 720, h: 1280, fit: 'cover', name: 'fx' });
    if (!h) return;
    await Promise.race([h.done, wait(7)]);
    h.destroy();
  }


  // ------------------------------------------------------------------ history ribbon
  private async renderHistory(h: { no: number; hits: string[] }[]) {
    const top = h.length ? h[0].no : 0;
    if (top === this.lastHistoryTop) return;
    const first = this.lastHistoryTop === -1;
    this.lastHistoryTop = top;
    this.ribbonRow.removeAllChildren();
    const items = h.slice(0, 9);
    const step = 58, x0 = -252;
    if (!first) { Tween.stopAllByTarget(this.ribbonRow); this.ribbonRow.setPosition(-step, 4, 0); tween(this.ribbonRow).to(0.4, { position: new Vec3(0, 4, 0) }, { easing: 'quadOut' }).start(); }
    await Promise.all(items.map(async (it, i) => {
      const t = this.targets.find(x => x.id === it.hits[0]);
      const n = await spawnSprite(this.ribbonRow, t?.icon, 46, 46, x0 + i * step, 0, 'contain', 'h');
      if (!n) return;
      if (it.hits.length > 1) {
        const t2 = this.targets.find(x => x.id === it.hits[1]);
        const s = await spawnSprite(n, t2?.icon, 26, 26, 14, -14, 'contain', 'h2'); void s;
      }
      if (i === 0 && !first) popIn(n, 0.4, 0.2);
    }));
  }

  // ------------------------------------------------------------------ betting
  private phaseNow() { const r = this.st.round, n = this.now(); return n < r.betEnd - 250 ? 'betting' : 'closed'; }

  private async placeBet(id: string) {
    const { hud } = this.ctx;
    if (this.phaseNow() !== 'betting') { toast(this.ctx.uiLayer, this.T.noMoreBets, this.ctx.theme); return; }
    const amount = this.chips[this.selected].value;
    if (hud.balance < amount) { hud.promptRefill(); return; }
    this.addBets({ [id]: amount });
  }

  private async repeatBets() {
    const { hud } = this.ctx;
    if (this.phaseNow() !== 'betting') { toast(this.ctx.uiLayer, this.T.noMoreBets, this.ctx.theme); return; }
    const bets = Object.entries(this.lastBets).filter(([id, v]) => v > 0 && this.targets.some(t => t.id === id));
    if (!bets.length) { toast(this.ctx.uiLayer, 'No previous bet to repeat', this.ctx.theme); return; }
    const total = bets.reduce((a, [, v]) => a + v, 0);
    if (hud.balance < total) { hud.promptRefill(); return; }
    this.addBets(Object.fromEntries(bets));
  }

  /** Optimistic update + server confirmation (requests are sent in order). */
  private addBets(add: Record<string, number>) {
    const { hud } = this.ctx;
    const total = Object.values(add).reduce((a, v) => a + v, 0);
    Object.entries(add).forEach(([id, v]) => { this.mine[id] = (this.mine[id] ?? 0) + v; this.refreshBox(id); this.effects.flyChip(id); });
    hud.setBalance(hud.balance - total, true);
    Sfx.playCustom('chip') || Sfx.coin();
    this.inflight++;
    this.queue = this.queue.then(async () => {
      try {
        const res = await this.ctx.api.wheelBet(Object.entries(add).map(([target, amount]) => ({ target, amount })));
        void res;
      } catch (e) {
        Object.entries(add).forEach(([id, v]) => { this.mine[id] = Math.max(0, (this.mine[id] ?? 0) - v); this.refreshBox(id); });
        hud.setBalance(hud.balance + total, false);
        const status = (e as { status?: number }).status;
        if (status === 409) toast(this.ctx.uiLayer, this.T.noMoreBets, this.ctx.theme); else hud.handleError(e);
      } finally { this.inflight--; if (!this.inflight) void this.refresh(); }
    });
  }


}
void hex; void vgrad; void rr; void stillFrame; void glowRing;
