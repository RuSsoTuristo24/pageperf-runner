import { eq } from 'drizzle-orm';

import type { Database } from '../../db/drizzle.js';
import { assetIssues } from '../../db/schema.js';
import type { AssetIssueRepository, StoredAssetIssue } from './asset-issue.repository.types.js';

function toStored(row: typeof assetIssues.$inferSelect): StoredAssetIssue
{
  return {
    assetKey: row.assetKey,
    assetUrl: row.assetUrl,
    resourceType: row.resourceType,
    mantisUrl: row.mantisUrl,
    status: row.status as StoredAssetIssue['status'],
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    closedAt: row.closedAt?.toISOString(),
  };
}

export class PgAssetIssueRepository implements AssetIssueRepository
{
  constructor(private readonly db: Database) {}

  async list(): Promise<StoredAssetIssue[]>
  {
    const rows = await this.db.select().from(assetIssues);

    return rows.map(toStored);
  }

  async findByAssetKey(assetKey: string): Promise<StoredAssetIssue | null>
  {
    const [row] = await this.db.select().from(assetIssues).where(eq(assetIssues.assetKey, assetKey));

    return row ? toStored(row) : null;
  }

  async save(issue: StoredAssetIssue): Promise<StoredAssetIssue>
  {
    const [row] = await this.db.insert(assetIssues).values({
      assetKey: issue.assetKey,
      assetUrl: issue.assetUrl,
      resourceType: issue.resourceType,
      mantisUrl: issue.mantisUrl,
      status: issue.status,
      note: issue.note,
      createdAt: new Date(issue.createdAt),
      updatedAt: new Date(issue.updatedAt),
      closedAt: issue.closedAt ? new Date(issue.closedAt) : null,
    }).onConflictDoUpdate({
      target: assetIssues.assetKey,
      set: {
        assetUrl: issue.assetUrl,
        resourceType: issue.resourceType,
        mantisUrl: issue.mantisUrl,
        status: issue.status,
        note: issue.note,
        updatedAt: new Date(issue.updatedAt),
        closedAt: issue.closedAt ? new Date(issue.closedAt) : null,
      },
    }).returning();

    return toStored(row);
  }

  async delete(assetKey: string): Promise<boolean>
  {
    const result = await this.db.delete(assetIssues).where(eq(assetIssues.assetKey, assetKey)).returning();

    return result.length > 0;
  }
}
