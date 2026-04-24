import type { FastifyInstance } from 'fastify';

import {
	RunScheduleNotFoundError,
	RunScheduleService,
	RunScheduleValidationError,
} from './run-schedule.service.js';

type ProfileParams = { id: string };

type UpsertBody = {
	cronExpression?: unknown;
	enabled?: unknown;
};

export function registerRunScheduleRoutes(app: FastifyInstance, service: RunScheduleService): void
{
	app.get<{ Params: ProfileParams }>('/api/profiles/:id/schedule', async (request, reply) => {
		const schedule = service.findByProfile(request.params.id);
		if (!schedule)
		{
			reply.code(404);
			return { error: 'Schedule not found' };
		}

		return schedule;
	});

	app.put<{ Params: ProfileParams; Body: UpsertBody }>('/api/profiles/:id/schedule', async (request, reply) => {
		try
		{
			return service.upsert(request.params.id, {
				cronExpression: typeof request.body?.cronExpression === 'string' ? request.body.cronExpression : '',
				enabled: request.body?.enabled !== false,
			});
		}
		catch (error)
		{
			if (error instanceof RunScheduleValidationError)
			{
				reply.code(400);
				return { error: error.message };
			}

			if (error instanceof RunScheduleNotFoundError)
			{
				reply.code(404);
				return { error: error.message };
			}

			throw error;
		}
	});

	app.delete<{ Params: ProfileParams }>('/api/profiles/:id/schedule', async (request, reply) => {
		service.deleteByProfile(request.params.id);
		reply.code(204);
		return null;
	});
}
