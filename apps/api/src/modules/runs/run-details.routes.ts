import type { FastifyInstance } from 'fastify';

import type { RunRepository } from './run.repository.types.js';

export function registerRunDetailRoutes(
  app: FastifyInstance,
  runs: RunRepository,
): void
{
  app.get('/api/runs/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const run = await runs.findById(params.id);

    if (!run)
    {
      reply.code(404);

      return { error: 'Run not found' };
    }

    const details = await runs.findDetails(params.id);

    return {
      run,
      pageMetrics: details.pageMetrics,
      requests: details.requests,
      artifacts: details.artifacts,
      passes: details.passes ?? [],
      traceSummary: details.traceSummary,
      jsExecutionSummary: details.jsExecutionSummary,
      coverageSummary: details.coverageSummary,
      pageDiagnostics: details.pageDiagnostics,
      pages: details.pages ?? [],
    };
  });
}
