import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';

const runExecutor = vi.fn();
const authCapture = vi.fn();
const authValidate = vi.fn();
let app: FastifyInstance;
let storageRoot = '';

beforeAll(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), 'pageperf-runner-asset-issues-'));
  app = await createApp({ runExecutor, authCapture, authValidate, storageRoot });
});

afterAll(async () => {
  await app.close();
  if (storageRoot)
  {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

beforeEach(() => {
  runExecutor.mockReset();
  authCapture.mockReset();
  authValidate.mockReset();
  authCapture.mockImplementation(async ({ storageStatePath }: { storageStatePath: string }) => {
    await mkdir(path.dirname(storageStatePath), { recursive: true });
    await writeFile(storageStatePath, JSON.stringify({ cookies: [], origins: [] }));
  });
  authValidate.mockResolvedValue(true);
});

describe('asset issue registry', () => {
  it('stores normalized asset issues and flags assets that returned after close', async () => {
    runExecutor.mockResolvedValue({
      runId: 'ignored-by-service',
      status: 'running',
      pageMetrics: [
        { name: 'ttfb', value: 320 },
        { name: 'load', value: 980 },
      ],
      requests: [
        {
          url: 'https://auth2.bitrix24.net/bitrix/cache/js/s1/new_design_2024/kernel_main_polyfill_customevent/kernel_main_polyfill_customevent_v1.js?177003277891665',
          method: 'GET',
          status: 200,
          resourceType: 'script',
          contentEncoding: 'gzip',
          fromDiskCache: false,
          fromMemoryCache: false,
          revalidated: false,
          transferSize: 12455,
          encodedBodySize: 12000,
          decodedBodySize: 32000,
          durationMs: 145.6,
        },
      ],
      traceSummary: {
        criticalChain: [],
        mainThread: {
          parse: 2,
          evaluate: 10,
          layout: 2,
          paint: 1,
          other: 4,
          longTaskCount: 0,
          longTaskTotal: 0,
        },
      },
      jsExecutionSummary: {
        resources: [
          {
            url: 'https://auth2.bitrix24.net/bitrix/cache/js/s1/new_design_2024/kernel_main_polyfill_customevent/kernel_main_polyfill_customevent_v1.js?177003277891665',
            parseMs: 2,
            evaluateMs: 10,
            totalMs: 12,
            attributionConfidence: 'high',
          },
        ],
        unattributed: {
          parseMs: 0,
          evaluateMs: 0,
          totalMs: 0,
        },
      },
      coverageSummary: {
        totals: {
          js: { usedBytes: 100, unusedBytes: 50 },
          css: { usedBytes: 20, unusedBytes: 5 },
        },
        resources: [],
      },
      passes: [
        {
          label: 'cold',
          pageMetrics: [
            { name: 'ttfb', value: 320 },
            { name: 'load', value: 980 },
          ],
          requests: [
            {
              url: 'https://auth2.bitrix24.net/bitrix/cache/js/s1/new_design_2024/kernel_main_polyfill_customevent/kernel_main_polyfill_customevent_v1.js?177003277891665',
              method: 'GET',
              status: 200,
              resourceType: 'script',
              contentEncoding: 'gzip',
              fromDiskCache: false,
              fromMemoryCache: false,
              revalidated: false,
              transferSize: 12455,
              encodedBodySize: 12000,
              decodedBodySize: 32000,
              durationMs: 145.6,
            },
          ],
        },
      ],
    });

    const profile = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: {
        name: 'Issue watch blank page',
        url: 'https://russeltest.bitrix24.ru/blank.php',
        throttling: 'native',
      },
    });

    const run = await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: {
        profileId: profile.json().id,
      },
    });

    const startedRun = await app.inject({
      method: 'POST',
      url: `/api/runs/${run.json().id}/start`,
      payload: {},
    });

    expect(startedRun.statusCode).toBe(200);

    const createIssue = await app.inject({
      method: 'POST',
      url: '/api/asset-issues',
      payload: {
        assetUrl: 'https://auth2.bitrix24.net/bitrix/cache/js/s1/new_design_2024/kernel_main_polyfill_customevent/kernel_main_polyfill_customevent_v1.js?1758801351763107',
        resourceType: 'script',
        mantisUrl: 'https://mantis.local/view.php?id=12345',
        status: 'closed',
        note: 'Need to cut the polyfill payload',
        closedAt: '2026-03-01T09:00:00.000Z',
      },
    });

    expect(createIssue.statusCode).toBe(201);
    expect(createIssue.json()).toMatchObject({
      assetKey: 'https://auth2.bitrix24.net/bitrix/cache/js/s1/new_design_2024/kernel_main_polyfill_customevent/kernel_main_polyfill_customevent_v1.js',
      status: 'closed',
      mantisUrl: 'https://mantis.local/view.php?id=12345',
      returnedAfterClose: true,
    });

    const listedIssues = await app.inject({
      method: 'GET',
      url: '/api/asset-issues',
    });

    expect(listedIssues.statusCode).toBe(200);
    expect(listedIssues.json()).toEqual([
      expect.objectContaining({
        assetKey: 'https://auth2.bitrix24.net/bitrix/cache/js/s1/new_design_2024/kernel_main_polyfill_customevent/kernel_main_polyfill_customevent_v1.js',
        status: 'closed',
        returnedAfterClose: true,
      }),
    ]);
  });

  it('updates an existing asset issue and clears the closedAt date when it is reopened', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/asset-issues',
      payload: {
        assetUrl: 'https://auth2.bitrix24.net/bitrix/js/main/core/core.min.js?123',
        resourceType: 'script',
        mantisUrl: 'https://mantis.local/view.php?id=88',
        status: 'closed',
        closedAt: '2026-03-10T10:00:00.000Z',
      },
    });

    expect(created.statusCode).toBe(201);

    const updated = await app.inject({
      method: 'PATCH',
      url: '/api/asset-issues',
      payload: {
        assetKey: 'https://auth2.bitrix24.net/bitrix/js/main/core/core.min.js',
        mantisUrl: 'https://mantis.local/view.php?id=88',
        status: 'review',
        note: 'Back in review after retest',
      },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      assetKey: 'https://auth2.bitrix24.net/bitrix/js/main/core/core.min.js',
      status: 'review',
      note: 'Back in review after retest',
    });
    expect(updated.json()).not.toHaveProperty('closedAt');
  });

  it('deletes a tracked asset issue by normalized asset key', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/asset-issues',
      payload: {
        assetUrl: 'https://auth2.bitrix24.net/bitrix/js/main/core/core.min.js?123',
        resourceType: 'script',
        mantisUrl: 'https://mantis.local/view.php?id=88',
        status: 'open',
      },
    });

    expect(created.statusCode).toBe(201);

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/asset-issues',
      payload: {
        assetKey: 'https://auth2.bitrix24.net/bitrix/js/main/core/core.min.js',
      },
    });

    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({
      deleted: true,
      assetKey: 'https://auth2.bitrix24.net/bitrix/js/main/core/core.min.js',
    });

    const listedIssues = await app.inject({
      method: 'GET',
      url: '/api/asset-issues',
    });

    expect(listedIssues.statusCode).toBe(200);
    expect(listedIssues.json()).not.toContainEqual(expect.objectContaining({
      assetKey: 'https://auth2.bitrix24.net/bitrix/js/main/core/core.min.js',
    }));
  });
});
