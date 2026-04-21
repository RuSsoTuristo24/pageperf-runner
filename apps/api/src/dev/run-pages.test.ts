import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { runPagesWithApp } from './run-pages.js';

describe('runPagesWithApp', () => {
  let app: FastifyInstance | undefined;
  let storageRoot = '';

  afterEach(async () => {
    if (app)
    {
      await app.close();
      app = undefined;
    }

    if (storageRoot)
    {
      await rm(storageRoot, { recursive: true, force: true });
      storageRoot = '';
    }
  });

  it('creates, starts, and summarizes runs for provided pages', async () => {
    const runExecutor = vi.fn()
      .mockResolvedValueOnce({
        runId: 'ignored-1',
        status: 'running',
        pageMetrics: [{ name: 'load', value: 1200 }],
        requests: [{
          url: 'https://example.com/one',
          method: 'GET',
          resourceType: 'document',
          contentEncoding: 'gzip',
          transferSize: 1000,
          encodedBodySize: 900,
          decodedBodySize: 2500,
        }],
        traceSummary: {
          criticalChain: [],
          mainThread: { parse: 0, evaluate: 1, layout: 1, paint: 1, other: 1, longTaskCount: 0, longTaskTotal: 0 },
        },
        coverageSummary: {
          totals: {
            js: { usedBytes: 10, unusedBytes: 2 },
            css: { usedBytes: 4, unusedBytes: 1 },
          },
          resources: [],
        },
        passes: [
          {
            label: 'cold',
            pageMetrics: [{ name: 'load', value: 1200 }],
            requests: [],
          },
        ],
      })
      .mockResolvedValueOnce({
        runId: 'ignored-2',
        status: 'running',
        pageMetrics: [{ name: 'load', value: 2400 }],
        requests: [{
          url: 'https://example.com/two',
          method: 'GET',
          resourceType: 'document',
          contentEncoding: 'br',
          transferSize: 2000,
          encodedBodySize: 1500,
          decodedBodySize: 4000,
        }],
        traceSummary: {
          criticalChain: [],
          mainThread: { parse: 0, evaluate: 2, layout: 2, paint: 1, other: 1, longTaskCount: 0, longTaskTotal: 0 },
        },
        coverageSummary: {
          totals: {
            js: { usedBytes: 20, unusedBytes: 5 },
            css: { usedBytes: 8, unusedBytes: 2 },
          },
          resources: [],
        },
        passes: [
          {
            label: 'cold',
            pageMetrics: [{ name: 'load', value: 2400 }],
            requests: [],
          },
        ],
      });

    storageRoot = await mkdtemp(path.join(tmpdir(), 'webperf-run-pages-'));
    app = await createApp({ runExecutor, storageRoot });

    const results = await runPagesWithApp(app, {
      throttling: 'slow-4g',
      cacheMode: 'cold',
      pages: [
        'https://example.com/one',
        'https://example.com/two',
      ],
    });

    expect(runExecutor).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      url: 'https://example.com/one',
      throttling: 'slow-4g',
      status: 'completed',
      requestCount: 1,
      loadMs: 1200,
    });
    expect(results[1]).toMatchObject({
      url: 'https://example.com/two',
      throttling: 'slow-4g',
      status: 'completed',
      requestCount: 1,
      loadMs: 2400,
    });

    const runs = await app.inject({
      method: 'GET',
      url: '/api/runs',
    });

    expect(runs.statusCode).toBe(200);
    expect(runs.json()).toHaveLength(2);
  });
});
