import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

export type WorkerRoutesDeps = {
  executeLiveRun: (input: unknown) => Promise<unknown>;
  captureAuthSession: (input: { targetUrl: string; storageStatePath: string; chromePath?: string; timeoutMs?: number }) => Promise<void>;
  validateAuthSession: (input: { targetUrl: string; storageStatePath: string; chromePath?: string; timeoutMs?: number }) => Promise<boolean>;
  checkWorker?: () => Promise<{ ok: boolean; xvfb: boolean; chrome: boolean }>;
};

const RunSchema = z.object({}).passthrough();
const AuthSchema = z.object({
  targetUrl: z.string().url(),
  storageStatePath: z.string(),
  chromePath: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export function registerWorkerRoutes(app: FastifyInstance, deps: WorkerRoutesDeps): void
{
  app.post('/run', async (req, reply) => {
    const body = RunSchema.parse(req.body);
    const result = await deps.executeLiveRun(body);
    reply.code(200);
    return result;
  });

  app.post('/capture-auth', async (req, reply) => {
    const body = AuthSchema.parse(req.body);
    await deps.captureAuthSession(body);
    reply.code(204);
    return;
  });

  app.post('/validate-auth', async (req, reply) => {
    const body = AuthSchema.parse(req.body);
    const valid = await deps.validateAuthSession(body);
    reply.code(200);
    return { valid };
  });

  app.get('/health', async (_req, reply) => {
    if (!deps.checkWorker)
    {
      reply.code(200);
      return { ok: true };
    }
    const h = await deps.checkWorker();
    reply.code(h.ok ? 200 : 503);
    return h;
  });
}
