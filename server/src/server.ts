import { createApp } from './app.js';
import { createContainer } from './container.js';
import { loadEnv } from './config/env.js';
import { createCache } from './infra/cache.js';
import { connectMongo, disconnectMongo } from './infra/mongo.js';
import { startWheelWorker } from './modules/lucky-wheel/wheel.worker.js';

const env = loadEnv();
await connectMongo(env.mongoUri);
const cache = createCache(env.redisUrl);
const container = createContainer(env, cache);
const stopWorker = startWheelWorker({ wheel: container.wheel, cache });

const server = createApp(container).listen(env.port, '0.0.0.0', () => {
  console.log(`MiniGame Studio running at ${env.publicUrl} (cache: ${cache.kind})`);
});

async function shutdown() {
  stopWorker();
  server.close();
  await cache.close();
  await disconnectMongo();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
