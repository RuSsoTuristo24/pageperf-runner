import type { FastifyInstance } from 'fastify';

import type { LlmReportService } from '../analysis/llm-report.service.js';

export function registerRunLlmReportRoutes(
	app: FastifyInstance,
	service: LlmReportService,
): void
{
	app.get('/api/runs/:id/llm-report', async (request, reply) => {
		const params = request.params as { id: string };
		const query = request.query as { pass?: string; page?: string };

		try
		{
			return await service.build(params.id, query.pass, query.page);
		}
		catch (error)
		{
			if (error instanceof Error && error.message === 'Run not found')
			{
				reply.code(404);

				return { error: error.message };
			}

			throw error;
		}
	});
}
