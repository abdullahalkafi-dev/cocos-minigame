// Shared setup for integration tests: a throw-away MongoDB replica set (needed for transactions),
// the real app on an ephemeral port, and small helpers that talk to it like a client would.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { createContainer } from '../container.js';
import { createMemoryCache } from '../infra/cache.js';
import { connectMongo, disconnectMongo } from '../infra/mongo.js';
import { WheelRoundModel } from '../modules/lucky-wheel/wheel.model.js';
import { LedgerModel } from '../modules/ledger/ledger.model.js';

export async function startHarness() {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectMongo(repl.getUri('mgs_test'));
  await Promise.all(Object.values(mongoose.models).map(m => m.init()));       // build indexes before the first request
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mgs-'));
  const cache = createMemoryCache();
  const env = { nodeEnv: 'test', port: 0, publicUrl: 'http://x.test', dataDir: dir, uploadsDir: dir, mongoUri: '', secret: 'test-secret', publicDir: dir, allowPrivateWebhooks: true };
  const container = createContainer(env, cache);
  const server = createApp(container).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const call = async (method: string, url: string, token?: string, body?: unknown) => {
    const r = await fetch(base + url, {
      method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    const isJson = r.headers.get('content-type')?.includes('json');
    return { status: r.status, body: isJson && text ? JSON.parse(text) : text, headers: r.headers };
  };
  const upload = async (gameId: string, token: string, kind: string, bytes: Buffer, name = 'f.bin') => {
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(bytes)]), name);
    const r = await fetch(`${base}/api/licenses/${gameId}/upload?kind=${kind}`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd });
    return { status: r.status, body: await r.json() };
  };
  /** A buyer with one game. By default the game allows guest login (players type a name), like the demo; pass { guest: false } for a real client setup. */
  const buyer = async (email = 'b@test.com', o: { guest?: boolean; wallet?: 'demo' | 'managed' } = {}) => {
    const reg = await call('POST', '/api/auth/register', undefined, { email, password: 'password123' });
    const T = reg.body.token as string;
    const apiKey = reg.body.apiKey as string;          // ONE key per account, returned once at sign-up
    const bought = await call('POST', '/api/store/lucky-wheel/buy', T);
    const settings: Record<string, unknown> = {};
    if (o.guest ?? true) settings.guestLogin = true;
    if (o.wallet) settings.walletMode = o.wallet;
    if (Object.keys(settings).length) await call('PUT', `/api/licenses/${bought.body.license.id}`, T, settings);
    const sess = await call('POST', '/api/v1/sessions', apiKey, { gameId: bought.body.license.id, ...(o.guest === false ? { playerId: 'session_probe' } : {}) });
    return { T, lic: bought.body.license.id as string, apiKey, session: sess.body.sessionToken as string };
  };
  const player = async (session: string, username: string) => (await call('POST', '/api/play/login', session, { username })).body.token as string;
  /** Pretend `ms` milliseconds have passed for every round. */
  const age = async (ms: number) => {
    await WheelRoundModel.updateMany({}, [{ $set: { startAt: { $subtract: ['$startAt', ms] }, betEnd: { $subtract: ['$betEnd', ms] }, spinEnd: { $subtract: ['$spinEnd', ms] }, endAt: { $subtract: ['$endAt', ms] } } }]);
    await cache.flush();
  };
  const reset = async () => { await Promise.all(Object.values(mongoose.models).map(m => m.deleteMany({}))); await cache.flush(); };
  /** Sum of all ledger deltas of a player (must always equal their balance). */
  const ledgerSum = async (playerId: string) => (await LedgerModel.find({ playerId }).lean()).reduce((a, e) => a + e.delta, 0);
  const stop = async () => { server.close(); await cache.close(); await disconnectMongo(); await repl.stop(); };

  return { container, base, call, upload, buyer, player, age, reset, ledgerSum, stop };
}
