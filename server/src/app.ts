import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fstatic from '@fastify/static';
import compress from '@fastify/compress';
import rateLimit from '@fastify/rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { Db, tx } from './db.js';
import { GAMES, gameBySlug, sanitizeConfig, fillAssetDefaults } from './catalog.js';
import { wheelState, placeBets, myBets, ranking, settleDue, pruneRounds } from './wheel.js';
import { checkPassword, deepMerge, hashPassword, rid, sha256, sign, verify } from './util.js';

export interface AppOpts {
  db: Db; secret: string; publicUrl: string; uploadsDir: string;
  gamesDir?: string; webRoot?: string; sdkDir?: string; docsDir?: string; defaultsDir?: string; logger?: boolean;
}

const SIGNUP_CREDITS = 10_000;
const SESSION_TTL = 15 * 60;
const PLAYER_TTL = 12 * 3600;
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,20}$/;
const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

type Row = Record<string, any>;

export async function buildApp(o: AppOpts) {
  const { db, secret } = o;
  const app = Fastify({ logger: o.logger ?? false, bodyLimit: 1_000_000, trustProxy: true });
  // Be forgiving: an empty body with a JSON content-type is treated as {}
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body) return done(null, {});
    try { done(null, JSON.parse(body as string)); } catch { done(Object.assign(new Error('Invalid JSON'), { statusCode: 400 })); }
  });
  await app.register(cors, { origin: true, allowedHeaders: ['Authorization', 'Content-Type'], methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] });
  await app.register(compress, { global: true, threshold: 1024, encodings: ['br', 'gzip'] });
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
  fs.mkdirSync(o.uploadsDir, { recursive: true });

  app.addHook('onSend', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    const u = req.url;
    if (u.startsWith('/uploads/')) {
      reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
      reply.header('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    }
    // the dashboard and API must never be framed by other sites; games (/g/) and the SDK are meant to be embedded
    if (!/^\/(g|sdk|uploads)\//.test(u)) reply.header('X-Frame-Options', 'SAMEORIGIN');
  });

  const q = {
    get: (sql: string, ...p: any[]) => db.prepare(sql).get(...p) as Row | undefined,
    all: (sql: string, ...p: any[]) => db.prepare(sql).all(...p) as Row[],
    run: (sql: string, ...p: any[]) => db.prepare(sql).run(...p),
  };
  const now = () => Date.now();
  const bearer = (req: FastifyRequest) => {
    const h = req.headers.authorization;
    return h && h.startsWith('Bearer ') ? h.slice(7).trim() : undefined;
  };
  const fail = (reply: FastifyReply, code: number, error: string) => reply.code(code).send({ error });

  // ---------- helpers ----------
  const resolveConfig = (lic: Row) => {
    const def = gameBySlug(lic.game_slug);
    if (!def) return {};
    return fillAssetDefaults(def, deepMerge(def.defaults, JSON.parse(lic.config || '{}')));
  };
  const absUrl = (u: string) => (u && u.startsWith('/') ? o.publicUrl + u : u);
  /** Config sent to the game: odds/weights stripped, every asset url made absolute. */
  const publicConfig = (lic: Row) => {
    const cfg: any = JSON.parse(JSON.stringify(resolveConfig(lic)));
    const walk = (n: any) => {
      if (Array.isArray(n)) n.forEach(walk);
      else if (n && typeof n === 'object') for (const k of Object.keys(n)) {
        if (k === 'url' && typeof n[k] === 'string') n[k] = absUrl(n[k]); else walk(n[k]);
      }
    };
    walk(cfg);
    if (Array.isArray(cfg.segments)) cfg.segments = cfg.segments.map((x: any) => ({ target: x.target }));
    return cfg;
  };
  const userView = (u: Row) => ({ id: u.id, email: u.email, balance: u.balance, hasApiKey: !!u.api_key_hash, apiKeyPrefix: u.api_key_prefix ?? null });
  const licenseView = (l: Row) => ({
    id: l.id, gameId: l.id, name: l.name, game: l.game_slug, status: l.status,
    allowedOrigins: l.allowed_origins ? l.allowed_origins.split(',') : [], createdAt: l.created_at, price: l.price,
  });
  const playerView = (p: Row) => ({ id: p.id, username: p.username, balance: p.balance });
  const newKey = () => 'mgs_' + rid('', 32);

  const authUser = (req: FastifyRequest, reply: FastifyReply): Row | null => {
    const t = verify<{ t: string; uid: string }>(bearer(req), secret);
    const u = t && t.t === 'u' ? q.get('SELECT * FROM users WHERE id = ?', t.uid) : undefined;
    if (!u) { fail(reply, 401, 'Please sign in again'); return null; }
    return u;
  };
  const ownLicense = (req: FastifyRequest, reply: FastifyReply): { user: Row; lic: Row } | null => {
    const user = authUser(req, reply); if (!user) return null;
    const lic = q.get('SELECT * FROM licenses WHERE id = ? AND user_id = ?', (req.params as any).id, user.id);
    if (!lic) { fail(reply, 404, 'Game not found'); return null; }
    return { user, lic };
  };

  // ---------- buyer auth & wallet ----------
  app.post('/api/auth/register', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { email, password } = (req.body ?? {}) as any;
    if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(reply, 400, 'Enter a valid email');
    if (typeof password !== 'string' || password.length < 8) return fail(reply, 400, 'Password must be at least 8 characters');
    const e = email.toLowerCase();
    if (q.get('SELECT id FROM users WHERE email = ?', e)) return fail(reply, 409, 'This email is already registered');
    const { salt, hash } = hashPassword(password);
    const id = rid('usr_');
    const apiKey = newKey();
    tx(db, () => {
      q.run('INSERT INTO users (id,email,pass_salt,pass_hash,balance,created_at,api_key_hash,api_key_prefix) VALUES (?,?,?,?,?,?,?,?)', id, e, salt, hash, SIGNUP_CREDITS, now(), sha256(apiKey), apiKey.slice(0, 12));
      q.run('INSERT INTO wallet_tx (user_id,delta,reason,created_at) VALUES (?,?,?,?)', id, SIGNUP_CREDITS, 'Welcome demo credits', now());
    });
    // the key is shown once; only its hash is stored
    return { token: sign({ t: 'u', uid: id }, secret, 7 * 86400), user: userView(q.get('SELECT * FROM users WHERE id = ?', id)!), apiKey };
  });
  app.post('/api/auth/login', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { email, password } = (req.body ?? {}) as any;
    const u = typeof email === 'string' ? q.get('SELECT * FROM users WHERE email = ?', email.toLowerCase()) : undefined;
    if (!u || typeof password !== 'string' || !checkPassword(password, u.pass_salt, u.pass_hash)) return fail(reply, 401, 'Wrong email or password');
    return { token: sign({ t: 'u', uid: u.id }, secret, 7 * 86400), user: userView(u) };
  });
  app.get('/api/me', async (req, reply) => {
    const u = authUser(req, reply); if (!u) return;
    return { user: userView(u), transactions: q.all('SELECT delta,reason,created_at FROM wallet_tx WHERE user_id = ? ORDER BY id DESC LIMIT 20', u.id) };
  });
  // ---------- the ONE secret API key of the account (works for every game the account owns) ----------
  app.get('/api/account/api-key', async (req, reply) => {
    const u = authUser(req, reply); if (!u) return;
    return { hasKey: !!u.api_key_hash, prefix: u.api_key_prefix ?? null };
  });
  app.post('/api/account/api-key', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const u = authUser(req, reply); if (!u) return;
    const key = newKey();   // create (if the account has none) or rotate (the old key stops working immediately)
    q.run('UPDATE users SET api_key_hash = ?, api_key_prefix = ? WHERE id = ?', sha256(key), key.slice(0, 12), u.id);
    return { apiKey: key, prefix: key.slice(0, 12) };
  });
  app.post('/api/wallet/topup', async (req, reply) => {
    const u = authUser(req, reply); if (!u) return;
    tx(db, () => {
      q.run('UPDATE users SET balance = balance + 5000 WHERE id = ?', u.id);
      q.run('INSERT INTO wallet_tx (user_id,delta,reason,created_at) VALUES (?,?,?,?)', u.id, 5000, 'Demo top-up', now());
    });
    return { user: userView(q.get('SELECT * FROM users WHERE id = ?', u.id)!) };
  });

  // ---------- store ----------
  app.get('/api/store', async () => ({
    games: GAMES.map(g => ({ slug: g.slug, name: g.name, tagline: g.tagline, price: g.price, tech: g.tech })),
  }));
  app.post('/api/store/:slug/buy', async (req, reply) => {
    const u = authUser(req, reply); if (!u) return;
    const def = gameBySlug((req.params as any).slug);
    if (!def) return fail(reply, 404, 'Unknown game');
    const id = rid('lic_', 7);
    try {
      tx(db, () => {
        const fresh = q.get('SELECT balance FROM users WHERE id = ?', u.id)!;
        if (fresh.balance < def.price) throw new Error('INSUFFICIENT');
        const n = (q.get('SELECT COUNT(*) c FROM licenses WHERE user_id = ? AND game_slug = ?', u.id, def.slug)!.c as number) + 1;
        q.run('UPDATE users SET balance = balance - ? WHERE id = ?', def.price, u.id);
        q.run('INSERT INTO wallet_tx (user_id,delta,reason,created_at) VALUES (?,?,?,?)', u.id, -def.price, `Purchased ${def.name}`, now());
        // key_hash/key_prefix are legacy columns (one key per account now); keep them unique placeholders
        q.run('INSERT INTO licenses (id,user_id,game_slug,name,key_hash,key_prefix,price,created_at) VALUES (?,?,?,?,?,?,?,?)',
          id, u.id, def.slug, `${def.name} #${n}`, 'unused:' + id, '', def.price, now());
      });
    } catch (e: any) {
      if (e.message === 'INSUFFICIENT') return fail(reply, 402, 'Not enough demo credits. Top up your wallet first.');
      throw e;
    }
    return { license: licenseView(q.get('SELECT * FROM licenses WHERE id = ?', id)!), balance: q.get('SELECT balance FROM users WHERE id = ?', u.id)!.balance };
  });

  // ---------- buyer: my games ----------
  app.get('/api/licenses', async (req, reply) => {
    const u = authUser(req, reply); if (!u) return;
    return {
      licenses: q.all('SELECT * FROM licenses WHERE user_id = ? ORDER BY created_at DESC', u.id).map(l => ({
        ...licenseView(l),
        stats: q.get(`SELECT COUNT(DISTINCT p.id) players, COUNT(r.id) rounds, COALESCE(SUM(r.bet),0) bet, COALESCE(SUM(r.win),0) win
                      FROM players p LEFT JOIN rounds r ON r.player_id = p.id AND r.status='done' WHERE p.license_id = ? AND p.is_preview = 0`, l.id),
      })),
    };
  });
  app.get('/api/licenses/:id', async (req, reply) => {
    const c = ownLicense(req, reply); if (!c) return;
    const def = gameBySlug(c.lic.game_slug);
    if (!def) return fail(reply, 404, 'Unknown game');
    return {
      license: licenseView(c.lic), game: { slug: def.slug, name: def.name, manifest: def.manifest, tech: def.tech },
      config: resolveConfig(c.lic), defaults: def.defaults, publicUrl: o.publicUrl,
    };
  });
  app.put('/api/licenses/:id/config', async (req, reply) => {
    const c = ownLicense(req, reply); if (!c) return;
    const def = gameBySlug(c.lic.game_slug);
    if (!def) return fail(reply, 404, 'Unknown game');
    const r = sanitizeConfig(def, (req.body as any)?.config);
    if (!r.ok) return fail(reply, 400, r.error);
    // merge into what the buyer already customised, so partial updates never wipe other settings
    const merged = JSON.stringify(deepMerge(JSON.parse(c.lic.config || '{}'), r.config));
    const problem = def.validate?.(fillAssetDefaults(def, deepMerge(def.defaults, JSON.parse(merged))));
    if (problem) return fail(reply, 400, problem);
    q.run('UPDATE licenses SET config = ? WHERE id = ?', merged, c.lic.id);
    return { config: resolveConfig({ ...c.lic, config: merged }) };
  });
  app.put('/api/licenses/:id', async (req, reply) => {
    const c = ownLicense(req, reply); if (!c) return;
    const { name, allowedOrigins } = (req.body ?? {}) as any;
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim() || name.length > 40) return fail(reply, 400, 'Name must be 1-40 characters');
      q.run('UPDATE licenses SET name = ? WHERE id = ?', name.trim(), c.lic.id);
    }
    if (allowedOrigins !== undefined) {
      const list = (Array.isArray(allowedOrigins) ? allowedOrigins : []).map((s: any) => String(s).trim()).filter(Boolean);
      if (list.some((s: string) => !/^https?:\/\/[\w.-]+(:\d+)?$/.test(s))) return fail(reply, 400, 'Origins look like https://example.com (no path)');
      q.run('UPDATE licenses SET allowed_origins = ? WHERE id = ?', list.join(','), c.lic.id);
    }
    return { license: licenseView(q.get('SELECT * FROM licenses WHERE id = ?', c.lic.id)!) };
  });
  app.post('/api/licenses/:id/preview-session', async (req, reply) => {
    const c = ownLicense(req, reply); if (!c) return;
    const token = sign({ t: 's', lic: c.lic.id, pv: 1 }, secret, SESSION_TTL);
    return { playUrl: `${o.publicUrl}/g/${c.lic.game_slug}/?session=${token}&v=${now()}` };
  });
  app.post('/api/licenses/:id/upload', async (req, reply) => {
    const c = ownLicense(req, reply); if (!c) return;
    const kind = String((req.query as any).kind || 'image') as 'image' | 'video' | 'audio' | 'media';
    const file = await req.file();
    if (!file) return fail(reply, 400, 'No file');
    const buf = await file.toBuffer();
    if (file.file.truncated) return fail(reply, 413, 'File is too large (max 12 MB)');
    const m = sniffMedia(buf);
    if (!m) return fail(reply, 400, 'Unsupported file. Use PNG, JPG, WebP, GIF, SVG, MP4, WebM, MP3, OGG, WAV or M4A.');
    const allowed: Record<string, string[]> = { image: ['image', 'svg'], video: ['video'], audio: ['audio'], media: ['image', 'svg', 'video'] };
    if (!(allowed[kind] || allowed.image).includes(m.type)) return fail(reply, 400, `This slot needs ${kind === 'media' ? 'an image, SVG or video' : kind === 'image' ? 'an image or SVG' : kind}, but the file is ${m.type}`);
    if (m.type === 'svg' && !svgIsSafe(buf.toString('utf8'))) return fail(reply, 400, 'This SVG contains scripts or external references and was rejected');
    const limit = UPLOAD_LIMITS[m.type];
    if (buf.length > limit) return fail(reply, 413, `${m.type.toUpperCase()} files can be at most ${Math.round(limit / 1024 / 1024 * 10) / 10} MB`);
    const dir = path.join(o.uploadsDir, c.lic.id);
    fs.mkdirSync(dir, { recursive: true });
    const used = fs.readdirSync(dir).reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0);
    if (used + buf.length > 150 * 1024 * 1024) return fail(reply, 413, 'Storage limit for this game reached (150 MB)');
    const name = `${rid('', 8)}.${m.ext}`;
    fs.writeFileSync(path.join(dir, name), buf);
    return { url: `/uploads/${c.lic.id}/${name}`, type: m.type, size: buf.length, name: file.filename };
  });

  // ---------- buyer: players & results ----------
  app.get('/api/licenses/:id/stats', async (req, reply) => {
    const c = ownLicense(req, reply); if (!c) return;
    const t = q.get(`SELECT COUNT(DISTINCT p.id) players, COUNT(r.id) rounds, COALESCE(SUM(r.bet),0) bet, COALESCE(SUM(r.win),0) win
                     FROM players p LEFT JOIN rounds r ON r.player_id = p.id AND r.status='done' WHERE p.license_id = ? AND p.is_preview = 0`, c.lic.id)!;
    const top = q.all(`SELECT p.username, SUM(r.win) win, COUNT(r.id) rounds FROM rounds r JOIN players p ON p.id = r.player_id
                       WHERE r.license_id = ? AND p.is_preview = 0 AND r.status='done' GROUP BY p.id HAVING win > 0 ORDER BY win DESC LIMIT 5`, c.lic.id);
    const daily = q.all(`SELECT strftime('%Y-%m-%d', r.created_at/1000, 'unixepoch') day, COUNT(*) rounds, SUM(r.bet) bet, SUM(r.win) win
                         FROM rounds r JOIN players p ON p.id = r.player_id WHERE r.license_id = ? AND p.is_preview = 0 AND r.status='done'
                         GROUP BY day ORDER BY day DESC LIMIT 14`, c.lic.id).reverse();
    return { totals: { ...t, rtp: t.bet ? t.win / t.bet : 0 }, topWinners: top, daily };
  });
  app.get('/api/licenses/:id/players', async (req, reply) => {
    const c = ownLicense(req, reply); if (!c) return;
    return {
      players: q.all(`SELECT p.id, p.username, p.balance, p.created_at, p.last_seen, COUNT(r.id) rounds,
                      COALESCE(SUM(r.bet),0) totalBet, COALESCE(SUM(r.win),0) totalWin
                      FROM players p LEFT JOIN rounds r ON r.player_id = p.id AND r.status='done'
                      WHERE p.license_id = ? AND p.is_preview = 0 GROUP BY p.id ORDER BY p.last_seen DESC LIMIT 500`, c.lic.id),
    };
  });
  app.get('/api/licenses/:id/rounds', async (req, reply) => {
    const c = ownLicense(req, reply); if (!c) return;
    const { limit = '50', offset = '0', player } = req.query as any;
    const lim = Math.min(200, Math.max(1, Number(limit) || 50)), off = Math.max(0, Number(offset) || 0);
    const rows = q.all(`SELECT r.id, p.username, r.bet, r.win, r.outcome, r.created_at FROM rounds r JOIN players p ON p.id = r.player_id
                        WHERE r.license_id = ? AND p.is_preview = 0 AND r.status='done' ${player ? 'AND p.username = ?' : ''}
                        ORDER BY r.created_at DESC LIMIT ? OFFSET ?`, ...(player ? [c.lic.id, String(player), lim, off] : [c.lic.id, lim, off]));
    return { rounds: rows.map(r => ({ ...r, outcome: JSON.parse(r.outcome) })) };
  });
  app.get('/api/licenses/:id/export.csv', async (req, reply) => {
    const c = ownLicense(req, reply); if (!c) return;
    const kind = (req.query as any).kind === 'players' ? 'players' : 'rounds';
    const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    let csv: string;
    if (kind === 'players') {
      const rows = q.all(`SELECT p.username, p.balance, p.created_at, p.last_seen, COUNT(r.id) rounds, COALESCE(SUM(r.bet),0) bet, COALESCE(SUM(r.win),0) win
                          FROM players p LEFT JOIN rounds r ON r.player_id = p.id AND r.status='done' WHERE p.license_id = ? AND p.is_preview = 0 GROUP BY p.id`, c.lic.id);
      csv = 'username,balance,rounds,total_bet,total_win,first_seen,last_seen\n' + rows.map(r => [r.username, r.balance, r.rounds, r.bet, r.win, new Date(r.created_at).toISOString(), new Date(r.last_seen).toISOString()].map(esc).join(',')).join('\n');
    } else {
      const rows = q.all(`SELECT r.created_at, p.username, r.bet, r.win, r.outcome FROM rounds r JOIN players p ON p.id = r.player_id
                          WHERE r.license_id = ? AND p.is_preview = 0 AND r.status='done' ORDER BY r.created_at DESC`, c.lic.id);
      csv = 'time,username,bet,win,result\n' + rows.map(r => [new Date(r.created_at).toISOString(), r.username, r.bet, r.win, JSON.parse(r.outcome).summary].map(esc).join(',')).join('\n');
    }
    return reply.header('Content-Type', 'text/csv').header('Content-Disposition', `attachment; filename="${kind}.csv"`).send(csv);
  });

  // ---------- server-to-server (authenticated with the account API key) ----------
  const apiAccount = (req: FastifyRequest, reply: FastifyReply): Row | null => {
    const key = bearer(req);
    const u = key && key.startsWith('mgs_') ? q.get('SELECT * FROM users WHERE api_key_hash = ?', sha256(key)) : undefined;
    if (!u) { fail(reply, 401, 'Invalid API key. Send it as "Authorization: Bearer <your API key>".'); return null; }
    return u;
  };
  /** The games this account owns (id = the value to send as gameId). */
  app.get('/api/v1/games', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
    const u = apiAccount(req, reply); if (!u) return;
    return { games: q.all('SELECT * FROM licenses WHERE user_id = ? ORDER BY created_at', u.id).map(l => ({ gameId: l.id, name: l.name, game: l.game_slug, status: l.status })) };
  });
  /** Create a 15-minute play session for one of the account's games. */
  app.post('/api/v1/sessions', { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (req, reply) => {
    const u = apiAccount(req, reply); if (!u) return;
    const { gameId, username } = (req.body ?? {}) as any;
    if (typeof gameId !== 'string' || !gameId) return fail(reply, 400, 'gameId is required. List yours with GET /api/v1/games or copy it from the dashboard.');
    const lic = q.get('SELECT * FROM licenses WHERE id = ? AND user_id = ?', gameId, u.id);
    if (!lic || !gameBySlug(lic.game_slug)) return fail(reply, 404, 'Game not found for this API key');
    if (lic.status !== 'active') return fail(reply, 403, 'This game is not active');
    if (username !== undefined && (typeof username !== 'string' || !USERNAME_RE.test(username))) return fail(reply, 400, 'username must be 3-20 chars: letters, numbers, _ . -');
    const token = sign({ t: 's', lic: lic.id, ...(username ? { u: username } : {}) }, secret, SESSION_TTL);
    return { sessionToken: token, playUrl: `${o.publicUrl}/g/${lic.game_slug}/?session=${token}`, expiresIn: SESSION_TTL, gameId: lic.id, game: lic.game_slug };
  });

  // ---------- player-facing API (session token / player token) ----------
  const getOrCreatePlayer = (lic: Row, username: string, preview: boolean): Row => {
    const startBal = Number(resolveConfig(lic).startingBalance) || 0;
    let p = q.get('SELECT * FROM players WHERE license_id = ? AND username = ?', lic.id, username);
    if (!p) {
      q.run('INSERT INTO players (id,license_id,username,balance,is_preview,created_at,last_seen) VALUES (?,?,?,?,?,?,?)',
        rid('ply_', 8), lic.id, username, startBal, preview ? 1 : 0, now(), now());
      p = q.get('SELECT * FROM players WHERE license_id = ? AND username = ?', lic.id, username)!;
    } else q.run('UPDATE players SET last_seen = ? WHERE id = ?', now(), p.id);
    return p;
  };
  const playerToken = (p: Row, lic: Row, pv: boolean) => sign({ t: 'p', lic: lic.id, pid: p.id, pv: pv ? 1 : 0 }, secret, PLAYER_TTL);
  const sessionCtx = (req: FastifyRequest, reply: FastifyReply) => {
    const t = verify<{ t: string; lic: string; u?: string; pid?: string; pv?: number }>(bearer(req), secret);
    const lic = t ? q.get('SELECT * FROM licenses WHERE id = ?', t.lic) : undefined;
    if (!t || !lic || lic.status !== 'active') { fail(reply, 401, 'Session expired. Reload the game.'); return null; }
    return { t, lic };
  };
  const playerCtx = (req: FastifyRequest, reply: FastifyReply, game?: string) => {
    const c = sessionCtx(req, reply); if (!c) return null;
    const p = c.t.t === 'p' ? q.get('SELECT * FROM players WHERE id = ?', c.t.pid) : undefined;
    if (!p) { fail(reply, 401, 'Please enter your username first'); return null; }
    if (game && c.lic.game_slug !== game) { fail(reply, 400, 'Wrong game'); return null; }
    return { lic: c.lic, p, cfg: resolveConfig(c.lic) };
  };

  app.get('/api/play/bootstrap', async (req, reply) => {
    const c = sessionCtx(req, reply); if (!c) return;
    let player: Row | undefined, token: string | undefined;
    if (c.t.t === 'p') player = q.get('SELECT * FROM players WHERE id = ?', c.t.pid);
    else if (c.t.u) { player = getOrCreatePlayer(c.lic, c.t.u, !!c.t.pv); token = playerToken(player, c.lic, !!c.t.pv); }
    return { game: c.lic.game_slug, config: publicConfig(c.lic), player: player ? playerView(player) : null, token: token ?? null };
  });
  app.post('/api/play/login', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const c = sessionCtx(req, reply); if (!c) return;
    const username = String(((req.body ?? {}) as any).username ?? '').trim();
    if (!USERNAME_RE.test(username)) return fail(reply, 400, 'Username must be 3-20 characters: letters, numbers, _ . -');
    const p = getOrCreatePlayer(c.lic, username, !!c.t.pv);
    return { token: playerToken(p, c.lic, !!c.t.pv), player: playerView(p) };
  });
  app.get('/api/play/me', async (req, reply) => {
    const c = playerCtx(req, reply); if (!c) return;
    return { player: playerView(c.p) };
  });
  app.post('/api/play/refill', async (req, reply) => {
    const c = playerCtx(req, reply); if (!c) return;
    const min = Math.min(...((c.cfg.chips as any[]) || [{ value: 1 }]).map(x => x.value));
    if (c.p.balance >= min) return fail(reply, 400, 'You still have enough balance to play');
    q.run('UPDATE players SET balance = ? WHERE id = ?', Number(c.cfg.startingBalance) || 0, c.p.id);
    return { balance: Number(c.cfg.startingBalance) || 0 };
  });

  // ---------- Lucky Wheel (shared round clock) ----------
  const wheel = (req: FastifyRequest, reply: FastifyReply) => playerCtx(req, reply, 'lucky-wheel');
  app.get('/api/play/wheel/state', { config: { rateLimit: { max: 150, timeWindow: '1 minute' } } }, async (req, reply) => {
    const c = wheel(req, reply); if (!c) return;
    q.run('UPDATE players SET last_seen = ? WHERE id = ?', now(), c.p.id);
    return wheelState(db, c.lic.id, c.cfg, c.p, now());
  });
  app.post('/api/play/wheel/bet', { config: { rateLimit: { max: 240, timeWindow: '1 minute' } } }, async (req, reply) => {
    const c = wheel(req, reply); if (!c) return;
    const bets = ((req.body ?? {}) as any).bets;
    if (!Array.isArray(bets) || !bets.length || bets.length > 24) return fail(reply, 400, 'Invalid bets');
    const list = bets.map((b: any) => ({ target: String(b?.target ?? ''), amount: Number(b?.amount) }));
    return { ...placeBets(db, c.lic.id, c.cfg, c.p, list, now()) };
  });
  app.get('/api/play/wheel/mybets', async (req, reply) => {
    const c = wheel(req, reply); if (!c) return;
    settleDue(db, c.lic.id, now());
    return { bets: myBets(db, c.p.id) };
  });
  app.get('/api/play/wheel/ranking', async (req, reply) => {
    const c = wheel(req, reply); if (!c) return;
    settleDue(db, c.lic.id, now());
    return ranking(db, c.lic.id, c.p);
  });
  // settle finished rounds even when nobody is polling, so dashboards and balances stay current
  const settleTimer = setInterval(() => { try { settleDue(db, null, Date.now()); } catch { /* keep running */ } }, 2000);
  settleTimer.unref();
  // keep the database small: idle rounds nobody bet on are dropped after a few days
  const pruneTimer = setInterval(() => { try { pruneRounds(db, Date.now()); } catch { /* keep running */ } }, 10 * 60_000);
  pruneTimer.unref();
  app.addHook('onClose', async () => { clearInterval(settleTimer); clearInterval(pruneTimer); });

  // ---------- static: uploads, game builds (with frame-ancestors), sdk, dashboard ----------
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/g/')) return;
    const m = /[?&]session=([^&]+)/.exec(req.url);
    const t = m ? verify<{ lic: string }>(decodeURIComponent(m[1]), secret) : null;
    const lic = t ? q.get('SELECT allowed_origins FROM licenses WHERE id = ?', t.lic) : undefined;
    const origins = lic?.allowed_origins ? lic.allowed_origins.split(',') : [];
    if (origins.length) reply.header('Content-Security-Policy', `frame-ancestors 'self' ${origins.join(' ')}`);
  });
  await app.register(fstatic, { root: path.resolve(o.uploadsDir), prefix: '/uploads/', decorateReply: false, maxAge: '1h' });
  if (o.gamesDir && fs.existsSync(o.gamesDir)) await app.register(fstatic, { root: path.resolve(o.gamesDir), prefix: '/g/', decorateReply: false, cacheControl: false, setHeaders: res => res.setHeader('Cache-Control', 'no-cache') });
  if (o.sdkDir && fs.existsSync(o.sdkDir)) await app.register(fstatic, { root: path.resolve(o.sdkDir), prefix: '/sdk/', decorateReply: false, cacheControl: false, setHeaders: res => res.setHeader('Cache-Control', 'no-cache') });
  if (o.defaultsDir && fs.existsSync(o.defaultsDir)) await app.register(fstatic, { root: path.resolve(o.defaultsDir), prefix: '/defaults/', decorateReply: false, maxAge: '7d', immutable: false });
  if (o.docsDir && fs.existsSync(o.docsDir)) await app.register(fstatic, { root: path.resolve(o.docsDir), prefix: '/docs/', decorateReply: false, cacheControl: false, setHeaders: res => res.setHeader('Cache-Control', 'no-cache') });
  if (o.webRoot && fs.existsSync(o.webRoot)) {
    await app.register(fstatic, { root: path.resolve(o.webRoot), prefix: '/', decorateReply: true, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !/^\/(api|g|uploads|sdk)\//.test(req.url)) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'Not found' });
    });
  }
  app.get('/api/health', async () => ({ ok: true, time: now() }));
  app.setErrorHandler((err: any, _req, reply) => {
    const code = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (code === 500) app.log.error(err);
    reply.code(code).send({ error: code === 500 ? 'Server error' : err.message });
  });
  return app;
}

const UPLOAD_LIMITS: Record<string, number> = { image: 3 * 1024 * 1024, svg: 300 * 1024, video: 10 * 1024 * 1024, audio: 4 * 1024 * 1024 };

/** Identify an upload by its file signature (never by its name or declared type). */
function sniffMedia(b: Buffer): { type: 'image' | 'svg' | 'video' | 'audio'; ext: string } | null {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return { type: 'image', ext: 'png' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image', ext: 'jpg' };
  if (b.toString('latin1', 0, 4) === 'GIF8') return { type: 'image', ext: 'gif' };
  if (b.toString('latin1', 0, 4) === 'RIFF') {
    const k = b.toString('latin1', 8, 12);
    if (k === 'WEBP') return { type: 'image', ext: 'webp' };
    if (k === 'WAVE') return { type: 'audio', ext: 'wav' };
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { type: 'video', ext: 'webm' };
  if (b.toString('latin1', 4, 8) === 'ftyp') { const brand = b.toString('latin1', 8, 12); return brand === 'M4A ' || brand === 'M4B ' ? { type: 'audio', ext: 'm4a' } : { type: 'video', ext: 'mp4' }; }
  if (b.toString('latin1', 0, 4) === 'OggS') return { type: 'audio', ext: 'ogg' };
  if (b.toString('latin1', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { type: 'audio', ext: 'mp3' };
  const head = b.toString('utf8', 0, 600).trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return { type: 'svg', ext: 'svg' };
  return null;
}
/** SVGs are rejected (not "cleaned") when they could run code or load anything from outside. */
export function svgIsSafe(t: string): boolean {
  if (/<script|<foreignobject|<iframe|<embed|<object|<audio|<video|<!entity|<!doctype[^>]*\[|@import|javascript:|vbscript:/i.test(t)) return false;
  if (/\son[a-z]+\s*=/i.test(t)) return false;
  if (/(?:xlink:)?href\s*=\s*["']\s*(?!#|data:image\/(?:png|jpe?g|webp|gif);base64,)/i.test(t)) return false;
  if (/url\(\s*["']?\s*(?:https?:|\/\/|javascript:)/i.test(t)) return false;
  return true;
}
