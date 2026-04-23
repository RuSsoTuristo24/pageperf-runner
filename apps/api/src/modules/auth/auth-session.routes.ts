import type { FastifyInstance } from 'fastify';

import { AuthSessionService, AuthSessionValidationError } from './auth-session.service.js';

type HostParams = { host: string };

export function registerAuthSessionRoutes(app: FastifyInstance, service: AuthSessionService): void
{
  app.get('/api/auth/sessions', async () => service.list());

  app.get<{ Params: HostParams }>('/api/auth/sessions/:host', async (request) => {
    const host = decodeURIComponent(request.params.host);

    return service.getForHost(host);
  });

  app.post('/api/auth/sessions/capture', async (request, reply) => {
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

  app.delete<{ Params: HostParams }>('/api/auth/sessions/:host', async (request, reply) => {
    const host = decodeURIComponent(request.params.host);
    service.delete(host);
    reply.code(204);

    return null;
  });
}
