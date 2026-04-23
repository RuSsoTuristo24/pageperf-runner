# Backlog: полный PG-ingest (вариант B)

## Контекст

Сейчас `RunIngestService` пишет в `InMemoryRunRepository` / `InMemoryProfileRepository`,
которые держат состояние в JSON-файлах под `storage/data/`. Вариант **A** перевёл
на PostgreSQL только те сущности, которые нужны Grafana-дашбордам и alert-rules:
`profiles`, `runs`, `page_metrics`, `requests`.

Остальные поля прогона остались в JSON-файлах и читаются только UI-ом
(`apps/web`). Ниже — что можно перенести в PG позже, когда появится
соответствующий дашборд/алерт.

## Что не перенесено

| Поле | Что хранит | Возможный Grafana-запрос |
|---|---|---|
| `passes[]` (cold/warm) | Для каждого прогона до двух «прогонов» с разным кэшем: `pageMetrics`, `requests` отдельно на cold и warm | Trend «cold/warm gap» по порталу, алерт на деградацию warm-кеша |
| `pages[]` (multi-page) | Для профиля с несколькими URL — метрики разбиты по страницам | Panel «метрики per-page», сравнение страниц одного портала |
| `traceSummary` | Агрегат Chromium-trace: фазы, TBT contributions | Timeseries «TBT over time» |
| `jsExecutionSummary` | Time-by-script breakdown с confidence-бейджами | «Top-N самых медленных JS-файлов» |
| `coverageSummary` | Процент unused JS / CSS | Timeseries «unused JS %» — раннее-предупреждение о bloat |
| `pageDiagnostics` | Long tasks, Layout Shift contributors, oversized images, third-party, render-blocking | Алерт «long tasks > 10 за неделю», панели «heavy third-party» |
| `artifacts[]` | Пути к файлам артефактов (`ai_snapshot.json`, HAR, trace) | Не нужны в Grafana — остаются ссылками в UI |

## Что требуется перед этим

1. **Новые таблицы в `apps/api/src/db/schema.ts`:**
   - `run_passes (id, run_id, label, created_at)` — ключ для привязки per-pass page_metrics/requests. Или `page_metrics.pass_id`, `requests.pass_id` (nullable).
   - `run_pages (id, run_id, page_key, url)` — многостраничный профиль.
   - `run_diagnostics (run_id PK, long_tasks_count, cls_score, oversized_images_count, render_blocking_count, third_party_count, details JSONB)` — плоский агрегат + raw в JSONB для UI.
   - `run_js_execution (id, run_id, script_url, duration_ms, confidence, ...)`.
   - `run_coverage (run_id PK, unused_js_pct, unused_css_pct, ...)`.
   - `run_trace (run_id PK, tbt_ms, largest_paint_ms, ...)`.

2. **Миграция drizzle-kit** — `0001_*.sql` + `meta/_journal.json` обновление.

3. **Расширить `RunIngestService.ingest(...)`** — писать все поля.

4. **`PgRunRepository`** — методы `getDetails(runId)` собирают данные из всех таблиц и строят `RunDetails` (обратно совместимая форма для UI).

5. **Миграция JSON → PG** для существующих прогонов — либо batch-скрипт, либо оставить JSON и начинать с чистой БД (для исторических дашбордов нужен либо backfill, либо accept-loss).

6. **Тесты repository + service** для всего нового.

7. **Удалить** `InMemoryRunRepository` / JSON-файловый код, когда всё зеленое.

## Сколько это

~1-2 дня работы одного разработчика. 80% механической (schema + migration + CRUD).
Сложное место — ingest для `pageDiagnostics` и `jsExecutionSummary` (неплоские
структуры с переменным количеством элементов).

## Когда триггерить

- Когда появится запрос «покажите тренд X в Grafana» для любого из полей в таблице.
- Когда начнёт жать storage (JSON-файлы могут расти, если прогонов много — 1 прогон ~500KB-1MB).
- Если понадобится многоузловой deploy: JSON-файлы не переносятся между инстансами, PG — да.

## Связанные файлы

- `apps/api/src/modules/runs/run.repository.ts` — InMemoryRunRepository (удалить после B)
- `apps/api/src/modules/profiles/profile.repository.ts` — (удалить после B)
- `apps/api/src/modules/ingest/run-ingest.service.ts` — расширить ingest
- `apps/api/src/db/schema.ts` — расширить схему
- `apps/api/drizzle/` — добавить миграцию
