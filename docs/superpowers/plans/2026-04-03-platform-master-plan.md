# Perf Platform — Master Plan

> Overall roadmap for unifying ext-audit, webperf-hub, and perflog.
> Each phase has its own detailed implementation plan.
> Spec: `docs/superpowers/specs/2026-04-03-perf-platform-unification.md`

## Phase 1: webperf-hub Docker + Postgres Migration

**Project:** `C:\bitrix_repos\webperf-hub`
**Detailed plan:** `docs/superpowers/plans/2026-04-03-phase1-docker-postgres.md`
**Status:** Not started

**Key deliverables:**
- docker-compose.yml: postgres:17 (port 5434) + api (port 4310)
- Dockerfile for API
- Drizzle migrations (tables already defined in schema.ts)
- Refactor repositories: JSON file storage → Drizzle queries
- Artifacts stay on filesystem (Docker volume)
- Worker stays native on Windows, connects to API at localhost:4310
- Web UI stays native (Vite dev server)
- .env.example updated

**Key risks:**
- Large refactor of data access layer (every repository touches json-file.ts)
- Need to handle migration of existing JSON data to Postgres
- Worker ↔ API communication must work cross Docker/native boundary

---

## Phase 2: Grafana Setup

**Project:** `C:\bitrix_repos\grafana-perf` (new)
**Detailed plan:** TBD (after Phase 1)
**Status:** Not started

**Key deliverables:**
- docker-compose.yml: grafana OSS (port 3000)
- Provisioned datasources: ext-audit Postgres (:5433), webperf-hub Postgres (:5434)
- Initial dashboards: Overview, Extension Health, Page Performance
- Dashboard JSON files committed for reproducibility

**Key decisions:**
- Grafana connects to host.docker.internal for local Postgres instances
- Dashboards provisioned via YAML + JSON (infrastructure as code)

---

## Phase 3: perflog MySQL Integration

**Project:** `C:\bitrix_repos\grafana-perf`
**Detailed plan:** TBD (after Phase 2)
**Status:** Not started

**Key deliverables:**
- MySQL datasource for perflog production server
- Production Metrics dashboard: P80 exec_time, query_count, user performance
- Cross-datasource annotations (hg revision correlation)
- SQL queries for key tables: b_bx24_metrics_log, b_bx24_userperformance_test, b_bx24_userperformance_assets

**Key risks:**
- Network access to production MySQL (user has server access, needs to configure)
- Query performance on production tables (read-only, but may need indexes)

---

## Phase 4: Scheduled Runs in webperf-hub

**Project:** `C:\bitrix_repos\webperf-hub`
**Detailed plan:** TBD (after Phase 3)
**Status:** Not started

**Key deliverables:**
- node-cron integration in API
- `scheduled` flag + `cronExpression` on profiles table
- API triggers worker via HTTP on cron fire
- Grafana auto-picks up new run data

**Dependencies:**
- Phase 1 complete (Postgres storage)
- Worker ↔ API HTTP communication working

---

## Architecture Summary

```
ext-audit (Docker)            webperf-hub                    perflog (prod)
  app:4320                      API:4310 (Docker)              MySQL:3306
  postgres:5433                 postgres:5434 (Docker)
                                Worker (native Windows)
                                Web UI (native Vite)
        \                           |                            /
         ---------> grafana-perf:3000 (Docker) <----------------
```

## Execution Order

Phase 1 → Phase 2 → Phase 3 → Phase 4

Each phase is a complete deliverable. No phase depends on a later phase.
Phases 2+3 can potentially be done together (both Grafana).
