import { describe, expect, it } from 'vitest';

import { InMemoryRunRepository } from '../runs/run.repository.js';
import { RunIngestService } from './run-ingest.service.js';

describe('RunIngestService', () => {
  it('persists metrics, requests, and artifacts for a run payload', async () => {
    const runs = new InMemoryRunRepository();
    const run = runs.create({ profileId: '11111111-1111-4111-8111-111111111111' });

    const service = new RunIngestService(runs);
    const stored = await service.ingest({
      runId: run.id,
      pageMetrics: [{ name: 'fcp', value: 1234 }],
      requests: [
        {
          url: 'https://russeltest.bitrix24.ru/blank.php',
          method: 'GET',
          resourceType: 'document',
          transferSize: 70003,
          encodedBodySize: 69703,
          decodedBodySize: 275275,
        },
      ],
      artifacts: [{ kind: 'trace', path: 'storage\\artifacts\\run\\trace.json' }],
    });

    expect(stored.run.status).toBe('completed');
    expect(stored.pageMetrics).toEqual([{ name: 'fcp', value: 1234 }]);
    expect(stored.requests).toHaveLength(1);
    expect(stored.artifacts).toEqual([{ kind: 'trace', path: 'storage\\artifacts\\run\\trace.json' }]);
  });

  it('accepts fractional page metric values', async () => {
    const runs = new InMemoryRunRepository();
    const run = runs.create({ profileId: '11111111-1111-4111-8111-111111111111' });

    const service = new RunIngestService(runs);
    const stored = await service.ingest({
      runId: run.id,
      pageMetrics: [{ name: 'cls', value: 0.12 }],
      requests: [
        {
          url: 'https://russeltest.bitrix24.ru/blank.php',
          method: 'GET',
          resourceType: 'document',
          transferSize: 70003,
          encodedBodySize: 69703,
          decodedBodySize: 275275,
        },
      ],
      artifacts: [{ kind: 'trace', path: 'storage\\artifacts\\run\\trace.json' }],
    });

    expect(stored.pageMetrics).toEqual([{ name: 'cls', value: 0.12 }]);
  });
});
