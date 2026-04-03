import path from 'node:path';

import { readJsonFileSync, writeJsonFileSync } from '../../storage/json-file.js';

import type { AssetIssueRepository, StoredAssetIssue } from './asset-issue.repository.types.js';

export type { StoredAssetIssue } from './asset-issue.repository.types.js';
export type { AssetIssueRepository } from './asset-issue.repository.types.js';

export class InMemoryAssetIssueRepository implements AssetIssueRepository
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

  async list(): Promise<StoredAssetIssue[]>
  {
    return [...this.#issues];
  }

  async findByAssetKey(assetKey: string): Promise<StoredAssetIssue | null>
  {
    return this.#issues.find((issue) => issue.assetKey === assetKey) ?? null;
  }

  async save(issue: StoredAssetIssue): Promise<StoredAssetIssue>
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

  async delete(assetKey: string): Promise<boolean>
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
