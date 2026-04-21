import type { FastifyInstance } from 'fastify';

export type HealthDeps = {
	checkDb: () => Promise<boolean>;
	checkWorker: () => Promise<boolean>;
};

export function registerHealthRoutes(app: FastifyInstance, deps?: HealthDeps): void
{
	if (!deps)
	{
		app.get('/health', async () => ({ ok: true }));
		return;
	}

	app.get('/health', async (_req, reply) => {
		const [db, worker] = await Promise.all([
			deps.checkDb().catch(() => false),
			deps.checkWorker().catch(() => false),
		]);
		const ok = db && worker;
		reply.code(ok ? 200 : 503);
		return {
			ok,
			db: db ? 'ok' : 'fail',
			worker: worker ? 'ok' : 'fail',
		};
	});
}
