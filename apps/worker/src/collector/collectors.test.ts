import { describe, expect, it } from 'vitest';

import { normalizeNetworkRequest } from './network-collector.js';
import { normalizePageMetrics } from './page-metrics-collector.js';

describe('page metrics collector', () => {
  it('normalizes TTFB, FP, FCP, DCL, and Load metrics', () => {
    const metrics = normalizePageMetrics({
      navigationEntry: {
        responseStart: 1698.5,
        domContentLoadedEventEnd: 8618.4,
        loadEventEnd: 9438.4,
      },
      paintEntries: [
        { name: 'first-paint', startTime: 2948 },
        { name: 'first-contentful-paint', startTime: 2948 },
      ],
    });

    expect(metrics).toEqual([
      { name: 'ttfb', value: 1698.5 },
      { name: 'fp', value: 2948 },
      { name: 'fcp', value: 2948 },
      { name: 'dcl', value: 8618.4 },
      { name: 'load', value: 9438.4 },
    ]);
  });
});

describe('network collector', () => {
  it('normalizes request status, type, cache flags, content encoding, sizes, and duration', () => {
    const request = normalizeNetworkRequest({
      url: 'https://russeltest.bitrix24.ru/blank.php',
      method: 'GET',
      status: 200,
      resourceType: 'document',
      responseHeaders: {
        'content-encoding': 'gzip',
      },
      fromDiskCache: false,
      fromMemoryCache: true,
      revalidated: false,
      transferSize: 70003,
      encodedBodySize: 69703,
      decodedBodySize: 275275,
      durationMs: 943.8,
    });

    expect(request).toEqual({
      url: 'https://russeltest.bitrix24.ru/blank.php',
      method: 'GET',
      status: 200,
      resourceType: 'document',
      contentEncoding: 'gzip',
      responseHeaders: {
        'content-encoding': 'gzip',
      },
      fromDiskCache: false,
      fromMemoryCache: true,
      revalidated: false,
      transferSize: 70003,
      encodedBodySize: 69703,
      decodedBodySize: 275275,
      durationMs: 943.8,
    });
  });
});
