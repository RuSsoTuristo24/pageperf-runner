# Phase 1: Docker + Postgres Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Skip barista check.

**Goal:** Containerize webperf-hub API + PostgreSQL and migrate JSON file storage to Drizzle/Postgres.

**Architecture:** Hybrid Docker — API + Postgres run in containers, Playwright worker stays native on Windows. Run details stored as structured JSONB. Page metrics extracted into proper table for Grafana queries. Auth session and settings stay as files on Docker volumes.

**Tech Stack:** Drizzle ORM, postgres.js driver, PostgreSQL 17, Docker, Node 22

---

## File Structure

### New Files
- `docker-compose.yml` — Postgres + API services
- `Dockerfile` — API container image
- `.dockerignore` — exclude node_modules, storage data
- `apps/api/src/db/drizzle.ts` — Drizzle client factory
- `apps/api/src/db/migrate.ts` — migration runner (called on app start)
- `apps/api/src/modules/profiles/pg-profile.repository.ts` — Postgres-backed profile repository
- `apps/api/src/modules/runs/pg-run.repository.ts` — Postgres-backed run repository
- `apps/api/src/modules/asset-issues/pg-asset-issue.repository.ts` — Postgres-backed asset issue repository
- `scripts/migrate-json-to-db.ts` — one-time data migration script

### Modified Files
- `apps/api/package.json` — add postgres.js dependency
- `apps/api/src/db/schema.ts` — expanded schema with new tables/columns
- `apps/api/src/db/client.ts` — export real Drizzle instance
- `apps/api/src/app.ts` — accept db parameter, use Postgres repositories
- `apps/api/src/server.ts` — init db, bind 0.0.0.0 when in Docker
- `apps/api/src/modules/ingest/run-ingest.service.ts` — accept repository interface instead of concrete class
- `apps/api/drizzle.config.ts` — minor update
- `.env.example` — add MODULES_ROOT
- `.gitignore` — add drizzle migrations

### Unchanged Files
- `apps/api/src/modules/auth/auth-session.repository.ts` — stays file-based
- `apps/api/src/modules/settings/settings.repository.ts` — stays file-based
- `apps/api/src/storage/json-file.ts` — kept for auth + settings
- `apps/worker/**` — no changes
- `apps/web/**` — no changes
- `packages/shared/**` — no changes

---

### Task 1: Add postgres.js driver and expand schema

**Files:**
- Modify: `apps/api/package.json`
- Rewrite: `apps/api/src/db/schema.ts`

- [ ] **Step 1: Install postgres.js**

```bash
cd C:\bitrix_repos\webperf-hub && corepack pnpm --filter @webperf/api add postgres
```

- [ ] **Step 2: Rewrite schema.ts with expanded tables**

Replace the entire content of `apps/api/src/db/schema.ts`:

```typescript
import { integer, jsonb, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// ── Profiles ─────────────────────────────────────────────
export const profiles = pgTable('profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  throttling: text('throttling').notNull().default('native'),
  authMode: text('auth_mode').notNull().default('none'),
  cacheMode: text('cache_mode').notNull().default('cold'),
  pages: jsonb('pages').$type<string[]>().notNull().default([]),
  repeatCount: integer('repeat_count').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Runs ─────────────────────────────────────────────────
export const runs = pgTable('runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').notNull(),
  status: text('status').notNull().default('queued'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

// ── Page Metrics (flat rows for Grafana) ─────────────────
export const pageMetrics = pgTable('page_metrics', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id').notNull(),
  passLabel: text('pass_label'),   // null = aggregate, 'cold', 'warm'
  pageKey: text('page_key'),       // null = main page
  name: text('name').notNull(),
  value: real('value').notNull(),
});

// ── Run Details (JSONB for heavy nested data) ────────────
export const runDetails = pgTable('run_details', {
  runId: uuid('run_id').primaryKey(),
  requests: jsonb('requests').notNull().default([]),
  artifacts: jsonb('artifacts').notNull().default([]),
  passes: jsonb('passes').notNull().default([]),
  pages: jsonb('pages').notNull().default([]),
  traceSummary: jsonb('trace_summary'),
  jsExecutionSummary: jsonb('js_execution_summary'),
  coverageSummary: jsonb('coverage_summary'),
  pageDiagnostics: jsonb('page_diagnostics'),
});

// ── Asset Issues ─────────────────────────────────────────
export const assetIssues = pgTable('asset_issues', {
  assetKey: text('asset_key').primaryKey(),
  assetUrl: text('asset_url').notNull(),
  resourceType: text('resource_type').notNull(),
  mantisUrl: text('mantis_url').notNull(),
  status: text('status').notNull().default('open'),
  note: text('note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
});

// ── Artifacts (metadata only, files on disk) ─────────────
export const artifacts = pgTable('artifacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id').notNull(),
  kind: text('kind').notNull(),
  path: text('path').notNull(),
});
```

- [ ] **Step 3: Commit**

```bash
cd C:\bitrix_repos\webperf-hub
git add apps/api/package.json apps/api/src/db/schema.ts pnpm-lock.yaml
git commit -m "feat: add postgres.js driver and expand Drizzle schema

Add profiles fields (authMode, cacheMode, pages, repeatCount),
run_details table with JSONB columns for heavy data,
asset_issues table, expanded page_metrics with pass/page support."
```

---

### Task 2: Drizzle client and migration runner

**Files:**
- Rewrite: `apps/api/src/db/client.ts`
- Create: `apps/api/src/db/drizzle.ts`
- Create: `apps/api/src/db/migrate.ts`
- Modify: `apps/api/drizzle.config.ts`

- [ ] **Step 1: Create Drizzle client factory**

Create `apps/api/src/db/drizzle.ts`:

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema.js';

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(databaseUrl: string)
{
  const client = postgres(databaseUrl);

  return drizzle(client, { schema });
}
```

- [ ] **Step 2: Create migration runner**

Create `apps/api/src/db/migrate.ts`:

```typescript
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Database } from './drizzle.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(currentDir, '../../drizzle');

export async function runMigrations(db: Database): Promise<void>
{
  await migrate(db, { migrationsFolder });
}
```

- [ ] **Step 3: Update client.ts to re-export**

Replace `apps/api/src/db/client.ts`:

```typescript
export { createDatabase, type Database } from './drizzle.js';
export { runMigrations } from './migrate.js';
```

- [ ] **Step 4: Update drizzle.config.ts**

Replace `apps/api/drizzle.config.ts`:

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5434/webperf_hub',
  },
});
```

- [ ] **Step 5: Generate initial migration**

```bash
cd C:\bitrix_repos\webperf-hub/apps/api
corepack pnpm exec drizzle-kit generate
```

Expected: creates `drizzle/0000_*.sql` with CREATE TABLE statements.

- [ ] **Step 6: Commit**

```bash
cd C:\bitrix_repos\webperf-hub
git add apps/api/src/db/ apps/api/drizzle.config.ts apps/api/drizzle/
git commit -m "feat: Drizzle client factory and migration runner

createDatabase() returns typed Drizzle instance.
runMigrations() applies SQL migrations on startup.
Generated initial migration from expanded schema."
```

---

### Task 3: Docker infrastructure

**Files:**
- Create: `docker-compose.yml`
- Create: `Dockerfile`
- Create: `.dockerignore`
- Modify: `.env.example`

- [ ] **Step 1: Create docker-compose.yml**

Create `docker-compose.yml` in project root:

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: webperf_hub
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "${DB_PORT:-5434}:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  api:
    build: .
    ports:
      - "${PORT:-4310}:4310"
    environment:
      PORT: "4310"
      DATABASE_URL: postgres://postgres:postgres@postgres:5432/webperf_hub
      MODULES_ROOT: /modules
      ARTIFACT_ROOT: /app/storage/artifacts
    volumes:
      - ${MODULES_ROOT:-C:/bitrix_repos/modules}:/modules:ro
      - ./storage/artifacts:/app/storage/artifacts
      - ./storage/auth:/app/storage/auth
      - ./storage/data:/app/storage/data
    depends_on:
      - postgres

volumes:
  pgdata:
```

- [ ] **Step 2: Create Dockerfile**

Create `Dockerfile` in project root:

```dockerfile
FROM node:22-alpine

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# Worker is not installed in Docker — exclude its deps
# but pnpm workspace needs the file to exist
RUN mkdir -p apps/worker && echo '{"name":"@webperf/worker","version":"0.0.0","private":true}' > apps/worker/package.json

RUN corepack pnpm install --frozen-lockfile --filter @webperf/api --filter @webperf/shared

COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

# Stub worker exports so API can import type-only references
RUN mkdir -p apps/worker/src && \
    echo 'export function captureAuthSession() { throw new Error("worker not available in Docker"); }' > apps/worker/src/index.ts && \
    echo 'export function createRunner() { return { start() { throw new Error("worker not available in Docker"); } }; }' >> apps/worker/src/index.ts && \
    echo 'export function defaultExecuteLiveRun() { throw new Error("worker not available in Docker"); }' >> apps/worker/src/index.ts && \
    echo 'export function validateAuthSession() { throw new Error("worker not available in Docker"); }' >> apps/worker/src/index.ts

EXPOSE 4310

CMD ["corepack", "pnpm", "--filter", "@webperf/api", "dev"]
```

- [ ] **Step 3: Create .dockerignore**

Create `.dockerignore` in project root:

```
node_modules/
dist/
build/
storage/logs/
storage/data/
storage/artifacts/
storage/auth/
apps/web/
.git/
*.log
.env
.env.local
```

- [ ] **Step 4: Update .env.example**

Replace `.env.example`:

```bash
# API
PORT=4310
DATABASE_URL=postgres://postgres:postgres@localhost:5434/webperf_hub
ARTIFACT_ROOT=./storage/artifacts
MODULES_ROOT=C:/bitrix_repos/modules

# Worker (native only)
CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe

# Docker
DB_PORT=5434
```

- [ ] **Step 5: Add drizzle folder to .gitignore**

Append to `.gitignore`:

```
# Drizzle migrations are generated — keep them
# But ignore drizzle meta journal
apps/api/drizzle/meta/_journal.json
```

Wait — actually migrations SHOULD be committed (they're the source of truth for DB schema). Don't gitignore them.

- [ ] **Step 6: Test Docker build**

```bash
cd C:\bitrix_repos\webperf-hub
docker compose build api
```

Expected: successful build with no errors.

- [ ] **Step 7: Commit**

```bash
cd C:\bitrix_repos\webperf-hub
git add docker-compose.yml Dockerfile .dockerignore .env.example
git commit -m "infra: Docker Compose with Postgres 17 + API container

Hybrid setup: API + Postgres in Docker, worker stays native.
Volumes for modules (read-only), artifacts, auth state, settings."
```

---

### Task 4: Repository interface extraction

Before rewriting repositories, extract interfaces so services don't depend on concrete implementations.

**Files:**
- Create: `apps/api/src/modules/profiles/profile.repository.types.ts`
- Create: `apps/api/src/modules/runs/run.repository.types.ts`
- Create: `apps/api/src/modules/asset-issues/asset-issue.repository.types.ts`

- [ ] **Step 1: Profile repository interface**

Create `apps/api/src/modules/profiles/profile.repository.types.ts`:

```typescript
import type { Profile } from '@webperf/shared';

export type StoredProfile = Profile & { id: string };

export interface ProfileRepository
{
  create(profile: Omit<Profile, 'id'>): Promise<StoredProfile>;
  list(): Promise<StoredProfile[]>;
  findById(id: string): Promise<StoredProfile | null>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Step 2: Run repository interface**

Create `apps/api/src/modules/runs/run.repository.types.ts`:

```typescript
import type { CoverageSummary, JsExecutionSummary, PageDiagnostics, TraceSummary } from '@webperf/worker';

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

export type RunDetails = {
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

export interface RunRepository
{
  create(input: { profileId: string }): Promise<RunRecord>;
  list(): Promise<RunRecord[]>;
  findById(id: string): Promise<RunRecord | null>;
  setStatus(id: string, status: RunRecord['status']): Promise<RunRecord | null>;
  findDetails(id: string): Promise<RunDetails>;
  updateDetails(id: string, details: RunDetails): Promise<void>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Step 3: Asset issue repository interface**

Create `apps/api/src/modules/asset-issues/asset-issue.repository.types.ts`:

```typescript
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
```

- [ ] **Step 4: Update existing repositories to implement interfaces**

In `apps/api/src/modules/profiles/profile.repository.ts`, add `implements ProfileRepository` and make methods async (return `Promise.resolve(...)` for now). The existing sync methods become `async` by wrapping return values.

In `apps/api/src/modules/runs/run.repository.ts`, import types from `run.repository.types.ts` instead of defining them inline. Add `implements RunRepository` and make methods async.

In `apps/api/src/modules/asset-issues/asset-issue.repository.ts`, add `implements AssetIssueRepository` and make methods async.

Note: All callers (services, routes) must now `await` repository calls. Update all call sites.

- [ ] **Step 5: Update services and routes to use async repository calls**

This affects every file that calls repository methods. Add `await` to all repository method calls in:
- `apps/api/src/modules/profiles/profile.service.ts`
- `apps/api/src/modules/runs/run.service.ts`
- `apps/api/src/modules/ingest/run-ingest.service.ts`
- `apps/api/src/modules/asset-issues/asset-issue.service.ts`
- `apps/api/src/modules/analysis/llm-report.service.ts`
- All route files that call services

- [ ] **Step 6: Run tests to verify nothing broke**

```bash
cd C:\bitrix_repos\webperf-hub
corepack pnpm test
```

Expected: all existing tests pass (in-memory repositories still used, just async now).

- [ ] **Step 7: Commit**

```bash
cd C:\bitrix_repos\webperf-hub
git add apps/api/src/modules/
git commit -m "refactor: extract repository interfaces, make all methods async

Prepare for Postgres migration by defining repository interfaces
and making all repository methods return Promises. Existing
InMemory implementations still used, async-wrapped."
```

---

### Task 5: Postgres profile repository

**Files:**
- Create: `apps/api/src/modules/profiles/pg-profile.repository.ts`
- Test: `apps/api/src/modules/profiles/pg-profile.repository.test.ts`

- [ ] **Step 1: Write the Postgres profile repository**

Create `apps/api/src/modules/profiles/pg-profile.repository.ts`:

```typescript
import { eq } from 'drizzle-orm';

import type { Profile } from '@webperf/shared';
import type { Database } from '../../db/drizzle.js';
import { profiles } from '../../db/schema.js';
import type { ProfileRepository, StoredProfile } from './profile.repository.types.js';

function toStoredProfile(row: typeof profiles.$inferSelect): StoredProfile
{
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    throttling: row.throttling,
    authMode: row.authMode as StoredProfile['authMode'],
    cacheMode: row.cacheMode as StoredProfile['cacheMode'],
    pages: (row.pages as string[]) ?? [],
    repeatCount: row.repeatCount,
  };
}

export class PgProfileRepository implements ProfileRepository
{
  constructor(private readonly db: Database) {}

  async create(input: Omit<Profile, 'id'>): Promise<StoredProfile>
  {
    const pages = input.pages?.length ? input.pages : [input.url];
    const [row] = await this.db.insert(profiles).values({
      name: input.name,
      url: input.url,
      throttling: input.throttling ?? 'native',
      authMode: input.authMode ?? 'none',
      cacheMode: input.cacheMode ?? 'cold',
      pages,
      repeatCount: input.repeatCount ?? 1,
    }).returning();

    return toStoredProfile(row);
  }

  async list(): Promise<StoredProfile[]>
  {
    const rows = await this.db.select().from(profiles).orderBy(profiles.createdAt);

    return rows.map(toStoredProfile);
  }

  async findById(id: string): Promise<StoredProfile | null>
  {
    const [row] = await this.db.select().from(profiles).where(eq(profiles.id, id));

    return row ? toStoredProfile(row) : null;
  }

  async delete(id: string): Promise<boolean>
  {
    const result = await this.db.delete(profiles).where(eq(profiles.id, id)).returning();

    return result.length > 0;
  }
}
```

- [ ] **Step 2: Write test**

Create `apps/api/src/modules/profiles/pg-profile.repository.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase } from '../../db/drizzle.js';
import { runMigrations } from '../../db/migrate.js';
import { PgProfileRepository } from './pg-profile.repository.js';

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5434/webperf_hub_test';

describe('PgProfileRepository', () => {
  const db = createDatabase(TEST_DB_URL);
  const repo = new PgProfileRepository(db);

  beforeAll(async () => {
    await runMigrations(db);
  });

  it('creates and retrieves a profile', async () => {
    const created = await repo.create({
      name: 'Test Profile',
      url: 'https://example.com/',
      throttling: 'native',
      authMode: 'none',
      cacheMode: 'cold',
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe('Test Profile');
    expect(created.pages).toEqual(['https://example.com/']);

    const found = await repo.findById(created.id);
    expect(found).toEqual(created);
  });

  it('lists profiles', async () => {
    const list = await repo.list();
    expect(list.length).toBeGreaterThan(0);
  });

  it('deletes a profile', async () => {
    const created = await repo.create({
      name: 'To Delete',
      url: 'https://example.com/delete',
    });
    const deleted = await repo.delete(created.id);
    expect(deleted).toBe(true);

    const found = await repo.findById(created.id);
    expect(found).toBeNull();
  });
});
```

- [ ] **Step 3: Run test (requires Postgres running)**

```bash
cd C:\bitrix_repos\webperf-hub
docker compose up postgres -d
# Create test database
docker compose exec postgres createdb -U postgres webperf_hub_test
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5434/webperf_hub_test corepack pnpm --filter @webperf/api exec vitest run src/modules/profiles/pg-profile.repository.test.ts
```

- [ ] **Step 4: Commit**

```bash
cd C:\bitrix_repos\webperf-hub
git add apps/api/src/modules/profiles/pg-profile.repository.ts apps/api/src/modules/profiles/pg-profile.repository.test.ts
git commit -m "feat: Postgres profile repository with tests"
```

---

### Task 6: Postgres run repository

The biggest migration task. Run details stored as JSONB, page metrics extracted to flat table.

**Files:**
- Create: `apps/api/src/modules/runs/pg-run.repository.ts`
- Test: `apps/api/src/modules/runs/pg-run.repository.test.ts`

- [ ] **Step 1: Write the Postgres run repository**

Create `apps/api/src/modules/runs/pg-run.repository.ts`:

```typescript
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

    // Load flat page metrics
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
      // Update run status
      await tx.update(runs).set({
        status: 'completed',
        completedAt: new Date(),
      }).where(eq(runs.id, id));

      // Upsert run details (JSONB columns)
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

      // Delete old page metrics and insert new ones
      await tx.delete(pageMetrics).where(eq(pageMetrics.runId, id));

      const metricRows = details.pageMetrics.map((m) => ({
        runId: id,
        name: m.name,
        value: m.value,
      }));

      // Also extract per-pass metrics
      for (const pass of details.passes ?? [])
      {
        for (const m of pass.pageMetrics)
        {
          metricRows.push({
            runId: id,
            passLabel: pass.label,
            pageKey: null,
            name: m.name,
            value: m.value,
          } as any);
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
```

- [ ] **Step 2: Write test**

Create `apps/api/src/modules/runs/pg-run.repository.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createDatabase } from '../../db/drizzle.js';
import { runMigrations } from '../../db/migrate.js';
import { PgRunRepository } from './pg-run.repository.js';
import { PgProfileRepository } from '../profiles/pg-profile.repository.js';
import type { RunDetails } from './run.repository.types.js';

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5434/webperf_hub_test';

describe('PgRunRepository', () => {
  const db = createDatabase(TEST_DB_URL);
  const profileRepo = new PgProfileRepository(db);
  const runRepo = new PgRunRepository(db);
  let profileId: string;

  beforeAll(async () => {
    await runMigrations(db);
    const profile = await profileRepo.create({
      name: 'Run Test Profile',
      url: 'https://example.com/',
    });
    profileId = profile.id;
  });

  it('creates a run in queued status', async () => {
    const run = await runRepo.create({ profileId });
    expect(run.status).toBe('queued');
    expect(run.profileId).toBe(profileId);
  });

  it('updates status', async () => {
    const run = await runRepo.create({ profileId });
    const updated = await runRepo.setStatus(run.id, 'running');
    expect(updated?.status).toBe('running');
    expect(updated?.completedAt).toBeUndefined();

    const completed = await runRepo.setStatus(run.id, 'completed');
    expect(completed?.status).toBe('completed');
    expect(completed?.completedAt).toBeDefined();
  });

  it('stores and retrieves details with page metrics', async () => {
    const run = await runRepo.create({ profileId });
    const details: RunDetails = {
      pageMetrics: [
        { name: 'FCP', value: 1200 },
        { name: 'LCP', value: 2500 },
      ],
      requests: [
        { url: 'https://example.com/app.js', method: 'GET', resourceType: 'script', transferSize: 50000, encodedBodySize: 50000, decodedBodySize: 150000 },
      ],
      artifacts: [],
      passes: [
        {
          label: 'cold',
          pageMetrics: [{ name: 'FCP', value: 1200 }],
          requests: [],
        },
      ],
    };

    await runRepo.updateDetails(run.id, details);
    const loaded = await runRepo.findDetails(run.id);

    expect(loaded.pageMetrics).toHaveLength(2);
    expect(loaded.pageMetrics[0].name).toBe('FCP');
    expect(loaded.requests).toHaveLength(1);
    expect(loaded.passes).toHaveLength(1);
  });

  it('deletes run and its details', async () => {
    const run = await runRepo.create({ profileId });
    await runRepo.updateDetails(run.id, {
      pageMetrics: [{ name: 'LCP', value: 1000 }],
      requests: [],
      artifacts: [],
    });

    const deleted = await runRepo.delete(run.id);
    expect(deleted).toBe(true);

    const found = await runRepo.findById(run.id);
    expect(found).toBeNull();
  });
});
```

- [ ] **Step 3: Run test**

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5434/webperf_hub_test corepack pnpm --filter @webperf/api exec vitest run src/modules/runs/pg-run.repository.test.ts
```

- [ ] **Step 4: Commit**

```bash
cd C:\bitrix_repos\webperf-hub
git add apps/api/src/modules/runs/pg-run.repository.ts apps/api/src/modules/runs/pg-run.repository.test.ts
git commit -m "feat: Postgres run repository with JSONB details and flat metrics"
```

---

### Task 7: Postgres asset issue repository

**Files:**
- Create: `apps/api/src/modules/asset-issues/pg-asset-issue.repository.ts`

- [ ] **Step 1: Write the repository**

Create `apps/api/src/modules/asset-issues/pg-asset-issue.repository.ts`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
cd C:\bitrix_repos\webperf-hub
git add apps/api/src/modules/asset-issues/pg-asset-issue.repository.ts
git commit -m "feat: Postgres asset issue repository with upsert support"
```

---

### Task 8: Wire up app.ts and server.ts

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Update app.ts to accept database and use Postgres repositories**

Modify `apps/api/src/app.ts`:
- Add `db?: Database` to AppOptions
- When `db` is provided, use Pg repositories; otherwise fall back to InMemory (for tests without DB)
- Import new Pg repository classes

Key changes to `createApp`:

```typescript
import { type Database } from './db/drizzle.js';
import { PgProfileRepository } from './modules/profiles/pg-profile.repository.js';
import { PgRunRepository } from './modules/runs/pg-run.repository.js';
import { PgAssetIssueRepository } from './modules/asset-issues/pg-asset-issue.repository.js';

type AppOptions = {
  db?: Database;
  // ... existing fields
};

export function createApp(options: AppOptions = {}): FastifyInstance
{
  const app = Fastify();
  const storageRoot = options.storageRoot ?? resolveDefaultStorageRoot();

  // Use Postgres repositories when db is provided, otherwise InMemory
  const profileRepository = options.db
    ? new PgProfileRepository(options.db)
    : new InMemoryProfileRepository(storageRoot);
  const runRepository = options.db
    ? new PgRunRepository(options.db)
    : new InMemoryRunRepository(storageRoot);
  const assetIssueRepository = options.db
    ? new PgAssetIssueRepository(options.db)
    : new AssetIssueRepository(storageRoot);

  // Auth and settings stay file-based always
  const authSessionRepository = new AuthSessionRepository(storageRoot);
  const settingsRepository = new SettingsRepository(storageRoot);

  // ... rest unchanged, but services now receive interface types
```

- [ ] **Step 2: Update server.ts to init database and bind 0.0.0.0**

Replace `apps/api/src/server.ts`:

```typescript
import { createApp } from './app.js';
import { createDatabase } from './db/drizzle.js';
import { runMigrations } from './db/migrate.js';

const port = Number(process.env.PORT ?? 4310);
const databaseUrl = process.env.DATABASE_URL;
const host = process.env.DOCKER === '1' ? '0.0.0.0' : '127.0.0.1';

async function main(): Promise<void>
{
  let db;

  if (databaseUrl)
  {
    db = createDatabase(databaseUrl);
    await runMigrations(db);
    console.log('Database connected and migrations applied');
  }
  else
  {
    console.log('No DATABASE_URL — using JSON file storage');
  }

  const app = createApp({ db });
  await app.listen({ host, port });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

Add `DOCKER=1` to docker-compose.yml api environment.

- [ ] **Step 3: Run existing tests to verify InMemory fallback still works**

```bash
cd C:\bitrix_repos\webperf-hub
corepack pnpm test
```

- [ ] **Step 4: Commit**

```bash
cd C:\bitrix_repos\webperf-hub
git add apps/api/src/app.ts apps/api/src/server.ts docker-compose.yml
git commit -m "feat: wire Postgres repositories into app with InMemory fallback

When DATABASE_URL is set, uses Postgres repositories.
Otherwise falls back to InMemory JSON repositories.
Server binds 0.0.0.0 in Docker, 127.0.0.1 locally."
```

---

### Task 9: JSON-to-Postgres data migration script

**Files:**
- Create: `scripts/migrate-json-to-db.ts`

- [ ] **Step 1: Write the migration script**

Create `scripts/migrate-json-to-db.ts`:

```typescript
/**
 * One-time migration: reads existing JSON storage files and inserts into Postgres.
 *
 * Usage:
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

const db = createDatabase(databaseUrl);
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

  // Load details
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

  // Extract page metrics
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
```

- [ ] **Step 2: Test the migration script**

```bash
cd C:\bitrix_repos\webperf-hub
docker compose up postgres -d
DATABASE_URL=postgres://postgres:postgres@localhost:5434/webperf_hub corepack pnpm --filter @webperf/api exec tsx ../../scripts/migrate-json-to-db.ts
```

Expected: prints migration counts matching existing JSON data.

- [ ] **Step 3: Commit**

```bash
cd C:\bitrix_repos\webperf-hub
git add scripts/migrate-json-to-db.ts
git commit -m "feat: JSON-to-Postgres one-time data migration script"
```

---

### Task 10: End-to-end smoke test

- [ ] **Step 1: Start full Docker stack**

```bash
cd C:\bitrix_repos\webperf-hub
docker compose up --build -d
```

- [ ] **Step 2: Verify API responds**

```bash
curl http://localhost:4310/api/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 3: Verify profiles API works**

```bash
# Create a profile
curl -X POST http://localhost:4310/api/profiles -H "Content-Type: application/json" -d '{"name":"Smoke Test","url":"https://example.com/"}'

# List profiles
curl http://localhost:4310/api/profiles
```

Expected: profile created and listed.

- [ ] **Step 4: Verify worker can connect (from native Windows)**

Start worker natively and verify it can reach the containerized API:

```bash
cd C:\bitrix_repos\webperf-hub
corepack pnpm profile:pages --url https://example.com/ --throttling native --cache-mode cold
```

Expected: worker profiles the page and ingests results to the Docker API.

- [ ] **Step 5: Verify data persists across restart**

```bash
docker compose down
docker compose up -d
curl http://localhost:4310/api/profiles
```

Expected: previously created profiles still returned.

- [ ] **Step 6: Commit any fixes**

```bash
cd C:\bitrix_repos\webperf-hub
git add -A
git commit -m "fix: smoke test fixes for Docker + Postgres integration"
```

---

## Summary

| Task | What | Estimated Complexity |
|------|------|---------------------|
| 1 | Postgres driver + schema expansion | Small |
| 2 | Drizzle client + migration runner | Small |
| 3 | Docker infrastructure | Medium |
| 4 | Repository interfaces + async migration | Medium (many files) |
| 5 | Postgres profile repository | Small |
| 6 | Postgres run repository | Large (JSONB + metrics) |
| 7 | Postgres asset issue repository | Small |
| 8 | Wire up app.ts + server.ts | Medium |
| 9 | JSON data migration script | Medium |
| 10 | End-to-end smoke test | Small |

**Dependencies:** Tasks 1-2 first (schema + client), then 3 (Docker) and 4 (interfaces) in parallel, then 5-7 (repositories) in parallel, then 8 (wiring), then 9 (migration), then 10 (smoke test).
