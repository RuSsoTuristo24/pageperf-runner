import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerWorkerRoutes } from './routes.js';

describe('worker-server routes', () => {
  const makeApp = (deps: Parameters<typeof registerWorkerRoutes>[1]) => {
    const app = Fastify();
    registerWorkerRoutes(app, deps);
    return app;
  };

  it('POST /run invokes executeLiveRun with body and returns JSON', async () => {
    const executeLiveRun = vi.fn().mockResolvedValue({ metrics: { lcpMs: 1234 } });
    const app = makeApp({
      executeLiveRun,
      captureAuthSession: vi.fn(),
      validateAuthSession: vi.fn(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/run',
      payload: { runId: 'r1', url: 'https://example', storageStatePath: '/tmp/s.json' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ metrics: { lcpMs: 1234 } });
    expect(executeLiveRun).toHaveBeenCalledWith({
      runId: 'r1',
      url: 'https://example',
      storageStatePath: '/tmp/s.json',
    });
  });

  it('POST /capture-auth invokes captureAuthSession', async () => {
    const captureAuthSession = vi.fn().mockResolvedValue(undefined);
    const app = makeApp({
      executeLiveRun: vi.fn(),
      captureAuthSession,
      validateAuthSession: vi.fn(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/capture-auth',
      payload: { targetUrl: 'https://x', storageStatePath: '/tmp/s.json' },
    });

    expect(res.statusCode).toBe(204);
    expect(captureAuthSession).toHaveBeenCalledWith({
      targetUrl: 'https://x',
      storageStatePath: '/tmp/s.json',
    });
  });

  it('POST /validate-auth returns boolean from validateAuthSession', async () => {
    const validateAuthSession = vi.fn().mockResolvedValue(true);
    const app = makeApp({
      executeLiveRun: vi.fn(),
      captureAuthSession: vi.fn(),
      validateAuthSession,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/validate-auth',
      payload: { targetUrl: 'https://x', storageStatePath: '/tmp/s.json' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ valid: true });
  });

  it('GET /health returns 200 when dependencies OK', async () => {
    const app = makeApp({
      executeLiveRun: vi.fn(),
      captureAuthSession: vi.fn(),
      validateAuthSession: vi.fn(),
      checkWorker: async () => ({ ok: true, xvfb: true, chrome: true }),
    });

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true, xvfb: true, chrome: true });
  });

  it('GET /health returns 503 when chrome missing', async () => {
    const app = makeApp({
      executeLiveRun: vi.fn(),
      captureAuthSession: vi.fn(),
      validateAuthSession: vi.fn(),
      checkWorker: async () => ({ ok: false, xvfb: true, chrome: false }),
    });

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(503);
  });
});
