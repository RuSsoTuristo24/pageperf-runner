# WebPerf Hub Design

**Date:** 2026-03-12

**Status:** Approved

**Goal:** Build a standalone browser performance diagnostics system for Bitrix pages that can run on Windows 11, profile real Chrome page loads through CDP, store run history, expose data to a web UI, and export normalized metrics for Grafana and AI-assisted analysis.

## Decision

Build `WebPerf Hub` as a standalone tool in `C:\bitrix_repos\webperf-hub`, not as a Bitrix module.

## Why Standalone

- The core problem is browser diagnostics, not Bitrix business logic.
- The runtime depends on Chrome/CDP/Playwright, background run orchestration, artifact storage, and external dashboards.
- A standalone service can profile multiple stands and pages without coupling to one portal installation.
- Bitrix integration can be added later through thin adapters, links, or launch hooks.

## Primary Requirements

- First-class local operation on Windows 11.
- Support profiling both authenticated real Chrome sessions and scripted runs.
- Measure network, compression, caching, page lifecycle, render-blocking assets, coverage, and trace summaries.
- Support cold, warm, repeated, and throttled runs.
- Preserve normalized data for historical analysis, Grafana dashboards, and AI recommendations.

## Scope

### In Scope

- Manual and scripted page profiling.
- Chrome DevTools Protocol based collection.
- Playwright-based scenario runner.
- Run history and comparison.
- Asset- and request-level analysis.
- JS/CSS coverage collection.
- Rule-based issue detection.
- AI-ready snapshots and recommendations.
- Grafana-ready normalized summaries.

### Out of Scope for MVP

- Full Bitrix module packaging.
- Mobile profiling.
- Server-side PHP tracing.
- Full Lighthouse replacement.
- Team auth/permissions beyond basic local or internal usage.
- Large-scale distributed workers.

## Operating Modes

### Interactive

Attach to an already opened Chrome tab and profile a real authenticated session.

### Scripted

Use Playwright to open a page, execute a repeatable scenario, and capture results.

### Scheduled

Run saved profiles on a schedule for history and regressions.

## High-Level Architecture

`WebPerf Hub` consists of five parts:

1. `runner`
2. `collector`
3. `backend`
4. `web-ui`
5. `export`

### Runner

Responsible for creating runs from saved profiles, launching browser actions, applying viewport and throttling profiles, handling cold/warm/repeat modes, and coordinating collection lifecycle.

### Collector

Responsible for gathering the browser truth from CDP:

- `Network.*`
- `Page.*`
- `Performance.*`
- trace data
- JS/CSS coverage
- console/runtime problems
- screenshots and optional HTML snapshots

### Backend

Responsible for persisting normalized run data, storing artifacts, computing summaries, running deterministic issue detection, and exposing APIs for UI, Grafana, and AI analysis.

### Web UI

Responsible for listing runs and profiles, showing requests/assets/timelines/coverage, comparing runs, and surfacing issues and recommendations.

### Export

Responsible for exposing stable summary tables/views for Grafana, generating compact AI snapshots, and enabling future alerts or downstream automation.

## Technology Direction

Use a TypeScript-first stack that runs well on Windows 11:

- Node.js 22+
- TypeScript
- Playwright
- Chrome DevTools Protocol via Playwright CDP session
- PostgreSQL for normalized storage
- filesystem artifact store initially
- React + Vite for UI
- shared TypeScript schemas between backend and UI

## Windows 11 Requirement

Windows 11 is a first-class platform, not an afterthought.

The tool must:

- run locally from PowerShell;
- work with installed Chrome on Windows 11;
- avoid Linux-only assumptions in scripts and paths;
- store artifacts in normal Windows paths;
- support local development without WSL;
- document any optional Docker/Postgres setup in Windows-friendly form.

## Data Model

### Core Entities

- `project`
- `profile`
- `run`
- `run_step`
- `page_metric`
- `request`
- `asset`
- `run_asset`
- `coverage`
- `trace_summary`
- `issue`
- `recommendation`
- `artifact`

### Profile

Defines how a run should execute:

- target URL
- scenario type
- auth strategy
- viewport
- browser mode
- cold/warm/repeat options
- throttling profile
- artifact capture options

### Run

Captures profile reference, environment metadata, start/end timestamps, browser metadata, scenario mode, run status, and baseline/comparison metadata.

### Request

For every request store:

- URL and method
- resource type
- status and protocol
- priority and initiator
- response headers relevant to compression and cache
- cache source flags
- transfer/encoded/decoded byte sizes
- phase timings
- render-blocking and third-party flags

### Page Metrics

Store page-level metrics per run and per step:

- TTFB
- FP
- FCP
- LCP
- DCL
- Load
- CLS
- INP when available
- Long Tasks summary
- total requests
- total encoded bytes
- total decoded bytes
- cache hit ratio
- compression breakdown

### Coverage

Store used and unused bytes for JS/CSS resources and aggregate them for run-level summaries.

### Trace Summary

Keep normalized summaries from raw trace:

- critical request chain
- main-thread task buckets
- parse/eval/layout/paint time buckets
- long tasks
- notable blocking spans

### Artifacts

Store heavy files outside the relational database:

- raw trace
- screenshot
- raw network dump
- optional HTML snapshot
- AI snapshot

## Network Emulation

Profiles must support:

- `native`
- `slow-4g`
- `fast-3g`
- `slow-3g`
- `custom`

For `custom`, store:

- download kbps
- upload kbps
- latency ms
- optional future packet-loss model

## Storage Strategy

Use PostgreSQL for normalized entities and aggregated summaries. Use local filesystem storage first for heavy artifacts under `storage/artifacts/<project>/<run-id>/...`. Keep summary tables or materialized views for fast UI and Grafana queries, including `run_summary`, `run_asset_summary`, `run_issue_summary`, and `profile_baseline_summary`.

## API Surface

### Profiles

- create/update/list profiles
- store throttling presets and scenario options

### Runs

- create run
- start run
- cancel run
- list runs
- view run summary
- compare runs

### Details

- requests
- assets
- coverage
- issues
- artifacts

### Analysis

- generate AI snapshot
- persist recommendations

### Streaming

Provide WebSocket or SSE run-status updates:

- queued
- starting browser
- collecting network
- trace complete
- coverage complete
- rule analysis complete
- AI analysis complete
- finished

## Web UI

### Screens

- `Runs`
- `Run Overview`
- `Requests`
- `Assets`
- `Timeline`
- `Coverage`
- `Compare Runs`
- `AI Analysis`
- `Profiles`

### UX Intent

The UI is an investigation tool, not a generic log viewer. The main workflow is:

1. find a run
2. inspect page-level summary
3. drill into heavy or suspicious assets
4. compare with baseline or another run
5. extract concrete actions

## Deterministic Rule Engine

AI should not be the first layer.

The system must first detect issues through deterministic rules such as:

- render-blocking CSS above threshold
- very large decoded JS
- poor cacheability on static assets
- large asset with low usage coverage
- duplicate framework/library payloads
- heavy third-party resources
- too many pre-FCP requests
- missing compression
- large encoded-to-decoded expansion ratio
- weak warm-cache improvement

Each issue stores `code`, `severity`, `evidence`, `affected assets`, and `suggested actions`.

## AI Analysis Strategy

Do not send raw trace by default.

Each run produces an `ai_snapshot.json` that contains page summary, top heavy assets, slowest requests, compression summary, cache summary, coverage summary, detected issues, and comparison against baseline when available.

AI uses this snapshot to produce:

- findings
- why each finding matters
- evidence
- confidence
- recommended action
- expected impact
- verification plan

## Tooling Recommendation

Playwright should be used for repeatable control. CDP should remain the source of truth for headers, encoding, caching, phase timings, page lifecycle, trace, and coverage.

## Integration With Bitrix

The initial product remains standalone.

Possible later integrations:

- launch links from Bitrix admin
- webhooks or REST endpoint to trigger runs
- saved Bitrix page profiles
- iframe/report links back into Bitrix

These integrations must not shape the core architecture.

## Delivery Phases

### Phase 1: Skeleton

- repository skeleton
- backend service
- profile/run CRUD
- artifact store layout
- basic run list UI

### Phase 2: Collector MVP

- network collection
- navigation/page metrics
- compression/cache collection
- cold/warm runs
- throttling presets
- request and asset views

### Phase 3: Deep Diagnostics

- trace capture
- coverage
- waterfall/timeline
- compare runs
- rule engine v1

### Phase 4: AI and Grafana

- AI snapshot generation
- recommendations
- summary views
- Grafana queries/dashboards
- scheduled runs

### Phase 5: Hardening

- retention policies
- retries/timeouts
- access control
- alerts/regression handling
- operational documentation

## Final Recommendation

Build `WebPerf Hub` as a standalone Windows-friendly TypeScript product with Playwright for orchestration, CDP for measurement truth, PostgreSQL for normalized history, filesystem artifacts for heavy files, deterministic issue detection before AI, and Grafana-ready summaries from day one.
