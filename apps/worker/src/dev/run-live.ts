import { createQueuedRunJob } from '../queue/run-job.js';
import { createRunner, defaultExecuteLiveRun } from '../runner/runner.js';

const targetUrl = process.argv[2] ?? 'https://example.com';
const throttling = (process.argv[3] as 'native' | 'slow-4g' | 'fast-3g' | 'slow-3g' | undefined) ?? 'native';
const runner = createRunner({ executeLiveRun: defaultExecuteLiveRun });

const result = await runner.start(createQueuedRunJob({
  runId: '11111111-1111-4111-8111-111111111111',
  profileId: '22222222-2222-4222-8222-222222222222',
  targetUrl,
  throttling,
}));

console.log(JSON.stringify({
  status: result.status,
  pageMetrics: result.pageMetrics,
  requestCount: result.requests.length,
  firstRequest: result.requests[0] ?? null,
  traceSummary: result.traceSummary,
  coverageSummary: result.coverageSummary.totals,
}, null, 2));
