import type { FastifyInstance } from 'fastify';

import type { SchedulerService } from './scheduler.service.js';

export function registerSchedulerRoutes(app: FastifyInstance, scheduler: SchedulerService): void
{
	app.get('/api/scheduler/status', async () => ({
		jobs: scheduler.getStatus(),
	}));

	app.post('/api/scheduler/refresh', async () => {
		await scheduler.refresh();

		return { ok: true, jobs: scheduler.getStatus() };
	});
}
