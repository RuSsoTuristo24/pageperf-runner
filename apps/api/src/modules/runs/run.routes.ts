import type { FastifyInstance } from 'fastify';

import { RunDependencyError, RunService, RunValidationError } from './run.service.js';

export function registerRunRoutes(app: FastifyInstance, service: RunService): void
{
  app.get('/api/runs', async () => service.list());

  app.post('/api/runs', async (request, reply) => {
    try
    {
      const run = service.create(request.body);

      reply.code(201);

      return run;
    }
    catch (error)
    {
      if (error instanceof RunValidationError)
      {
        reply.code(400);

        return { error: error.message };
      }

      if (error instanceof RunDependencyError)
      {
        reply.code(404);

        return { error: error.message };
      }

      throw error;
    }
  });

  app.post('/api/runs/:id/start', async (request, reply) => {
    try
    {
      return await service.start((request.params as { id: string }).id);
    }
    catch (error)
    {
      if (error instanceof RunValidationError)
      {
        reply.code(400);

        return { error: error.message };
      }

      if (error instanceof RunDependencyError)
      {
        reply.code(404);

        return { error: error.message };
      }

      throw error;
    }
  });

  app.delete('/api/runs/:id', async (request, reply) => {
    try
    {
      return await service.delete((request.params as { id: string }).id);
    }
    catch (error)
    {
      if (error instanceof RunValidationError)
      {
        reply.code(400);

        return { error: error.message };
      }

      if (error instanceof RunDependencyError)
      {
        reply.code(404);

        return { error: error.message };
      }

      throw error;
    }
  });
}
