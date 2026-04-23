import type { FastifyInstance } from 'fastify';

export type AppConfig = {
  vncUrl: string | null;
};

export function registerConfigRoutes(app: FastifyInstance, config: AppConfig): void
{
  app.get('/api/config', async () => config);
}
