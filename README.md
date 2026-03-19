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

## Storage

Current persistence is file-based, not database-backed yet.

- `storage/data/profiles.json` - saved profiling profiles
- `storage/data/runs/index.json` - run list and statuses
- `storage/data/runs/details/<run-id>.json` - page metrics, requests, artifacts for each run
- `storage/data/auth/session.json` - saved auth session status metadata
- `storage/data/asset-issues.json` - tracked asset issues and Mantis links
- `storage/auth/default.json` - Playwright storage state for authenticated runs
- `storage/artifacts/<run-id>/...` - heavy artifacts such as AI snapshot and trace files

This lets runs survive API restarts while keeping the implementation light until Postgres is introduced.
