# Windows 11 Setup

## Prerequisites

- Windows 11
- Node.js 22+
- Chrome installed
- `corepack` enabled

## Install Dependencies

```powershell
cd C:\bitrix_repos\pageperf-runner
corepack pnpm install
```

## Run Checks

```powershell
corepack pnpm -r test
corepack pnpm -r build
corepack pnpm -r lint
```

## Notes

- This workspace currently uses `corepack pnpm` because `pnpm` is not assumed to be in `PATH`.
- The smoke script is at `scripts\smoke-run.ps1`.
- The main dev launcher is `scripts\start-dev.ps1`; by default it starts API and Web in the background without opening two extra PowerShell windows.
- `scripts\start-dev.ps1` first stops tracked background services and frees ports `4310` and `4173`, then starts fresh API/UI processes.
- Background process logs are written to `storage\logs\api-dev.log` and `storage\logs\web-dev.log`.
- Stop background services with `scripts\stop-dev.ps1`.
- Use `scripts\start-dev.ps1 -SeparateWindows` only if you explicitly want separate terminals.
- Profiles support `cold`, `warm`, and `both` cache modes; `warm` performs a warm-up pass first, while `both` records both passes for comparison in the UI.
- Profiles can include multiple same-origin pages in `Run Pages`; the UI exposes a `Run Page` selector to switch per-page statistics inside one saved run.
- The overview now includes deeper runtime metrics: `Visible`, `LCP`, `CLS`, `JS Parse`, `JS Eval`, and `Long Tasks`.
- Default runtime storage lives under `storage\`.
- Run history currently persists in JSON files under `storage\data\`, while large artifacts live under `storage\artifacts\`.
- Saved login state is stored in `storage\data\auth\session.json` and `storage\auth\default.json`.
- Asset issue tracking for Mantis is stored in `storage\data\asset-issues.json`.
- `Mantis Watch` is a dedicated top-level tab in the workspace. It highlights tracked assets, supports edit/delete, and marks closed assets that appeared again after `closedAt`.
- Authenticated profiles revalidate the saved session before every run; if it expired, the UI will require a fresh login capture.
- The active run can be exported as an LLM-friendly markdown report from the `Сформировать LLM-отчёт` button in the workspace header.
