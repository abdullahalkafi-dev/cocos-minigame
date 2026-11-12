import { Api, WheelState } from './Api';

/**
 * Live connection to the server (WebSocket). The server PUSHES the state of the room about once a second and at once
 * when something changes for this player, so the game does not have to ask. If the connection cannot be made or breaks,
 * the caller keeps polling over HTTP (see `healthy`) and this class keeps trying to reconnect in the background.
 *
 * It also measures the difference between the server clock and ours with ping/pong, which keeps the wheel in step for everybody.
 */
export class LiveFeed {
  private ws: WebSocket | null = null;
  private closed = false;
  private retry = 0;
  private lastMsgAt = 0;
  private bestRtt = Infinity;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private api: Api, private onState: (st: WheelState) => void, private onClock: (offsetMs: number) => void) {}

  /** True while messages are arriving: no polling is needed then. */
  get healthy() { return !!this.ws && this.ws.readyState === 1 && Date.now() - this.lastMsgAt < 3500; }

  start() { this.closed = false; this.open(); }
  stop() {
    this.closed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    try { this.ws?.close(); } catch { /* ignore */ }
  }

  private open() {
    let ws: WebSocket;
    try { ws = new WebSocket(this.api.base.replace(/^http/, 'ws') + '/ws'); } catch { this.again(); return; }
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'auth', token: this.api.authToken }));
      this.ping();
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.ping(), 4000);
    };
    ws.onmessage = ev => {
      let m: any;
      try { m = JSON.parse(String(ev.data)); } catch { return; }
      if (m.t === 'state') {
        this.lastMsgAt = Date.now();
        this.retry = 0;                                     // only a working connection resets the back-off
        this.onState(toWheelState(m));
      }
      else if (m.t === 'pong') {
        const now = Date.now(), rtt = now - m.c;
        // the sample with the shortest round trip is the most trustworthy; slowly forget old ones
        this.bestRtt = Math.min(this.bestRtt * 1.05, rtt + 1);
        if (rtt <= this.bestRtt * 1.5) this.onClock(m.s - (m.c + now) / 2);
      }
    };
    ws.onclose = ev => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.ws = null;
      // the server refused this player for good (expired token, game stopped, room closed): reconnecting would only repeat it, and the HTTP polling shows the reason
      if ([4401, 4003, 4004, 4404].includes(ev.code)) { this.closed = true; return; }
      this.again();
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  private ping() { try { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'ping', c: Date.now() })); } catch { /* ignore */ } }
  private again() {
    if (this.closed) return;
    // growing pause plus a random part, so thousands of players do not all come back in the same second after a server restart
    const wait = Math.min(1000 * 2 ** this.retry++, 10000) * (0.5 + Math.random());
    setTimeout(() => { if (!this.closed) this.open(); }, wait);
  }
}

/** The pushed message has the same content as the HTTP state, with the per-player parts at the top level. */
export function toWheelState(m: any): WheelState {
  return {
    serverTime: m.serverTime, balance: m.balance, timing: m.timing, pot: m.pot, mine: m.mine, history: m.history,
    round: { ...m.round, summary: m.winners && m.my ? { winners: m.winners, my: m.my } : null },
  };
}
