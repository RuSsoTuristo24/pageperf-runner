import path from 'node:path';

import type { AssetIssue } from '@pageperf-runner/shared';

import { readJsonFileSync, writeJsonFileSync } from '../../storage/json-file.js';

export type StoredAssetIssue = Required<Pick<AssetIssue, 'assetKey' | 'assetUrl' | 'resourceType' | 'mantisUrl' | 'status' | 'note' | 'createdAt' | 'updatedAt'>> & {
  closedAt?: string;
};

export class AssetIssueRepository
{
  #issues: StoredAssetIssue[];

  readonly #storageFilePath?: string;

  constructor(storageRoot?: string)
  {
    this.#storageFilePath = storageRoot ? path.join(storageRoot, 'data', 'asset-issues.json') : undefined;
    this.#issues = this.#storageFilePath
      ? readJsonFileSync<StoredAssetIssue[]>(this.#storageFilePath, [])
      : [];
  }

  list(): StoredAssetIssue[]
  {
    return [...this.#issues];
  }

  findByAssetKey(assetKey: string): StoredAssetIssue | null
  {
    return this.#issues.find((issue) => issue.assetKey === assetKey) ?? null;
  }

  save(issue: StoredAssetIssue): StoredAssetIssue
  {
    const currentIndex = this.#issues.findIndex((currentIssue) => currentIssue.assetKey === issue.assetKey);

    if (currentIndex >= 0)
    {
      this.#issues[currentIndex] = issue;
    }
    else
    {
      this.#issues.unshift(issue);
    }

    this.#persist();

    return issue;
  }

  delete(assetKey: string): boolean
  {
    const nextIssues = this.#issues.filter((issue) => issue.assetKey !== assetKey);

    if (nextIssues.length === this.#issues.length)
    {
      return false;
    }

    this.#issues = nextIssues;
    this.#persist();

    return true;
  }

  #persist(): void
  {
    if (!this.#storageFilePath)
    {
      return;
    }

    writeJsonFileSync(this.#storageFilePath, this.#issues);
  }
}
