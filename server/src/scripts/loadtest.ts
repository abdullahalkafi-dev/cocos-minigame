// Load test: many bot players on one game, each connected over WebSocket and betting in rounds.
//
//   npm run loadtest -w server -- --players 1000 --seconds 80 --bet-rate 0.3
//
// It starts a throw-away MongoDB replica set, runs the REAL server as a child process (so the numbers are the server's
// own, not the bots'), creates the players directly in the database, and reports what the players experienced and what
// the server spent. Everything runs on this one machine: read the numbers as "what one server process can do here".
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import WebSocket from 'ws';
import { sign } from '../common/utils/crypto.js';
import { GameModel } from '../modules/games/game.model.js';
import { PlayerModel } from '../modules/players/player.model.js';
import { UserModel } from '../modules/users/user.model.js';

const arg = (name: string, def: number) => { const i = process.argv.indexOf('--' + name); return i > 0 ? Number(process.argv[i + 1]) : def; };
const PLAYERS = arg('players', 1000), SECONDS = arg('seconds', 80), BET_RATE = arg('bet-rate', 0.3), PORT = arg('port', 3300);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const pct = (a: number[], p: number) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] * 10) / 10; };

const SECRET = 'loadtest-secret';
const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const uri = repl.getUri('loadtest');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mgs-load-'));
const serverRoot = path.resolve(import.meta.dirname, '../..');
const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
  cwd: serverRoot, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, MONGODB_URI: uri, DATA_DIR: dataDir, PORT: String(PORT), PUBLIC_URL: `http://127.0.0.1:${PORT}`, SESSION_SECRET: SECRET, METRICS_TOKEN: 'load', REDIS_URL: process.env.LOADTEST_REDIS_URL ?? '' },
});
child.stdout.on('data', () => { /* drained: an unread pipe would eventually stall the server */ });
child.stderr.on('data', d => { const t = String(d); if (!/ExperimentalWarning/.test(t)) process.stderr.write('[server] ' + t); });
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) break; } catch { /* not yet */ } await sleep(300); }

// ---- data: one buyer, one game with a managed wallet, N players with plenty of coins
await mongoose.connect(uri);
const now = Date.now();
await UserModel.create({ _id: 'usr_load', email: 'load@test.dev', passSalt: 'x', passHash: 'x', balance: 0, createdAt: now });
await GameModel.create({ _id: 'lic_load', userId: 'usr_load', slug: 'lucky-wheel', name: 'Load', config: {}, allowedOrigins: [], status: 'active', walletMode: 'managed', price: 0, createdAt: now });
await PlayerModel.insertMany(Array.from({ length: PLAYERS }, (_, i) => ({ _id: `ply_load_${i}`, gameId: 'lic_load', externalId: `bot-${i}`, displayName: `Bot ${i}`, balance: 1_000_000_000, isPreview: false, createdAt: now, lastSeen: now })), { ordered: false });
console.log(`created ${PLAYERS} players`);

// ---- bots
const agent = new http.Agent({ keepAlive: true, maxSockets: 256 });
const stat = { stateLatency: [] as number[], betLatency: [] as number[], payoutLag: [] as number[], bets: 0, betsOk: 0, betsFailed: {} as Record<string, number>, messages: 0, connected: 0, closed: 0, authFailed: 0 };
const postBet = (token: string, target: string) => new Promise<void>(resolve => {
  const body = JSON.stringify({ bets: [{ target, amount: 30_000 }] });
  const t0 = performance.now();
  const req = http.request({ host: '127.0.0.1', port: PORT, path: '/api/play/wheel/bet', method: 'POST', agent, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), authorization: 'Bearer ' + token } }, res => {
    let raw = ''; res.on('data', c => { raw += c; });
    res.on('end', () => {
      stat.betLatency.push(performance.now() - t0); stat.bets++;
      if (res.statusCode === 200) stat.betsOk++; else { let code = String(res.statusCode); try { code = JSON.parse(raw).code ?? code; } catch { /* keep */ } stat.betsFailed[code] = (stat.betsFailed[code] ?? 0) + 1; }
      resolve();
    });
  });
  req.on('error', () => { stat.bets++; stat.betsFailed.network = (stat.betsFailed.network ?? 0) + 1; resolve(); });
  req.end(body);
});

const sockets: WebSocket[] = [];
let stopping = false;
const connect = (i: number) => new Promise<void>(resolve => {
  const token = sign({ t: 'p', lic: 'lic_load', pid: `ply_load_${i}`, pv: 0, rm: 'main' }, SECRET, 3600);
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  sockets.push(ws);
  let round = -1, paid = false;
  const targets = ['seven', 'plum', 'watermelon'];
  ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', token })));
  ws.on('message', raw => {
    const m = JSON.parse(String(raw));
    if (m.t !== 'state') return;
    if (stat.connected <= i) { /* first message of this bot */ }
    stat.messages++;
    stat.stateLatency.push(Date.now() - m.serverTime);
    if (m.round.no !== round) {
      round = m.round.no; paid = false;
      if (!stopping && m.round.phase === 'betting' && Math.random() < BET_RATE) {
        const window = Math.max(500, m.round.betEnd - Date.now() - 1500);
        setTimeout(() => { if (!stopping) void postBet(token, targets[Math.floor(Math.random() * 3)]); }, Math.random() * window);
      }
    }
    if (m.winners && !paid) { paid = true; stat.payoutLag.push(Date.now() - m.round.spinEnd); }
  });
  ws.on('open', () => { stat.connected++; resolve(); });
  ws.on('close', code => { stat.closed++; if (code === 4401) stat.authFailed++; });
  ws.on('error', () => resolve());
});

const t0 = Date.now();
for (let i = 0; i < PLAYERS; i += 250) {                       // connect in waves so the test machine itself is not the limit
  await Promise.all(Array.from({ length: Math.min(250, PLAYERS - i) }, (_, k) => connect(i + k)));
  await sleep(150);
}
console.log(`${stat.connected}/${PLAYERS} connected in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
stat.stateLatency.length = 0;                                  // measure the steady state only

// ---- run, sampling the server's own numbers every 2 seconds
const samples: any[] = [];
const end = Date.now() + SECONDS * 1000;
while (Date.now() < end) {
  await sleep(2000);
  try { samples.push(await (await fetch(`http://127.0.0.1:${PORT}/api/metrics`, { headers: { 'x-metrics-token': 'load' } })).json()); } catch { /* skip */ }
}
stopping = true;
await sleep(1500);

const cpu = samples.map(s => s.cpuPercent), loop = samples.map(s => s.eventLoopDelayMs.p95), loopMax = samples.map(s => s.eventLoopDelayMs.max);
const report = {
  players: PLAYERS, seconds: SECONDS, betRate: BET_RATE, connected: stat.connected, authFailed: stat.authFailed, droppedDuringTest: stat.closed,
  pushedStateMessagesPerSecond: Math.round(stat.messages / (SECONDS + 1)),
  stateLatencyMs: { p50: pct(stat.stateLatency, 50), p95: pct(stat.stateLatency, 95), p99: pct(stat.stateLatency, 99), max: pct(stat.stateLatency, 100) },
  bets: { sent: stat.bets, ok: stat.betsOk, failed: stat.betsFailed, latencyMs: { p50: pct(stat.betLatency, 50), p95: pct(stat.betLatency, 95), p99: pct(stat.betLatency, 99) } },
  winnersShownAfterSpinEndMs: { p50: pct(stat.payoutLag, 50), p95: pct(stat.payoutLag, 95), max: pct(stat.payoutLag, 100) },
  server: {
    cpuPercentAvg: Math.round((cpu.reduce((a, b) => a + b, 0) / Math.max(1, cpu.length)) * 10) / 10, cpuPercentMax: Math.max(0, ...cpu),
    eventLoopDelayP95Ms: Math.max(0, ...loop), eventLoopDelayMaxMs: Math.max(0, ...loopMax), rssMaxMB: Math.max(0, ...samples.map(s => s.rssMB)),
    hubTickMaxMs: Math.max(0, ...samples.map(s => s.hub.maxTickMs)), cpuCores: os.cpus().length,
  },
};
console.log('\n' + JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(serverRoot, `../tmp/loadtest-${PLAYERS}.json`), JSON.stringify(report, null, 2));

for (const ws of sockets) try { ws.terminate(); } catch { /* ignore */ }
child.kill();
await mongoose.disconnect();
await repl.stop();
process.exit(0);
