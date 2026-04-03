import type { FastifyInstance } from 'fastify';

import { ProfileService, ProfileValidationError } from './profile.service.js';

export function registerProfileRoutes(app: FastifyInstance, service: ProfileService): void
{
  app.get('/api/profiles', async () => await service.list());

  app.post('/api/profiles', async (request, reply) => {
    try
    {
      const profile = await service.create(request.body);

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

  app.post('/api/delete-profile', async (request, reply) => {
    const { id } = request.body as { id?: string };

    if (!id)
    {
      reply.code(400);

      return { error: 'Missing id' };
    }

    const deleted = await service.delete(id);

    if (!deleted)
    {
      reply.code(404);

      return { error: 'Profile not found' };
    }

    return { deleted: true, id };
  });
}
