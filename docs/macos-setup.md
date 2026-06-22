# macOS Setup

## Prerequisites

- macOS
- Node.js 22+
- Chrome installed
- `corepack` enabled (`corepack enable`)

## Install Dependencies

```bash
cd ~/bitrix_repos/perf-platform/pageperf-runner
corepack pnpm install
```

## Run Checks

```bash
corepack pnpm -r test
corepack pnpm -r build
corepack pnpm -r lint
```

## Dev servers

На macOS нет `.ps1`-лаунчеров (`start-dev.ps1` / `stop-dev.ps1` существуют только под Windows). Запускаем pnpm-скрипты напрямую:

```bash
corepack pnpm dev:api    # API :4310
corepack pnpm dev:web    # UI  :4173  (в отдельном терминале)
```

Разовый замер страницы:

```bash
corepack pnpm profile:pages --url https://example.com --throttling native --cache-mode cold
```

## Notes

- Воркспейс использует `corepack pnpm`, т.к. `pnpm` не предполагается в `PATH`.
- Профили поддерживают режимы кеша `cold`, `warm`, `both`; `warm` делает прогрев, `both` записывает оба прохода для сравнения в UI.
- Профиль может включать несколько same-origin страниц в `Run Pages`; в UI есть селектор `Run Page` для пер-страничной статистики внутри одного run.
- Overview включает метрики: `Visible`, `LCP`, `CLS`, `JS Parse`, `JS Eval`, `Long Tasks`.
- Рантайм-хранилище — под `storage/`. История run'ов — JSON в `storage/data/`, крупные артефакты — `storage/artifacts/`.
- Сохранённое состояние логина — `storage/data/auth/session.json` и `storage/auth/default.json`. Аутентифицированные профили ревалидируют сессию перед каждым run; при истечении UI попросит свежий логин.
- Трекинг ассетов для Mantis — `storage/data/asset-issues.json`. `Mantis Watch` — отдельная вкладка воркспейса (подсветка трекаемых ассетов, edit/delete, пометка закрытых ассетов, появившихся снова после `closedAt`).
- Активный run экспортируется в LLM-friendly markdown кнопкой `Сформировать LLM-отчёт` в шапке воркспейса.
