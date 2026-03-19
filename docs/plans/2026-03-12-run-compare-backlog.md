# Run Compare Backlog

## Goal

Отложить полноценное сравнение прогонов в отдельный backlog, не смешивая это с текущей доработкой asset explorer.

## Scope

- Выбор baseline-прогона для страницы или профиля.
- Ручное сравнение двух конкретных прогонов.
- Дельты по page metrics: `TTFB`, `FP`, `FCP`, `DCL`, `LOAD`.
- Дельты по ассетам: новые, исчезнувшие, выросшие по `encoded`, `decoded`, `duration`.
- Дельты по request count, compression mix и heavy assets.
- Отдельный compare-view в UI.
- API endpoint для получения нормализованного diff.

## Suggested Milestones

### 1. Data model

- Добавить сущность baseline на уровне profile или page.
- Зафиксировать формат `run diff summary`.
- Подготовить AI-friendly snapshot для сравнения двух прогонов.

### 2. API

- `GET /api/runs/:id/compare/:otherRunId`
- `GET /api/profiles/:id/baseline`
- `POST /api/profiles/:id/baseline`

### 3. UI

- Выбор второго прогона из sidebar или compare modal.
- Отдельная compare-panel вместо текущей заглушки.
- Таблица regressions/improvements по page metrics и ассетам.

### 4. Reporting

- JSON export сравнения.
- Позже: Grafana-ready aggregate views по regressions.

## Not In Scope Now

- Автоматические regression alerts.
- Исторические тренды по десяткам прогонов.
- Полноценный waterfall-diff.
- Baseline syncing между стендами.
