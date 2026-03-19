import { throttlingProfiles } from '@webperf/shared';

type RunnerNetworkInput = {
  throttling: 'native' | 'slow-4g' | 'fast-3g' | 'slow-3g' | 'custom';
  customNetworkProfile?: {
    downloadKbps: number;
    uploadKbps: number;
    latencyMs: number;
  };
};

export function toNetworkConditions(input: RunnerNetworkInput): {
  downloadThroughput: number;
  uploadThroughput: number;
  latency: number;
  offline: false;
}
{
  const profile = input.throttling === 'custom'
    ? input.customNetworkProfile
    : throttlingProfiles[input.throttling];

  if (!profile)
  {
    throw new Error('Unknown network profile');
  }

  return {
    downloadThroughput: Math.round((profile.downloadKbps * 1000) / 8),
    uploadThroughput: Math.round((profile.uploadKbps * 1000) / 8),
    latency: profile.latencyMs,
    offline: false,
  };
}
