import { Node, Label, Sprite, tween, Vec3, Tween } from 'cc';
import { cached, loadImage, panelFrame, remoteFrame, sprite, Tex, rr } from './Art';
import { countTo, fmtNum, hex, mk } from './Util';
import { label, showModal, Button } from './Widgets';
import { Sfx } from './Sfx';
import { Api, ApiError } from './Api';
import { showFatal } from './Login';

export interface Theme { primary: string; secondary: string; background: string; text: string }

const speaker = (on: boolean) => cached('spk' + on, 40, 40, (g, w, h) => {
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(8, 15); g.lineTo(14, 15); g.lineTo(22, 8); g.lineTo(22, 32); g.lineTo(14, 25); g.lineTo(8, 25); g.closePath(); g.fill();
  if (on) { g.beginPath(); g.arc(23, 20, 7, -0.9, 0.9); g.stroke(); g.beginPath(); g.arc(23, 20, 13, -0.9, 0.9); g.stroke(); }
  else { g.strokeStyle = '#fca5a5'; g.beginPath(); g.moveTo(27, 14); g.lineTo(36, 26); g.moveTo(36, 14); g.lineTo(27, 26); g.stroke(); }
});

export class Hud {
  node: Node;
  private balLabel: Label;
  private shown: number;
  private spkSprite: Sprite;

  constructor(parent: Node, private cfg: any, private theme: Theme, private player: { username: string; balance: number }, private api: Api, private modalLayer: Node) {
    this.node = mk('hud', parent, 0, 0);
    this.shown = player.balance;
    const L = -340, R = 340, top = 640 - 62;

    // title / logo (left)
    const logoUrl = cfg.images?.logo as string | undefined;
    const titleLabel = label(this.node, cfg.title || '', 36, theme.text, { x: L, y: top + 2, align: 'left', outline: { c: 'rgba(0,0,0,0.55)', w: 4 } });
    if (logoUrl) {
      void loadImage(logoUrl).then(im => {
        if (!im || !this.node.isValid) return;
        titleLabel.node.active = false;
        const h = 78, w = Math.min(280, (im.width / im.height) * h);
        sprite(this.node, remoteFrame(im), w, h, L + w / 2, top, undefined, 'logo');
      });
    }

    // balance pill (right)
    const pw = 270, ph = 70;
    const pill = mk('balance', this.node, R - pw / 2, top, pw, ph);
    sprite(pill, panelFrame(pw, ph, '#000000', theme.secondary, 35, 0.45), pw, ph);
    sprite(pill, Tex.coin(theme.secondary), 46, 46, -pw / 2 + 36, 0, undefined, 'coin');
    label(pill, String(cfg.currencyName || 'Coins').toUpperCase(), 15, theme.secondary, { x: 22, y: 19, w: 190, h: 20, bold: true });
    this.balLabel = label(pill, fmtNum(this.shown), 32, '#ffffff', { x: 22, y: -8, outline: { c: 'rgba(0,0,0,0.5)', w: 3 } });

    // username chip + sound toggle (second row)
    const y2 = top - 74;
    const chip = mk('user', this.node, L + 105, y2, 210, 46);
    sprite(chip, panelFrame(210, 46, '#000000', 'rgba(255,255,255,0.25)', 23, 0.4), 210, 46);
    const ini = String(player.username[0] || '?').toUpperCase();
    sprite(chip, cached('av' + theme.primary, 36, 36, (g, w, h) => { g.fillStyle = theme.primary; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 1, 0, 7); g.fill(); }), 34, 34, -87, 0);
    label(chip, ini, 20, '#ffffff', { x: -87, y: 0 });
    label(chip, player.username.length > 11 ? player.username.slice(0, 10) + '…' : player.username, 22, '#ffffff', { x: -64, y: 0, align: 'left', bold: false });

    const sb = mk('sound', this.node, R - 24, y2, 48, 48);
    sprite(sb, panelFrame(48, 48, '#000000', 'rgba(255,255,255,0.25)', 24, 0.4), 48, 48);
    const icon = sprite(sb, speaker(!Sfx.muted), 30, 30);
    this.spkSprite = icon.getComponent(Sprite)!;
    sb.on(Node.EventType.TOUCH_END, () => {
      Sfx.unlock(); Sfx.setMuted(!Sfx.muted);
      this.spkSprite.spriteFrame = speaker(!Sfx.muted);
      if (!Sfx.muted) Sfx.click();
    });
  }

  get balance() { return this.shown; }

  /** Update the balance display (animated). */
  setBalance(v: number, animate = true) {
    const from = this.shown;
    this.shown = v;
    this.player.balance = v;
    if (!animate || from === v) { this.balLabel.string = fmtNum(v); return; }
    Tween.stopAllByTarget(this.balLabel.node);
    void countTo(this.balLabel, from, v, Math.min(1.2, 0.3 + Math.abs(v - from) / 4000), fmtNum);
    this.balLabel.node.setScale(1.18, 1.18, 1);
    tween(this.balLabel.node).to(0.35, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
  }

  /** Centralised handling for API failures during play. Returns true when handled. */
  handleError(e: unknown): boolean {
    const status = (e as { status?: unknown } | null)?.status;
    if (e instanceof ApiError || typeof status === 'number') {
      if (status === 401) { showFatal('Your session expired. Please reload the game.'); return true; }
      if (status === 402) { this.promptRefill(); return true; }
    }
    this.notice('Something went wrong', (e as Error)?.message || 'Please try again.');
    return true;
  }

  notice(title: string, body: string) {
    showModal(this.modalLayer, { title, body, h: 380, buttons: [{ text: 'OK', primary: true }] }, this.theme);
  }

  promptRefill() {
    const cur = String(this.cfg.currencyName || 'coins');
    const start = Number(this.cfg.startingBalance) || 0;
    showModal(this.modalLayer, {
      title: `Out of ${cur.toLowerCase()}`, body: `You don't have enough ${cur.toLowerCase()} for this. Get a free refill of ${fmtNum(start)} and keep playing.`, h: 470,
      buttons: [
        { text: `Get ${fmtNum(start)} ${cur}`, primary: true, onClick: async () => { try { const r = await this.api.refill(); this.setBalance(r.balance); Sfx.coin(); } catch (e) { this.notice('Not available', (e as Error).message); } } },
        { text: 'Not now' },
      ],
    }, this.theme);
  }
}

export { hex, rr, Button };
