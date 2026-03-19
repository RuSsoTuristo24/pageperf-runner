# WebPerf Hub Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone Windows 11 friendly service that profiles browser page loads with Playwright and CDP, stores normalized run history, shows results in a web UI, and exposes Grafana- and AI-ready summaries.

**Architecture:** The system lives in `C:\bitrix_repos\webperf-hub` as a standalone TypeScript monorepo with three apps: backend API, collector/runner worker, and React UI. Browser truth comes from Chrome DevTools Protocol, orchestration comes from Playwright, normalized facts go to PostgreSQL, and heavy artifacts stay on disk under a structured artifact root.

**Tech Stack:** Node.js 22+, TypeScript, pnpm workspaces, Fastify, Drizzle ORM, PostgreSQL, Playwright, React, Vite, Vitest, Zod.

---

### Task 1: Scaffold the monorepo

**Files:**
- Create: `C:/bitrix_repos/webperf-hub/package.json`
- Create: `C:/bitrix_repos/webperf-hub/pnpm-workspace.yaml`
- Create: `C:/bitrix_repos/webperf-hub/tsconfig.base.json`
- Create: `C:/bitrix_repos/webperf-hub/.gitignore`
- Create: `C:/bitrix_repos/webperf-hub/README.md`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/package.json`
- Create: `C:/bitrix_repos/webperf-hub/apps/worker/package.json`
- Create: `C:/bitrix_repos/webperf-hub/apps/web/package.json`
- Create: `C:/bitrix_repos/webperf-hub/packages/shared/package.json`

**Step 1: Write the failing test**

Define root scripts `build`, `test`, and `lint` in `package.json` before child packages exist.

**Step 2: Run test to verify it fails**

Run: `pnpm -r test`
Expected: FAIL because workspace packages are not yet implemented.

**Step 3: Write minimal implementation**

Create the workspace root files and minimal package manifests so `pnpm install` recognizes the monorepo on Windows 11.

**Step 4: Run test to verify it passes**

Run: `pnpm install`
Expected: PASS and all workspaces are discovered.

**Step 5: Commit**

```bash
git add C:/bitrix_repos/webperf-hub
git commit -m "chore: scaffold webperf hub workspace"
```

### Task 2: Add shared config and domain schemas

**Files:**
- Create: `C:/bitrix_repos/webperf-hub/packages/shared/src/env.ts`
- Create: `C:/bitrix_repos/webperf-hub/packages/shared/src/config.ts`
- Create: `C:/bitrix_repos/webperf-hub/packages/shared/src/domain/profile.ts`
- Create: `C:/bitrix_repos/webperf-hub/packages/shared/src/domain/run.ts`
- Create: `C:/bitrix_repos/webperf-hub/packages/shared/src/domain/request.ts`
- Create: `C:/bitrix_repos/webperf-hub/packages/shared/src/domain/issue.ts`
- Create: `C:/bitrix_repos/webperf-hub/packages/shared/src/index.ts`
- Create: `C:/bitrix_repos/webperf-hub/packages/shared/src/shared.test.ts`
- Create: `C:/bitrix_repos/webperf-hub/.env.example`

**Step 1: Write the failing test**

Add tests for:
- Windows-safe artifact path resolution
- built-in throttling presets: `native`, `slow-4g`, `fast-3g`, `slow-3g`
- valid run status and issue severity enums

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @webperf/shared test`
Expected: FAIL because schemas and env parsing do not exist.

**Step 3: Write minimal implementation**

Implement Zod-based config loading and shared TypeScript/Zod schemas for profiles, runs, requests, and issues.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @webperf/shared test`
Expected: PASS

**Step 5: Commit**

```bash
git add C:/bitrix_repos/webperf-hub/packages/shared C:/bitrix_repos/webperf-hub/.env.example
git commit -m "feat: add shared config and schemas"
```

### Task 3: Build the API skeleton and database schema

**Files:**
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/app.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/server.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/routes/health.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/db/client.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/db/schema.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/drizzle.config.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/api.test.ts`

**Step 1: Write the failing test**

Add tests for:
- `GET /health`
- schema presence for `profiles`, `runs`, `page_metrics`, `requests`, `assets`, `issues`, `artifacts`

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @webperf/api test`
Expected: FAIL because API app and DB schema are missing.

**Step 3: Write minimal implementation**

Implement Fastify bootstrap and Drizzle schema with the initial normalized tables.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @webperf/api test`
Expected: PASS

**Step 5: Commit**

```bash
git add C:/bitrix_repos/webperf-hub/apps/api
git commit -m "feat: add api skeleton and schema"
```

### Task 4: Implement profile and run CRUD

**Files:**
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/modules/profiles/profile.repository.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/modules/profiles/profile.service.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/modules/profiles/profile.routes.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/modules/runs/run.repository.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/modules/runs/run.service.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/modules/runs/run.routes.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/modules/runs/run-details.routes.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/modules/runs/run-crud.test.ts`

**Step 1: Write the failing test**

Add tests for:
- `POST /api/profiles`
- `GET /api/profiles`
- `POST /api/runs`
- `GET /api/runs`
- `GET /api/runs/:id`

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @webperf/api test`
Expected: FAIL because CRUD modules do not exist.

**Step 3: Write minimal implementation**

Implement repositories, services, and routes for profiles and queued runs.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @webperf/api test`
Expected: PASS

**Step 5: Commit**

```bash
git add C:/bitrix_repos/webperf-hub/apps/api/src/modules
git commit -m "feat: add profile and run crud"
```

### Task 5: Add artifact storage and run ingestion

**Files:**
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/modules/artifacts/artifact-store.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/modules/ingest/run-ingest.service.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/modules/artifacts/artifact-store.test.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/modules/ingest/run-ingest.test.ts`

**Step 1: Write the failing test**

Add tests for:
- per-run artifact directory creation
- safe JSON artifact writing
- storing page metrics and requests from a worker payload

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @webperf/api test`
Expected: FAIL because artifact store and ingest service are missing.

**Step 3: Write minimal implementation**

Implement filesystem artifact storage rooted at `ARTIFACT_ROOT` and an ingest service that persists collected run facts.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @webperf/api test`
Expected: PASS

**Step 5: Commit**

```bash
git add C:/bitrix_repos/webperf-hub/apps/api/src/modules/artifacts C:/bitrix_repos/webperf-hub/apps/api/src/modules/ingest
git commit -m "feat: add artifact store and run ingest"
```

### Task 6: Create the worker and Windows-friendly browser launcher

**Files:**
- Create: `C:/bitrix_repos/webperf-hub/apps/worker/src/index.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/worker/src/runner/runner.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/worker/src/browser/browser-launcher.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/worker/src/browser/network-profile.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/worker/src/worker.test.ts`

**Step 1: Write the failing test**

Add tests for:
- resolving Chrome path on Windows
- converting built-in and custom throttling profiles into CDP settings
- transitioning a queued run into a running state

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @webperf/worker test`
Expected: FAIL because worker and launcher do not exist.

**Step 3: Write minimal implementation**

Implement the worker bootstrap, browser launcher, and throttling mapper.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @webperf/worker test`
Expected: PASS

**Step 5: Commit**

```bash
git add C:/bitrix_repos/webperf-hub/apps/worker
git commit -m "feat: add worker and browser launcher"
```

### Task 7: Collect page metrics and network requests with CDP

**Files:**
- Create: `C:/bitrix_repos/webperf-hub/apps/worker/src/collector/page-metrics-collector.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/worker/src/collector/network-collector.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/worker/src/collector/collectors.test.ts`
- Modify: `C:/bitrix_repos/webperf-hub/apps/worker/src/runner/runner.ts`

**Step 1: Write the failing test**

Add tests that assert normalization of:
- `TTFB`, `FP`, `FCP`, `DCL`, `Load`
- request status, resource type, cache flags, `content-encoding`
- `transfer_size`, `encoded_body_size`, `decoded_body_size`

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @webperf/worker test`
Expected: FAIL because collectors do not exist.

**Step 3: Write minimal implementation**

Implement CDP-backed collectors for page metrics and request-level network facts and wire them into the run lifecycle.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @webperf/worker test`
Expected: PASS

**Step 5: Commit**

```bash
git add C:/bitrix_repos/webperf-hub/apps/worker/src/collector C:/bitrix_repos/webperf-hub/apps/worker/src/runner/runner.ts
git commit -m "feat: collect page metrics and requests"
```

### Task 8: Add trace, coverage, and rule engine v1

**Files:**
- Create: `C:/bitrix_repos/webperf-hub/apps/worker/src/collector/trace-collector.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/worker/src/collector/coverage-collector.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/modules/issues/rule-engine.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/modules/issues/rule-engine.test.ts`
- Modify: `C:/bitrix_repos/webperf-hub/apps/worker/src/runner/runner.ts`

**Step 1: Write the failing test**

Add tests for:
- trace summary generation
- JS/CSS used vs unused byte summaries
- rule detection for large decoded JS, missing compression, render-blocking CSS, and weak warm-cache improvement

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @webperf/worker test`
Run: `pnpm --filter @webperf/api test`
Expected: FAIL because trace, coverage, and rules are missing.

**Step 3: Write minimal implementation**

Implement trace and coverage collectors in the worker and deterministic issue generation in the API.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @webperf/worker test`
Run: `pnpm --filter @webperf/api test`
Expected: PASS

**Step 5: Commit**

```bash
git add C:/bitrix_repos/webperf-hub/apps/worker/src/collector C:/bitrix_repos/webperf-hub/apps/api/src/modules/issues
git commit -m "feat: add trace coverage and issue detection"
```

### Task 9: Build the web UI investigation screens

**Files:**
- Create: `C:/bitrix_repos/webperf-hub/apps/web/index.html`
- Create: `C:/bitrix_repos/webperf-hub/apps/web/src/main.tsx`
- Create: `C:/bitrix_repos/webperf-hub/apps/web/src/app.tsx`
- Create: `C:/bitrix_repos/webperf-hub/apps/web/src/features/runs/run-list.tsx`
- Create: `C:/bitrix_repos/webperf-hub/apps/web/src/features/runs/run-overview.tsx`
- Create: `C:/bitrix_repos/webperf-hub/apps/web/src/features/requests/request-table.tsx`
- Create: `C:/bitrix_repos/webperf-hub/apps/web/src/features/assets/asset-table.tsx`
- Create: `C:/bitrix_repos/webperf-hub/apps/web/src/features/compare/compare-view.tsx`
- Create: `C:/bitrix_repos/webperf-hub/apps/web/src/features/web.test.tsx`

**Step 1: Write the failing test**

Add UI tests that expect:
- runs list rendering
- overview metrics rendering
- request table filters
- asset table encoded vs decoded columns
- compare view delta highlights

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @webperf/web test`
Expected: FAIL because web UI does not exist.

**Step 3: Write minimal implementation**

Implement the Vite React shell and the first investigation screens backed by API calls.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @webperf/web test`
Expected: PASS

**Step 5: Commit**

```bash
git add C:/bitrix_repos/webperf-hub/apps/web
git commit -m "feat: add web ui investigation screens"
```

### Task 10: Add AI snapshot, Grafana summaries, and Windows smoke docs

**Files:**
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/modules/analysis/ai-snapshot.service.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/modules/analysis/ai-snapshot.test.ts`
- Create: `C:/bitrix_repos/webperf-hub/apps/api/src/db/summary-views.sql`
- Create: `C:/bitrix_repos/webperf-hub/docs/grafana-queries.md`
- Create: `C:/bitrix_repos/webperf-hub/docs/windows-setup.md`
- Create: `C:/bitrix_repos/webperf-hub/scripts/smoke-run.ps1`

**Step 1: Write the failing test**

Add tests that expect:
- `ai_snapshot.json` contains summary, heavy assets, slow requests, issues, and optional baseline compare section
- summary SQL exposes run-level metrics and issue counts

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @webperf/api test`
Expected: FAIL because AI snapshot and summary views are missing.

**Step 3: Write minimal implementation**

Implement AI snapshot generation, Grafana-ready summary views, Windows 11 setup docs, and a PowerShell smoke script.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @webperf/api test`
Expected: PASS

**Step 5: Commit**

```bash
git add C:/bitrix_repos/webperf-hub/apps/api/src/modules/analysis C:/bitrix_repos/webperf-hub/apps/api/src/db/summary-views.sql C:/bitrix_repos/webperf-hub/docs C:/bitrix_repos/webperf-hub/scripts
git commit -m "feat: add ai snapshots and grafana summaries"
```

### Task 11: Verify the full workspace

**Files:**
- Verify: `C:/bitrix_repos/webperf-hub`

**Step 1: Run lint**

Run: `pnpm -r lint`
Expected: PASS

**Step 2: Run tests**

Run: `pnpm -r test`
Expected: PASS

**Step 3: Run builds**

Run: `pnpm -r build`
Expected: PASS

**Step 4: Run smoke path**

Run: `powershell -ExecutionPolicy Bypass -File C:/bitrix_repos/webperf-hub/scripts/smoke-run.ps1`
Expected: PASS and one completed sample run.

**Step 5: Commit**

```bash
git add C:/bitrix_repos/webperf-hub
git commit -m "chore: verify webperf hub workspace"
```
