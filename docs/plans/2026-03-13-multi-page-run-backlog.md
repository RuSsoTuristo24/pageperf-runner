# Multi-Page Run Backlog

## Goal

Добавить возможность запускать один job по нескольким страницам и сохранять результат по каждой странице отдельно, но в рамках общего запуска.

## Why

- Упростить прогон типового набора Bitrix-страниц.
- Получать одну сессию измерения для набора сценариев.
- Упростить пакетный экспорт для LLM и дальнейшее сравнение.

## Scope

- Один launch action в UI для списка URL.
- Один parent run job.
- Отдельный child result на каждую страницу.
- Отдельные page metrics, requests, assets, coverage, trace summary для каждой страницы.
- Отдельная вкладка со списком страниц внутри batch-run.

## Suggested Model

- `run_batch`
- `run_batch_item`
- `run_batch_item_result`

Либо, в файловом persistence MVP:

- `batch.json`
- `items/<item-id>.json`

## UI Expectations

- В форме запуска можно добавить несколько URL.
- После старта виден parent batch.
- Внутри batch можно выбрать конкретную страницу и смотреть её текущий привычный `Requests / Assets / Mantis Watch / LLM Report`.

## Out of Scope For This Step

- Compare between batch items
- Parallel execution tuning
- Shared baseline across batch pages
