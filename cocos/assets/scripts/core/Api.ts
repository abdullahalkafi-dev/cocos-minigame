// Talks to the MiniGame Studio backend. The page URL carries ?session=<token>; the secret
// license key never reaches this code.
export interface Player { id: string; username: string; balance: number }
export interface Bootstrap { game: string; config: any; player: Player | null; token: string | null }

export class ApiError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

export class Api {
  readonly base: string;
  private token: string;

  constructor() {
    const q = new URLSearchParams(location.search);
    this.token = q.get('session') || '';
    // same-origin by default; ?api=https://host lets a build be hosted on a CDN
    this.base = (q.get('api') || location.origin).replace(/\/$/, '');
  }
  get hasSession() { return !!this.token; }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.base + path, {
        method,
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'Cannot reach the game server. Check your connection.');
    }
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
    return data as T;
  }

  async bootstrap(): Promise<Bootstrap> {
    if (!this.token) throw new ApiError(401, 'This game needs a session link from the website that embeds it.');
    const b = await this.req<Bootstrap>('GET', '/api/play/bootstrap');
    if (b.token) this.token = b.token;
    return b;
  }
  async login(username: string): Promise<Player> {
    const r = await this.req<{ token: string; player: Player }>('POST', '/api/play/login', { username });
    this.token = r.token;
    return r.player;
  }
  spin(bet: number) { return this.req<{ roundId: string; result: any; balance: number }>('POST', '/api/play/spin', { bet }); }
  slots(bet: number) { return this.req<{ roundId: string; result: any; balance: number }>('POST', '/api/play/slots', { bet }); }
  ludoStart() { return this.req<{ matchId: string; balance: number }>('POST', '/api/play/ludo/start', {}); }
  ludoFinish(matchId: string, placement: number) {
    return this.req<{ win: number; placement: number; balance: number }>('POST', '/api/play/ludo/finish', { matchId, placement });
  }
  refill() { return this.req<{ balance: number }>('POST', '/api/play/refill', {}); }
  leaderboard() { return this.req<{ leaderboard: { username: string; won: number }[] }>('GET', '/api/play/leaderboard'); }
}
