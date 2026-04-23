import { runSchema } from '@pageperf-runner/shared';
import type { CoverageSummary, JsExecutionSummary, PageDiagnostics, TraceSummary } from '@pageperf-runner/worker';
import { AuthSessionExpiredError, AuthSessionService } from '../auth/auth-session.service.js';
import { buildAiSnapshot } from '../analysis/ai-snapshot.service.js';
import { ArtifactStore } from '../artifacts/artifact-store.js';
import { RunIngestService } from '../ingest/run-ingest.service.js';
import { detectIssues } from '../issues/rule-engine.js';
import { createQueuedRunJob } from '@pageperf-runner/worker';
import type { Db } from '../../db/client.js';
import { pgInsertRun, pgUpdateRunStatus } from '../../db/pg-ingest.js';

import { InMemoryProfileRepository } from '../profiles/profile.repository.js';
import {
  InMemoryRunRepository,
  type ArtifactRecord,
  type PageMetricRecord,
  type RunPageRecord,
  type RequestRecord,
  type RunPassRecord,
  type RunRecord,
} from './run.repository.js';

export class RunValidationError extends Error {}

export class RunDependencyError extends Error {}

type RunExecutionResult = {
  runId: string;
  status: 'running' | 'completed';
  pageMetrics: PageMetricRecord[];
  requests: RequestRecord[];
  traceSummary: TraceSummary;
  jsExecutionSummary: JsExecutionSummary;
  coverageSummary: CoverageSummary;
  pageDiagnostics?: PageDiagnostics;
  passes: RunPassRecord[];
  pages?: RunPageRecord[];
};

type RunExecutor = ReturnType<typeof createQueuedRunJob> extends infer T
  ? (job: T) => Promise<RunExecutionResult>
  : never;

export class RunService
{
  constructor(
    private readonly runs: InMemoryRunRepository,
    private readonly profiles: InMemoryProfileRepository,
    private readonly ingestService?: RunIngestService,
    private readonly artifactStore?: ArtifactStore,
    private readonly runExecutor?: RunExecutor,
    private readonly authSessionService?: AuthSessionService,
    private readonly db?: Db,
  )
  {
  }

  create(input: unknown): RunRecord
  {
    if (
      !input
      || typeof input !== 'object'
      || typeof (input as { profileId?: unknown }).profileId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test((input as { profileId: string }).profileId)
    )
    {
      throw new RunValidationError('Invalid run payload');
    }

    const payload = input as { profileId: string };
    const profile = this.profiles.findById(payload.profileId);

    if (!profile)
    {
      throw new RunDependencyError('Profile not found');
    }

    const run = this.runs.create(payload);
    runSchema.parse({
      id: run.id,
      profileId: run.profileId,
      status: run.status,
    });

    // Dual-write: record the run in PG for Grafana. Status starts as 'running'
    // so dashboards can see it right away; start() flips it to completed/failed.
    void pgInsertRun(this.db, {
      id: run.id,
      profileId: run.profileId,
      status: 'running',
    });

    return run;
  }

  list(): RunRecord[]
  {
    return this.runs.list();
  }

  async start(runId: string): Promise<{
    run: RunRecord;
    pageMetrics: PageMetricRecord[];
    requests: RequestRecord[];
    artifacts: ArtifactRecord[];
    passes: RunPassRecord[];
    issues: ReturnType<typeof detectIssues>;
    traceSummary: TraceSummary;
    jsExecutionSummary: JsExecutionSummary;
    coverageSummary: CoverageSummary;
    pageDiagnostics?: PageDiagnostics;
    pages: RunPageRecord[];
  }>
  {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId))
    {
      throw new RunValidationError('Invalid run id');
    }

    const run = this.runs.findById(runId);

    if (!run)
    {
      throw new RunDependencyError('Run not found');
    }

    const profile = this.profiles.findById(run.profileId);

    if (!profile)
    {
      throw new RunDependencyError('Profile not found');
    }

    if (!this.runExecutor || !this.ingestService)
    {
      throw new RunDependencyError('Run execution is not configured');
    }

    this.runs.setStatus(run.id, 'running');

    try
    {
      const executionResult = await this.runExecutor(createQueuedRunJob({
        runId: run.id,
        profileId: run.profileId,
        targetUrl: profile.url,
        targetUrls: profile.pages?.length ? profile.pages : [profile.url],
        throttling: profile.throttling,
        cacheMode: profile.cacheMode,
        authStatePath: profile.authMode === 'session'
          ? await this.#resolveAuthStatePath(profile.url)
          : undefined,
      }));
      const coldLoadMetric = executionResult.passes.find((pass) => pass.label === 'cold')?.pageMetrics.find((metric) => metric.name === 'load')?.value
        ?? executionResult.pageMetrics.find((metric) => metric.name === 'load')?.value
        ?? 0;
      const warmLoadMetric = executionResult.passes.find((pass) => pass.label === 'warm')?.pageMetrics.find((metric) => metric.name === 'load')?.value
        ?? coldLoadMetric;
      const issues = detectIssues({
        requests: executionResult.requests.map((request) => ({
          ...request,
          contentEncoding: request.contentEncoding ?? null,
          renderBlocking: request.resourceType === 'stylesheet',
        })),
        coldLoadMs: coldLoadMetric,
        warmLoadMs: warmLoadMetric,
      });
      const artifacts: ArtifactRecord[] = [];

      if (this.artifactStore)
      {
        const aiSnapshotArtifact = await this.artifactStore.writeJsonArtifact({
          runId: run.id,
          kind: 'ai-snapshot',
          fileName: 'ai_snapshot.json',
          data: buildAiSnapshot({
            run: {
              id: run.id,
              profileId: run.profileId,
              status: 'completed',
            },
            pageMetrics: executionResult.pageMetrics,
            requests: executionResult.requests,
            issues,
          }),
        });

        artifacts.push(aiSnapshotArtifact);
      }

      const stored = await this.ingestService.ingest({
        runId: run.id,
        pageMetrics: executionResult.pageMetrics,
        requests: executionResult.requests,
        artifacts,
        passes: executionResult.passes,
        traceSummary: executionResult.traceSummary,
        jsExecutionSummary: executionResult.jsExecutionSummary,
        coverageSummary: executionResult.coverageSummary,
        pageDiagnostics: executionResult.pageDiagnostics,
        pages: executionResult.pages ?? [],
      });

      // Fire-and-forget: refresh the saved auth state so PHPSESSID rotation
      // and persistent-cookie expiry bumps land on disk. Any failure here is
      // intentionally swallowed — it must never fail a completed run.
      if (profile.authMode === 'session' && this.authSessionService)
      {
        try
        {
          const host = new URL(profile.url).host;
          void this.authSessionService.refresh(host).catch(() => undefined);
        }
        catch
        {
          // URL parsing failure — skip
        }
      }

      void pgUpdateRunStatus(this.db, run.id, 'completed');

      return {
        ...stored,
        issues,
        traceSummary: executionResult.traceSummary,
        jsExecutionSummary: executionResult.jsExecutionSummary,
        coverageSummary: executionResult.coverageSummary,
        pageDiagnostics: executionResult.pageDiagnostics,
        pages: executionResult.pages ?? [],
      };
    }
    catch (error)
    {
      this.runs.setStatus(run.id, 'failed');
      void pgUpdateRunStatus(this.db, run.id, 'failed');
      throw error;
    }
  }

  async delete(runId: string): Promise<{ deleted: true; runId: string }>
  {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId))
    {
      throw new RunValidationError('Invalid run id');
    }

    const deleted = this.runs.delete(runId);

    if (!deleted)
    {
      throw new RunDependencyError('Run not found');
    }

    if (this.artifactStore)
    {
      await this.artifactStore.deleteRunArtifacts(runId);
    }

    return {
      deleted: true,
      runId,
    };
  }

  async #resolveAuthStatePath(targetUrl: string): Promise<string>
  {
    if (!this.authSessionService)
    {
      throw new RunDependencyError('Auth session service is not configured');
    }

    try
    {
      return await this.authSessionService.ensureReadyForUrl(targetUrl);
    }
    catch (error)
    {
      if (error instanceof AuthSessionExpiredError)
      {
        throw new RunDependencyError(error.message);
      }

      throw error;
    }
  }
}
