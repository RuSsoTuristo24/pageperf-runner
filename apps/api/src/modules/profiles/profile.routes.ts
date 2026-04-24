import type { FastifyInstance } from 'fastify';

import { ProfileNotFoundError, ProfileService, ProfileValidationError } from './profile.service.js';

export function registerProfileRoutes(app: FastifyInstance, service: ProfileService): void
{
  app.get('/api/profiles', async () => service.list());

  app.post('/api/profiles', async (request, reply) => {
    try
    {
      const profile = service.create(request.body);

      reply.code(201);

      return profile;
    }
    catch (error)
    {
      if (error instanceof ProfileValidationError)
      {
        reply.code(400);

        return { error: error.message };
      }

      throw error;
    }
  });

  app.patch('/api/profiles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try
    {
      return service.update(id, request.body ?? {});
    }
    catch (error)
    {
      if (error instanceof ProfileValidationError)
      {
        reply.code(400);
        return { error: error.message };
      }

      if (error instanceof ProfileNotFoundError)
      {
        reply.code(404);
        return { error: error.message };
      }

      throw error;
    }
  });

  app.patch('/api/profiles/:id/template', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { isTemplate?: unknown };

    if (typeof body.isTemplate !== 'boolean')
    {
      reply.code(400);

      return { error: 'isTemplate must be a boolean' };
    }

    try
    {
      return service.setTemplate(id, body.isTemplate);
    }
    catch (error)
    {
      if (error instanceof ProfileNotFoundError)
      {
        reply.code(404);

        return { error: error.message };
      }

      throw error;
    }
  });
}
