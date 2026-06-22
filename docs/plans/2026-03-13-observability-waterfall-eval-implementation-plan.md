# Observability Waterfall Eval Implementation Plan

**Goal:** добавить в WebPerf Hub request waterfall, initiator/dependency chain и best-effort per-asset JS parse/eval attribution без смены текущей `run + pages[]` модели.

**Architecture:** observability расширяется внутри существующих `RequestRecord`, `RunDetails` и `RunPageRecord`. Worker собирает richer network/trace data через CDP, API сохраняет и нормализует их, UI показывает waterfall и execution ranking с graceful fallback для старых runs.

**Tech Stack:** TypeScript, Fastify, Playwright/CDP, React 19, Vitest, file-based persistence

**Execution Status:** completed on 2026-03-13 without Git operations.

---

### Task 1: Extend Request Schema For Waterfall Metadata
Status: done

**Files:**
- Modify: `~/bitrix_repos/webperf-hub/apps/api/src/modules/runs/run.repository.ts`
- Modify: `~/bitrix_repos/webperf-hub/apps/worker/src/collector/network-collector.ts`
- Modify: `~/bitrix_repos/webperf-hub/apps/web/src/lib/api.ts`
- Test: `~/bitrix_repos/webperf-hub/packages/shared/src/shared.test.ts`
- Test: `~/bitrix_repos/webperf-hub/apps/api/src/modules/runs/run-crud.test.ts`

**Step 1: Write the failing test**

Добавить тест, что request schema и persisted run details принимают:

```ts
{
  startTimeMs: 15,
  endTimeMs: 180,
  queueingMs: 5,
  dnsMs: 10,
  connectMs: 20,
  sslMs: 15,
  requestSentMs: 2,
  waitingMs: 80,
  downloadMs: 33,
  initiatorType: 'script',
  initiatorUrl: 'https://example.com/app.js',
  protocol: 'h2',
  priority: 'High',
}
```

**Step 2: Run test to verify it fails**

Run: `corepack pnpm --dir ~/bitrix_repos/webperf-hub --filter @webperf/api test -- run-crud`

Expected: FAIL on missing request fields in type/schema expectations.

**Step 3: Write minimal implementation**

Расширить `RequestRecord` и клиентский контракт новыми optional полями без изменения существующего поведения старых runs.

**Step 4: Run test to verify it passes**

Run: `corepack pnpm --dir ~/bitrix_repos/webperf-hub --filter @webperf/api test -- run-crud`

Expected: PASS.

### Task 2: Collect Waterfall Phases And Initiator Data In Worker
Status: done

**Files:**
- Modify: `~/bitrix_repos/webperf-hub/apps/worker/src/runner/live-profile.ts`
- Modify: `~/bitrix_repos/webperf-hub/apps/worker/src/collector/network-collector.ts`
- Test: `~/bitrix_repos/webperf-hub/apps/worker/src/worker.test.ts`

**Step 1: Write the failing test**

Добавить тест, что worker переводит CDP timing/initiator в request breakdown:

```ts
expect(result.requests[0]).toMatchObject({
  startTimeMs: 0,
  waitingMs: 80,
  downloadMs: 33,
  initiatorType: 'script',
  initiatorUrl: 'https://example.com/app.js',
  protocol: 'h2',
});
```

**Step 2: Run test to verify it fails**

Run: `corepack pnpm --dir ~/bitrix_repos/webperf-hub --filter @webperf/worker test -- worker.test.ts`

Expected: FAIL because these fields are not collected yet.

**Step 3: Write minimal implementation**

В `live-profile.ts`:

- читать `response.timing`
- вычислять phase durations в ms
- извлекать `initiator.type`
- извлекать `initiator.url`, если доступен
- сохранять `protocol` и `priority`
- не подменять отсутствующие фазы фиктивными значениями

**Step 4: Run test to verify it passes**

Run: `corepack pnpm --dir ~/bitrix_repos/webperf-hub --filter @webperf/worker test -- worker.test.ts`

Expected: PASS.

### Task 3: Persist And Return Waterfall Data Through API
Status: done

**Files:**
- Modify: `~/bitrix_repos/webperf-hub/apps/api/src/modules/ingest/run-ingest.service.ts`
- Modify: `~/bitrix_repos/webperf-hub/apps/api/src/modules/runs/run.service.ts`
- Modify: `~/bitrix_repos/webperf-hub/apps/api/src/modules/runs/run-details.routes.ts`
- Test: `~/bitrix_repos/webperf-hub/apps/api/src/modules/runs/run-multi-page.test.ts`
- Test: `~/bitrix_repos/webperf-hub/apps/api/src/modules/runs/run-crud.test.ts`

**Step 1: Write the failing test**

Добавить тест, что multi-page run details отдают request breakdown в `pages[].requests` и top-level `requests`.

**Step 2: Run test to verify it fails**

Run: `corepack pnpm --dir ~/bitrix_repos/webperf-hub --filter @webperf/api test -- run-multi-page`

Expected: FAIL because new fields are not persisted end-to-end.

**Step 3: Write minimal implementation**

- пропустить новые request fields через ingest/service/routes
- не ломать old run details
- сохранить backward compatibility для старых JSON

**Step 4: Run test to verify it passes**

Run: `corepack pnpm --dir ~/bitrix_repos/webperf-hub --filter @webperf/api test -- run-multi-page`

Expected: PASS.

### Task 4: Build Request Waterfall UI
Status: done

**Files:**
- Create: `~/bitrix_repos/webperf-hub/apps/web/src/features/requests/request-waterfall.tsx`
- Modify: `~/bitrix_repos/webperf-hub/apps/web/src/features/requests/request-table.tsx`
- Modify: `~/bitrix_repos/webperf-hub/apps/web/src/app.tsx`
- Modify: `~/bitrix_repos/webperf-hub/apps/web/src/styles.css`
- Test: `~/bitrix_repos/webperf-hub/apps/web/src/features/web.test.tsx`

**Step 1: Write the failing test**

Добавить UI-тест:

```ts
expect(screen.getByRole('heading', { name: 'Waterfall' })).toBeTruthy();
expect(screen.getByText('parser')).toBeTruthy();
expect(screen.getByText('h2')).toBeTruthy();
```

**Step 2: Run test to verify it fails**

Run: `corepack pnpm --dir ~/bitrix_repos/webperf-hub --filter @webperf/web test -- web.test.tsx`

Expected: FAIL because waterfall panel does not exist.

**Step 3: Write minimal implementation**

- создать `request-waterfall.tsx`
- отрисовать bars по phase durations
- добавить initiator/protocol/priority в requests UI
- включить panel для active page/pass

**Step 4: Run test to verify it passes**

Run: `corepack pnpm --dir ~/bitrix_repos/webperf-hub --filter @webperf/web test -- web.test.tsx`

Expected: PASS.

### Task 5: Add Trace-Based JS Execution Attribution Model
Status: done

**Files:**
- Modify: `~/bitrix_repos/webperf-hub/apps/worker/src/collector/trace-collector.ts`
- Modify: `~/bitrix_repos/webperf-hub/apps/worker/src/runner/live-profile.ts`
- Modify: `~/bitrix_repos/webperf-hub/apps/api/src/modules/runs/run.repository.ts`
- Modify: `~/bitrix_repos/webperf-hub/apps/web/src/lib/api.ts`
- Test: `~/bitrix_repos/webperf-hub/apps/worker/src/collector/trace-collector.test.ts`
- Test: `~/bitrix_repos/webperf-hub/apps/worker/src/worker.test.ts`

**Step 1: Write the failing test**

Добавить trace unit-test:

```ts
expect(result.jsExecutionSummary.resources).toEqual([
  expect.objectContaining({
    url: 'https://example.com/app.js',
    parseMs: 12,
    evaluateMs: 48,
    totalMs: 60,
    attributionConfidence: 'high',
  }),
]);
```

**Step 2: Run test to verify it fails**

Run: `corepack pnpm --dir ~/bitrix_repos/webperf-hub --filter @webperf/worker test -- trace-collector`

Expected: FAIL because per-resource execution summary does not exist.

**Step 3: Write minimal implementation**

- расширить trace collector новым `jsExecutionSummary`
- использовать best-effort mapping URL/script metadata
- неатрибутируемые события класть в `unattributed`
- сохранить confidence на каждом resource row

**Step 4: Run test to verify it passes**

Run: `corepack pnpm --dir ~/bitrix_repos/webperf-hub --filter @webperf/worker test -- trace-collector`

Expected: PASS.

### Task 6: Persist And Expose JS Execution Summary
Status: done

**Files:**
- Modify: `~/bitrix_repos/webperf-hub/apps/api/src/modules/ingest/run-ingest.service.ts`
- Modify: `~/bitrix_repos/webperf-hub/apps/api/src/modules/runs/run.service.ts`
- Modify: `~/bitrix_repos/webperf-hub/apps/api/src/modules/runs/run-details.routes.ts`
- Test: `~/bitrix_repos/webperf-hub/apps/api/src/modules/runs/run-multi-page.test.ts`

**Step 1: Write the failing test**

Добавить ожидание `jsExecutionSummary` в API response для completed run и page record.

**Step 2: Run test to verify it fails**

Run: `corepack pnpm --dir ~/bitrix_repos/webperf-hub --filter @webperf/api test -- run-multi-page`

Expected: FAIL because API contract does not include new summary.

**Step 3: Write minimal implementation**

- сохранить `jsExecutionSummary` в top-level run details и `pages[]`
- отдать его через `/api/runs/:id`
- не требовать его наличия у старых runs

**Step 4: Run test to verify it passes**

Run: `corepack pnpm --dir ~/bitrix_repos/webperf-hub --filter @webperf/api test -- run-multi-page`

Expected: PASS.

### Task 7: Build JS Execution UI With Confidence Badges
Status: done

**Files:**
- Create: `~/bitrix_repos/webperf-hub/apps/web/src/features/runs/js-execution-panel.tsx`
- Modify: `~/bitrix_repos/webperf-hub/apps/web/src/app.tsx`
- Modify: `~/bitrix_repos/webperf-hub/apps/web/src/styles.css`
- Test: `~/bitrix_repos/webperf-hub/apps/web/src/features/web.test.tsx`
- Test: `~/bitrix_repos/webperf-hub/apps/web/src/features/run-pages.test.tsx`

**Step 1: Write the failing test**

Добавить UI expectations:

```ts
expect(screen.getByRole('heading', { name: 'JS Execution' })).toBeTruthy();
expect(screen.getByText('high')).toBeTruthy();
expect(screen.getByText('unattributed')).toBeTruthy();
```

**Step 2: Run test to verify it fails**

Run: `corepack pnpm --dir ~/bitrix_repos/webperf-hub --filter @webperf/web test -- run-pages`

Expected: FAIL because panel is missing.

**Step 3: Write minimal implementation**

- создать `js-execution-panel.tsx`
- показывать ranking ресурсов по `totalMs`
- показывать `parse`, `eval`, `total`, `confidence`
- показывать unattributed bucket
- привязывать panel к active page внутри multi-page run

**Step 4: Run test to verify it passes**

Run: `corepack pnpm --dir ~/bitrix_repos/webperf-hub --filter @webperf/web test -- run-pages`

Expected: PASS.

### Task 8: Backward Compatibility And Manual Verification
Status: partial

**Files:**
- Modify: `~/bitrix_repos/webperf-hub/apps/api/src/modules/runs/run.repository.ts`
- Modify: `~/bitrix_repos/webperf-hub/apps/web/src/lib/api.ts`
- Test: `~/bitrix_repos/webperf-hub/apps/api/src/modules/runs/run-crud.test.ts`
- Test: `~/bitrix_repos/webperf-hub/apps/web/src/features/web.test.tsx`
- Docs: `~/bitrix_repos/webperf-hub/README.md`

**Step 1: Write the failing test**

Добавить regression test на старый run detail JSON без waterfall/jsExecutionSummary, который должен открываться без падения и без скрытых runtime errors.

**Step 2: Run test to verify it fails**

Run: `corepack pnpm --dir ~/bitrix_repos/webperf-hub --filter @webperf/web test -- web.test.tsx`

Expected: FAIL if any new UI assumes enriched schema unconditionally.

**Step 3: Write minimal implementation**

- normalizers для legacy payload
- UI fallback для отсутствующих observability block'ов
- обновить README описанием waterfall и JS execution limitations

**Step 4: Run test to verify it passes**

Run:

```bash
corepack pnpm --dir ~/bitrix_repos/webperf-hub --filter @webperf/api test
corepack pnpm --dir ~/bitrix_repos/webperf-hub --filter @webperf/web test
corepack pnpm --dir ~/bitrix_repos/webperf-hub --filter @webperf/worker test
```

Expected: all PASS.

### Task 9: Manual QA In Running App
Status: pending manual smoke-check

**Files:**
- Docs: `~/bitrix_repos/webperf-hub/docs/plans/2026-03-13-observability-waterfall-eval-design.md`
- Docs: `~/bitrix_repos/webperf-hub/docs/plans/2026-03-13-observability-waterfall-eval-implementation-plan.md`

**Step 1: Write the failing test**

Для этого шага automated failing test не требуется; вместо него создать QA checklist в заметках implementation session:

```md
- old saved run opens
- new run shows waterfall
- multi-page run switches pages
- js execution ranking visible
- confidence badges visible
- unattributed bucket visible when needed
```

**Step 2: Run test to verify it fails**

Run: manual repro against current app before final polish.

Expected: найти любые layout/data regressions до финального signoff.

**Step 3: Write minimal implementation**

- поправить найденные UX/data issues без расширения scope

**Step 4: Run test to verify it passes**

Run:

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1
```

Manual checks:

- открыть `http://127.0.0.1:4173`
- открыть старый run
- открыть новый multi-page run
- переключить `Run Page`
- проверить waterfall bars
- проверить JS execution panel

Expected: визуально корректный UI и отсутствие runtime errors в browser console.

## Result

Сделано:

- request waterfall phases и initiator metadata
- multi-page/page-pass compatible persistence
- `jsExecutionSummary` в worker/API/web
- `JS Execution` panel с `high/medium/low` confidence и `unattributed`
- backward compatibility для legacy `traceSummary`

Остался только опциональный ручной smoke-check в браузере и возможное расширение `README`/`LLM Report` на более подробное описание новых данных.
