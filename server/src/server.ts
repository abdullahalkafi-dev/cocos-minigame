import { createHttpServer } from './app.js';
import { createContainer } from './container.js';
import { loadEnv } from './config/env.js';
import { createCache } from './infra/cache.js';
import { connectMongo, disconnectMongo } from './infra/mongo.js';
import { startSeamlessWorker } from './modules/seamless/seamless.worker.js';
import { startWebhookWorker } from './modules/webhooks/webhook.worker.js';
import { startWheelWorker } from './modules/lucky-wheel/wheel.worker.js';
import { WheelBetModel, WheelRoundModel } from './modules/lucky-wheel/wheel.model.js';
import { ResultModel } from './modules/results/result.model.js';

const env = loadEnv();
await connectMongo(env.mongoUri);
// the round and bet indexes changed when rooms were added: bring the database in line (drops indexes the code no longer declares)
await Promise.all([WheelRoundModel.syncIndexes(), WheelBetModel.syncIndexes(), ResultModel.syncIndexes()]);
const cache = createCache(env.redisUrl);
const container = createContainer(env, cache);
container.hub.start();
const stopWheelWorker = startWheelWorker({ wheel: container.wheel, cache });
const stopWebhookWorker = startWebhookWorker({ webhooks: container.webhooks, cache });
const stopSeamlessWorker = startSeamlessWorker({ seamless: container.seamless, cache });

const { server, sockets } = createHttpServer(container);
server.listen(env.port, '0.0.0.0', () => {
  console.log(`MiniGame Studio running at ${env.publicUrl} (cache: ${cache.kind})`);
});

async function shutdown() {
  stopWheelWorker(); stopWebhookWorker(); stopSeamlessWorker();
  container.hub.stop();
  sockets.close();
  server.close();
  await cache.close();
  await disconnectMongo();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
