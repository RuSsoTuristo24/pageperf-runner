import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { createApp } from '../../app.js';

const runExecutor = vi.fn();
const authCapture = vi.fn();
const authValidate = vi.fn();
let app: FastifyInstance;
let appStorageRoot = '';

beforeAll(async () => {
  appStorageRoot = await mkdtemp(path.join(tmpdir(), 'pageperf-runner-api-suite-'));
  app = await createApp({ runExecutor, authCapture, authValidate, storageRoot: appStorageRoot });
});

afterAll(async () => {
  await app.close();
  if (appStorageRoot)
  {
    await rm(appStorageRoot, { recursive: true, force: true });
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

describe('profile crud', () => {
  it('creates and lists profiles', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: {
        name: 'Blank page native',
        url: 'https://russeltest.bitrix24.ru/blank.php',
        throttling: 'native',
      },
    });

    expect(create.statusCode).toBe(201);
    expect(create.json()).toMatchObject({
      name: 'Blank page native',
      throttling: 'native',
    });

    const list = await app.inject({
      method: 'GET',
      url: '/api/profiles',
    });

    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([
      expect.objectContaining({
        name: 'Blank page native',
      }),
    ]);
  });

  it('persists auth mode on created profiles', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: {
        name: 'Blank page secured',
        url: 'https://russeltest.bitrix24.ru/blank.php',
        throttling: 'native',
        authMode: 'session',
        cacheMode: 'warm',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      authMode: 'session',
      cacheMode: 'warm',
    });
  });

  it('rejects an unknown throttling preset', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: {
        name: 'Bad profile',
        url: 'https://russeltest.bitrix24.ru/blank.php',
        throttling: 'satellite',
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('run crud', () => {
  it('persists profiles and runs across app restarts when using the same storage root', async () => {
    const storageRoot = await mkdtemp(path.join(tmpdir(), 'pageperf-runner-api-'));
    const firstApp = await createApp({ runExecutor, authCapture, storageRoot });

    try {
      const profile = await firstApp.inject({
        method: 'POST',
        url: '/api/profiles',
        payload: {
          name: 'Blank page persisted',
          url: 'https://russeltest.bitrix24.ru/blank.php',
          throttling: 'native',
        },
      });

      const run = await firstApp.inject({
        method: 'POST',
        url: '/api/runs',
        payload: {
          profileId: profile.json().id,
        },
      });

      expect(profile.statusCode).toBe(201);
      expect(run.statusCode).toBe(201);

      await firstApp.close();

      const secondApp = await createApp({ runExecutor, authCapture, storageRoot });

      try {
        const profiles = await secondApp.inject({
          method: 'GET',
          url: '/api/profiles',
        });
        const runs = await secondApp.inject({
          method: 'GET',
          url: '/api/runs',
        });
        const details = await secondApp.inject({
          method: 'GET',
          url: `/api/runs/${run.json().id}`,
        });

        expect(profiles.statusCode).toBe(200);
        expect(profiles.json()).toEqual([
          expect.objectContaining({
            id: profile.json().id,
            name: 'Blank page persisted',
          }),
        ]);
        expect(runs.statusCode).toBe(200);
        expect(runs.json()).toEqual([
          expect.objectContaining({
            id: run.json().id,
            profileId: profile.json().id,
            status: 'queued',
          }),
        ]);
        expect(details.statusCode).toBe(200);
        expect(details.json()).toMatchObject({
          run: expect.objectContaining({
            id: run.json().id,
            status: 'queued',
          }),
        });
      }
      finally {
        await secondApp.close();
      }
    }
    finally {
      await rm(storageRoot, { recursive: true, force: true });
    }
  });

  it('normalizes legacy trace summaries when loading persisted run details', async () => {
    const storageRoot = await mkdtemp(path.join(tmpdir(), 'pageperf-runner-api-legacy-trace-'));
    const legacyRunId = 'legacy-run-1';
    const legacyProfileId = 'legacy-profile-1';

    try {
      await mkdir(path.join(storageRoot, 'data', 'runs', 'details'), { recursive: true });
      await writeFile(
        path.join(storageRoot, 'data', 'runs', 'index.json'),
        JSON.stringify([
          {
            id: legacyRunId,
            profileId: legacyProfileId,
            status: 'completed',
            createdAt: '2026-03-13T09:03:02.257Z',
            completedAt: '2026-03-13T09:03:09.429Z',
          },
        ]),
      );
      await writeFile(
        path.join(storageRoot, 'data', 'runs', 'details', `${legacyRunId}.json`),
        JSON.stringify({
          pageMetrics: [
            { name: 'ttfb', value: 100 },
            { name: 'load', value: 200 },
          ],
          requests: [],
          artifacts: [],
          passes: [],
          traceSummary: {
            criticalChain: [
              { url: 'https://example.com/app.js', duration: 123.4 },
            ],
            mainThread: {
              script: 44.5,
              layout: 6,
              paint: 2,
              other: 1,
            },
          },
          coverageSummary: {
            totals: {
              js: { usedBytes: 0, unusedBytes: 0 },
              css: { usedBytes: 0, unusedBytes: 0 },
            },
            resources: [],
          },
          pages: [],
        }),
      );

      const legacyApp = await createApp({ runExecutor, authCapture, authValidate, storageRoot });

      try {
        const response = await legacyApp.inject({
          method: 'GET',
          url: `/api/runs/${legacyRunId}`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          traceSummary: {
            criticalChain: [
              { url: 'https://example.com/app.js', duration: 123.4 },
            ],
            mainThread: {
              parse: 0,
              evaluate: 44.5,
              layout: 6,
              paint: 2,
              other: 1,
              longTaskCount: 0,
              longTaskTotal: 0,
            },
          },
        });
      }
      finally {
        await legacyApp.close();
      }
    }
    finally {
      await rm(storageRoot, { recursive: true, force: true });
    }
  });

  it('creates queued runs and returns run details', async () => {
    const profile = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: {
        name: 'Blank page warm',
        url: 'https://russeltest.bitrix24.ru/blank.php',
        throttling: 'slow-4g',
      },
    });

    const createRun = await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: {
        profileId: profile.json().id,
      },
    });

    expect(createRun.statusCode).toBe(201);
    expect(createRun.json()).toMatchObject({
      profileId: profile.json().id,
      status: 'queued',
    });

    const listRuns = await app.inject({
      method: 'GET',
      url: '/api/runs',
    });

    expect(listRuns.statusCode).toBe(200);
    expect(listRuns.json()).toEqual([
      expect.objectContaining({
        id: createRun.json().id,
        status: 'queued',
      }),
    ]);

    const details = await app.inject({
      method: 'GET',
      url: `/api/runs/${createRun.json().id}`,
    });

    expect(details.statusCode).toBe(200);
    expect(details.json()).toMatchObject({
      run: expect.objectContaining({
        id: createRun.json().id,
      }),
      pageMetrics: [],
      requests: [],
      artifacts: [],
    });
  });

  it('starts a run, collects live results, and stores an ai snapshot artifact', async () => {
    runExecutor.mockResolvedValue({
      runId: 'ignored-by-service',
      status: 'running',
      pageMetrics: [
        { name: 'ttfb', value: 1200.5 },
        { name: 'load', value: 2400.25 },
      ],
      requests: [
        {
          url: 'https://russeltest.bitrix24.ru/blank.php',
          method: 'GET',
          status: 200,
          resourceType: 'document',
          contentEncoding: 'gzip',
          fromDiskCache: false,
          fromMemoryCache: false,
          revalidated: false,
          transferSize: 70003,
          encodedBodySize: 69703,
          decodedBodySize: 275275,
        },
      ],
      traceSummary: {
        criticalChain: [],
        mainThread: {
          parse: 2,
          evaluate: 10,
          layout: 5,
          paint: 1,
          other: 2,
          longTaskCount: 0,
          longTaskTotal: 0,
        },
      },
      jsExecutionSummary: {
        resources: [
          {
            url: 'https://russeltest.bitrix24.ru/bitrix/js/main/core/core.min.js',
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
          js: { usedBytes: 100, unusedBytes: 25 },
          css: { usedBytes: 50, unusedBytes: 10 },
        },
        resources: [],
      },
      passes: [
        {
          label: 'cold',
          pageMetrics: [
            { name: 'ttfb', value: 1200.5 },
            { name: 'load', value: 2400.25 },
          ],
          requests: [
            {
              url: 'https://russeltest.bitrix24.ru/blank.php',
              method: 'GET',
              status: 200,
              resourceType: 'document',
              contentEncoding: 'gzip',
              fromDiskCache: false,
              fromMemoryCache: false,
              revalidated: false,
              transferSize: 70003,
              encodedBodySize: 69703,
              decodedBodySize: 275275,
            },
          ],
        },
        {
          label: 'warm',
          pageMetrics: [
            { name: 'ttfb', value: 300.1 },
            { name: 'load', value: 800.5 },
          ],
          requests: [
            {
              url: 'https://russeltest.bitrix24.ru/blank.php',
              method: 'GET',
              status: 200,
              resourceType: 'document',
              contentEncoding: 'gzip',
              fromDiskCache: true,
              fromMemoryCache: false,
              revalidated: false,
              transferSize: 0,
              encodedBodySize: 0,
              decodedBodySize: 275275,
            },
          ],
        },
      ],
    });

    const profile = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: {
        name: 'Blank page startable',
        url: 'https://russeltest.bitrix24.ru/blank.php',
        throttling: 'native',
        cacheMode: 'both',
      },
    });

    const createRun = await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: {
        profileId: profile.json().id,
      },
    });

    const startRun = await app.inject({
      method: 'POST',
      url: `/api/runs/${createRun.json().id}/start`,
    });

    expect(startRun.statusCode).toBe(200);
    expect(runExecutor).toHaveBeenCalledTimes(1);
    expect(startRun.json()).toMatchObject({
      run: expect.objectContaining({
        id: createRun.json().id,
        status: 'completed',
      }),
      pageMetrics: [
        { name: 'ttfb', value: 1200.5 },
        { name: 'load', value: 2400.25 },
      ],
      requests: [
        expect.objectContaining({
          url: 'https://russeltest.bitrix24.ru/blank.php',
          status: 200,
          contentEncoding: 'gzip',
        }),
      ],
      artifacts: [
        expect.objectContaining({
          kind: 'ai-snapshot',
        }),
      ],
      passes: [
        expect.objectContaining({ label: 'cold' }),
        expect.objectContaining({ label: 'warm' }),
      ],
    });
  });

  it('builds an LLM-ready report for a completed run', async () => {
    runExecutor.mockResolvedValue({
      runId: 'ignored-by-service',
      status: 'running',
      pageMetrics: [
        { name: 'ttfb', value: 553.8 },
        { name: 'fcp', value: 1952 },
        { name: 'load', value: 3566.4 },
      ],
      requests: [
        {
          url: 'https://russeltest.bitrix24.ru/blank.php',
          method: 'GET',
          status: 200,
          resourceType: 'document',
          contentEncoding: 'gzip',
          fromDiskCache: false,
          fromMemoryCache: false,
          revalidated: false,
          transferSize: 70003,
          encodedBodySize: 69703,
          decodedBodySize: 275275,
          durationMs: 553.8,
        },
        {
          url: 'https://russeltest.bitrix24.ru/bitrix/js/call/core/dist/call.bundle.min.js?177003277891665',
          method: 'GET',
          status: 200,
          resourceType: 'script',
          contentEncoding: 'gzip',
          fromDiskCache: false,
          fromMemoryCache: false,
          revalidated: false,
          transferSize: 282000,
          encodedBodySize: 281700,
          decodedBodySize: 1119000,
          durationMs: 281.7,
        },
      ],
      traceSummary: {
        criticalChain: [],
        mainThread: {
          parse: 24,
          evaluate: 120,
          layout: 18,
          paint: 7,
          other: 41,
          longTaskCount: 2,
          longTaskTotal: 130,
        },
      },
      jsExecutionSummary: {
        resources: [
          {
            url: 'https://russeltest.bitrix24.ru/bitrix/js/call/core/dist/call.bundle.min.js?177003277891665',
            parseMs: 24,
            evaluateMs: 120,
            totalMs: 144,
            attributionConfidence: 'high',
          },
        ],
        unattributed: {
          parseMs: 0,
          evaluateMs: 6,
          totalMs: 6,
        },
      },
      coverageSummary: {
        totals: {
          js: { usedBytes: 220000, unusedBytes: 140000 },
          css: { usedBytes: 12000, unusedBytes: 6000 },
        },
        resources: [],
      },
      passes: [
        {
          label: 'cold',
          pageMetrics: [
            { name: 'ttfb', value: 553.8 },
            { name: 'fcp', value: 1952 },
            { name: 'load', value: 3566.4 },
          ],
          requests: [
            {
              url: 'https://russeltest.bitrix24.ru/blank.php',
              method: 'GET',
              status: 200,
              resourceType: 'document',
              contentEncoding: 'gzip',
              fromDiskCache: false,
              fromMemoryCache: false,
              revalidated: false,
              transferSize: 70003,
              encodedBodySize: 69703,
              decodedBodySize: 275275,
              durationMs: 553.8,
            },
            {
              url: 'https://russeltest.bitrix24.ru/bitrix/js/call/core/dist/call.bundle.min.js?177003277891665',
              method: 'GET',
              status: 200,
              resourceType: 'script',
              contentEncoding: 'gzip',
              fromDiskCache: false,
              fromMemoryCache: false,
              revalidated: false,
              transferSize: 282000,
              encodedBodySize: 281700,
              decodedBodySize: 1119000,
              durationMs: 281.7,
            },
          ],
        },
      ],
    });

    const profile = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: {
        name: 'Blank page llm report',
        url: 'https://russeltest.bitrix24.ru/blank.php',
        throttling: 'native',
        cacheMode: 'cold',
      },
    });

    const createRun = await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: {
        profileId: profile.json().id,
      },
    });

    await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: {
        profileId: profile.json().id,
      },
    });

    await app.inject({
      method: 'POST',
      url: `/api/runs/${createRun.json().id}/start`,
    });

    await app.inject({
      method: 'POST',
      url: '/api/asset-issues',
      payload: {
        assetUrl: 'https://russeltest.bitrix24.ru/bitrix/js/call/core/dist/call.bundle.min.js?177003277891665',
        resourceType: 'script',
        mantisUrl: 'https://mantis.local/view.php?id=501',
        status: 'review',
        note: 'Investigate call bundle weight',
      },
    });

    const reportResponse = await app.inject({
      method: 'GET',
      url: `/api/runs/${createRun.json().id}/llm-report`,
    });

    expect(reportResponse.statusCode).toBe(200);
    expect(reportResponse.json()).toMatchObject({
      runId: createRun.json().id,
      format: 'markdown',
      passLabel: 'cold',
    });
    expect(reportResponse.json().content).toContain('# pageperf-runner LLM Report');
    expect(reportResponse.json().content).toContain('call.bundle.min.js');
    expect(reportResponse.json().content).toContain('https://mantis.local/view.php?id=501');
    expect(reportResponse.json().content).toContain('Coverage Summary');
    expect(reportResponse.json().content).toContain('Rule Engine Findings');
  });

  it('fails an authenticated run when the saved session is no longer valid', async () => {
    authCapture.mockImplementation(async ({ storageStatePath }: { storageStatePath: string }) => {
      await mkdir(path.dirname(storageStatePath), { recursive: true });
      await writeFile(storageStatePath, JSON.stringify({ cookies: [{ name: 'bitrix' }], origins: [] }));
    });
    authValidate.mockResolvedValue(false);

    const capture = await app.inject({
      method: 'POST',
      url: '/api/auth/sessions/capture',
      payload: {
        targetUrl: 'https://russeltest.bitrix24.ru/blank.php',
      },
    });

    expect(capture.statusCode).toBe(200);

    const profile = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: {
        name: 'Blank page session profile',
        url: 'https://russeltest.bitrix24.ru/blank.php',
        throttling: 'native',
        authMode: 'session',
      },
    });

    const run = await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: {
        profileId: profile.json().id,
      },
    });

    const startRun = await app.inject({
      method: 'POST',
      url: `/api/runs/${run.json().id}/start`,
    });

    expect(startRun.statusCode).toBe(404);
    expect(startRun.json()).toMatchObject({
      error: 'Saved auth session for russeltest.bitrix24.ru is no longer valid. Capture it again.',
    });

    const authStatus = await app.inject({
      method: 'GET',
      url: '/api/auth/sessions/russeltest.bitrix24.ru',
    });

    expect(authValidate).toHaveBeenCalledWith({
      targetUrl: 'https://russeltest.bitrix24.ru/blank.php',
      storageStatePath: expect.stringContaining('auth'),
    });
    expect(authStatus.statusCode).toBe(200);
    expect(authStatus.json()).toMatchObject({
      host: 'russeltest.bitrix24.ru',
      status: 'failed',
      error: 'Saved auth session is no longer valid. Capture it again.',
    });
  });
});

describe('auth session api', () => {
  it('reports missing auth state and stores a captured session', async () => {
    const storageRoot = await mkdtemp(path.join(tmpdir(), 'pageperf-runner-api-auth-'));
    const isolatedApp = await createApp({ runExecutor, authCapture, authValidate, storageRoot });

    const listEmpty = await isolatedApp.inject({
      method: 'GET',
      url: '/api/auth/sessions',
    });

    expect(listEmpty.statusCode).toBe(200);
    expect(listEmpty.json()).toEqual([]);

    const missing = await isolatedApp.inject({
      method: 'GET',
      url: '/api/auth/sessions/russeltest.bitrix24.ru',
    });

    expect(missing.statusCode).toBe(200);
    expect(missing.json()).toMatchObject({
      host: 'russeltest.bitrix24.ru',
      status: 'missing',
    });

    const capture = await isolatedApp.inject({
      method: 'POST',
      url: '/api/auth/sessions/capture',
      payload: {
        targetUrl: 'https://russeltest.bitrix24.ru/blank.php',
      },
    });

    expect(capture.statusCode).toBe(200);
    expect(authCapture).toHaveBeenCalledWith({
      targetUrl: 'https://russeltest.bitrix24.ru/blank.php',
      storageStatePath: expect.stringContaining('auth'),
    });
    expect(capture.json()).toMatchObject({
      host: 'russeltest.bitrix24.ru',
      status: 'ready',
      targetUrl: 'https://russeltest.bitrix24.ru/blank.php',
    });

    const ready = await isolatedApp.inject({
      method: 'GET',
      url: '/api/auth/sessions/russeltest.bitrix24.ru',
    });

    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      host: 'russeltest.bitrix24.ru',
      status: 'ready',
      targetUrl: 'https://russeltest.bitrix24.ru/blank.php',
    });

    const list = await isolatedApp.inject({
      method: 'GET',
      url: '/api/auth/sessions',
    });

    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([
      expect.objectContaining({
        host: 'russeltest.bitrix24.ru',
        status: 'ready',
      }),
    ]);

    await isolatedApp.close();
    await rm(storageRoot, { recursive: true, force: true });
  });
});

describe('pg dual-write', () => {
  function createSpyDb() {
    const valuesSpy = vi.fn().mockResolvedValue(undefined);
    const whereSpy = vi.fn().mockResolvedValue(undefined);
    const setSpy = vi.fn().mockReturnValue({ where: whereSpy });
    const insert = vi.fn().mockReturnValue({ values: valuesSpy });
    const update = vi.fn().mockReturnValue({ set: setSpy });
    const execute = vi.fn().mockResolvedValue(undefined);
    return {
      db: { insert, update, execute } as unknown as import('../../db/client.js').Db,
      insert,
      update,
      valuesSpy,
      setSpy,
      whereSpy,
    };
  }

  it('inserts profile, run, metrics and requests into PG through services', async () => {
    const storageRoot = await mkdtemp(path.join(tmpdir(), 'pageperf-runner-api-pg-'));
    const { db, insert, update, valuesSpy, setSpy } = createSpyDb();
    const localRunExecutor = vi.fn().mockResolvedValue({
      runId: 'ignored',
      status: 'running',
      pageMetrics: [
        { name: 'ttfb', value: 100 },
        { name: 'load', value: 400 },
      ],
      requests: [
        {
          url: 'https://russeltest.bitrix24.ru/blank.php',
          method: 'GET',
          status: 200,
          resourceType: 'document',
          contentEncoding: 'gzip',
          fromDiskCache: false,
          fromMemoryCache: false,
          revalidated: false,
          transferSize: 1000,
          encodedBodySize: 900,
          decodedBodySize: 2000,
        },
      ],
      traceSummary: {
        criticalChain: [],
        mainThread: { parse: 1, evaluate: 2, layout: 1, paint: 1, other: 1, longTaskCount: 0, longTaskTotal: 0 },
      },
      jsExecutionSummary: { resources: [], unattributed: { parseMs: 0, evaluateMs: 0, totalMs: 0 } },
      coverageSummary: { totals: { js: { usedBytes: 0, unusedBytes: 0 }, css: { usedBytes: 0, unusedBytes: 0 } }, resources: [] },
      passes: [],
    });

    const pgApp = await createApp({
      runExecutor: localRunExecutor,
      authCapture,
      authValidate,
      storageRoot,
      db,
    });

    try {
      const profile = await pgApp.inject({
        method: 'POST',
        url: '/api/profiles',
        payload: {
          name: 'PG profile',
          url: 'https://russeltest.bitrix24.ru/blank.php',
          throttling: 'native',
        },
      });
      expect(profile.statusCode).toBe(201);

      const run = await pgApp.inject({
        method: 'POST',
        url: '/api/runs',
        payload: { profileId: profile.json().id },
      });
      expect(run.statusCode).toBe(201);

      const start = await pgApp.inject({
        method: 'POST',
        url: `/api/runs/${run.json().id}/start`,
      });
      expect(start.statusCode).toBe(200);

      // Allow fire-and-forget void pg* calls to settle.
      await new Promise((resolve) => setImmediate(resolve));

      // profile insert + run insert (status=running) + metrics insert + requests insert = 4
      expect(insert).toHaveBeenCalled();
      const insertedPayloads = valuesSpy.mock.calls.map((args) => args[0]);

      // Profile row with matching id/name.
      const profileRow = insertedPayloads.find(
        (row) => row && !Array.isArray(row) && row.name === 'PG profile',
      );
      expect(profileRow).toMatchObject({
        id: profile.json().id,
        name: 'PG profile',
        url: 'https://russeltest.bitrix24.ru/blank.php',
        throttling: 'native',
      });

      // Run row inserted with status 'running'.
      const runRow = insertedPayloads.find(
        (row) => row && !Array.isArray(row) && row.id === run.json().id,
      );
      expect(runRow).toMatchObject({
        id: run.json().id,
        profileId: profile.json().id,
        status: 'running',
      });

      // page_metrics batch — an array with the expected metric names.
      const metricsRows = insertedPayloads.find(
        (row) => Array.isArray(row) && row[0]?.name === 'ttfb',
      ) as Array<{ runId: string; name: string; value: number }> | undefined;
      expect(metricsRows).toBeDefined();
      expect(metricsRows).toHaveLength(2);

      // requests batch.
      const requestRows = insertedPayloads.find(
        (row) => Array.isArray(row) && row[0]?.url?.includes('blank.php') && 'resourceType' in row[0],
      ) as Array<{ runId: string; url: string; resourceType: string; status: number }> | undefined;
      expect(requestRows).toBeDefined();
      expect(requestRows?.[0]).toMatchObject({ resourceType: 'document', status: 200 });

      // Status update to 'completed' after start() succeeded.
      expect(update).toHaveBeenCalled();
      expect(setSpy).toHaveBeenCalledWith({ status: 'completed' });
    }
    finally {
      await pgApp.close();
      await rm(storageRoot, { recursive: true, force: true });
    }
  });

  it('continues to return success when PG inserts reject', async () => {
    const storageRoot = await mkdtemp(path.join(tmpdir(), 'pageperf-runner-api-pg-fail-'));
    const valuesSpy = vi.fn().mockRejectedValue(new Error('pg down'));
    const whereSpy = vi.fn().mockRejectedValue(new Error('pg down'));
    const setSpy = vi.fn().mockReturnValue({ where: whereSpy });
    const insert = vi.fn().mockReturnValue({ values: valuesSpy });
    const update = vi.fn().mockReturnValue({ set: setSpy });
    const execute = vi.fn().mockResolvedValue(undefined);
    const db = { insert, update, execute } as unknown as import('../../db/client.js').Db;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const pgApp = await createApp({
      runExecutor,
      authCapture,
      authValidate,
      storageRoot,
      db,
    });

    try {
      const profile = await pgApp.inject({
        method: 'POST',
        url: '/api/profiles',
        payload: {
          name: 'PG failing profile',
          url: 'https://russeltest.bitrix24.ru/blank.php',
          throttling: 'native',
        },
      });
      expect(profile.statusCode).toBe(201);

      const run = await pgApp.inject({
        method: 'POST',
        url: '/api/runs',
        payload: { profileId: profile.json().id },
      });
      expect(run.statusCode).toBe(201);

      await new Promise((resolve) => setImmediate(resolve));
    }
    finally {
      warnSpy.mockRestore();
      await pgApp.close();
      await rm(storageRoot, { recursive: true, force: true });
    }
  });
});
