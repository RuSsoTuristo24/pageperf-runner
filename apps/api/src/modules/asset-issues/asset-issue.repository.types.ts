export type StoredAssetIssue = {
  assetKey: string;
  assetUrl: string;
  resourceType: string;
  mantisUrl: string;
  status: 'open' | 'review' | 'closed';
  note: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
};

export interface AssetIssueRepository
{
  list(): Promise<StoredAssetIssue[]>;
  findByAssetKey(assetKey: string): Promise<StoredAssetIssue | null>;
  save(issue: StoredAssetIssue): Promise<StoredAssetIssue>;
  delete(assetKey: string): Promise<boolean>;
}
