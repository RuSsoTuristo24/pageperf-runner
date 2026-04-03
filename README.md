# WebPerf Hub

Browser performance diagnostics tool for Bitrix24 pages. Profiles real Chrome page loads via CDP, stores run history, and provides a web UI for deep analysis.

## Architecture

pnpm monorepo with four packages:

| Package | Description |
|---|---|
| `apps/api` | Fastify backend — REST API, data persistence, extension resolver |
| `apps/worker` | Playwright/CDP runner — browser instrumentation and data collection |
| `apps/web` | React 19 + Vite UI — run explorer, waterfall, assets, diagnostics |
| `packages/shared` | Shared Zod schemas, domain types, config |

### Tech Stack

- **Runtime:** Node.js 22+, TypeScript, ESM
- **Backend:** Fastify 5, Drizzle ORM, PostgreSQL (file-based JSON fallback for some data)
- **Frontend:** React 19, Vite 7, Tailwind CSS
- **Profiling:** Playwright 1.55, Chrome DevTools Protocol
- **Package manager:** pnpm 10 (via corepack)

## What It Measures

### Page Metrics
TTFB, FP, FCP, LCP, CLS, DOMContentLoaded, Load

### Deep Metrics
- **JS Parse / JS Eval** — main-thread time per script (3-tier confidence attribution)
- **Long Tasks** — tasks > 50ms with attribution
- **Network Waterfall** — DNS, connect, SSL, wait, download per request
- **JS/CSS Coverage** — bytes used vs loaded
- **Page Diagnostics** — DOM nodes, event listeners, heap, oversized images, render-blocking resources, third-party origins

### Bitrix-Specific
- **Extension Dependency Tree** — parses `config.php` -> `rel[]`, builds recursive tree with circular detection, bundle sizes, conditional branches
- **Vue 2 Detection** — warns when deprecated Vue 2 bundles are loaded
- **URL-to-Extension Mapping** — maps production asset URLs back to Bitrix extension names

## Cache Modes

- `cold` — single measured pass in fresh context
- `warm` — warm-up pass, then measured pass with warmed cache
- `both` — two measured passes: cold then warm in same context

## Prerequisites

- Node.js 22+
- Google Chrome (for profiling)
- PostgreSQL 17 (optional, falls back to JSON storage)

## Installation

```bash
# Enable corepack for pnpm
corepack enable

# Clone and install
git clone https://github.com/RuSsoTuristo24/webperf-hub.git
cd webperf-hub
corepack pnpm install

# Install Playwright browsers
corepack pnpm --filter @webperf/worker exec playwright install chromium

# Copy and edit environment config
cp .env.example .env
```

### Environment Variables (.env)

```bash
PORT=4310                           # API server port
DATABASE_URL=postgres://...         # PostgreSQL connection (optional)
ARTIFACT_ROOT=./storage/artifacts   # Where to store trace files
CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

## Usage

### Quick Start (dev mode)

```powershell
# Start API + Web UI in background
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1

# Stop
powershell -ExecutionPolicy Bypass -File .\scripts\stop-dev.ps1
```

API runs at `http://127.0.0.1:4310`, UI at `http://127.0.0.1:4173`.

### Profile a Page (CLI)

```bash
corepack pnpm profile:pages --url https://your-portal.bitrix24.ru/company/ \
  --throttling native --cache-mode cold
```

### Authenticated Sessions

1. Open UI at `http://127.0.0.1:4173`
2. In **Saved Login**, click **Open Login Window**
3. Log in inside the Chrome window
4. Enable **Use saved auth session** when creating a profile

Sessions are validated before each run; expired sessions block the run.

### Multi-Page Runs

A single run can profile multiple pages on the same origin. Add URLs in the **Run Pages** field (one per line) when creating a profile.

## Features

### Mantis Asset Watch
Track problematic assets from the request/asset explorer — link to Mantis tickets, track status (open/review/closed), detect returned-after-close.

### LLM Export
Export run data as compact markdown for AI analysis. Includes page stages, network summary, heavy assets, coverage, trace summary, and rule engine findings.

### Extension Dependency Tree
Expand any Bitrix JS/CSS extension in the assets table to see its full dependency tree. Configure the modules path in Settings (gear icon in sidebar).

## Project Structure

```
webperf-hub/
  apps/
    api/src/
      modules/
        analysis/      # AI snapshots, LLM reports
        asset-issues/  # Mantis tracking
        auth/          # Browser session management
        extensions/    # Bitrix extension resolver, config.php parser
        ingest/        # Run data ingestion and normalization
        issues/        # Rule engine for issue detection
        profiles/      # Profiling profile CRUD
        runs/          # Run management and details
        settings/      # App settings
      db/              # Drizzle schema and client
    web/src/
      features/
        assets/        # Asset table, dependency tree, tops
        auth/          # Auth session UI
        compare/       # Run comparison
        diagnostics/   # Long tasks, render-blocking, oversized images
        requests/      # Request table, waterfall
        runs/          # Run list, launch form, JS execution
    worker/src/
      browser/         # Chrome/auth session management
      collector/       # CDP data collectors (network, trace, coverage, metrics)
      runner/          # Run orchestration, live profiling
      queue/           # Job queue for async runs
  packages/
    shared/src/        # Zod schemas, domain types
  scripts/             # PowerShell dev launchers
  storage/             # Local data, logs, artifacts (gitignored)
```

## License

Private. Internal tool for Bitrix24 performance engineering.
