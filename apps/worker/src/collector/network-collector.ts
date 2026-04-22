import { requestSchema, type WebPerfRequest } from '@pageperf-runner/shared';

export type RawNetworkEntry = {
  url: string;
  method: string;
  status: number;
  resourceType: string;
  responseHeaders?: Record<string, string>;
  fromDiskCache?: boolean;
  fromMemoryCache?: boolean;
  revalidated?: boolean;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  durationMs?: number;
  startTimeMs?: number;
  endTimeMs?: number;
  queueingMs?: number;
  dnsMs?: number;
  connectMs?: number;
  sslMs?: number;
  requestSentMs?: number;
  waitingMs?: number;
  downloadMs?: number;
  initiatorType?: 'parser' | 'script' | 'preload' | 'fetch' | 'xmlhttprequest' | 'other';
  initiatorUrl?: string;
  redirectParentUrl?: string;
  protocol?: string;
  priority?: string;
};

export function normalizeNetworkRequest(input: RawNetworkEntry): WebPerfRequest
{
  return requestSchema.parse({
    url: input.url,
    method: input.method,
    status: input.status,
    resourceType: input.resourceType,
    contentEncoding: input.responseHeaders?.['content-encoding'] ?? null,
    fromDiskCache: input.fromDiskCache ?? false,
    fromMemoryCache: input.fromMemoryCache ?? false,
    revalidated: input.revalidated ?? false,
    transferSize: input.transferSize,
    encodedBodySize: input.encodedBodySize,
    decodedBodySize: input.decodedBodySize,
    durationMs: input.durationMs,
    startTimeMs: input.startTimeMs,
    endTimeMs: input.endTimeMs,
    queueingMs: input.queueingMs,
    dnsMs: input.dnsMs,
    connectMs: input.connectMs,
    sslMs: input.sslMs,
    requestSentMs: input.requestSentMs,
    waitingMs: input.waitingMs,
    downloadMs: input.downloadMs,
    initiatorType: input.initiatorType,
    initiatorUrl: input.initiatorUrl,
    redirectParentUrl: input.redirectParentUrl,
    protocol: input.protocol,
    priority: input.priority,
    responseHeaders: input.responseHeaders,
  });
}
