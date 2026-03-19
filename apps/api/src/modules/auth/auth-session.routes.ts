import type { FastifyInstance } from 'fastify';

import { AuthSessionService, AuthSessionValidationError } from './auth-session.service.js';

export function registerAuthSessionRoutes(app: FastifyInstance, service: AuthSessionService): void
{
  app.get('/api/auth/session', async () => service.getStatus());

  app.post('/api/auth/session/capture', async (request, reply) => {
    try
    {
      return await service.capture(request.body);
    }
    catch (error)
    {
      if (error instanceof AuthSessionValidationError)
      {
        reply.code(400);

        return { error: error.message };
      }

      throw error;
    }
  });
}
