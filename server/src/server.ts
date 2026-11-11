import { createApp } from './app.js';
import { createContainer } from './container.js';
import { loadEnv } from './config/env.js';
import { createCache } from './infra/cache.js';
import { connectMongo, disconnectMongo } from './infra/mongo.js';
import { startWebhookWorker } from './modules/webhooks/webhook.worker.js';
import { startWheelWorker } from './modules/lucky-wheel/wheel.worker.js';

const env = loadEnv();
await connectMongo(env.mongoUri);
const cache = createCache(env.redisUrl);
const container = createContainer(env, cache);
const stopWheelWorker = startWheelWorker({ wheel: container.wheel, cache });
const stopWebhookWorker = startWebhookWorker({ webhooks: container.webhooks, cache });

const server = createApp(container).listen(env.port, '0.0.0.0', () => {
  console.log(`MiniGame Studio running at ${env.publicUrl} (cache: ${cache.kind})`);
});

async function shutdown() {
  stopWheelWorker();
  stopWebhookWorker();
  server.close();
  await cache.close();
  await disconnectMongo();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
