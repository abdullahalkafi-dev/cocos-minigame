// The popups of the Lucky Wheel: how to play, history, my bets, ranking and the round winners.
import { BlockInputEvents, Color, Label, Node, UITransform, Vec3, tween } from 'cc';
import type { WheelState } from '../../core/Api';
import { cached, panelFrame, sprite, Tex } from '../../core/Art';
import type { GameCtx } from '../../core/GameBase';
import { spawnSprite } from '../../core/Media';
import { ensureOpacity, fmtNum, mk, popIn, shade, wait } from '../../core/Util';
import { label } from '../../core/Widgets';
import { short, stamp } from './format';
import type { Target } from './types';

interface PopupHost { ctx: GameCtx; T: any; targets: Target[]; history(): WheelState['history'] }

export class WheelPopups {
  private popup: Node | null = null;
  private popupPanel: Node | null = null;
  private popupDim: Node | null = null;
  constructor(private h: PopupHost) {}

  open(title: string, w: number, h: number): Node {
    this.close();
    const { theme, uiLayer } = this.h.ctx;
    const root = mk('popup', uiLayer, 0, 0, 3000, 3000);
    root.addComponent(BlockInputEvents);
    const dim = sprite(root, Tex.rect(), 3000, 3000, 0, 0, new Color(0, 0, 0, 170), 'dim');
    ensureOpacity(dim).opacity = 0; tween(ensureOpacity(dim)).to(0.2, { opacity: 255 }).start();
    dim.on(Node.EventType.TOUCH_END, () => this.close());
    const panel = mk('panel', root, 0, 20, w, h);
    panel.on(Node.EventType.TOUCH_END, () => undefined);
    sprite(panel, panelFrame(w, h, theme.popup, theme.accent, 30, 0.98), w, h);
    const tw = Math.max(230, title.length * 22 + 80);
    sprite(panel, cached(`tab:${theme.accent}:${tw}`, tw, 60, (g) => {
      g.fillStyle = theme.accent; g.beginPath(); g.moveTo(14, 4); g.lineTo(tw - 14, 4); g.quadraticCurveTo(tw - 2, 4, tw - 6, 22); g.lineTo(tw - 20, 54); g.lineTo(20, 54); g.lineTo(6, 22); g.quadraticCurveTo(2, 4, 14, 4); g.fill();
      g.strokeStyle = shade(theme.accent, -0.4); g.lineWidth = 3; g.stroke();
    }), tw, 60, 0, h / 2 + 2);
    label(panel, title, 28, '#2a0a5a', { y: h / 2 + 4, bold: true });
    popIn(panel, 0.3, 0.7);
    this.popup = root; this.popupPanel = panel; this.popupDim = dim;
    return panel;
  }
  close() {
    const root = this.popup, panel = this.popupPanel, dim = this.popupDim;
    this.popup = null; this.popupPanel = null; this.popupDim = null;
    if (!root?.isValid) return;
    if (panel?.isValid) tween(panel).to(0.16, { scale: new Vec3(0.88, 0.88, 1) }).start();
    if (dim?.isValid) tween(ensureOpacity(dim)).to(0.16, { opacity: 0 }).call(() => { if (root.isValid) root.destroy(); }).start(); else root.destroy();
  }

  howTo() {
    const lines: string[] = this.h.T.howToPlay ?? [];
    const w = 650;
    const est = lines.map(l => Math.ceil(l.length / 52) * 30 + 12);
    const h = Math.min(980, est.reduce((a, b) => a + b, 0) + 80);
    const panel = this.open(this.h.T.howToPlayTitle, w, h);
    let y = h / 2 - 54;
    lines.forEach((l, i) => {
      const lb = label(panel, `${i + 1}. ${l}`, 22, '#ffffff', { x: 0, y, w: w - 80, wrap: true, align: 'center', bold: false, lineHeight: 30 });
      lb.horizontalAlign = Label.HorizontalAlign.LEFT;
      const ut = lb.node.getComponent(UITransform)!; ut.anchorY = 1;
      y -= est[i];
    });
  }

  async history() {
    const panel = this.open(this.h.T.historyTitle, 650, 600);
    const items = this.h.history().slice(0, 48);
    const cols = 8, cell = 72;
    await Promise.all(items.map(async (it, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const x = (c - (cols - 1) / 2) * cell, y = 200 - r * cell;
      if (i === 0) sprite(panel, panelFrame(60, 60, '#6b4a00', this.h.ctx.theme.secondary, 10, 0.8), 60, 60, x, y);
      const t = this.h.targets.find(z => z.id === it.hits[0]);
      await spawnSprite(panel, t?.icon, 46, 46, x, y, 'contain', 'h');
    }));
    if (!items.length) label(panel, 'No rounds yet', 24, '#c4b5fd', { bold: false });
  }

  async myBets() {
    const panel = this.open(this.h.T.myBetsTitle, 650, 600);
    const { theme } = this.h.ctx;
    sprite(panel, panelFrame(590, 44, '#ffffff', 'rgba(255,255,255,0)', 8, 0.14), 590, 44, 0, 205);
    ([['Time', -280], ['Bet', -95], ['Result', 40], ['Revenue', 140]] as const).forEach(([t, x]) => label(panel, t, 20, '#ffffff', { x, y: 205, align: 'left', bold: false }));
    const res = await this.h.ctx.api.wheelMyBets().catch(() => ({ bets: [] }));
    if (!panel.isValid) return;
    if (!res.bets.length) label(panel, 'No bets yet', 24, '#c4b5fd', { y: 60, bold: false });
    res.bets.slice(0, 9).forEach((b, i) => {
      const y = 150 - i * 50;
      label(panel, stamp(b.time), 17, '#e9ddff', { x: -280, y, align: 'left', bold: false });
      label(panel, `${b.label} ${short(b.amount)}`, 18, '#e9ddff', { x: -95, y, align: 'left', bold: false });
      label(panel, b.win > 0 ? 'Win' : 'Lose', 18, b.win > 0 ? '#86efac' : '#fca5a5', { x: 40, y, align: 'left', bold: true });
      sprite(panel, Tex.coin(theme.secondary), 24, 24, 150, y);
      label(panel, b.win > 0 ? short(b.win) : '0', 18, '#ffffff', { x: 170, y, align: 'left', bold: true });
    });
  }

  private crown(parent: Node, x: number, y: number, size: number, color = '#facc15') {
    sprite(parent, cached('crown:' + color, 48, 36, (g, w, h) => {
      g.fillStyle = color; g.beginPath(); g.moveTo(4, 30); g.lineTo(2, 8); g.lineTo(14, 18); g.lineTo(24, 4); g.lineTo(34, 18); g.lineTo(46, 8); g.lineTo(44, 30); g.closePath(); g.fill();
      g.strokeStyle = shade(color, -0.45); g.lineWidth = 2; g.stroke();
      g.fillStyle = shade(color, -0.2); g.fillRect(4, 28, 40, 6);
    }), size, size * 0.75, x, y);
  }
  private avatarDot(parent: Node, x: number, y: number, size: number, name: string) {
    const { theme } = this.h.ctx;
    sprite(parent, cached('dot:' + theme.primary, 48, 48, (g, w, h) => {
      g.fillStyle = shade(theme.primary, 0.25); g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
    }), size, size, x, y);
    label(parent, (name[0] || '?').toUpperCase(), Math.round(size * 0.5), '#fff', { x, y: y - 1 });
  }

  async ranking() {
    const panel = this.open(this.h.T.rankingTitle, 650, 760);
    const { theme } = this.h.ctx;
    sprite(panel, panelFrame(590, 44, '#ffffff', 'rgba(255,255,255,0)', 8, 0.14), 590, 44, 0, 300);
    label(panel, 'Ranking', 20, '#fff', { x: -280, y: 300, align: 'left', bold: false }); label(panel, 'Bet', 20, '#fff', { x: -170, y: 300, align: 'left', bold: false }); label(panel, 'Reward', 20, '#fff', { x: 280, y: 300, align: 'right', bold: false });
    const res = await this.h.ctx.api.wheelRanking().catch(() => null);
    if (!panel.isValid || !res) return;
    res.list.slice(0, 9).forEach((r, i) => {
      const y = 240 - i * 56;
      if (r.rank <= 3) this.crown(panel, -255, y, 40, ['#facc15', '#cbd5e1', '#d97706'][r.rank - 1]); else label(panel, String(r.rank), 20, '#e9ddff', { x: -255, y, bold: false });
      this.avatarDot(panel, -170, y, 34, r.username);
      label(panel, r.username, 20, '#ffffff', { x: -140, y, align: 'left', bold: false });
      sprite(panel, Tex.coin(theme.secondary), 24, 24, 175, y);
      label(panel, short(r.win), 20, '#ffffff', { x: 290, y, align: 'right', bold: true });
    });
    if (!res.list.length) label(panel, 'No winners yet', 24, '#c4b5fd', { y: 60, bold: false });
    sprite(panel, panelFrame(590, 64, '#4c2bb0', theme.accent, 14, 0.9), 590, 64, 0, -300);
    this.avatarDot(panel, -250, -300, 40, res.me.username);
    label(panel, res.me.username, 22, '#ffffff', { x: -215, y: -300, align: 'left', bold: true });
    label(panel, res.me.rank ? `#${res.me.rank}` : '--', 20, '#e9ddff', { x: -60, y: -300, bold: false });
    label(panel, short(res.me.win), 22, '#ffffff', { x: 290, y: -300, align: 'right', bold: true });
  }

  winners(sum: NonNullable<WheelState['round']['summary']>, seconds: number) {
    const panel = this.open(this.h.T.goodLuckTitle, 650, 540);
    const { theme, player } = this.h.ctx;
    label(panel, this.h.T.goodLuckBody, 22, '#ffffff', { y: 190, bold: false });
    const n = Math.min(3, sum.winners.length);
    sum.winners.slice(0, 3).forEach((w, i) => {
      const x = (i - (n - 1) / 2) * 190, y = 70;
      this.avatarDot(panel, x, y, 84, w.username);
      this.crown(panel, x, y + 64, 56);
      label(panel, w.username, 18, '#ffffff', { x, y: -4, bold: true });
      const box = (txt: string, yy: number) => { sprite(panel, panelFrame(150, 30, '#000000', 'rgba(255,255,255,0)', 6, 0.55), 150, 30, x, yy); label(panel, txt, 17, '#ffffff', { x, y: yy, bold: false }); };
      box(`Bet: ${short(w.bet)}`, -40); box(`Win: ${short(w.win)}`, -78);
    });
    sprite(panel, panelFrame(590, 90, '#4c2bb0', 'rgba(255,255,255,0)', 14, 0.9), 590, 90, 0, -190);
    this.avatarDot(panel, -250, -190, 56, player.username);
    label(panel, player.username, 24, '#ffffff', { x: -205, y: -190, align: 'left', bold: true });
    label(panel, `Bet : ${fmtNum(sum.my.bet)}`, 18, '#ffffff', { x: 285, y: -168, align: 'right', bold: false });
    label(panel, `Win : ${fmtNum(sum.my.win)}`, 18, sum.my.win > 0 ? '#86efac' : '#ffffff', { x: 285, y: -208, align: 'right', bold: true });
    void theme;
    const root = this.popup;
    void (async () => { await wait(seconds); if (this.popup === root) this.close(); })();
  }
}
