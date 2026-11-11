import { Node } from 'cc';
import { fmtNum } from './Util';
import { showModal } from './Widgets';
import { Sfx } from './Sfx';
import { Api, ApiError } from './Api';
import { showFatal } from './Login';
import { emit } from './Host';

export interface Theme { primary: string; secondary: string; background: string; text: string; popup: string; accent: string }

/**
 * Player wallet + shared error handling. Each game draws its own balance display and subscribes with onBalance();
 * this class owns the number, the "out of coins" refill prompt and API error handling.
 */
export class Hud {
  private shown: number;
  private listeners: ((v: number, animate: boolean) => void)[] = [];

  constructor(private cfg: any, private theme: Theme, private player: { username: string; balance: number }, private api: Api, private modalLayer: Node) {
    this.shown = player.balance;
  }
  get balance() { return this.shown; }
  get username() { return this.player.username; }
  onBalance(cb: (v: number, animate: boolean) => void) { this.listeners.push(cb); cb(this.shown, false); }
  setBalance(v: number, animate = true) {
    this.shown = v;
    this.player.balance = v;
    this.listeners.forEach(l => l(v, animate));
  }

  /** Centralised handling for API failures. Returns true when handled. */
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
    if (this.cfg.walletMode === 'managed') {
      // coins come from the app around the game: tell it, so it can open its own shop, and explain to the player
      emit('needCoins', { balance: this.shown });
      this.notice(`Out of ${cur.toLowerCase()}`, `You don't have enough ${cur.toLowerCase()} for this. Add more in the app and come back to keep playing.`);
      return;
    }
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
