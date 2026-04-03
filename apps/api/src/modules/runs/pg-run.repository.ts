import { eq, desc } from 'drizzle-orm';

import type { Database } from '../../db/drizzle.js';
import { runs, runDetails, pageMetrics } from '../../db/schema.js';
import type {
  RunRepository,
  RunRecord,
  RunDetails,
  PageMetricRecord,
} from './run.repository.types.js';

function toRunRecord(row: typeof runs.$inferSelect): RunRecord
{
  return {
    id: row.id,
    profileId: row.profileId,
    status: row.status as RunRecord['status'],
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
  };
}

export class PgRunRepository implements RunRepository
{
  constructor(private readonly db: Database) {}

  async create(input: { profileId: string }): Promise<RunRecord>
  {
    const [row] = await this.db.insert(runs).values({
      profileId: input.profileId,
      status: 'queued',
    }).returning();

    await this.db.insert(runDetails).values({
      runId: row.id,
      requests: [],
      artifacts: [],
      passes: [],
      pages: [],
    });

    return toRunRecord(row);
  }

  async list(): Promise<RunRecord[]>
  {
    const rows = await this.db.select().from(runs).orderBy(desc(runs.createdAt));

    return rows.map(toRunRecord);
  }

  async findById(id: string): Promise<RunRecord | null>
  {
    const [row] = await this.db.select().from(runs).where(eq(runs.id, id));

    return row ? toRunRecord(row) : null;
  }

  async setStatus(id: string, status: RunRecord['status']): Promise<RunRecord | null>
  {
    const completedAt = (status === 'completed' || status === 'failed' || status === 'cancelled')
      ? new Date()
      : null;

    const [row] = await this.db.update(runs)
      .set({ status, completedAt })
      .where(eq(runs.id, id))
      .returning();

    return row ? toRunRecord(row) : null;
  }

  async findDetails(id: string): Promise<RunDetails>
  {
    const empty: RunDetails = {
      pageMetrics: [],
      requests: [],
      artifacts: [],
      passes: [],
      pages: [],
    };

    const [detail] = await this.db.select().from(runDetails).where(eq(runDetails.runId, id));

    if (!detail)
    {
      return empty;
    }

    const metricRows = await this.db.select()
      .from(pageMetrics)
      .where(eq(pageMetrics.runId, id));

    const aggregateMetrics: PageMetricRecord[] = metricRows
      .filter((m) => !m.passLabel && !m.pageKey)
      .map((m) => ({ name: m.name, value: m.value }));

    return {
      pageMetrics: aggregateMetrics,
      requests: (detail.requests as RunDetails['requests']) ?? [],
      artifacts: (detail.artifacts as RunDetails['artifacts']) ?? [],
      passes: (detail.passes as RunDetails['passes']) ?? [],
      pages: (detail.pages as RunDetails['pages']) ?? [],
      traceSummary: detail.traceSummary as RunDetails['traceSummary'],
      jsExecutionSummary: detail.jsExecutionSummary as RunDetails['jsExecutionSummary'],
      coverageSummary: detail.coverageSummary as RunDetails['coverageSummary'],
      pageDiagnostics: detail.pageDiagnostics as RunDetails['pageDiagnostics'],
    };
  }

  async updateDetails(id: string, details: RunDetails): Promise<void>
  {
    await this.db.transaction(async (tx) => {
      await tx.update(runs).set({
        status: 'completed',
        completedAt: new Date(),
      }).where(eq(runs.id, id));

      await tx.delete(runDetails).where(eq(runDetails.runId, id));
      await tx.insert(runDetails).values({
        runId: id,
        requests: details.requests as any,
        artifacts: details.artifacts as any,
        passes: details.passes as any,
        pages: details.pages as any,
        traceSummary: details.traceSummary as any,
        jsExecutionSummary: details.jsExecutionSummary as any,
        coverageSummary: details.coverageSummary as any,
        pageDiagnostics: details.pageDiagnostics as any,
      });

      await tx.delete(pageMetrics).where(eq(pageMetrics.runId, id));

      const metricRows: any[] = details.pageMetrics.map((m) => ({
        runId: id,
        name: m.name,
        value: m.value,
      }));

      for (const pass of details.passes ?? [])
      {
        for (const m of pass.pageMetrics)
        {
          metricRows.push({
            runId: id,
            passLabel: pass.label,
            name: m.name,
            value: m.value,
          });
        }
      }

      if (metricRows.length > 0)
      {
        await tx.insert(pageMetrics).values(metricRows);
      }
    });
  }

  async delete(id: string): Promise<boolean>
  {
    await this.db.delete(pageMetrics).where(eq(pageMetrics.runId, id));
    await this.db.delete(runDetails).where(eq(runDetails.runId, id));
    const result = await this.db.delete(runs).where(eq(runs.id, id)).returning();

    return result.length > 0;
  }
}
