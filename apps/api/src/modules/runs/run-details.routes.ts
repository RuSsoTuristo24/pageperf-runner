import type { FastifyInstance } from 'fastify';

import { InMemoryRunRepository } from './run.repository.js';

export function registerRunDetailRoutes(
  app: FastifyInstance,
  runs: InMemoryRunRepository,
): void
{
  app.get('/api/runs/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const run = runs.findById(params.id);

    if (!run)
    {
      reply.code(404);

      return { error: 'Run not found' };
    }

    const details = runs.findDetails(params.id);

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
