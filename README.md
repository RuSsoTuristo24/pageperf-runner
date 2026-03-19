# WebPerf Hub

Standalone browser performance diagnostics tool for Bitrix pages.

## Workspace

- `apps/api` - backend API
- `apps/worker` - Playwright/CDP runner
- `apps/web` - investigation UI
- `packages/shared` - shared schemas and config

## Local setup

1. Install Node.js 22+
2. Run `corepack enable`
3. Run `corepack pnpm install`

The project is designed to run on Windows 11 first.

## Quick Run

Analyze a page and persist the result:

```powershell
corepack pnpm profile:pages --url https://example.com --throttling native --cache-mode cold
```

Then start the UI and API:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1
```

Open `http://127.0.0.1:4173` and inspect the saved runs.

The default dev launcher now starts API and Web in the background without opening two extra PowerShell windows. Before booting, it automatically stops previously tracked dev processes and clears listeners on ports `4310` and `4173` so you do not accidentally inspect stale code.

- Logs: `storage/logs/api-dev.log`, `storage/logs/web-dev.log`
- Stop both processes: `powershell -ExecutionPolicy Bypass -File .\scripts\stop-dev.ps1`
- If you still want separate terminal windows, use:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1 -SeparateWindows
```

## Saved Login

Authenticated Bitrix pages can reuse a saved browser session.

1. Start the UI and open `http://127.0.0.1:4173`
2. In `Saved Login`, click `Открыть окно входа`
3. Log in inside the opened Chrome window
4. Wait until the browser returns to the target Bitrix page and closes itself
5. Enable `Use saved auth session` when creating a profile

Before every authenticated run, WebPerf Hub automatically validates that the saved session still opens the target portal page. If the session has expired, the run is blocked and the UI asks you to capture login again.

## Cache Modes

Each profile can now choose how cache should be handled during measurement:

- `cold` - one measured pass in a fresh browser context
- `warm` - one warm-up pass, then one measured pass with warmed cache
- `both` - two measured passes in the same context: first `cold`, then `warm`

When `both` is used, the run stores both passes and the UI lets you switch between them directly from the overview panel.

## Multi-Page Runs

A single run can now profile multiple pages on the same origin.

1. In `Create Profile`, keep the main `Profile URL`
2. Fill `Run Pages` with one URL per line
3. All URLs must belong to the same origin as the main profile URL
4. Start the run once
5. In the workspace header, use `Run Page` to switch between per-page results inside that run

The selected page drives:

- page stages
- deep performance metrics
- requests
- assets
- LLM report export

## Deep Metrics

The overview includes a second metric strip beyond basic page stages:

- `Visible` - practical “user saw meaningful content” point; prefers `FCP`, falls back to `FP`
- `LCP` - when the largest visible first-screen content appeared
- `CLS` - accumulated layout instability
- `JS Parse` - time spent parsing JavaScript before execution
- `JS Eval` - time spent executing JavaScript on the main thread
- `Long Tasks` - number and total duration of main-thread tasks longer than 50 ms

## Waterfall And JS Execution

The requests view now includes a visual `Waterfall` panel for the active page and active pass.

It shows:

- request start relative to navigation start
- phase timing breakdown: `queue`, `dns`, `connect`, `ssl`, `send`, `wait`, `download`
- initiator metadata
- `protocol` and `priority`

The overview area also includes a `JS Execution` panel.

It shows:

- top JavaScript resources by total main-thread CPU time
- per-resource `parse`, `eval`, and `total`
- attribution confidence: `high`, `medium`, `low`
- `unattributed` CPU time that could not be mapped to a single JS asset with sufficient confidence

Important limitation:

- `JS Execution` is best-effort attribution from Chrome trace data, not a perfect source-of-truth profiler
- `high` means direct URL/script metadata was available
- `medium` means the resource was inferred from stack or related trace metadata
- `low` means heuristic attribution
- if attribution is too weak, the time stays in `unattributed`

## Mantis Asset Watch

The UI can track problematic assets directly from the request or asset explorer.

1. Open any saved run for a Bitrix page such as `blank.php`
2. In `Requests` or `Assets`, click `Track` for the asset you want to watch
3. Add the Mantis link, choose a status, and save
4. The row stays highlighted and the asset appears in the dedicated `Mantis Watch` tab
5. Existing tracked assets can be edited or deleted from `Requests`, `Assets`, or `Mantis Watch`

Asset issues are keyed by normalized `origin + pathname`, so cache-busting query strings do not create duplicates.

`Mantis Watch` shows:

- Mantis link
- current status: `open`, `review`, `closed`
- added date
- closed date
- last seen date in saved runs
- automatic `returned after close` marking when a closed asset appears again in later runs

## LLM Export

The active run can be exported as a compact markdown report for later analysis in an LLM.

1. Open any saved run
2. Optionally switch between `cold` and `warm` pass
3. Click `Сформировать LLM-отчёт`
4. Copy the generated markdown from the `LLM Report` panel

The report currently includes:

- run context
- page stages
- network summary
- heavy assets
- slow requests
- coverage summary
- trace summary
- rule engine findings
- relevant Mantis-tracked assets

At the moment, the report does not yet expand `Waterfall` phase details or `JS Execution` hotspot ranking into a dedicated section, even though those data are already available in the saved run details.

## Extension Dependency Tree

The assets table can show the full recursive dependency tree for any Bitrix JS/CSS extension.

Click the `+` button to the left of an asset name to expand its dependency tree. The tree is built by parsing `config.php` → `rel[]` arrays from the local Bitrix modules directory.

Each tree node shows:

- extension name
- own bundle size (`.min` variant when available) with explicit `js` / `css` labels
- cumulative size with all dependencies in parentheses
- `circular` badge — cyclic dependency, Bitrix loads it once (hover for explanation)
- `not in source` badge — config.php not found, possibly dynamic registration
- `N ветки` badge — conditional PHP branches in config.php, click to see alternatives

The primary (first `if`) branch is shown in the tree. Alternative branches are available via the clickable badge. Cumulative sizes are calculated from the primary branch only.

### Configuration

Click the gear icon next to "WebPerf Hub" in the sidebar to set the modules path. Accepts any format:

- Windows: `C:\bitrix_repos\modules` or `C:/bitrix_repos/modules`
- Linux: `/home/user/bitrix/modules`

The path is saved to `storage/data/settings.json` and persists across restarts. The extension resolver rebuilds its URL index when the path changes (no restart needed).

### URL-to-Extension Mapping

At first request, the resolver scans all `config.php` files in the modules directory and builds a reverse index mapping bundle URL paths to extension names. Both original and `.min` variants are indexed (~6000 entries for a full Bitrix repo). This allows matching production URLs like `/bitrix/js/main/popup/dist/main.popup.bundle.min.js` → `main.popup`.

## Vue 2 Detection

When a page loads Vue 2 (`/bitrix/js/ui/vue/vue2/` or `/bitrix/js/ui/vue/vuex/`), a red warning banner appears at the top of the workspace showing:

- the Vue 2 bundle URL and its decoded size
- the initiator URL (what triggered the load), when available from network data
- migration hint to `ui.vue3` / `BX.Vue3`

Vue 2 is deprecated in Bitrix24 and components should migrate to Vue 3.

## JS Eval in Assets Table

The assets table includes an `Eval` column for JS resources, showing execution time on the main thread from Chrome trace data. Values are color-coded by attribution confidence:

- bright text — `high` confidence (direct script URL in trace event)
- dimmed text — `medium` confidence (inferred from call stack)
- dimmed italic — `low` confidence (matched by timing heuristic)

The column is sortable. Data comes from the same `jsExecutionSummary` shown in the Analysis tab.

## How Data Is Collected

All measurements happen in a single Playwright-controlled Chromium session via Chrome DevTools Protocol (CDP).

### Collectors

| Collector | CDP Method | What It Captures |
|-----------|-----------|-----------------|
| **Network** | `Performance.getEntriesByType('resource')` + network events | URL, sizes (transfer/encoded/decoded), timing phases (DNS, connect, SSL, wait, download), initiator, protocol, priority |
| **Page Metrics** | `PerformanceObserver` + navigation timing | TTFB, FP, FCP, LCP, CLS, DCL, Load |
| **Trace** | `Tracing.start` with categories `devtools.timeline`, `v8.execute`, `toplevel`, `loading`, `blink.user_timing`, `disabled-by-default-devtools.timeline.stack` | JS parse/eval per script (3-tier attribution), long tasks, layout shifts, forced reflows, main thread breakdown |
| **Coverage** | `Profiler.startPreciseCoverage` + `CSS.startRuleUsageTracking` | JS/CSS bytes used vs loaded |
| **Page Diagnostics** | `Runtime.evaluate` on the page | DOM node count, tree depth, event listeners, heap size, oversized images, third-party origins, render-blocking resources |

### Data Flow

```
Playwright opens Chromium
    ↓ navigates to target page with CDP instrumentation active
    ↓ waits for page load + settles
All collectors run in parallel during page load
    ↓
POST /api/runs/{id}/ingest → normalizes and stores
    ↓
storage/data/runs/details/{id}.json
    ↓
GET /api/runs/{id} → Frontend renders
```

### JS Execution Attribution

Trace events are attributed to scripts through three tiers:

1. **Direct** (high confidence) — event contains `url`, `scriptName`, or `scriptUrl` in metadata
2. **Stack trace** (medium confidence) — URL found by walking the call frames
3. **Timing overlap** (low confidence) — event timing matched against network request timing

Events that cannot be attributed stay in the `unattributed` bucket.

Note: `Parse` is often 0 because V8 uses lazy compilation — code is compiled on first function call, not at load time, and `CompileScript` trace events are frequently absent for minified bundles.

## Storage

Current persistence is file-based, not database-backed yet.

- `storage/data/profiles.json` - saved profiling profiles
- `storage/data/runs/index.json` - run list and statuses
- `storage/data/runs/details/<run-id>.json` - page metrics, requests, artifacts for each run
- `storage/data/auth/session.json` - saved auth session status metadata
- `storage/data/asset-issues.json` - tracked asset issues and Mantis links
- `storage/data/settings.json` - application settings (modules path)
- `storage/auth/default.json` - Playwright storage state for authenticated runs
- `storage/artifacts/<run-id>/...` - heavy artifacts such as AI snapshot and trace files

This lets runs survive API restarts while keeping the implementation light until Postgres is introduced.
