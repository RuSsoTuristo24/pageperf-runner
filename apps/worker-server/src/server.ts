import Fastify from 'fastify';
import {
  captureAuthSession,
  defaultExecuteLiveRun,
  refreshAuthSession,
  validateAuthSession,
} from '@pageperf-runner/worker';

import { registerWorkerRoutes } from './routes.js';
import { checkWorkerHealth } from './health-check.js';

async function main(): Promise<void>
{
  const port = Number(process.env.WORKER_PORT ?? 4311);
  const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
  const display = process.env.DISPLAY ?? ':99';

  const app = Fastify({ logger: true });

  registerWorkerRoutes(app, {
    executeLiveRun: defaultExecuteLiveRun,
    captureAuthSession,
    validateAuthSession,
    refreshAuthSession,
    checkWorker: () => checkWorkerHealth(chromePath, display),
  });

  await app.listen({ port, host: '0.0.0.0' });
  app.log.info({ port, chromePath, display }, 'worker-server ready');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
