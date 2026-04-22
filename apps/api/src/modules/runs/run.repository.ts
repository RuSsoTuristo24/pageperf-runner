import { randomUUID } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

import type { CoverageSummary, JsExecutionSummary, PageDiagnostics, TraceSummary } from '@pageperf-runner/worker';

import { readJsonFileSync, writeJsonFileSync } from '../../storage/json-file.js';

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

type RunDetails = {
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

function toFiniteNumber(value: unknown, fallback = 0): number
{
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback;
}

function normalizeCriticalChain(
  criticalChain: unknown,
): TraceSummary['criticalChain']
{
  if (!Array.isArray(criticalChain))
  {
    return [];
  }

  return criticalChain.flatMap((entry) => {
    if (!entry || typeof entry !== 'object')
    {
      return [];
    }

    const candidate = entry as { url?: unknown; duration?: unknown };
    const url = typeof candidate.url === 'string' ? candidate.url : null;

    if (!url)
    {
      return [];
    }

    return [{
      url,
      duration: toFiniteNumber(candidate.duration),
    }];
  });
}

function normalizeTraceSummary(traceSummary: unknown): TraceSummary | undefined
{
  if (!traceSummary || typeof traceSummary !== 'object')
  {
    return undefined;
  }

  const candidate = traceSummary as {
    criticalChain?: unknown;
    mainThread?: Record<string, unknown>;
  };
  const mainThread = candidate.mainThread;

  if (!mainThread || typeof mainThread !== 'object')
  {
    return undefined;
  }

  return {
    criticalChain: normalizeCriticalChain(candidate.criticalChain),
    mainThread: {
      parse: toFiniteNumber(mainThread.parse),
      evaluate: toFiniteNumber(mainThread.evaluate, toFiniteNumber(mainThread.script)),
      layout: toFiniteNumber(mainThread.layout),
      paint: toFiniteNumber(mainThread.paint),
      other: toFiniteNumber(mainThread.other),
      longTaskCount: toFiniteNumber(mainThread.longTaskCount),
      longTaskTotal: toFiniteNumber(mainThread.longTaskTotal),
    },
  };
}

function normalizeJsExecutionSummary(jsExecutionSummary: unknown): JsExecutionSummary | undefined
{
  if (!jsExecutionSummary || typeof jsExecutionSummary !== 'object')
  {
    return undefined;
  }

  const candidate = jsExecutionSummary as {
    resources?: unknown;
    unattributed?: Record<string, unknown>;
  };

  return {
    resources: Array.isArray(candidate.resources)
      ? candidate.resources.flatMap((entry) => {
        if (!entry || typeof entry !== 'object')
        {
          return [];
        }

        const nextEntry = entry as {
          url?: unknown;
          parseMs?: unknown;
          evaluateMs?: unknown;
          totalMs?: unknown;
          attributionConfidence?: unknown;
        };
        const url = typeof nextEntry.url === 'string' ? nextEntry.url : null;

        if (!url)
        {
          return [];
        }

        return [{
          url,
          parseMs: toFiniteNumber(nextEntry.parseMs),
          evaluateMs: toFiniteNumber(nextEntry.evaluateMs),
          totalMs: toFiniteNumber(nextEntry.totalMs, toFiniteNumber(nextEntry.parseMs) + toFiniteNumber(nextEntry.evaluateMs)),
          attributionConfidence: nextEntry.attributionConfidence === 'high'
            || nextEntry.attributionConfidence === 'medium'
            || nextEntry.attributionConfidence === 'low'
            ? nextEntry.attributionConfidence
            : 'low',
        }];
      })
      : [],
    unattributed: {
      parseMs: toFiniteNumber(candidate.unattributed?.parseMs),
      evaluateMs: toFiniteNumber(candidate.unattributed?.evaluateMs),
      totalMs: toFiniteNumber(candidate.unattributed?.totalMs),
    },
  };
}

function normalizePageDiagnostics(pageDiagnostics: unknown): PageDiagnostics | undefined
{
  if (!pageDiagnostics || typeof pageDiagnostics !== 'object')
  {
    return undefined;
  }

  const candidate = pageDiagnostics as Record<string, unknown>;
  const dom = candidate.dom as Record<string, unknown> | undefined;
  const heap = candidate.heap as Record<string, unknown> | undefined;

  if (!dom || typeof dom !== 'object' || !heap || typeof heap !== 'object')
  {
    return undefined;
  }

  return {
    dom: {
      nodeCount: toFiniteNumber(dom.nodeCount),
      treeDepth: toFiniteNumber(dom.treeDepth),
      eventListenerCount: toFiniteNumber(dom.eventListenerCount),
    },
    heap: {
      usedBytes: toFiniteNumber(heap.usedBytes),
      totalBytes: toFiniteNumber(heap.totalBytes),
    },
    oversizedImages: Array.isArray((candidate as any).oversizedImages) ? (candidate as any).oversizedImages : [],
    thirdParty: (candidate as any).thirdParty ?? { origins: [], totalTransferBytes: 0, totalRequests: 0 },
  } as PageDiagnostics;
}

function normalizeRunDetails(details: RunDetails): RunDetails
{
  return {
    ...details,
    passes: (details.passes ?? []).map((pass) => ({
      ...pass,
      traceSummary: normalizeTraceSummary(pass.traceSummary),
      jsExecutionSummary: normalizeJsExecutionSummary(pass.jsExecutionSummary),
      pageDiagnostics: normalizePageDiagnostics(pass.pageDiagnostics),
    })),
    traceSummary: normalizeTraceSummary(details.traceSummary),
    jsExecutionSummary: normalizeJsExecutionSummary(details.jsExecutionSummary),
    pageDiagnostics: normalizePageDiagnostics(details.pageDiagnostics),
    pages: (details.pages ?? []).map((page) => ({
      ...page,
      passes: (page.passes ?? []).map((pass) => ({
        ...pass,
        traceSummary: normalizeTraceSummary(pass.traceSummary),
        jsExecutionSummary: normalizeJsExecutionSummary(pass.jsExecutionSummary),
        pageDiagnostics: normalizePageDiagnostics(pass.pageDiagnostics),
      })),
      traceSummary: normalizeTraceSummary(page.traceSummary),
      jsExecutionSummary: normalizeJsExecutionSummary(page.jsExecutionSummary),
      pageDiagnostics: normalizePageDiagnostics(page.pageDiagnostics),
    })),
  };
}

export class InMemoryRunRepository
{
  #runs: RunRecord[];

  #details = new Map<string, RunDetails>();

  readonly #indexFilePath?: string;

  readonly #detailsDirectoryPath?: string;

  constructor(storageRoot?: string)
  {
    this.#indexFilePath = storageRoot ? path.join(storageRoot, 'data', 'runs', 'index.json') : undefined;
    this.#detailsDirectoryPath = storageRoot ? path.join(storageRoot, 'data', 'runs', 'details') : undefined;
    this.#runs = this.#indexFilePath
      ? readJsonFileSync<RunRecord[]>(this.#indexFilePath, [])
      : [];
    this.#runs = this.#runs.map((run) => ({
      ...run,
      createdAt: run.createdAt ?? new Date().toISOString(),
    }));

    for (const run of this.#runs)
    {
      this.#details.set(run.id, this.#readDetails(run.id));
    }
  }

  create(input: { profileId: string }): RunRecord
  {
    const run: RunRecord = {
      id: randomUUID(),
      profileId: input.profileId,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };

    this.#runs.unshift(run);
      this.#details.set(run.id, {
        pageMetrics: [],
        requests: [],
        artifacts: [],
        passes: [],
        traceSummary: undefined,
        jsExecutionSummary: undefined,
        coverageSummary: undefined,
      });
    this.#persistRuns();
    this.#persistDetails(run.id);

    return run;
  }

  list(): RunRecord[]
  {
    return [...this.#runs];
  }

  findById(id: string): RunRecord | null
  {
    return this.#runs.find((run) => run.id === id) ?? null;
  }

  setStatus(id: string, status: RunRecord['status']): RunRecord | null
  {
    const run = this.findById(id);

    if (!run)
    {
      return null;
    }

    run.status = status;
    if (status === 'queued' || status === 'running')
    {
      run.completedAt = undefined;
    }
    this.#persistRuns();

    return run;
  }

  findDetails(id: string): RunDetails
  {
    return this.#details.get(id) ?? {
      pageMetrics: [],
      requests: [],
      artifacts: [],
      passes: [],
      pages: [],
    };
  }

  updateDetails(id: string, details: RunDetails): void
  {
    const run = this.findById(id);
    if (!run)
    {
      return;
    }

    run.status = 'completed';
    run.completedAt = new Date().toISOString();
    this.#details.set(id, details);
    this.#persistRuns();
    this.#persistDetails(id);
  }

  delete(id: string): boolean
  {
    const runIndex = this.#runs.findIndex((run) => run.id === id);

    if (runIndex < 0)
    {
      return false;
    }

    this.#runs.splice(runIndex, 1);
    this.#details.delete(id);
    this.#persistRuns();

    if (this.#detailsDirectoryPath)
    {
      const detailPath = path.join(this.#detailsDirectoryPath, `${id}.json`);

      if (existsSync(detailPath))
      {
        rmSync(detailPath, { force: true });
      }
    }

    return true;
  }

  #readDetails(id: string): RunDetails
  {
    if (!this.#detailsDirectoryPath)
    {
      return {
        pageMetrics: [],
        requests: [],
        artifacts: [],
        passes: [],
        traceSummary: undefined,
        jsExecutionSummary: undefined,
        coverageSummary: undefined,
        pages: [],
      };
    }

    return normalizeRunDetails(readJsonFileSync<RunDetails>(
      path.join(this.#detailsDirectoryPath, `${id}.json`),
      {
        pageMetrics: [],
        requests: [],
        artifacts: [],
        passes: [],
        traceSummary: undefined,
        jsExecutionSummary: undefined,
        coverageSummary: undefined,
        pages: [],
      },
    ));
  }

  #persistRuns(): void
  {
    if (!this.#indexFilePath)
    {
      return;
    }

    writeJsonFileSync(this.#indexFilePath, this.#runs);
  }

  #persistDetails(id: string): void
  {
    if (!this.#detailsDirectoryPath)
    {
      return;
    }

    writeJsonFileSync(
      path.join(this.#detailsDirectoryPath, `${id}.json`),
      this.findDetails(id),
    );
  }
}
