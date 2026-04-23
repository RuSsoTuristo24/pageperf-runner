import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';

import { registerConfigRoutes } from './config.routes.js';

describe('config routes', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.VNC_URL;
  });

  afterEach(() => {
    if (originalEnv === undefined)
    {
      delete process.env.VNC_URL;
    }
    else
    {
      process.env.VNC_URL = originalEnv;
    }
  });

  it('GET /api/config returns vncUrl when configured', async () => {
    const app = Fastify();
    registerConfigRoutes(app, { vncUrl: 'http://vnc.example/vnc.html' });
    const res = await app.inject({ method: 'GET', url: '/api/config' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ vncUrl: 'http://vnc.example/vnc.html' });
    await app.close();
  });

  it('GET /api/config returns vncUrl=null when unset', async () => {
    const app = Fastify();
    registerConfigRoutes(app, { vncUrl: null });
    const res = await app.inject({ method: 'GET', url: '/api/config' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ vncUrl: null });
    await app.close();
  });
});
