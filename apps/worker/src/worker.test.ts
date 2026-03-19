import { describe, expect, it, vi } from 'vitest';

import { resolveChromePath } from './browser/browser-launcher.js';
import { toNetworkConditions } from './browser/network-profile.js';
import { normalizeNetworkRequest } from './collector/network-collector.js';
import { normalizePageMetrics } from './collector/page-metrics-collector.js';
import { createQueuedRunJob } from './queue/run-job.js';
import {
  buildRequestTimingBreakdown,
  extractInitiatorUrl,
  extractUsedBytesFromCoverageEntry,
  normalizeInitiatorType,
} from './runner/live-profile.js';
import { createRunner } from './runner/runner.js';

describe('browser launcher', () => {
  it('prefers an explicit Chrome path on Windows', () => {
    expect(
      resolveChromePath({
        chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      }),
    ).toBe('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
  });
});

describe('network profiles', () => {
  it('converts built-in presets into CDP-friendly conditions', () => {
    expect(toNetworkConditions({ throttling: 'slow-4g' })).toEqual({
      downloadThroughput: 200000,
      uploadThroughput: 93750,
      latency: 150,
      offline: false,
    });
  });

  it('supports custom throttling values', () => {
    expect(
      toNetworkConditions({
        throttling: 'custom',
        customNetworkProfile: {
          downloadKbps: 512,
          uploadKbps: 256,
          latencyMs: 900,
        },
      }),
    ).toEqual({
      downloadThroughput: 64000,
      uploadThroughput: 32000,
      latency: 900,
      offline: false,
    });
  });
});

describe('runner', () => {
  it('normalizes initiator types and extracts the most relevant initiator url', () => {
    expect(normalizeInitiatorType('parser')).toBe('parser');
    expect(normalizeInitiatorType('xmlhttprequest')).toBe('xmlhttprequest');
    expect(normalizeInitiatorType('preflight')).toBe('other');
    expect(extractInitiatorUrl({
      type: 'script',
      stack: {
        callFrames: [
          { url: '' },
          { url: 'https://russeltest.bitrix24.ru/bitrix/js/main/core/core.min.js' },
        ],
      },
    })).toBe('https://russeltest.bitrix24.ru/bitrix/js/main/core/core.min.js');
  });

  it('builds a request timing breakdown from chrome response timing data', () => {
    expect(buildRequestTimingBreakdown({
      startTs: 10,
      endTs: 10.21,
      baselineStartTs: 10,
      responseTiming: {
        requestTime: 10,
        dnsStart: 4,
        dnsEnd: 10,
        connectStart: 10,
        connectEnd: 30,
        sslStart: 15,
        sslEnd: 23,
        sendStart: 32,
        sendEnd: 34,
        receiveHeadersStart: 184,
        receiveHeadersEnd: 190,
      },
    })).toMatchObject({
      startTimeMs: 0,
      endTimeMs: 210,
      queueingMs: 4,
      dnsMs: 6,
      connectMs: 12,
      sslMs: 8,
      requestSentMs: 2,
      waitingMs: 150,
      downloadMs: 20,
    });
  });

  it('extracts used bytes from Playwright JS coverage function ranges', () => {
    expect(extractUsedBytesFromCoverageEntry({
      functions: [
        {
          functionName: 'boot',
          isBlockCoverage: true,
          ranges: [
            { startOffset: 0, endOffset: 100, count: 1 },
            { startOffset: 100, endOffset: 140, count: 0 },
          ],
        },
        {
          functionName: 'render',
          isBlockCoverage: true,
          ranges: [
            { startOffset: 140, endOffset: 220, count: 1 },
          ],
        },
      ],
    })).toBe(180);
  });

  it('transitions a queued run job into a running state', async () => {
    const runner = createRunner();
    const job = createQueuedRunJob({
      runId: 'run-42',
      profileId: 'profile-42',
      targetUrl: 'https://russeltest.bitrix24.ru/blank.php',
      throttling: 'native',
      cacheMode: 'cold',
    });

    const result = await runner.start(job);

    expect(result.status).toBe('running');
    expect(result.runId).toBe('run-42');
  });

  it('wires collectors into the run result when raw inputs are provided', async () => {
    const runner = createRunner();
    const job = createQueuedRunJob({
      runId: 'run-43',
      profileId: 'profile-43',
      targetUrl: 'https://russeltest.bitrix24.ru/blank.php',
      throttling: 'native',
      cacheMode: 'cold',
    });

    const result = await runner.start(job, {
      navigationEntry: {
        responseStart: 1200,
        domContentLoadedEventEnd: 2400,
        loadEventEnd: 2600,
      },
      paintEntries: [
        { name: 'first-paint', startTime: 1500 },
        { name: 'first-contentful-paint', startTime: 1600 },
      ],
      networkEntries: [
        {
          url: 'https://russeltest.bitrix24.ru/blank.php',
          method: 'GET',
          status: 200,
          resourceType: 'document',
          responseHeaders: { 'content-encoding': 'gzip' },
          fromDiskCache: false,
          fromMemoryCache: false,
          revalidated: false,
          transferSize: 70003,
          encodedBodySize: 69703,
          decodedBodySize: 275275,
          startTimeMs: 10,
          endTimeMs: 210,
          queueingMs: 4,
          dnsMs: 6,
          connectMs: 12,
          sslMs: 8,
          requestSentMs: 2,
          waitingMs: 150,
          downloadMs: 18,
          initiatorType: 'parser',
          initiatorUrl: 'https://russeltest.bitrix24.ru/blank.php',
          redirectParentUrl: 'https://russeltest.bitrix24.ru/index.php',
          protocol: 'h2',
          priority: 'High',
        },
      ],
    });

    expect(result.pageMetrics).toEqual(normalizePageMetrics({
      navigationEntry: {
        responseStart: 1200,
        domContentLoadedEventEnd: 2400,
        loadEventEnd: 2600,
      },
      paintEntries: [
        { name: 'first-paint', startTime: 1500 },
        { name: 'first-contentful-paint', startTime: 1600 },
      ],
    }));
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({
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
      startTimeMs: 10,
      endTimeMs: 210,
      queueingMs: 4,
      dnsMs: 6,
      connectMs: 12,
      sslMs: 8,
      requestSentMs: 2,
      waitingMs: 150,
      downloadMs: 18,
      initiatorType: 'parser',
      initiatorUrl: 'https://russeltest.bitrix24.ru/blank.php',
      redirectParentUrl: 'https://russeltest.bitrix24.ru/index.php',
      protocol: 'h2',
      priority: 'High',
    });
    expect(result.jsExecutionSummary).toEqual({
      resources: [],
      unattributed: {
        parseMs: 0,
        evaluateMs: 0,
        totalMs: 0,
      },
    });
  });

  it('includes trace and coverage summaries when trace and coverage inputs are provided', async () => {
    const runner = createRunner();
    const job = createQueuedRunJob({
      runId: 'run-44',
      profileId: 'profile-44',
      targetUrl: 'https://russeltest.bitrix24.ru/blank.php',
      throttling: 'native',
      cacheMode: 'cold',
    });

    const result = await runner.start(job, {
      traceEntries: [
        {
          name: 'ResourceSendRequest',
          duration: 281.7,
          url: 'https://russeltest.bitrix24.ru/bitrix/js/call/core/dist/call.bundle.min.js',
        },
        {
          name: 'CompileScript',
          duration: 12,
          url: 'https://russeltest.bitrix24.ru/bitrix/js/main/core/core.min.js',
          attributionConfidence: 'high',
        },
        {
          name: 'EvaluateScript',
          duration: 48,
          url: 'https://russeltest.bitrix24.ru/bitrix/js/main/core/core.min.js',
          attributionConfidence: 'high',
        },
      ],
      coverageEntries: [
        {
          url: 'https://russeltest.bitrix24.ru/bitrix/js/main/core/core.min.js',
          type: 'js',
          totalBytes: 245644,
          usedBytes: 120000,
        },
      ],
    });

    expect(result.traceSummary.criticalChain).toEqual([
      {
        url: 'https://russeltest.bitrix24.ru/bitrix/js/call/core/dist/call.bundle.min.js',
        duration: 281.7,
      },
    ]);
    expect(result.jsExecutionSummary.resources).toEqual([
      {
        url: 'https://russeltest.bitrix24.ru/bitrix/js/main/core/core.min.js',
        parseMs: 12,
        evaluateMs: 48,
        totalMs: 60,
        attributionConfidence: 'high',
      },
    ]);
    expect(result.coverageSummary.totals.js.unusedBytes).toBe(125644);
  });

  it('uses the live executor when no raw inputs are provided', async () => {
    const executeLiveRun = vi.fn().mockResolvedValue({
      pageMetrics: [{ name: 'ttfb', value: 987.6 }],
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
          transferSize: 123,
          encodedBodySize: 100,
          decodedBodySize: 300,
        },
      ],
      traceSummary: {
        criticalChain: [],
        mainThread: {
          parse: 0,
          evaluate: 1,
          layout: 2,
          paint: 3,
          other: 4,
          longTaskCount: 0,
          longTaskTotal: 0,
        },
      },
      jsExecutionSummary: {
        resources: [
          {
            url: 'https://russeltest.bitrix24.ru/bitrix/js/main/core/core.min.js',
            parseMs: 4,
            evaluateMs: 16,
            totalMs: 20,
            attributionConfidence: 'high',
          },
        ],
        unattributed: {
          parseMs: 0,
          evaluateMs: 2,
          totalMs: 2,
        },
      },
      coverageSummary: {
        totals: {
          js: { usedBytes: 10, unusedBytes: 2 },
          css: { usedBytes: 5, unusedBytes: 1 },
        },
        resources: [],
      },
      passes: [
        {
          label: 'cold',
          pageMetrics: [{ name: 'ttfb', value: 987.6 }],
          requests: [],
          jsExecutionSummary: {
            resources: [],
            unattributed: {
              parseMs: 0,
              evaluateMs: 0,
              totalMs: 0,
            },
          },
        },
      ],
      pages: [],
    });
    const runner = createRunner({ executeLiveRun });
    const job = createQueuedRunJob({
      runId: 'run-45',
      profileId: 'profile-45',
      targetUrl: 'https://russeltest.bitrix24.ru/blank.php',
      throttling: 'native',
      cacheMode: 'cold',
    });

    const result = await runner.start(job);

    expect(executeLiveRun).toHaveBeenCalledWith(job);
    expect(result.runId).toBe('run-45');
    expect(result.pageMetrics).toEqual([{ name: 'ttfb', value: 987.6 }]);
    expect(result.requests).toHaveLength(1);
    expect(result.jsExecutionSummary.resources[0]).toMatchObject({
      url: 'https://russeltest.bitrix24.ru/bitrix/js/main/core/core.min.js',
      totalMs: 20,
      attributionConfidence: 'high',
    });
    expect(result.passes).toEqual([
      {
        label: 'cold',
        pageMetrics: [{ name: 'ttfb', value: 987.6 }],
        requests: [],
        jsExecutionSummary: {
          resources: [],
          unattributed: {
            parseMs: 0,
            evaluateMs: 0,
            totalMs: 0,
          },
        },
      },
    ]);
  });
});
