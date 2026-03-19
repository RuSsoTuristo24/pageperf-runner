# CDP Performance Enhancements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Расширить набор собираемых CDP-метрик: DOM-статистика, JS Heap, oversized images, individual long tasks, layout shift details, forced reflows, third-party impact, render-blocking resources, unused preloads, HTTP/2 анализ.

**Architecture:** Новый collector-модуль `page-diagnostics-collector.ts` собирает всё, что требует `page.evaluate()` или `Performance.getMetrics()` после загрузки страницы. Результат — единый `PageDiagnostics` объект, который проходит тот же пайплайн (worker → API storage → web frontend), что и `traceSummary`/`jsExecutionSummary`/`coverageSummary`. Каждая группа метрик — отдельная панель или секция в UI.

**Tech Stack:** TypeScript 5.9, Playwright CDP, Vitest, React 19, Fastify 5

**Layers touched per feature:**
1. `apps/worker/src/collector/` — сбор данных
2. `apps/worker/src/runner/live-profile.ts` — вызов сбора в `executeMeasuredPass`
3. `apps/api/src/modules/runs/run.repository.ts` — типы хранения + нормализация
4. `apps/api/src/modules/ingest/run-ingest.service.ts` — валидация
5. `apps/web/src/lib/api.ts` — API-тип
6. `apps/web/src/app.tsx` — проброс данных в панели
7. `apps/web/src/features/` — UI-панель

---

## Task 1: Page Diagnostics Collector — DOM Stats + JS Heap

Собираем: количество DOM-нод, глубину дерева, количество event listeners, JS heap used/total.

**Files:**
- Create: `apps/worker/src/collector/page-diagnostics-collector.ts`
- Test: `apps/worker/src/collector/page-diagnostics-collector.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/worker/src/collector/page-diagnostics-collector.test.ts
import { describe, expect, it } from 'vitest';

import { summarizePageDiagnostics } from './page-diagnostics-collector.js';

describe('page diagnostics collector', () => {
  it('summarizes DOM stats and heap metrics from raw input', () => {
    const summary = summarizePageDiagnostics({
      domNodeCount: 1847,
      domTreeDepth: 24,
      eventListenerCount: 312,
      jsHeapUsedBytes: 18_400_000,
      jsHeapTotalBytes: 32_000_000,
    });

    expect(summary).toEqual({
      dom: {
        nodeCount: 1847,
        treeDepth: 24,
        eventListenerCount: 312,
      },
      heap: {
        usedBytes: 18_400_000,
        totalBytes: 32_000_000,
      },
      oversizedImages: [],
      thirdParty: { origins: [], totalTransferBytes: 0, totalRequests: 0 },
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/worker && npx vitest run src/collector/page-diagnostics-collector.test.ts -v`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// apps/worker/src/collector/page-diagnostics-collector.ts

export type OversizedImage = {
  url: string;
  naturalWidth: number;
  naturalHeight: number;
  displayWidth: number;
  displayHeight: number;
  wastedPixels: number;
  estimatedWastedBytes: number;
};

export type ThirdPartyOrigin = {
  origin: string;
  transferBytes: number;
  requestCount: number;
  blockingTimeMs: number;
};

export type ThirdPartySummary = {
  origins: ThirdPartyOrigin[];
  totalTransferBytes: number;
  totalRequests: number;
};

export type PageDiagnostics = {
  dom: {
    nodeCount: number;
    treeDepth: number;
    eventListenerCount: number;
  };
  heap: {
    usedBytes: number;
    totalBytes: number;
  };
  oversizedImages: OversizedImage[];
  thirdParty: ThirdPartySummary;
};

type RawPageDiagnosticsInput = {
  domNodeCount?: number;
  domTreeDepth?: number;
  eventListenerCount?: number;
  jsHeapUsedBytes?: number;
  jsHeapTotalBytes?: number;
  oversizedImages?: OversizedImage[];
  thirdParty?: ThirdPartySummary;
};

function toSafeInt(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : fallback;
}

export function summarizePageDiagnostics(input: RawPageDiagnosticsInput): PageDiagnostics {
  return {
    dom: {
      nodeCount: toSafeInt(input.domNodeCount),
      treeDepth: toSafeInt(input.domTreeDepth),
      eventListenerCount: toSafeInt(input.eventListenerCount),
    },
    heap: {
      usedBytes: toSafeInt(input.jsHeapUsedBytes),
      totalBytes: toSafeInt(input.jsHeapTotalBytes),
    },
    oversizedImages: input.oversizedImages ?? [],
    thirdParty: input.thirdParty ?? { origins: [], totalTransferBytes: 0, totalRequests: 0 },
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/worker && npx vitest run src/collector/page-diagnostics-collector.test.ts -v`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/worker/src/collector/page-diagnostics-collector.ts apps/worker/src/collector/page-diagnostics-collector.test.ts
git commit -m "feat(worker): add page diagnostics collector with DOM stats and heap"
```

---

## Task 2: Oversized Images Detection

Собираем через `page.evaluate()`: для каждого `<img>` с `src` сравниваем `naturalWidth/Height` с `clientWidth/Height`. Если пикселей отдаётся >2x больше, чем отображается — это oversized.

**Files:**
- Modify: `apps/worker/src/collector/page-diagnostics-collector.ts`
- Modify: `apps/worker/src/collector/page-diagnostics-collector.test.ts`

**Step 1: Write the failing test**

```typescript
// add to page-diagnostics-collector.test.ts
it('detects oversized images with wasted pixel and byte estimates', () => {
  const summary = summarizePageDiagnostics({
    domNodeCount: 100,
    domTreeDepth: 10,
    eventListenerCount: 5,
    jsHeapUsedBytes: 1_000_000,
    jsHeapTotalBytes: 2_000_000,
    oversizedImages: [
      {
        url: 'https://cdn.example.com/photo.jpg',
        naturalWidth: 2000,
        naturalHeight: 1500,
        displayWidth: 400,
        displayHeight: 300,
        wastedPixels: 2_880_000,
        estimatedWastedBytes: 864_000,
      },
    ],
  });

  expect(summary.oversizedImages).toEqual([
    {
      url: 'https://cdn.example.com/photo.jpg',
      naturalWidth: 2000,
      naturalHeight: 1500,
      displayWidth: 400,
      displayHeight: 300,
      wastedPixels: 2_880_000,
      estimatedWastedBytes: 864_000,
    },
  ]);
});
```

**Step 2: Run test to verify it passes** (type already supports this)

Run: `cd apps/worker && npx vitest run src/collector/page-diagnostics-collector.test.ts -v`
Expected: PASS — types already support oversizedImages

**Step 3: Add `collectOversizedImages` helper for use in `page.evaluate()`**

```typescript
// add to page-diagnostics-collector.ts

export function buildOversizedImageScript(): string {
  return `(() => {
    const images = Array.from(document.querySelectorAll('img[src]'));
    return images.flatMap(img => {
      const nat = { w: img.naturalWidth, h: img.naturalHeight };
      const disp = { w: img.clientWidth, h: img.clientHeight };
      if (nat.w === 0 || nat.h === 0 || disp.w === 0 || disp.h === 0) return [];
      const natPixels = nat.w * nat.h;
      const dispPixels = disp.w * disp.h;
      if (natPixels <= dispPixels * 2) return [];
      const wasted = natPixels - dispPixels;
      return [{
        url: img.src,
        naturalWidth: nat.w,
        naturalHeight: nat.h,
        displayWidth: disp.w,
        displayHeight: disp.h,
        wastedPixels: wasted,
        estimatedWastedBytes: Math.round(wasted * 0.3),
      }];
    }).sort((a, b) => b.estimatedWastedBytes - a.estimatedWastedBytes);
  })()`;
}
```

**Step 4: Add test for the script builder**

```typescript
it('builds an oversized images detection script', () => {
  const script = buildOversizedImageScript();
  expect(script).toContain('naturalWidth');
  expect(script).toContain('clientWidth');
  expect(typeof script).toBe('string');
});
```

**Step 5: Run tests & commit**

Run: `cd apps/worker && npx vitest run src/collector/page-diagnostics-collector.test.ts -v`
Expected: PASS

```bash
git add apps/worker/src/collector/page-diagnostics-collector.ts apps/worker/src/collector/page-diagnostics-collector.test.ts
git commit -m "feat(worker): add oversized images detection via page.evaluate"
```

---

## Task 3: Third-Party Impact Analysis

Группируем сетевые запросы по origin: для каждого стороннего origin считаем transfer bytes, количество запросов, и blocking time (из JS execution summary).

**Files:**
- Modify: `apps/worker/src/collector/page-diagnostics-collector.ts`
- Modify: `apps/worker/src/collector/page-diagnostics-collector.test.ts`

**Step 1: Write the failing test**

```typescript
it('calculates third-party impact grouped by origin', () => {
  const result = buildThirdPartySummary({
    targetOrigin: 'https://russeltest.bitrix24.ru',
    requests: [
      { url: 'https://russeltest.bitrix24.ru/blank.php', transferSize: 5000 },
      { url: 'https://mc.yandex.ru/metrika/tag.js', transferSize: 30000 },
      { url: 'https://mc.yandex.ru/metrika/watch.js', transferSize: 12000 },
      { url: 'https://www.googletagmanager.com/gtm.js?id=X', transferSize: 80000 },
    ],
    jsExecutionResources: [
      { url: 'https://mc.yandex.ru/metrika/tag.js', totalMs: 83 },
      { url: 'https://www.googletagmanager.com/gtm.js?id=X', totalMs: 45 },
    ],
  });

  expect(result.origins).toHaveLength(2);
  expect(result.origins[0]).toEqual({
    origin: 'https://www.googletagmanager.com',
    transferBytes: 80000,
    requestCount: 1,
    blockingTimeMs: 45,
  });
  expect(result.origins[1]).toEqual({
    origin: 'https://mc.yandex.ru',
    transferBytes: 42000,
    requestCount: 2,
    blockingTimeMs: 83,
  });
  expect(result.totalTransferBytes).toBe(122000);
  expect(result.totalRequests).toBe(3);
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/worker && npx vitest run src/collector/page-diagnostics-collector.test.ts -v`
Expected: FAIL — buildThirdPartySummary not found

**Step 3: Implement**

```typescript
// add to page-diagnostics-collector.ts

type ThirdPartyInput = {
  targetOrigin: string;
  requests: Array<{ url: string; transferSize: number }>;
  jsExecutionResources?: Array<{ url: string; totalMs: number }>;
};

export function buildThirdPartySummary(input: ThirdPartyInput): ThirdPartySummary {
  const originMap = new Map<string, { transferBytes: number; requestCount: number; blockingTimeMs: number }>();

  for (const request of input.requests) {
    let origin: string;
    try { origin = new URL(request.url).origin; }
    catch { continue; }

    if (origin === input.targetOrigin) continue;

    const current = originMap.get(origin) ?? { transferBytes: 0, requestCount: 0, blockingTimeMs: 0 };
    current.transferBytes += request.transferSize;
    current.requestCount += 1;
    originMap.set(origin, current);
  }

  for (const resource of input.jsExecutionResources ?? []) {
    let origin: string;
    try { origin = new URL(resource.url).origin; }
    catch { continue; }

    const current = originMap.get(origin);
    if (current) {
      current.blockingTimeMs += resource.totalMs;
    }
  }

  const origins: ThirdPartyOrigin[] = [...originMap.entries()]
    .map(([origin, data]) => ({ origin, ...data }))
    .sort((a, b) => b.transferBytes - a.transferBytes);

  return {
    origins,
    totalTransferBytes: origins.reduce((sum, o) => sum + o.transferBytes, 0),
    totalRequests: origins.reduce((sum, o) => sum + o.requestCount, 0),
  };
}
```

**Step 4: Run tests & commit**

```bash
git add apps/worker/src/collector/page-diagnostics-collector.ts apps/worker/src/collector/page-diagnostics-collector.test.ts
git commit -m "feat(worker): add third-party impact analysis by origin"
```

---

## Task 4: Integrate Collection into `executeMeasuredPass`

Подключаем сбор DOM stats, JS heap, oversized images, third-party в `live-profile.ts`.

**Files:**
- Modify: `apps/worker/src/runner/live-profile.ts:796-853`
- Modify: `apps/worker/src/collector/page-diagnostics-collector.ts` (export from index)
- Modify: `apps/worker/src/index.ts`

**Step 1: Add `PageDiagnostics` to result types**

In `live-profile.ts`, add `pageDiagnostics` to `LiveRunPassResult`, `LiveRunPageResult`, `LiveRunProfileResult`.

```typescript
// In LiveRunPassResult, add:
pageDiagnostics: PageDiagnostics;

// In LiveRunPageResult, add:
pageDiagnostics: PageDiagnostics;

// In LiveRunProfileResult passes array, add:
pageDiagnostics?: PageDiagnostics;

// In LiveRunProfileResult top-level, add:
pageDiagnostics: PageDiagnostics;
```

**Step 2: Add collection in `executeMeasuredPass` after `page.waitForLoadState`**

Insert between the `page.waitForLoadState` line and `const timing = await page.evaluate(...)`:

```typescript
// Collect DOM stats + oversized images in a single evaluate
const pageDiagnosticsRaw = await page.evaluate(/* inline script */);

// Collect JS heap via CDP
const perfMetrics = await cdp.send('Performance.getMetrics');
const heapUsed = perfMetrics.metrics.find((m: any) => m.name === 'JSHeapUsedSize')?.value ?? 0;
const heapTotal = perfMetrics.metrics.find((m: any) => m.name === 'JSHeapTotalSize')?.value ?? 0;
```

The `page.evaluate` script collects:
```typescript
const pageDiagnosticsRaw = await page.evaluate(() => {
  const allNodes = document.querySelectorAll('*');
  let maxDepth = 0;
  for (const node of allNodes) {
    let depth = 0;
    let current: Element | null = node;
    while (current) { depth++; current = current.parentElement; }
    if (depth > maxDepth) maxDepth = depth;
  }

  // Oversized images
  const images = Array.from(document.querySelectorAll('img[src]'));
  const oversizedImages = images.flatMap(img => {
    const nw = img.naturalWidth, nh = img.naturalHeight;
    const dw = img.clientWidth, dh = img.clientHeight;
    if (nw === 0 || nh === 0 || dw === 0 || dh === 0) return [];
    const natPx = nw * nh, dispPx = dw * dh;
    if (natPx <= dispPx * 2) return [];
    const wasted = natPx - dispPx;
    return [{
      url: img.src, naturalWidth: nw, naturalHeight: nh,
      displayWidth: dw, displayHeight: dh,
      wastedPixels: wasted, estimatedWastedBytes: Math.round(wasted * 0.3),
    }];
  }).sort((a, b) => b.estimatedWastedBytes - a.estimatedWastedBytes);

  // Event listener count via getEventListeners not available in page context,
  // use CDP Runtime.evaluate with includeCommandLineAPI in a separate step
  return {
    domNodeCount: allNodes.length,
    domTreeDepth: maxDepth,
    oversizedImages,
  };
});
```

Then collect event listener count via CDP:
```typescript
const listenerCountResult = await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    let count = 0;
    const walker = document.createTreeWalker(document, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const el = walker.currentNode;
      try { count += getEventListeners(el) ? Object.keys(getEventListeners(el)).reduce((s, k) => s + getEventListeners(el)[k].length, 0) : 0; } catch {}
    }
    return count;
  })()`,
  includeCommandLineAPI: true,
  returnByValue: true,
});
const eventListenerCount = listenerCountResult.result?.value ?? 0;
```

**Step 3: Build diagnostics and add to return**

```typescript
const thirdParty = buildThirdPartySummary({
  targetOrigin: new URL(targetUrl).origin,
  requests: requests.map(r => ({ url: r.url, transferSize: r.transferSize })),
  jsExecutionResources: traceAnalysis.jsExecutionSummary.resources.map(r => ({ url: r.url, totalMs: r.totalMs })),
});

const pageDiagnostics = summarizePageDiagnostics({
  domNodeCount: pageDiagnosticsRaw.domNodeCount,
  domTreeDepth: pageDiagnosticsRaw.domTreeDepth,
  eventListenerCount,
  jsHeapUsedBytes: heapUsed,
  jsHeapTotalBytes: heapTotal,
  oversizedImages: pageDiagnosticsRaw.oversizedImages,
  thirdParty,
});

return {
  label,
  pageMetrics: ...,
  requests,
  traceSummary: traceAnalysis.traceSummary,
  jsExecutionSummary: traceAnalysis.jsExecutionSummary,
  coverageSummary: buildCoverageSummary(jsCoverage, cssCoverage),
  pageDiagnostics,  // <-- NEW
};
```

**Step 4: Propagate through `executePageRun` and `executeLiveRun`**

Same pattern as `traceSummary` — add `pageDiagnostics` to all return objects.

**Step 5: Export from worker index.ts**

```typescript
// apps/worker/src/index.ts — add:
export * from './collector/page-diagnostics-collector.js';
```

**Step 6: Run existing tests to verify nothing breaks**

Run: `cd apps/worker && npx vitest run -v`
Expected: All existing tests PASS

**Step 7: Commit**

```bash
git add apps/worker/src/runner/live-profile.ts apps/worker/src/index.ts apps/worker/src/collector/page-diagnostics-collector.ts
git commit -m "feat(worker): integrate page diagnostics collection into measured pass"
```

---

## Task 5: Runner + API Pipeline — Pass `pageDiagnostics` Through

**Files:**
- Modify: `apps/worker/src/runner/runner.ts` — add `pageDiagnostics` to `LiveRunResult` and `start()` return
- Modify: `apps/api/src/modules/runs/run.repository.ts` — add `pageDiagnostics?` to `RunPassRecord`, `RunPageRecord`, `RunDetails`
- Modify: `apps/api/src/modules/runs/run.service.ts` — add `pageDiagnostics` to `RunExecutionResult` and `start()` return
- Modify: `apps/api/src/modules/ingest/run-ingest.service.ts` — pass `pageDiagnostics` to `updateDetails`
- Modify: `apps/api/src/modules/runs/run-details.routes.ts` — return `pageDiagnostics` in GET response

**Step 1: Update runner.ts**

In `LiveRunResult` type and `start()` return, add `pageDiagnostics` field alongside `traceSummary`.

**Step 2: Update run.repository.ts**

```typescript
// Add to RunPassRecord:
pageDiagnostics?: PageDiagnostics;

// Add to RunPageRecord:
pageDiagnostics?: PageDiagnostics;

// Add to RunDetails:
pageDiagnostics?: PageDiagnostics;

// Add normalizePageDiagnostics() function similar to normalizeTraceSummary()
// Add to normalizeRunDetails() for passes, pages, and top-level
```

**Step 3: Update run-ingest.service.ts**

Add `pageDiagnostics: payload.pageDiagnostics` to the `updateDetails` call.

**Step 4: Update run.service.ts**

Add `pageDiagnostics` to `RunExecutionResult`, `ingestService.ingest()` call, and `start()` return.

**Step 5: Update run-details.routes.ts**

Add `pageDiagnostics: details.pageDiagnostics` to GET response.

**Step 6: Update run-multi-page.test.ts**

Add `pageDiagnostics` to the mock `runExecutor.mockResolvedValue(...)` and add assertions.

**Step 7: Run all API tests**

Run: `cd apps/api && npx vitest run -v`
Expected: All tests PASS

**Step 8: Commit**

```bash
git add apps/worker/src/runner/runner.ts apps/api/src/modules/runs/run.repository.ts apps/api/src/modules/runs/run.service.ts apps/api/src/modules/ingest/run-ingest.service.ts apps/api/src/modules/runs/run-details.routes.ts apps/api/src/modules/runs/run-multi-page.test.ts
git commit -m "feat(api): pass pageDiagnostics through runner → ingest → storage pipeline"
```

---

## Task 6: Web Frontend — API Types + Deep Metrics

**Files:**
- Modify: `apps/web/src/lib/api.ts` — add `pageDiagnostics` to `ApiRunDetails`, passes, pages
- Modify: `apps/web/src/app.tsx` — add DOM/Heap metrics to `buildDeepMetricItems()`

**Step 1: Add `pageDiagnostics` to `ApiRunDetails`**

```typescript
// In ApiRunDetails, add after coverageSummary:
pageDiagnostics?: {
  dom: { nodeCount: number; treeDepth: number; eventListenerCount: number };
  heap: { usedBytes: number; totalBytes: number };
  oversizedImages: Array<{
    url: string;
    naturalWidth: number;
    naturalHeight: number;
    displayWidth: number;
    displayHeight: number;
    wastedPixels: number;
    estimatedWastedBytes: number;
  }>;
  thirdParty: {
    origins: Array<{
      origin: string;
      transferBytes: number;
      requestCount: number;
      blockingTimeMs: number;
    }>;
    totalTransferBytes: number;
    totalRequests: number;
  };
};
```

Add same to passes and pages types.

**Step 2: Add DOM/Heap to `buildDeepMetricItems` in `app.tsx`**

```typescript
// Add pageDiagnostics parameter to buildDeepMetricItems
// Add new metrics after CSS Coverage:
{
  label: 'DOM Nodes',
  value: pageDiagnostics ? formatCount(pageDiagnostics.dom.nodeCount) : 'n/a',
  hint: 'Общее количество DOM-нод на странице. Более 1500 нод замедляет layout и paint.',
},
{
  label: 'DOM Depth',
  value: pageDiagnostics ? String(pageDiagnostics.dom.treeDepth) : 'n/a',
  hint: 'Максимальная глубина DOM-дерева. Глубокие деревья увеличивают стоимость CSS-рекалькуляций.',
},
{
  label: 'Listeners',
  value: pageDiagnostics ? formatCount(pageDiagnostics.dom.eventListenerCount) : 'n/a',
  hint: 'Количество зарегистрированных event listeners. Много listeners = больше памяти и медленнее GC.',
},
{
  label: 'JS Heap',
  value: pageDiagnostics ? formatBytes(pageDiagnostics.heap.usedBytes) : 'n/a',
  hint: 'Объём JS-кучи, занятый объектами. Высокие значения могут указывать на утечки памяти.',
},
```

**Step 3: Wire `pageDiagnostics` through app.tsx data flow**

Add `pageDiagnostics` to the `activePass`/`activePage`/`selectedRunDetails` chain, same pattern as `traceSummary`.

**Step 4: Run web tests**

Run: `cd apps/web && npx vitest run -v`
Expected: All tests PASS (new fields are optional)

**Step 5: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/app.tsx
git commit -m "feat(web): show DOM stats and JS heap in deep metrics strip"
```

---

## Task 7: Oversized Images Panel

**Files:**
- Create: `apps/web/src/features/diagnostics/oversized-images-panel.tsx`
- Modify: `apps/web/src/app.tsx` — render the panel

**Step 1: Create the panel component**

```tsx
// apps/web/src/features/diagnostics/oversized-images-panel.tsx
import type { ApiRunDetails } from '../../lib/api.js';
import { formatBytes } from '../../lib/format.js';
import { getDisplayUrl, getResourceLabel, getTargetOrigin } from '../../lib/url.js';

type OversizedImagesPanelProps = {
  images?: NonNullable<ApiRunDetails['pageDiagnostics']>['oversizedImages'];
  targetUrl?: string;
};

export function OversizedImagesPanel({ images, targetUrl }: OversizedImagesPanelProps) {
  if (!images || images.length === 0) return null;

  const targetOrigin = getTargetOrigin(targetUrl);
  const totalWasted = images.reduce((sum, img) => sum + img.estimatedWastedBytes, 0);

  return (
    <section className="panel panel-oversized-images" aria-labelledby="oversized-images-heading">
      <div className="panel-heading panel-heading-inline">
        <div>
          <p className="eyebrow">Изображения</p>
          <h2 id="oversized-images-heading">Oversized Images</h2>
        </div>
        <span className="workspace-context">
          {images.length} шт, ~{formatBytes(totalWasted)} лишних
        </span>
      </div>

      <div className="data-table-wrap">
        <table className="data-table" aria-label="Oversized images">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Изображение</th>
              <th title="Реальный размер изображения (naturalWidth x naturalHeight)">Оригинал</th>
              <th title="Размер отображения на странице (clientWidth x clientHeight)">Отображение</th>
              <th title="Коэффициент — во сколько раз оригинал больше отображаемого">Ratio</th>
              <th title="Примерная оценка лишних байт">Лишний вес</th>
            </tr>
          </thead>
          <tbody>
            {images.map((img) => {
              const ratio = (img.naturalWidth * img.naturalHeight) / Math.max(1, img.displayWidth * img.displayHeight);
              return (
                <tr key={img.url}>
                  <td style={{ textAlign: 'left' }}>
                    <strong className="resource-primary">{getResourceLabel(img.url)}</strong>
                    <span className="resource-meta">{getDisplayUrl(img.url, targetOrigin)}</span>
                  </td>
                  <td>{img.naturalWidth}x{img.naturalHeight}</td>
                  <td>{img.displayWidth}x{img.displayHeight}</td>
                  <td>{ratio.toFixed(1)}x</td>
                  <td>{formatBytes(img.estimatedWastedBytes)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

**Step 2: Wire in app.tsx**

Add import and render `<OversizedImagesPanel>` after `<JsExecutionPanel>`:

```tsx
<OversizedImagesPanel
  images={activeDiagnostics?.oversizedImages}
  targetUrl={activePage?.url ?? selectedProfile?.url}
/>
```

**Step 3: Commit**

```bash
git add apps/web/src/features/diagnostics/oversized-images-panel.tsx apps/web/src/app.tsx
git commit -m "feat(web): add oversized images panel showing natural vs display dimensions"
```

---

## Task 8: Third-Party Impact Panel

**Files:**
- Create: `apps/web/src/features/diagnostics/third-party-panel.tsx`
- Modify: `apps/web/src/app.tsx`

**Step 1: Create the panel**

```tsx
// apps/web/src/features/diagnostics/third-party-panel.tsx
import type { ApiRunDetails } from '../../lib/api.js';
import { formatBytes, formatMetricValue } from '../../lib/format.js';

type ThirdPartyPanelProps = {
  summary?: NonNullable<ApiRunDetails['pageDiagnostics']>['thirdParty'];
};

export function ThirdPartyPanel({ summary }: ThirdPartyPanelProps) {
  if (!summary || summary.origins.length === 0) return null;

  return (
    <section className="panel panel-third-party" aria-labelledby="third-party-heading">
      <div className="panel-heading panel-heading-inline">
        <div>
          <p className="eyebrow">Сторонние ресурсы</p>
          <h2 id="third-party-heading">Third-Party Impact</h2>
        </div>
        <span className="workspace-context">
          {summary.origins.length} origins, {formatBytes(summary.totalTransferBytes)} total
        </span>
      </div>

      <div className="data-table-wrap">
        <table className="data-table" aria-label="Third-party origins">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Origin</th>
              <th title="Объём данных, переданных по сети">Transfer</th>
              <th title="Количество HTTP-запросов к этому origin">Запросы</th>
              <th title="Суммарное время выполнения JS от этого origin на главном потоке">JS Blocking</th>
            </tr>
          </thead>
          <tbody>
            {summary.origins.map((origin) => (
              <tr key={origin.origin}>
                <td style={{ textAlign: 'left' }}>
                  <strong className="resource-primary">{origin.origin}</strong>
                </td>
                <td>{formatBytes(origin.transferBytes)}</td>
                <td>{origin.requestCount}</td>
                <td>{origin.blockingTimeMs > 0 ? formatMetricValue('duration', origin.blockingTimeMs) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

**Step 2: Wire in app.tsx and commit**

```bash
git add apps/web/src/features/diagnostics/third-party-panel.tsx apps/web/src/app.tsx
git commit -m "feat(web): add third-party impact panel grouped by origin"
```

---

## Task 9: Individual Long Tasks in Trace Summary

Расширяем `TraceSummary` — добавляем массив individual long tasks с attribution.

**Files:**
- Modify: `apps/worker/src/collector/trace-collector.ts` — add `longTasks` to `TraceSummary`
- Modify: `apps/worker/src/collector/trace-collector.test.ts`
- Modify: `apps/worker/src/runner/live-profile.ts` — pass `ts` data into trace entries

**Step 1: Write the failing test**

```typescript
it('collects individual long tasks with optional script attribution', () => {
  const summary = summarizeTrace([
    { name: 'RunTask', duration: 120, ts: 1000 },
    { name: 'RunTask', duration: 30, ts: 2000 },
    { name: 'RunTask', duration: 75, ts: 3000, url: 'https://example.com/app.js' },
  ]);

  expect(summary.longTasks).toEqual([
    { durationMs: 120, startMs: 1000, url: undefined },
    { durationMs: 75, startMs: 3000, url: 'https://example.com/app.js' },
  ]);
});
```

**Step 2: Update `RawTraceEntry` to include optional `ts`**

```typescript
export type RawTraceEntry = {
  name: string;
  duration: number;
  url?: string;
  attributionConfidence?: 'high' | 'medium' | 'low';
  ts?: number;  // <-- NEW: timestamp in ms
};
```

**Step 3: Update `TraceSummary` and `summarizeTrace`**

```typescript
// Add to TraceSummary:
longTasks: Array<{
  durationMs: number;
  startMs?: number;
  url?: string;
}>;

// In summarizeTrace, add collection:
if (entry.name === 'RunTask' && entry.duration >= 50) {
  summary.longTasks.push({
    durationMs: entry.duration,
    startMs: entry.ts,
    url: entry.url,
  });
  // existing count/total logic
}
```

**Step 4: Update `buildTraceEntries` in live-profile.ts to pass `ts`**

```typescript
const baseEntry: RawTraceEntry = {
  name: event.name,
  duration: event.dur / 1000,
  ts: event.ts !== undefined ? event.ts / 1000 : undefined,  // <-- NEW
};
```

**Step 5: Run all tests, fix existing test expectations, commit**

```bash
git commit -m "feat(worker): collect individual long tasks with timestamps and script attribution"
```

---

## Task 10: Layout Shift Details

Собираем отдельные LayoutShift события из trace с attribution (какой элемент сдвинулся).

**Files:**
- Modify: `apps/worker/src/collector/trace-collector.ts` — add `layoutShifts` to `TraceSummary`
- Modify: `apps/worker/src/runner/live-profile.ts` — extract `LayoutShift` events from trace

**Step 1: Add to `TraceSummary`**

```typescript
layoutShifts: Array<{
  value: number;
  startMs?: number;
  sources?: string[];
}>;
```

**Step 2: Collect `LayoutShift` events in `buildTraceEntries`**

LayoutShift trace events have `ph: 'I'` (instant), not `ph: 'X'`. Need to add a second pass for instant events:

```typescript
// In buildTraceEntries, after the main loop:
for (const event of traceEvents) {
  if (event.name === 'LayoutShift' && typeof event.args?.data === 'object') {
    const data = event.args.data as any;
    entries.push({
      name: 'LayoutShift',
      duration: 0,
      ts: event.ts !== undefined ? event.ts / 1000 : undefined,
      layoutShiftValue: typeof data.score === 'number' ? data.score : undefined,
      layoutShiftSources: Array.isArray(data.impacted_nodes)
        ? data.impacted_nodes.map((n: any) => n.node_name ?? n.old_rect).filter(Boolean)
        : undefined,
    });
  }
}
```

**Step 3: Update `summarizeTrace` to collect layout shifts**

**Step 4: Tests & commit**

```bash
git commit -m "feat(worker): collect individual layout shift events from trace"
```

---

## Task 11: Forced Reflows Detection

Обнаруживаем синхронный `Layout` внутри JS execution стека — это forced reflow.

**Files:**
- Modify: `apps/worker/src/runner/live-profile.ts` — detect forced reflows from trace events
- Modify: `apps/worker/src/collector/trace-collector.ts` — add `forcedReflows` to `TraceSummary`

Forced reflows в trace выглядят как `Layout` event, где `args.beginData.stackTrace` существует (значит layout был вызван из JS, а не из обычного rendering pipeline).

```typescript
// In TraceSummary, add:
forcedReflows: Array<{
  durationMs: number;
  startMs?: number;
  url?: string;
}>;
```

Detection: в `buildTraceEntries`, если event.name === 'Layout' и `event.args?.beginData?.stackTrace` существует — это forced reflow.

**Commit:**
```bash
git commit -m "feat(worker): detect forced reflows from trace Layout events with stack traces"
```

---

## Task 12: Render-Blocking Resources + Unused Preloads + Protocol Analysis

Эти три фичи не требуют нового CDP — они вычисляются из существующих данных.

**Files:**
- Modify: `apps/worker/src/collector/page-diagnostics-collector.ts`
- Modify: `apps/worker/src/collector/page-diagnostics-collector.test.ts`

**Step 1: Render-blocking resources**

Запросы с `resourceType === 'stylesheet'` или `resourceType === 'script'` у которых `initiatorType === 'parser'` и `startTimeMs < fcpMs` — это render-blocking.

```typescript
export type RenderBlockingResource = {
  url: string;
  resourceType: string;
  durationMs: number;
  transferBytes: number;
};

// Add to PageDiagnostics:
renderBlocking: RenderBlockingResource[];
```

**Step 2: Unused preloads**

Сравниваем `<link rel="preload">` ресурсы (из response headers или from page.evaluate) с фактически загруженными.

```typescript
// Add to PageDiagnostics:
unusedPreloads: string[];
```

**Step 3: Protocol distribution**

Группируем запросы по `protocol` полю.

```typescript
// Add to PageDiagnostics:
protocolDistribution: Array<{
  protocol: string;
  requestCount: number;
  transferBytes: number;
}>;
```

**Step 4: Tests & commit**

```bash
git commit -m "feat(worker): add render-blocking, unused preloads, and protocol distribution analysis"
```

---

## Task 13: Web Panels for New Trace Features

**Files:**
- Create: `apps/web/src/features/diagnostics/long-tasks-panel.tsx`
- Create: `apps/web/src/features/diagnostics/render-blocking-panel.tsx`
- Modify: `apps/web/src/app.tsx`

Панели для:
1. Individual Long Tasks — таблица с duration, timestamp, attributed script URL
2. Render-Blocking Resources — таблица с URL, type, duration, transfer size
3. Protocol Distribution — маленькая таблица в deep metrics или отдельная секция

Layout shifts и forced reflows показываем как дополнительные deep metric items:
- `Layout Shifts` — count + total CLS value
- `Forced Reflows` — count + total duration

**Commit:**
```bash
git commit -m "feat(web): add long tasks, render-blocking, and protocol panels"
```

---

## Task 14: Integration Tests

**Files:**
- Modify: `apps/api/src/modules/runs/run-multi-page.test.ts` — add `pageDiagnostics` to mock and assertions
- Modify: `apps/web/src/features/web.test.tsx` — add oversized images / third-party panel rendering tests

**Step 1: API integration test**

Add `pageDiagnostics` mock data with DOM stats, oversized images, and third-party origins to the existing `runExecutor.mockResolvedValue()`. Assert they appear in GET `/api/runs/:id` response.

**Step 2: Web render test**

Add a test that verifies the oversized images panel renders when data is present, and hides when absent.

**Step 3: Run full test suite**

```bash
cd apps/worker && npx vitest run -v
cd apps/api && npx vitest run -v
cd apps/web && npx vitest run -v
```

**Step 4: Commit**

```bash
git commit -m "test: add integration tests for pageDiagnostics pipeline"
```

---

## Summary of Deliverables by Task

| Task | Feature | Layer |
|------|---------|-------|
| 1 | DOM stats + JS Heap collector | Worker |
| 2 | Oversized images detection | Worker |
| 3 | Third-party impact analysis | Worker |
| 4 | Integration into executeMeasuredPass | Worker |
| 5 | Runner + API pipeline | Worker + API |
| 6 | API types + deep metrics (DOM/Heap) | Web |
| 7 | Oversized Images panel | Web |
| 8 | Third-Party Impact panel | Web |
| 9 | Individual Long Tasks | Worker |
| 10 | Layout Shift details | Worker |
| 11 | Forced Reflows detection | Worker |
| 12 | Render-blocking + Unused preloads + Protocol | Worker |
| 13 | Web panels for new trace features | Web |
| 14 | Integration tests | All |

**Recommended execution order:** Tasks 1→14 последовательно. Каждый task — самостоятельный коммит. После task 8 уже будет видимый результат в UI (DOM stats, heap, oversized images, third-party). Tasks 9-13 — дополнительные trace-фичи.
