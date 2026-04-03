/**
 * One-time migration: reads existing JSON storage files and inserts into Postgres.
 *
 * Usage:
 *   cd C:\bitrix_repos\webperf-hub
 *   DATABASE_URL=postgres://postgres:postgres@localhost:5434/webperf_hub \
 *     corepack pnpm --filter @webperf/api exec tsx ../../scripts/migrate-json-to-db.ts [storageRoot]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDatabase } from '../apps/api/src/db/drizzle.js';
import { runMigrations } from '../apps/api/src/db/migrate.js';
import { profiles, runs, runDetails, pageMetrics, assetIssues } from '../apps/api/src/db/schema.js';
import { readJsonFileSync } from '../apps/api/src/storage/json-file.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl)
{
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const storageRoot = process.argv[2] ?? path.resolve(currentDir, '../storage');

async function main(): Promise<void>
{
const db = createDatabase(databaseUrl!);
await runMigrations(db);

// ── Profiles ──
const storedProfiles = readJsonFileSync<any[]>(path.join(storageRoot, 'data', 'profiles.json'), []);
console.log(`Migrating ${storedProfiles.length} profiles...`);

for (const p of storedProfiles)
{
  await db.insert(profiles).values({
    id: p.id,
    name: p.name,
    url: p.url,
    throttling: p.throttling ?? 'native',
    authMode: p.authMode ?? 'none',
    cacheMode: p.cacheMode ?? 'cold',
    pages: p.pages ?? [p.url],
    repeatCount: p.repeatCount ?? 1,
  }).onConflictDoNothing();
}

// ── Runs ──
const storedRuns = readJsonFileSync<any[]>(path.join(storageRoot, 'data', 'runs', 'index.json'), []);
console.log(`Migrating ${storedRuns.length} runs...`);

for (const r of storedRuns)
{
  await db.insert(runs).values({
    id: r.id,
    profileId: r.profileId,
    status: r.status,
    createdAt: new Date(r.createdAt),
    completedAt: r.completedAt ? new Date(r.completedAt) : null,
  }).onConflictDoNothing();

  const details = readJsonFileSync<any>(
    path.join(storageRoot, 'data', 'runs', 'details', `${r.id}.json`),
    null,
  );

  if (!details)
  {
    continue;
  }

  await db.insert(runDetails).values({
    runId: r.id,
    requests: details.requests ?? [],
    artifacts: details.artifacts ?? [],
    passes: details.passes ?? [],
    pages: details.pages ?? [],
    traceSummary: details.traceSummary ?? null,
    jsExecutionSummary: details.jsExecutionSummary ?? null,
    coverageSummary: details.coverageSummary ?? null,
    pageDiagnostics: details.pageDiagnostics ?? null,
  }).onConflictDoNothing();

  const metrics = (details.pageMetrics ?? []).map((m: any) => ({
    runId: r.id,
    name: m.name,
    value: m.value,
  }));

  if (metrics.length > 0)
  {
    await db.insert(pageMetrics).values(metrics);
  }
}

// ── Asset Issues ──
const storedIssues = readJsonFileSync<any[]>(path.join(storageRoot, 'data', 'asset-issues.json'), []);
console.log(`Migrating ${storedIssues.length} asset issues...`);

for (const issue of storedIssues)
{
  await db.insert(assetIssues).values({
    assetKey: issue.assetKey,
    assetUrl: issue.assetUrl,
    resourceType: issue.resourceType,
    mantisUrl: issue.mantisUrl,
    status: issue.status,
    note: issue.note ?? '',
    createdAt: new Date(issue.createdAt),
    updatedAt: new Date(issue.updatedAt),
    closedAt: issue.closedAt ? new Date(issue.closedAt) : null,
  }).onConflictDoNothing();
}

console.log('Migration complete!');
process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
