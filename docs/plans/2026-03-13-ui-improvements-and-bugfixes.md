# WebPerf Hub: UI Improvements & Bug Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix critical backend bugs, localize UI to Russian, improve UX (coverage display, polling, timestamps, waterfall legend, tab counters), refactor shared utilities.

**Architecture:** All changes are in-place edits to existing files. Backend bug fixes are in `apps/api/src/`. UI changes are in `apps/web/src/`. Shared URL utilities extracted to `apps/web/src/lib/url.ts`. No new dependencies needed.

**Tech Stack:** React 19, TypeScript 5.9, Fastify 5, Vitest, CSS custom properties.

**Test command:** `cd /c/bitrix_repos/webperf-hub && corepack pnpm test`

---

### Task 1: Fix backend bugs

**Files:**
- Modify: `apps/api/src/modules/runs/run.repository.ts` (completedAt loss)
- Modify: `apps/api/src/modules/runs/run.service.ts` (stuck runs)
- Modify: `apps/api/src/modules/analysis/llm-report.service.ts` (cold/warm)
- Modify: `apps/api/src/modules/asset-issues/asset-issue.service.ts` (assetUrl)
- Modify: `apps/worker/src/runner/live-profile.ts` (recursion depth)

**Step 1: Fix completedAt loss in run.repository.ts**

In `setStatus()`, change:
```ts
// BEFORE:
if (status !== 'completed') {
    run.completedAt = undefined;
}
// AFTER:
if (status === 'queued' || status === 'running') {
    run.completedAt = undefined;
}
```

**Step 2: Fix stuck runs in run.service.ts**

Wrap the executor call in `start()` with try/catch so failed runs get status='failed':
```ts
try {
    const executionResult = await this.runExecutor(/* ... */);
    // ... existing success logic
} catch (error) {
    this.runs.setStatus(run.id, 'failed');
    throw error;
}
```

**Step 3: Fix cold/warm LLM report in llm-report.service.ts**

The `coldLoadMs` and `warmLoadMs` must come from different passes. Find where both are set to `metricMap.get('load') ?? 0` and fix to pull from the correct pass data.

**Step 4: Fix assetUrl normalization in asset-issue.service.ts**

Where `assetUrl: assetKey` is set, change to `assetUrl: payload.assetUrl ?? assetKey` to preserve original URL.

**Step 5: Fix recursion depth in live-profile.ts**

Add depth parameter to `findUrlInStackTrace`:
```ts
function findUrlInStackTrace(stackTrace: unknown, depth = 0): string | undefined {
    if (depth > 50) return undefined;
    // ... existing logic, pass depth + 1 to recursive call
}
```

**Step 6: Run tests**

Run: `cd /c/bitrix_repos/webperf-hub && corepack pnpm test`
Expected: All existing tests pass.

---

### Task 2: Full UI localization to Russian

**Files:**
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/features/runs/run-launch-form.tsx`
- Modify: `apps/web/src/features/runs/run-overview.tsx`
- Modify: `apps/web/src/features/runs/run-list.tsx`
- Modify: `apps/web/src/features/runs/js-execution-panel.tsx`
- Modify: `apps/web/src/features/requests/request-table.tsx`
- Modify: `apps/web/src/features/assets/asset-table.tsx`
- Modify: `apps/web/src/features/asset-issues/asset-issue-editor.tsx`
- Modify: `apps/web/src/features/asset-issues/issue-watch.tsx`
- Modify: `apps/web/src/lib/format.ts`

Translate ALL English-facing text to Russian. Keep technical terms (TTFB, FCP, LCP, etc.) and brand name "WebPerf Hub" in English. Keep code identifiers in English.

Complete mapping of every string to translate — see analysis doc. Key translations:

- "Investigation Overview" → "Обзор прогона"
- "Page Stages" → "Стадии загрузки"
- "Runs" → "Прогоны"
- "Create Profile" → "Создать профиль"
- "Profile Name" → "Имя профиля"
- "Profile URL" → "URL профиля"
- "Run Pages" → "Страницы для прогона"
- "Throttling Preset" → "Пресет сети"
- "Cache Mode" → "Режим кеша"
- "Create and Start Run" → "Создать и запустить"
- "Requests" → "Запросы"
- "Assets" → "Ресурсы"
- "Mantis Watch" → "Mantis-трекер"
- "Columns" → "Столбцы"
- "Request Type" / "Asset Type" → "Тип запроса" / "Тип ресурса"
- "Track" → "Отслеживать"
- "Edit" → "Изменить"
- "Delete issue" → "Удалить"
- "Cancel" → "Отмена"
- "Save issue" → "Сохранить"
- "Waiting" → "Ожидание"
- "No requests in this filter." → "Нет запросов для данного фильтра."
- "No assets in this filter." → "Нет ресурсов для данного фильтра."
- "No tracked assets for this filter yet." → "Нет отслеживаемых ресурсов для этого фильтра."
- Summary labels: Status→Статус, Profile→Профиль, Cache Mode→Режим кеша, Recorded Pass→Тип прогона, Pages→Страницы, Requests→Запросы, Encoded Total→Сжатый размер, Decoded Total→Исходный размер, Compression Mix→Виды сжатия
- "Select a run" → "Выберите прогон"
- "Active Investigation" → "Текущий прогон"
- kicker/copy texts → Russian equivalents
- "idle" status → "нет данных"
- "Saved Sessions" → "Сохранённые сессии"
- "No runs available yet." → "Прогонов пока нет."
- JS Execution panel: "Resource"→"Ресурс", "Confidence"→"Уверенность", "unattributed"→"не атрибутировано", description→Russian
- "Decoded Threshold (MB)" → "Порог decoded (МБ)"
- "Heavy decoded:" → "Тяжёлых decoded:"
- "Only returned after close" → "Только вернувшиеся после закрытия"
- issue-watch dates: "Added:"→"Создан:", "Closed:"→"Закрыт:", "Seen:"→"Замечен:"
- "Hide editor" → "Скрыть"
- "Run Summary" → "Итоги прогона"
- "Load Timeline" → "Хронология загрузки"
- waterfall: "Network Timeline"→"Хронология сети"
- LLM report: "AI Export" → "Экспорт для AI"
- option labels in selects: "native"→"без ограничений", "cold"→"холодный", "warm"→"тёплый", "both"→"оба"
- "Run Page" → "Страница прогона"
- auth section: keep existing Russian, translate remaining English

---

### Task 3: UI improvements — Run Pages textarea

**Files:**
- Modify: `apps/web/src/features/runs/run-launch-form.tsx`

Add placeholder and helper text to the Run Pages textarea:
```tsx
<textarea
    placeholder={"https://example.com/page1\nhttps://example.com/page2"}
    ...
/>
// Add helper span below:
<span className="field-hint">По одному URL на строку</span>
```

Add CSS for `.field-hint` in `styles.css`:
```css
.field-hint {
    color: var(--text-muted);
    font-size: 0.72rem;
}
```

---

### Task 4: UI improvements — Run list timestamps

**Files:**
- Modify: `apps/web/src/app.tsx` (add createdAt to RunListItem)
- Modify: `apps/web/src/features/runs/run-list.tsx` (render timestamp)

Add `createdAt` field to `RunListItem` type. Format using relative time (e.g., "2 мин назад"). Show in `run-list-meta` row.

---

### Task 5: UI improvements — Tab counters

**Files:**
- Modify: `apps/web/src/app.tsx` (pass counts to tabs)

Add counts to tab labels:
```tsx
['requests', `Запросы (${filteredRequests.length})`],
['assets', `Ресурсы (${filteredAssets.length})`],
['mantis', `Mantis (${assetIssues.length})`],
```

---

### Task 6: UI improvements — Coverage metrics display

**Files:**
- Modify: `apps/web/src/app.tsx` (build coverage items for deep metrics)

Add JS Coverage and CSS Coverage cards to `buildDeepMetricItems()`:
```ts
// After existing items, add:
{
    label: 'JS Coverage',
    value: coverageSummary
        ? `${((coverageSummary.totals.js.usedBytes / Math.max(1, coverageSummary.totals.js.usedBytes + coverageSummary.totals.js.unusedBytes)) * 100).toFixed(1)}%`
        : 'n/a',
    hint: 'Процент использованного JS-кода. Остальное — мёртвый код, загруженный, но не выполненный.',
},
{
    label: 'CSS Coverage',
    value: coverageSummary
        ? `${((coverageSummary.totals.css.usedBytes / Math.max(1, coverageSummary.totals.css.usedBytes + coverageSummary.totals.css.unusedBytes)) * 100).toFixed(1)}%`
        : 'n/a',
    hint: 'Процент использованного CSS-кода. Остальное — неиспользуемые правила, загруженные на страницу.',
},
```

Pass `coverageSummary` to `buildDeepMetricItems`.

---

### Task 7: UI improvements — Summary grid layout

**Files:**
- Modify: `apps/web/src/styles.css`

Change summary-grid from fixed 6 columns to auto-fill:
```css
.summary-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
}
```

Update media queries accordingly.

---

### Task 8: UI improvements — Waterfall legend

**Files:**
- Modify: `apps/web/src/features/requests/request-waterfall.tsx`
- Modify: `apps/web/src/styles.css`

Add a color legend bar below the waterfall heading:
```tsx
<div className="waterfall-legend">
    <span className="waterfall-legend-item"><span className="waterfall-legend-swatch waterfall-segment-queueing" /> Очередь</span>
    <span className="waterfall-legend-item"><span className="waterfall-legend-swatch waterfall-segment-dns" /> DNS</span>
    <span className="waterfall-legend-item"><span className="waterfall-legend-swatch waterfall-segment-connect" /> Соединение</span>
    <span className="waterfall-legend-item"><span className="waterfall-legend-swatch waterfall-segment-ssl" /> SSL</span>
    <span className="waterfall-legend-item"><span className="waterfall-legend-swatch waterfall-segment-requestSent" /> Отправка</span>
    <span className="waterfall-legend-item"><span className="waterfall-legend-swatch waterfall-segment-waiting" /> Ожидание</span>
    <span className="waterfall-legend-item"><span className="waterfall-legend-swatch waterfall-segment-download" /> Загрузка</span>
</div>
```

CSS:
```css
.waterfall-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 16px;
    padding: 10px 0;
    border-bottom: 1px solid var(--line);
}
.waterfall-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.74rem;
    color: var(--text-secondary);
}
.waterfall-legend-swatch {
    display: inline-block;
    width: 14px;
    height: 10px;
    border-radius: 3px;
}
```

---

### Task 9: UI improvements — Copy feedback & status pill

**Files:**
- Modify: `apps/web/src/app.tsx` (copy feedback state, status pill localization)

Add copy feedback:
```tsx
const [copyFeedback, setCopyFeedback] = useState(false);

async function handleCopyLlmReport(): Promise<void> {
    // ... existing copy logic
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
}
// Button text: copyFeedback ? 'Скопировано!' : 'Копировать'
```

---

### Task 10: UI improvements — Polling for running runs

**Files:**
- Modify: `apps/web/src/app.tsx`

Add polling effect that re-fetches run details every 3 seconds when selected run status is 'running' or 'queued':
```tsx
useEffect(() => {
    const selectedRun = runs.find(r => r.id === selectedRunId);
    if (!selectedRun || (selectedRun.status !== 'running' && selectedRun.status !== 'queued')) return;

    const interval = setInterval(async () => {
        const [updatedRuns, details] = await Promise.all([
            fetchRuns(),
            selectedRunId ? fetchRunDetails(selectedRunId) : Promise.resolve(null),
        ]);
        setRuns(updatedRuns);
        if (details) setSelectedRunDetails(details);
    }, 3000);

    return () => clearInterval(interval);
}, [selectedRunId, runs]);
```

---

### Task 11: Extract shared URL utilities

**Files:**
- Create: `apps/web/src/lib/url.ts`
- Modify: `apps/web/src/features/requests/request-table.tsx`
- Modify: `apps/web/src/features/requests/request-waterfall.tsx`
- Modify: `apps/web/src/features/assets/asset-table.tsx`
- Modify: `apps/web/src/features/runs/js-execution-panel.tsx`

Extract duplicated functions `getResourceLabel`, `getDisplayUrl`, `getTargetOrigin`, `getResourceTypeLabel` into `lib/url.ts`. Update all 4 files to import from there.

---

### Task 12: Add TBT metric

**Files:**
- Modify: `apps/web/src/app.tsx` (add to deep metrics)

Add TBT (Total Blocking Time) to deep metrics. Calculate from existing longTask data:
```ts
{
    label: 'TBT',
    value: traceSummary
        ? formatMetricValue('duration', Math.max(0, traceSummary.mainThread.longTaskTotal - traceSummary.mainThread.longTaskCount * 50))
        : 'n/a',
    hint: 'Total Blocking Time. Суммарное время, на которое длинные задачи (>50 мс) блокировали главный поток сверх порога.',
},
```

---

### Task 13: Run tests and verify

Run: `cd /c/bitrix_repos/webperf-hub && corepack pnpm test`
Expected: All tests pass.

---
