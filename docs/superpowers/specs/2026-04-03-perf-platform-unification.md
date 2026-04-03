# Bitrix24 Performance Platform — Unification Spec

**Date:** 2026-04-03
**Status:** Approved

## Goal

Unify three separate Bitrix24 performance tools into an automated platform with shared Grafana dashboards, while keeping each tool as an independent service.

## Current State

| Tool | What | Storage | Runtime |
|---|---|---|---|
| ext-audit | Static JS extension analysis (deps, sizes, trees, Chef CLI) | PostgreSQL (Drizzle, port 5433) | Docker (app + postgres) |
| webperf-hub | Browser profiling via Playwright/CDP | JSON files + PostgreSQL schema (unused) | Native Windows |
| perflog | Production PHP/frontend metrics | MySQL on production server | Bitrix module on prod |

## Target State

Three independent services, each with its own persistence, connected through Grafana as the unified dashboard layer.

```
ext-audit (Docker)          webperf-hub (Docker + native worker)     perflog (prod)
  app:4320 + postgres:5433    api:4310 + postgres:5434                 mysql:3306
         \                          |                                   /
          \                         |                                  /
           ------>  grafana-perf (Docker, port 3000)  <---------------
                    DS1: ext-audit Postgres
                    DS2: webperf-hub Postgres
                    DS3: perflog MySQL
```

## Design Decisions

1. **Separate codebases** — ext-audit and webperf-hub remain independent projects. Merge deferred until both are stable in Docker.
2. **Hybrid Docker for webperf-hub** — API + Postgres in Docker. Playwright worker stays native on Windows (needs real Chrome for authenticated sessions).
3. **Postgres for structured data** — profiles, runs, metrics, requests, issues migrate from JSON to Postgres. Heavy artifacts (trace files, AI snapshots) stay on filesystem via Docker volume.
4. **Grafana as aggregator** — separate project (`C:\bitrix_repos\grafana-perf`), connects to all three data sources. No custom aggregation service.
5. **perflog via MySQL** — Grafana queries perflog MySQL directly. No REST API wrapper needed. User has direct server access.

## Phases

### Phase 1: webperf-hub Docker + Postgres Migration

**Scope:** Containerize the API and database. Migrate JSON-based storage to PostgreSQL.

**docker-compose.yml services:**
- `postgres` — PostgreSQL 17, port 5434, volume for data persistence
- `api` — Fastify app, port 4310, connects to postgres

**Worker remains native** — runs on Windows, talks to API at `http://localhost:4310`. No changes to Playwright, auth, or browser code.

**Web UI** — runs via `pnpm dev:web` (Vite dev server) or served as static build. Not containerized (dev tool, not production service).

**Data migration:**
- Drizzle schema already exists: profiles, runs, page_metrics, requests, assets, issues, artifacts
- Need: Drizzle migrations, repository layer refactor (JSON file reads → Drizzle queries)
- `storage/artifacts/` directory mounted as Docker volume for trace files and AI snapshots
- `settings.json` stays as file on volume (simple key-value, not worth a table)

**Repository changes:**
- `apps/api/src/storage/json-file.ts` — currently the persistence layer. Each module's repository reads/writes JSON files through this.
- Replace with Drizzle-based repositories. The routes and services stay the same — only the data access layer changes.

**Environment:**
```
PORT=4310
DATABASE_URL=postgres://postgres:postgres@postgres:5432/webperf_hub
ARTIFACT_ROOT=/app/storage/artifacts
MODULES_ROOT=/modules
```

### Phase 2: Grafana Setup

**Separate project:** `C:\bitrix_repos\grafana-perf`

**docker-compose.yml:**
- `grafana` — Grafana OSS, port 3000, provisioned datasources and dashboards

**Provisioned datasources:**
- `ext-audit` — Postgres, host `host.docker.internal:5433`, database `ext_audit`
- `webperf-hub` — Postgres, host `host.docker.internal:5434`, database `webperf_hub`
- `perflog` — MySQL, host (production server address), database with perflog tables

**Initial dashboards:**
- **Overview** — key metrics from all three sources on one screen
- **Extension Health** — ext-audit: total bundle size trend, dependency count trend, alerts timeline
- **Page Performance** — webperf-hub: page load times, FCP/LCP trends, asset size trends
- **Production Metrics** — perflog: P80 exec_time, query_count, user performance page loads

**Annotations:** hg revision markers for correlating code changes across environments.

### Phase 3: perflog MySQL Integration

- Configure MySQL datasource in Grafana with production server credentials
- Key tables: `b_bx24_metrics_log` (PHP metrics), `b_bx24_userperformance_test` (page loads), `b_bx24_userperformance_assets` (asset tracking)
- Write SQL queries for Production Metrics dashboard
- Add cross-datasource annotations (revision-based correlation)

### Phase 4: Scheduled Runs in webperf-hub

- Add `node-cron` to API
- `scheduled` flag + `cronExpression` field on profiles
- API triggers worker via HTTP when cron fires
- Worker profiles the page, sends results back to API
- Grafana picks up new data automatically via SQL queries

## Out of Scope

- Merging ext-audit into webperf-hub codebase (deferred)
- Containerizing Playwright worker (auth session limitation)
- Containerizing web UI (dev tool)
- Writing perflog REST API
- Mobile profiling
- Team auth/permissions

## Success Criteria

1. `docker compose up` in webperf-hub starts API + Postgres; worker connects from Windows
2. All existing webperf-hub features work with Postgres backend (no JSON file dependency for structured data)
3. Grafana shows dashboards from all three data sources
4. Scheduled profiles run automatically and appear in Grafana trends
