import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildAiSnapshot } from './ai-snapshot.service.js';

describe('ai snapshot service', () => {
  it('builds a compact snapshot with summary, heavy assets, slow requests, issues, and compare section', () => {
    const snapshot = buildAiSnapshot({
      run: {
        id: 'run-1',
        profileId: 'profile-1',
        status: 'completed',
      },
      pageMetrics: [
        { name: 'ttfb', value: 1698.5 },
        { name: 'fcp', value: 2948 },
        { name: 'load', value: 9438.4 },
      ],
      requests: [
        {
          url: 'https://russeltest.bitrix24.ru/blank.php',
          method: 'GET',
          resourceType: 'document',
          transferSize: 70003,
          encodedBodySize: 69703,
          decodedBodySize: 275275,
        },
        {
          url: 'https://russeltest.bitrix24.ru/bitrix/js/call/core/dist/call.bundle.min.js',
          method: 'GET',
          resourceType: 'script',
          transferSize: 281950,
          encodedBodySize: 281650,
          decodedBodySize: 1118961,
        },
      ],
      issues: [
        {
          code: 'large-decoded-js',
          severity: 'critical',
          evidence: 'Script decoded size exceeds threshold',
        },
      ],
      compareToBaseline: {
        loadDeltaMs: -120,
        encodedBytesDelta: -48000,
      },
    });

    expect(snapshot.runId).toBe('run-1');
    expect(snapshot.summary).toMatchObject({
      metrics: expect.objectContaining({
        ttfb: 1698.5,
        fcp: 2948,
        load: 9438.4,
      }),
      requestCount: 2,
    });
    expect(snapshot.heavyAssets[0]).toMatchObject({
      url: 'https://russeltest.bitrix24.ru/bitrix/js/call/core/dist/call.bundle.min.js',
      decodedBodySize: 1118961,
    });
    expect(snapshot.slowRequests[0]).toMatchObject({
      url: 'https://russeltest.bitrix24.ru/bitrix/js/call/core/dist/call.bundle.min.js',
      transferSize: 281950,
    });
    expect(snapshot.issues).toEqual([
      expect.objectContaining({ code: 'large-decoded-js' }),
    ]);
    expect(snapshot.compareToBaseline).toEqual({
      loadDeltaMs: -120,
      encodedBytesDelta: -48000,
    });
  });
});

describe('summary views sql', () => {
  it('defines run-level summary and issue summary views', async () => {
    const sqlPath = path.resolve(
      import.meta.dirname,
      '../../db/summary-views.sql',
    );

    const sql = await readFile(sqlPath, 'utf8');

    expect(sql).toContain('CREATE VIEW run_summary');
    expect(sql).toContain('CREATE VIEW run_issue_summary');
    expect(sql).toContain('issue_count');
    expect(sql).toContain('request_count');
  });
});
