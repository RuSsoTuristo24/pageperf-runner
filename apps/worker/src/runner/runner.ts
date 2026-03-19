import type { RunJob } from '../queue/run-job.js';
import {
  normalizeNetworkRequest,
  type RawNetworkEntry,
} from '../collector/network-collector.js';
import {
  normalizePageMetrics,
  type NavigationEntryLike,
  type PaintEntryLike,
  type PageMetricRecord,
} from '../collector/page-metrics-collector.js';
import {
  summarizeTrace,
  summarizeJsExecution,
  type RawTraceEntry,
  type TraceSummary,
  type JsExecutionSummary,
} from '../collector/trace-collector.js';
import {
  summarizeCoverage,
  type CoverageSummary,
  type RawCoverageEntry,
} from '../collector/coverage-collector.js';
import type { PageDiagnostics } from '../collector/page-diagnostics-collector.js';
import { executeLiveRun as executePlaywrightLiveRun } from './live-profile.js';

type RunnerRawInput = {
  navigationEntry?: NavigationEntryLike;
  paintEntries?: PaintEntryLike[];
  networkEntries?: RawNetworkEntry[];
  traceEntries?: RawTraceEntry[];
  coverageEntries?: RawCoverageEntry[];
};

type LiveRunResult = {
  pageMetrics: PageMetricRecord[];
  requests: ReturnType<typeof normalizeNetworkRequest>[];
  traceSummary: TraceSummary;
  jsExecutionSummary: JsExecutionSummary;
  coverageSummary: CoverageSummary;
  pageDiagnostics?: PageDiagnostics;
  pages?: Array<{
    pageKey: string;
    url: string;
    pageMetrics: PageMetricRecord[];
    requests: ReturnType<typeof normalizeNetworkRequest>[];
    traceSummary: TraceSummary;
    jsExecutionSummary: JsExecutionSummary;
    coverageSummary: CoverageSummary;
    pageDiagnostics?: PageDiagnostics;
    passes: Array<{
      label: 'cold' | 'warm';
      pageMetrics: PageMetricRecord[];
      requests: ReturnType<typeof normalizeNetworkRequest>[];
      traceSummary?: TraceSummary;
      jsExecutionSummary?: JsExecutionSummary;
      coverageSummary?: CoverageSummary;
      pageDiagnostics?: PageDiagnostics;
    }>;
  }>;
  passes: Array<{
    label: 'cold' | 'warm';
    pageMetrics: PageMetricRecord[];
    requests: ReturnType<typeof normalizeNetworkRequest>[];
    traceSummary?: TraceSummary;
    jsExecutionSummary?: JsExecutionSummary;
    coverageSummary?: CoverageSummary;
    pageDiagnostics?: PageDiagnostics;
  }>;
};

type RunnerOptions = {
  executeLiveRun?: (job: RunJob) => Promise<LiveRunResult>;
};

export function createRunner(options: RunnerOptions = {})
{
  return {
    async start(job: RunJob, rawInput?: RunnerRawInput): Promise<{
      runId: string;
      status: 'running' | 'completed';
      pageMetrics: PageMetricRecord[];
      requests: ReturnType<typeof normalizeNetworkRequest>[];
      traceSummary: TraceSummary;
      jsExecutionSummary: JsExecutionSummary;
      coverageSummary: CoverageSummary;
      pageDiagnostics?: PageDiagnostics;
      pages?: LiveRunResult['pages'];
      passes: LiveRunResult['passes'];
    }>
    {
      if (!rawInput && options.executeLiveRun)
      {
        const liveResult = await options.executeLiveRun(job);

      return {
        runId: job.runId,
        status: 'completed',
        pageMetrics: liveResult.pageMetrics,
        requests: liveResult.requests,
        traceSummary: liveResult.traceSummary,
        jsExecutionSummary: liveResult.jsExecutionSummary,
        coverageSummary: liveResult.coverageSummary,
        pageDiagnostics: liveResult.pageDiagnostics,
        pages: liveResult.pages,
        passes: liveResult.passes,
      };
      }

      if (!rawInput)
      {
        return {
          runId: job.runId,
          status: 'running',
          pageMetrics: [],
          requests: [],
          traceSummary: summarizeTrace([]),
          jsExecutionSummary: summarizeJsExecution([]),
          coverageSummary: summarizeCoverage([]),
          pages: [],
          passes: [],
        };
      }

      return {
        runId: job.runId,
        status: 'running',
        pageMetrics: normalizePageMetrics({
          navigationEntry: rawInput?.navigationEntry,
          paintEntries: rawInput?.paintEntries,
        }),
        requests: (rawInput?.networkEntries ?? []).map((entry) => normalizeNetworkRequest(entry)),
        traceSummary: summarizeTrace(rawInput?.traceEntries ?? []),
        jsExecutionSummary: summarizeJsExecution(rawInput?.traceEntries ?? []),
        coverageSummary: summarizeCoverage(rawInput?.coverageEntries ?? []),
        pages: [],
        passes: [],
      };
    },
  };
}

export const defaultExecuteLiveRun = executePlaywrightLiveRun;
