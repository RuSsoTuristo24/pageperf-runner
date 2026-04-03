import type { CoverageSummary, JsExecutionSummary, PageDiagnostics, TraceSummary } from '@webperf/worker';

export type RunRecord = {
  id: string;
  profileId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
};

export type PageMetricRecord = {
  name: string;
  value: number;
};

export type RequestRecord = {
  url: string;
  method: string;
  status?: number;
  resourceType: string;
  contentEncoding?: string | null;
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
  responseHeaders?: Record<string, string>;
};

export type ArtifactRecord = {
  kind: string;
  path: string;
};

export type RunPassRecord = {
  label: 'cold' | 'warm';
  pageMetrics: PageMetricRecord[];
  requests: RequestRecord[];
  traceSummary?: TraceSummary;
  jsExecutionSummary?: JsExecutionSummary;
  coverageSummary?: CoverageSummary;
  pageDiagnostics?: PageDiagnostics;
};

export type RunPageRecord = {
  pageKey: string;
  url: string;
  pageMetrics: PageMetricRecord[];
  requests: RequestRecord[];
  passes: RunPassRecord[];
  traceSummary?: TraceSummary;
  jsExecutionSummary?: JsExecutionSummary;
  coverageSummary?: CoverageSummary;
  pageDiagnostics?: PageDiagnostics;
};

export type RunDetails = {
  pageMetrics: PageMetricRecord[];
  requests: RequestRecord[];
  artifacts: ArtifactRecord[];
  passes?: RunPassRecord[];
  traceSummary?: TraceSummary;
  jsExecutionSummary?: JsExecutionSummary;
  coverageSummary?: CoverageSummary;
  pageDiagnostics?: PageDiagnostics;
  pages?: RunPageRecord[];
};

export interface RunRepository
{
  create(input: { profileId: string }): Promise<RunRecord>;
  list(): Promise<RunRecord[]>;
  findById(id: string): Promise<RunRecord | null>;
  setStatus(id: string, status: RunRecord['status']): Promise<RunRecord | null>;
  findDetails(id: string): Promise<RunDetails>;
  updateDetails(id: string, details: RunDetails): Promise<void>;
  delete(id: string): Promise<boolean>;
}
