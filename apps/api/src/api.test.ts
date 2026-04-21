import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { schemaTables } from './db/schema.js';

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
  it('returns health payload with db + worker status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    const body = response.json();
    // No db injected → checkDb returns true (default); no worker running → checkWorker returns false.
    expect(response.statusCode).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.db).toBe('ok');
    expect(body.worker).toBe('fail');
  });
});

describe('db schema', () => {
  it('declares the core normalized tables', () => {
    expect(Object.keys(schemaTables)).toEqual([
      'profiles',
      'runs',
      'pageMetrics',
      'requests',
      'assets',
      'issues',
      'artifacts',
    ]);
  });
});
