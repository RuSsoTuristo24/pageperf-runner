import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import * as schema from './db/schema.js';

let app: FastifyInstance;
let storageRoot = '';

beforeAll(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), 'webperf-api-health-'));
  app = createApp({ storageRoot });
});

afterAll(async () => {
  await app.close();
  if (storageRoot)
  {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

describe('api app', () => {
  it('returns health payload', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});

describe('db schema', () => {
  it('declares the core tables', () => {
    expect(schema.profiles).toBeDefined();
    expect(schema.runs).toBeDefined();
    expect(schema.runDetails).toBeDefined();
    expect(schema.pageMetrics).toBeDefined();
    expect(schema.assetIssues).toBeDefined();
    expect(schema.artifacts).toBeDefined();
  });
});
