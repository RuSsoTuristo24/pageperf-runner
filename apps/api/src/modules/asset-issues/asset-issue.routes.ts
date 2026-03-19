import type { FastifyInstance } from 'fastify';

import { AssetIssueDependencyError, AssetIssueService, AssetIssueValidationError } from './asset-issue.service.js';

export function registerAssetIssueRoutes(app: FastifyInstance, service: AssetIssueService): void
{
  app.get('/api/asset-issues', async () => service.list());

  app.post('/api/asset-issues', async (request, reply) => {
    try
    {
      const issue = service.create(request.body);

      reply.code(201);

      return issue;
    }
    catch (error)
    {
      if (error instanceof AssetIssueValidationError)
      {
        reply.code(400);

        return { error: error.message };
      }

      throw error;
    }
  });

  app.patch('/api/asset-issues', async (request, reply) => {
    try
    {
      return service.update(request.body);
    }
    catch (error)
    {
      if (error instanceof AssetIssueValidationError)
      {
        reply.code(400);

        return { error: error.message };
      }

      if (error instanceof AssetIssueDependencyError)
      {
        reply.code(404);

        return { error: error.message };
      }

      throw error;
    }
  });

  app.delete('/api/asset-issues', async (request, reply) => {
    try
    {
      return service.delete(request.body);
    }
    catch (error)
    {
      if (error instanceof AssetIssueValidationError)
      {
        reply.code(400);

        return { error: error.message };
      }

      if (error instanceof AssetIssueDependencyError)
      {
        reply.code(404);

        return { error: error.message };
      }

      throw error;
    }
  });
}
