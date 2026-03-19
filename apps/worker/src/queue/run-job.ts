export type RunJob = {
  runId: string;
  profileId: string;
  targetUrl: string;
  targetUrls?: string[];
  throttling: 'native' | 'slow-4g' | 'fast-3g' | 'slow-3g' | 'custom';
  cacheMode: 'cold' | 'warm' | 'both';
  authStatePath?: string;
};

export function createQueuedRunJob(input: RunJob): RunJob
{
  return {
    ...input,
  };
}
