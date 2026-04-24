# Backlog: меню алертов + автозапуск прогонов

## Контекст

Сейчас в pageperf-runner нет ни настройки алертов, ни автозапуска прогонов по
расписанию. Пользователь сам нажимает «Создать и запустить» или «Запустить»
из шаблона. Уведомления о регрессиях, если понадобятся, идут через Grafana.

Это backlog для будущего меню, когда появится конкретный запрос. Решения
ниже согласованы с пользователем 24-04-2026.

## Алерты — через Grafana Alerting, НЕ локально

**Решение:** правила хранятся и исполняются в Grafana. pageperf-runner UI
даёт только deep-link «Настроить алерт в Grafana» с предзаполненным query
(`runId`, `profileId`).

**Почему не локально:**
- PG с сырыми метриками уже у Grafana — дублировать alert manager не нужно
- В Grafana готовы нотификаторы (email, Telegram, Slack, webhook)
- Одна точка конфигурации по всей perf-платформе (ext-audit + pageperf + perflog)

**Что нужно сделать в pageperf-runner:**
- В workspace-header или на панели метрики кнопка «Создать алерт» →
  `window.open('https://grafana.perf/alerting/new?query=...', '_blank')`
- Шаблоны запросов для типовых алертов (LCP > X, CLS > Y, unused-JS % > Z)
  в `docs/alerts-cookbook.md` (не создан)

## Автозапуск — cron расписание на уровне профиля

**Решение:** каждому профилю можно задать cron-строку. Фоновый scheduler
на стороне API запускает прогоны по расписанию. Триггер — только cron,
без webhook.

**Почему не webhook:**
- На MVP нет явного потребителя webhook-триггера
- Если появится запрос «запускать прогон после деплоя» — добавим
  `POST /api/runs/:profileId/trigger` отдельно, независимо от cron

### Что нужно сделать

**Схема БД (drizzle + PG):**
```sql
CREATE TABLE run_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cron_expression text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  last_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX run_schedules_profile_id_idx ON run_schedules(profile_id);
CREATE INDEX run_schedules_enabled_idx ON run_schedules(enabled);
```

**InMemoryRunScheduleRepository** — JSON `data/run-schedules.json`. Методы
`list()`, `findByProfile(profileId)`, `upsert({profileId, cronExpression, enabled})`,
`delete(id)`, `markTriggered(id, runId)`.

**RunScheduleService** — CRUD + валидация cron-строки (использовать
`cron-parser` или `node-cron` validate).

**Routes:**
- `GET /api/profiles/:id/schedule` → текущее расписание или 404
- `PUT /api/profiles/:id/schedule` → `{cronExpression, enabled}`
- `DELETE /api/profiles/:id/schedule`

**RunScheduleRunner** — `node-cron` scheduler поверх `RunScheduleService`.
На старте читает все enabled-расписания, регистрирует таски; при CRUD
перерегистрирует. Каждый tick: `RunService.create({profileId})` +
`RunService.start(runId)`. При ошибке — не падает, только лог.

Использовать паттерн `AuthSessionScheduler` (apps/api/src/modules/auth/
auth-session-scheduler.ts) как образец.

**UI:**
- В `run-launch-form.tsx` или в отдельной кнопке на workspace-header
  модалка «Расписание прогонов»:
  - cron-строка (с пресетами «каждый день 3:00», «каждые 6 часов»,
    «каждый час», «каждую неделю в понедельник»)
  - toggle enabled
  - last_triggered_at + last_run_id (ссылка на прогон)
- `/api/profiles/:id/schedule` клиент в `web/src/lib/api.ts`

**Тесты:**
- api: CRUD расписания; валидация cron; взаимодействие runner и RunService
- web: создание/удаление расписания; отображение last_triggered_at

## Когда реализовать

**Триггер алертов:** появится первый инцидент, когда пропустили регрессию.
До этого — ручной обход Grafana раз в неделю.

**Триггер cron:** появится запрос «LCP стало падать, хочу тренд по дням
без ручных прогонов».

## Оценка

- Алерты: 0.5 дня (только UI кнопки + cookbook)
- Автозапуск: 1.5-2 дня (schema, migration, repository, service, runner,
  routes, web UI, тесты)

## Связанные файлы

- `apps/api/src/modules/auth/auth-session-scheduler.ts` — образец node-cron
- `apps/api/src/modules/profiles/profile.service.ts` — владелец профиля
- `apps/api/src/modules/runs/run.service.ts` — create + start
- `apps/api/src/db/schema.ts` — добавить run_schedules
- `apps/api/drizzle/` — новая миграция
- `apps/web/src/features/runs/run-launch-form.tsx` — UI настройки
