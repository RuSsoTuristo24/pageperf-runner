import { assetIssueSchema, assetIssueStatusSchema, normalizeAssetUrl } from '@webperf/shared';

import type { RunRepository, RunRecord } from '../runs/run.repository.types.js';
import type { AssetIssueRepository, StoredAssetIssue } from './asset-issue.repository.types.js';

export class AssetIssueValidationError extends Error {}
export class AssetIssueDependencyError extends Error {}

type AssetIssueListItem = StoredAssetIssue & {
  returnedAfterClose: boolean;
  lastSeenAt?: string;
  lastSeenRunId?: string;
};

type AssetIssueUpsertPayload = {
  assetKey?: string;
  assetUrl?: string;
  resourceType?: string;
  mantisUrl?: string;
  status?: string;
  note?: string;
  closedAt?: string;
};

type AssetIssueDeletePayload = {
  assetKey?: string;
};

type ValidatedCreateInput = {
  assetKey: string;
  assetUrl: string;
  resourceType: string;
  mantisUrl: string;
  status: 'open' | 'review' | 'closed';
  note: string;
  closedAt?: string;
};

type ValidatedUpdateInput = {
  assetKey: string;
  mantisUrl: string;
  status: 'open' | 'review' | 'closed';
  note: string;
  resourceType?: string;
  closedAt?: string;
};

export class AssetIssueService
{
  constructor(
    private readonly repository: AssetIssueRepository,
    private readonly runs: RunRepository,
  )
  {
  }

  async list(): Promise<AssetIssueListItem[]>
  {
    const issues = await this.repository.list();

    return Promise.all(issues.map((issue) => this.#enrichIssue(issue)));
  }

  async create(input: unknown): Promise<AssetIssueListItem>
  {
    const payload = this.#validateCreateInput(input);
    const assetKey = normalizeAssetUrl(payload.assetUrl);
    const currentIssue = await this.repository.findByAssetKey(assetKey);
    const now = new Date().toISOString();
    const storedIssue: StoredAssetIssue = {
      assetKey,
      assetUrl: payload.assetUrl ?? assetKey,
      resourceType: payload.resourceType,
      mantisUrl: payload.mantisUrl,
      status: payload.status,
      note: payload.note,
      createdAt: currentIssue?.createdAt ?? now,
      updatedAt: now,
      closedAt: payload.status === 'closed'
        ? (payload.closedAt ?? currentIssue?.closedAt ?? now)
        : undefined,
    };

    return this.#enrichIssue(await this.repository.save(storedIssue));
  }

  async update(input: unknown): Promise<AssetIssueListItem>
  {
    const payload = this.#validateUpdateInput(input);
    const currentIssue = await this.repository.findByAssetKey(payload.assetKey);

    if (!currentIssue)
    {
      throw new AssetIssueDependencyError('Asset issue not found');
    }

    const now = new Date().toISOString();
    const storedIssue: StoredAssetIssue = {
      ...currentIssue,
      mantisUrl: payload.mantisUrl,
      status: payload.status,
      note: payload.note,
      resourceType: payload.resourceType ?? currentIssue.resourceType,
      updatedAt: now,
      closedAt: payload.status === 'closed'
        ? (payload.closedAt ?? currentIssue.closedAt ?? now)
        : undefined,
    };

    return this.#enrichIssue(await this.repository.save(storedIssue));
  }

  async delete(input: unknown): Promise<{ deleted: true; assetKey: string }>
  {
    const assetKey = this.#validateDeleteInput(input);
    const deleted = await this.repository.delete(assetKey);

    if (!deleted)
    {
      throw new AssetIssueDependencyError('Asset issue not found');
    }

    return {
      deleted: true,
      assetKey,
    };
  }

  #validateCreateInput(input: unknown): ValidatedCreateInput
  {
    if (!input || typeof input !== 'object')
    {
      throw new AssetIssueValidationError('Invalid asset issue payload');
    }

    const candidate = input as AssetIssueUpsertPayload;

    if (typeof candidate.assetUrl !== 'string' || candidate.assetUrl.trim() === '')
    {
      throw new AssetIssueValidationError('Asset URL is required');
    }

    if (typeof candidate.resourceType !== 'string' || candidate.resourceType.trim() === '')
    {
      throw new AssetIssueValidationError('Resource type is required');
    }

    const parsedIssue = assetIssueSchema.safeParse({
      assetUrl: candidate.assetUrl,
      resourceType: candidate.resourceType,
      mantisUrl: candidate.mantisUrl,
      status: candidate.status,
      note: candidate.note ?? '',
      closedAt: candidate.closedAt,
    });

    if (!parsedIssue.success)
    {
      throw new AssetIssueValidationError(parsedIssue.error.issues[0]?.message ?? 'Invalid asset issue payload');
    }

    return {
      assetUrl: parsedIssue.data.assetUrl,
      resourceType: parsedIssue.data.resourceType,
      mantisUrl: parsedIssue.data.mantisUrl,
      status: parsedIssue.data.status,
      note: parsedIssue.data.note,
      closedAt: parsedIssue.data.closedAt,
      assetKey: parsedIssue.data.assetKey ?? normalizeAssetUrl(parsedIssue.data.assetUrl),
    };
  }

  #validateUpdateInput(input: unknown): ValidatedUpdateInput
  {
    if (!input || typeof input !== 'object')
    {
      throw new AssetIssueValidationError('Invalid asset issue payload');
    }

    const candidate = input as AssetIssueUpsertPayload;

    if (typeof candidate.assetKey !== 'string' || candidate.assetKey.trim() === '')
    {
      throw new AssetIssueValidationError('Asset key is required');
    }

    const parsedStatus = assetIssueStatusSchema.safeParse(candidate.status);
    if (!parsedStatus.success)
    {
      throw new AssetIssueValidationError('Invalid asset issue status');
    }

    if (typeof candidate.mantisUrl !== 'string' || candidate.mantisUrl.trim() === '')
    {
      throw new AssetIssueValidationError('Mantis URL is required');
    }

    const parsedUrl = assetIssueSchema.shape.mantisUrl.safeParse(candidate.mantisUrl);
    if (!parsedUrl.success)
    {
      throw new AssetIssueValidationError(parsedUrl.error.issues[0]?.message ?? 'Invalid Mantis URL');
    }

    return {
      assetKey: candidate.assetKey,
      mantisUrl: parsedUrl.data,
      status: parsedStatus.data,
      note: typeof candidate.note === 'string' ? candidate.note : '',
      resourceType: typeof candidate.resourceType === 'string' && candidate.resourceType.trim() !== ''
        ? candidate.resourceType
        : undefined,
      closedAt: typeof candidate.closedAt === 'string' && candidate.closedAt.trim() !== ''
        ? candidate.closedAt
        : undefined,
    };
  }

  #validateDeleteInput(input: unknown): string
  {
    if (!input || typeof input !== 'object')
    {
      throw new AssetIssueValidationError('Invalid asset issue payload');
    }

    const candidate = input as AssetIssueDeletePayload;

    if (typeof candidate.assetKey !== 'string' || candidate.assetKey.trim() === '')
    {
      throw new AssetIssueValidationError('Asset key is required');
    }

    return candidate.assetKey;
  }

  async #enrichIssue(issue: StoredAssetIssue): Promise<AssetIssueListItem>
  {
    const issueAppearance = await this.#findLatestAppearance(issue.assetKey);
    const lastSeenAt = issueAppearance?.seenAt;

    return {
      ...issue,
      returnedAfterClose: Boolean(
        issue.status === 'closed'
        && issue.closedAt
        && lastSeenAt
        && new Date(lastSeenAt).getTime() > new Date(issue.closedAt).getTime(),
      ),
      lastSeenAt,
      lastSeenRunId: issueAppearance?.runId,
    };
  }

  async #findLatestAppearance(assetKey: string): Promise<{ seenAt: string; runId: string } | null>
  {
    let latestAppearance: { seenAt: string; runId: string } | null = null;

    for (const run of await this.runs.list())
    {
      const appearance = await this.#findRunAppearance(run, assetKey);

      if (!appearance)
      {
        continue;
      }

      if (!latestAppearance || new Date(appearance.seenAt).getTime() > new Date(latestAppearance.seenAt).getTime())
      {
        latestAppearance = appearance;
      }
    }

    return latestAppearance;
  }

  async #findRunAppearance(run: RunRecord, assetKey: string): Promise<{ seenAt: string; runId: string } | null>
  {
    const seenAt = run.completedAt ?? run.createdAt;
    const details = await this.runs.findDetails(run.id);
    const requests = [
      ...details.requests,
      ...(details.passes ?? []).flatMap((pass) => pass.requests),
      ...(details.pages ?? []).flatMap((page) => [
        ...page.requests,
        ...page.passes.flatMap((pass) => pass.requests),
      ]),
    ];
    const hasAsset = requests.some((request) => normalizeAssetUrl(request.url) === assetKey);

    if (!hasAsset)
    {
      return null;
    }

    return {
      seenAt,
      runId: run.id,
    };
  }
}
