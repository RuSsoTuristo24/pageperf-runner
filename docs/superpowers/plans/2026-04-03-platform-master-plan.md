# Perf Platform — Master Plan

> Overall roadmap for unifying ext-audit, webperf-hub, and perflog.
> Each phase has its own detailed implementation plan.
> Spec: `docs/superpowers/specs/2026-04-03-perf-platform-unification.md`

## Phase 1: webperf-hub Docker + Postgres Migration

**Project:** `C:\bitrix_repos\webperf-hub`
**Detailed plan:** `docs/superpowers/plans/2026-04-03-phase1-docker-postgres.md`
**Status:** DONE (2026-04-03)

**Completed:** 11 commits, all repositories migrated, Docker + Postgres working, 
JSON data migrated, 26 tests passing, smoke test passed.

---

## Phase 2+3: Grafana Setup + perflog Integration

**Project:** `C:\bitrix_repos\grafana-perf`
**Status:** DONE (2026-04-03) — perflog datasource prepared, awaiting credentials

**Completed:**
- docker-compose.yml with Grafana OSS
- Provisioned datasources: ext-audit Postgres (:5433), webperf-hub Postgres (:5434)
- perflog MySQL datasource template ready (uncomment + add credentials)
- 3 dashboards: Overview (cross-source), Extension Health, Page Performance
- perflog SQL queries prepared in dashboards (will activate when datasource configured)
- All provisioned, all working on http://localhost:3000

**Remaining:** User provides perflog MySQL credentials → uncomment in datasources.yml

---

## Phase 4: Scheduled Runs in webperf-hub

**Project:** `C:\bitrix_repos\webperf-hub`
**Status:** DONE (2026-04-03)

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
