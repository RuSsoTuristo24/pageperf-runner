import { runSchema } from '@webperf/shared';
import type { CoverageSummary, JsExecutionSummary, PageDiagnostics, TraceSummary } from '@webperf/worker';
import { AuthSessionExpiredError, AuthSessionService } from '../auth/auth-session.service.js';
import { buildAiSnapshot } from '../analysis/ai-snapshot.service.js';
import { ArtifactStore } from '../artifacts/artifact-store.js';
import { RunIngestService } from '../ingest/run-ingest.service.js';
import { detectIssues } from '../issues/rule-engine.js';
import { createQueuedRunJob } from '@webperf/worker';

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
        repeatCount: profile.repeatCount ?? 1,
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
      return await this.authSessionService.ensureReady(targetUrl);
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
