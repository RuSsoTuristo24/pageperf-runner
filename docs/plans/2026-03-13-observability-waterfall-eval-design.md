# WebPerf Hub Observability Design

**Date:** 2026-03-13

**Status:** Implemented

**Goal:** добавить в WebPerf Hub полноценную page-level observability для multi-page run: request waterfall, initiator/dependency chain и best-effort attribution `parse/eval` к конкретным JS-ассетам.

## Current State

WebPerf Hub уже умеет:

- запускать один run по нескольким страницам в рамках `run + pages[]`
- сохранять page metrics, requests, trace summary и coverage summary для каждой страницы
- переключать страницу внутри одного run в UI

Реализовано в текущей версии:

- request timing сохраняется с фазами `start/end/queueing/dns/connect/ssl/requestSent/waiting/download`
- request metadata включает `initiatorType`, `initiatorUrl`, `redirectParentUrl`, `protocol`, `priority`
- UI показывает request waterfall для выбранной страницы/pass
- `JS Execution` показывает best-effort per-resource attribution для `parse/eval/total`
- данные отдаются и на top-level run, и на `pages[]`, и на `passes[]`
- старые saved runs открываются через normalizer без падения UI

## Decision

Не вводить отдельные сущности `run_batch / run_batch_item` на этом этапе.

Причины:

- текущая модель `run + pages[]` уже закрывает multi-page use case
- waterfall/eval attribution являются per-page observability проблемой, а не batch-моделью
- переписывание доменной модели здесь не даёт пропорциональной пользы

Новая observability будет встраиваться в существующий `RunPageRecord` и top-level `RunDetails`.

## Scope

### In Scope

- per-request phase timings:
  - `startTimeMs`
  - `endTimeMs`
  - `queueingMs`
  - `dnsMs`
  - `connectMs`
  - `sslMs`
  - `requestSentMs`
  - `waitingMs`
  - `downloadMs`
- response metadata:
  - `protocol`
  - `priority`
- initiator/dependency metadata:
  - `initiatorType`
  - `initiatorUrl`
  - `redirectParentUrl`
- visual waterfall UI
- best-effort JS CPU attribution:
  - `parseMs`
  - `evaluateMs`
  - `attributionConfidence`
- ranking UI for JS execution hotspots
- backward compatibility for old saved runs

### Out of Scope

- full Chrome trace viewer parity
- full task flamechart UI
- exact decompression CPU attribution
- perfect 100% accurate ownership of every `FunctionCall` for every runtime scenario
- migration to `run_batch` entities

## Data Model

### Request record extension

Existing `RequestRecord` expands with:

```ts
type RequestTimingBreakdown = {
  startTimeMs?: number;
  endTimeMs?: number;
  queueingMs?: number;
  dnsMs?: number;
  connectMs?: number;
  sslMs?: number;
  requestSentMs?: number;
  waitingMs?: number;
  downloadMs?: number;
};

type RequestDependency = {
  initiatorType?: 'parser' | 'script' | 'preload' | 'fetch' | 'xmlhttprequest' | 'other';
  initiatorUrl?: string;
  redirectParentUrl?: string;
  protocol?: string;
  priority?: string;
};
```

Эти поля сохраняются как в top-level `requests`, так и в `pages[].requests`, и в `passes[].requests`.

### JS execution attribution

Новый page-level блок:

```ts
type JsExecutionSummary = {
  resources: Array<{
    url: string;
    parseMs: number;
    evaluateMs: number;
    totalMs: number;
    attributionConfidence: 'high' | 'medium' | 'low';
  }>;
  unattributed: {
    parseMs: number;
    evaluateMs: number;
    totalMs: number;
  };
};
```

Он хранится рядом с `traceSummary` и описывает не просто агрегаты страницы, а попытку привязать CPU time к конкретным JS URL.

## Collection Strategy

### 1. Network waterfall

Источник данных: CDP `Network.*`.

Нужные события:

- `Network.requestWillBeSent`
- `Network.requestWillBeSentExtraInfo`
- `Network.responseReceived`
- `Network.responseReceivedExtraInfo`
- `Network.dataReceived`
- `Network.loadingFinished`

Также используется `response.timing`, если Chrome его отдаёт. Именно он даёт near-DevTools раскладку по фазам.

Если часть timing-полей отсутствует:

- сохраняем доступную частичную фазовую картину
- не выдумываем значения
- оставляем недостающие фазы `undefined`

### 2. Initiator / dependency chain

Источник данных:

- `requestWillBeSent.initiator`
- redirect linkage по `redirectResponse`
- request URL map

Mapping:

- `parser` -> HTML parser
- `script` -> JS-инитированный запрос
- `preload` -> preload/prefetch path
- `fetch` / `xmlhttprequest` -> runtime network API
- redirect parent -> предыдущий URL в цепочке

### 3. JS parse/eval attribution

Источник данных: trace events из `Tracing.start(...)`.

Используем:

- `CompileScript`
- `V8.CompileCode`
- `EvaluateScript`
- `FunctionCall`
- `V8.Execute`

Attribution pipeline:

1. Сначала извлекаем trace events, где URL доступен напрямую.
2. Затем пробуем привязать event через stack / call frame / script metadata.
3. Затем fallback к initiator/request mapping.
4. Всё, что не удалось уверенно сопоставить, уходит в `unattributed`.

Важно: `FunctionCall` не всегда можно безошибочно связать с отдельным файлом. Поэтому attribution обязан хранить `attributionConfidence`.

## Confidence Model

### `high`

- trace event содержит URL скрипта напрямую
- либо есть однозначный script id -> URL mapping

### `medium`

- event привязан через stack / initiator chain, но есть несколько возможных источников

### `low`

- event отнесён к URL по эвристике
- либо агрегирован в bucket “наиболее вероятный ресурс”

Если уверенности недостаточно даже для `low`, время остаётся в `unattributed`.

## API Contract

API продолжает возвращать `RunDetails`, но расширяет его:

```ts
type ApiRunDetails = {
  ...
  jsExecutionSummary?: JsExecutionSummary;
  passes?: Array<{
    ...
    jsExecutionSummary?: JsExecutionSummary;
  }>;
  pages?: Array<{
    ...
    jsExecutionSummary?: JsExecutionSummary;
    passes?: Array<{
      ...
      jsExecutionSummary?: JsExecutionSummary;
    }>;
  }>;
};
```

Backward compatibility:

- старые runs без новых полей продолжают открываться
- старые `traceSummary` нормализуются в текущую схему
- UI должен рендерить waterfall/eval-блоки в деградированном режиме, если данные отсутствуют

## UI Design

### Requests

Существующая таблица `Requests` сохраняет текущую компактную табличную форму и получает отдельную waterfall-панель над таблицей. Metadata `initiator/protocol/priority` сейчас отображается внутри waterfall row, а не как постоянные дополнительные колонки таблицы.

### Waterfall panel

Новый компонент показывает:

- абсолютный старт request относительно navigation start
- полную длительность
- фазовую разбивку цветными сегментами
- overlap между requests
- inline breakdown по фазам

### JS Execution panel

Новый panel в overview/workspace показывает:

- top JS resources by `totalMs`
- отдельные колонки `parse`, `eval`, `total`
- badge confidence
- unattributed summary

### UX principle

Waterfall и JS execution должны быть связаны:

- сейчас связь реализована через общий URL/resource label и выбор active page/pass
- прямой cross-highlight между rows пока не реализован

## Risks

### 1. Trace attribution is imperfect

Это не баг, а свойство источника данных. Решение:

- хранить confidence
- отдельно показывать unattributed bucket
- не выдавать attribution как абсолютную истину

### 2. Old runs without new fields

Решение:

- normalizer на API и web client
- UI fallback на отсутствующие поля

### 3. Payload growth

Waterfall phases и per-resource execution увеличат размер saved runs.

Решение:

- хранить только нужные поля
- не сохранять сырой trace полностью в run details
- при необходимости тяжёлые raw artifacts оставлять в `storage/artifacts/<run-id>/`

## Implementation Notes

Фактически реализовано:

1. расширен request schema и persistence
2. добавлен сбор waterfall phases + initiator chain
3. добавлен waterfall UI
4. добавлен `jsExecutionSummary` с confidence/unattributed
5. добавлен `JS Execution` panel
6. сохранена backward compatibility для legacy run details

Не реализовано в этом батче:

- tooltip/cross-highlight UX для waterfall
- отдельный UI dependency graph
- расширение `LLM Report` новыми JS execution hotspot'ами

## Rollout Order

1. расширить network schema и persistence
2. собрать waterfall phases + initiator chain
3. отрисовать waterfall UI
4. собрать JS attribution summary
5. отрисовать JS execution UI
6. проверить backward compatibility на старых run files

## Success Criteria

- старые saved runs открываются без чёрного экрана
- новые runs показывают waterfall по requests
- по каждому request виден initiator
- по JS-ассетам доступен ranking по parse/eval
- UI явно помечает точность attribution
- multi-page runs продолжают работать в той же модели `run + pages[]`
