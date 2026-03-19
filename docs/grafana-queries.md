# Grafana Queries

`WebPerf Hub` exposes SQL-ready summary views intended for Grafana dashboards.

## Expected Views

- `run_summary`
- `run_issue_summary`

## Example Panels

### Run Overview

```sql
SELECT
  run_id,
  profile_id,
  status,
  request_count,
  encoded_bytes,
  decoded_bytes,
  ttfb_ms,
  fcp_ms,
  load_ms
FROM run_summary
ORDER BY run_id DESC;
```

### Issue Counts

```sql
SELECT
  run_id,
  issue_count,
  critical_issue_count
FROM run_issue_summary
ORDER BY run_id DESC;
```
