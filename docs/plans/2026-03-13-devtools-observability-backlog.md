# DevTools Observability Backlog

## Current Coverage

WebPerf Hub already persists a useful subset of Chrome DevTools performance data:

- page stages: `TTFB`, `FP`, `FCP`, `DCL`, `LOAD`
- request-level timings: total request duration
- request sizes:
  - `transferSize`
  - `encodedBodySize`
  - `decodedBodySize`
- cache signals:
  - memory cache
  - disk cache
  - revalidation
- compression signal:
  - `content-encoding`
- resource typing:
  - `document`
  - `script`
  - `stylesheet`
  - `image`
  - other request classes
- coverage summary:
  - JS used/unused bytes
  - CSS used/unused bytes
- trace summary:
  - critical chain count
  - main-thread script/layout/paint/other buckets

This is enough for first-line diagnostics of payload size, cache value, compression expansion, and coarse page stages.

## Gaps vs Chrome DevTools

Chrome DevTools can still provide more detail than WebPerf Hub currently persists or visualizes.

### 1. Full Waterfall Phases

Persist per-request phase breakdown instead of only total duration:

- queueing / stalled
- DNS lookup
- initial connection
- SSL handshake
- request sent
- waiting for server response
- content download

This is needed to explain *why* a request is slow, not only *that* it is slow.

### 2. More Response Metadata

Persist and show:

- `cache-control`
- `etag`
- `last-modified`
- `expires`
- `content-type`
- `priority`
- transport protocol: `h2`, `h3`, `http/1.1`

This is needed for real cache-policy and compression investigations.

### 3. Initiator / Dependency Chain

Persist request initiator and dependency source:

- parser
- script
- preload
- fetch/xhr
- redirect parent

This is needed to understand why non-critical assets are loaded early.

### 4. Richer Trace Metrics

Add more of the information normally explored in DevTools Performance:

- long tasks
- total blocking time approximation
- parse/eval split for JS
- style recalculation
- layout
- paint
- composite
- task timeline for first screen

### 5. Web Vitals

Persist and show:

- `LCP`
- `CLS`
- `INP`

These are important for user-facing UX diagnostics and future Grafana dashboards.

### 6. Coverage by Resource

Current UI exposes totals only. Add per-resource coverage:

- JS unused bytes per file
- CSS unused bytes per file
- top waste ranking

This is needed to justify lazy loading, pruning, or bundle trimming.

### 7. Render-Blocking Attribution

Persist whether a resource is render-blocking and why it was in the critical path.

### 8. Waterfall UI

Add a visual request waterfall similar to Chrome DevTools Network:

- start time
- finish time
- phase composition
- overlap between requests

## Recommended Next Order

1. per-request timing phases
2. richer response headers and protocol
3. LCP / CLS / INP
4. per-resource coverage
5. waterfall UI
6. richer trace slices and long tasks

## Not Required For MVP

- exact decompression CPU time isolated from parse/eval
- full Chrome trace viewer parity
- continuous RUM ingestion
