import type { CoverageSummary, JsExecutionSummary, PageDiagnostics, TraceSummary } from '@pageperf-runner/worker';
import { requestSchema } from '@pageperf-runner/shared';

import type { Db } from '../../db/client.js';
import { pgInsertPageMetrics, pgInsertRequests } from '../../db/pg-ingest.js';
import {
  InMemoryRunRepository,
  type ArtifactRecord,
  type PageMetricRecord,
  type RunPageRecord,
  type RunPassRecord,
  type RequestRecord,
} from '../runs/run.repository.js';

type IngestPayload = {
  runId: string;
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

export class RunIngestService
{
  constructor(
    private readonly runs: InMemoryRunRepository,
    private readonly db?: Db,
  )
  {
  }

  async ingest(input: IngestPayload): Promise<{
    run: { id: string; profileId: string; status: string };
    pageMetrics: PageMetricRecord[];
    requests: RequestRecord[];
    artifacts: ArtifactRecord[];
    passes: RunPassRecord[];
    traceSummary?: TraceSummary;
    jsExecutionSummary?: JsExecutionSummary;
    coverageSummary?: CoverageSummary;
    pageDiagnostics?: PageDiagnostics;
    pages: RunPageRecord[];
  }>
  {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.runId))
    {
      throw new Error('Invalid run id');
    }

    for (const metric of input.pageMetrics)
    {
      if (
        !metric?.name
        || typeof metric.value !== 'number'
        || !Number.isFinite(metric.value)
        || metric.value < 0
      )
      {
        throw new Error('Invalid page metric payload');
      }
    }

    for (const request of input.requests)
    {
      requestSchema.parse(request);
    }

    for (const page of input.pages ?? [])
    {
      for (const metric of page.pageMetrics)
      {
        if (!metric?.name || typeof metric.value !== 'number' || !Number.isFinite(metric.value) || metric.value < 0)
        {
          throw new Error('Invalid page metric payload');
        }
      }

      for (const request of page.requests)
      {
        requestSchema.parse(request);
      }
    }

    for (const artifact of input.artifacts)
    {
      if (!artifact?.kind || !artifact?.path)
      {
        throw new Error('Invalid artifact payload');
      }
    }

    const payload = input;
    this.runs.updateDetails(payload.runId, {
      pageMetrics: payload.pageMetrics,
      requests: payload.requests,
      artifacts: payload.artifacts,
      passes: payload.passes ?? [],
      traceSummary: payload.traceSummary,
      jsExecutionSummary: payload.jsExecutionSummary,
      coverageSummary: payload.coverageSummary,
      pageDiagnostics: payload.pageDiagnostics,
      pages: payload.pages ?? [],
    });

    // Dual-write subset to PG for Grafana dashboards. Fire-and-forget —
    // helpers swallow their own errors.
    void pgInsertPageMetrics(this.db, payload.runId, payload.pageMetrics);
    void pgInsertRequests(
      this.db,
      payload.runId,
      payload.requests.map((request) => ({
        url: request.url,
        resourceType: request.resourceType,
        status: request.status,
      })),
    );

    const run = this.runs.findById(payload.runId);

    if (!run)
    {
      throw new Error('Run not found');
    }

    return {
      run,
      pageMetrics: payload.pageMetrics,
      requests: payload.requests,
      artifacts: payload.artifacts,
      passes: payload.passes ?? [],
      traceSummary: payload.traceSummary,
      jsExecutionSummary: payload.jsExecutionSummary,
      coverageSummary: payload.coverageSummary,
      pageDiagnostics: payload.pageDiagnostics,
      pages: payload.pages ?? [],
    };
  }
}
