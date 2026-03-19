CREATE VIEW run_summary AS
SELECT
  r.id AS run_id,
  r.profile_id,
  r.status,
  COUNT(DISTINCT req.id) AS request_count,
  COALESCE(SUM(req.encoded_body_size), 0) AS encoded_bytes,
  COALESCE(SUM(req.decoded_body_size), 0) AS decoded_bytes,
  MAX(CASE WHEN pm.name = 'ttfb' THEN pm.value END) AS ttfb_ms,
  MAX(CASE WHEN pm.name = 'fcp' THEN pm.value END) AS fcp_ms,
  MAX(CASE WHEN pm.name = 'load' THEN pm.value END) AS load_ms
FROM runs r
LEFT JOIN requests req ON req.run_id = r.id
LEFT JOIN page_metrics pm ON pm.run_id = r.id
GROUP BY r.id, r.profile_id, r.status;

CREATE VIEW run_issue_summary AS
SELECT
  r.id AS run_id,
  COUNT(i.id) AS issue_count,
  SUM(CASE WHEN i.severity = 'critical' THEN 1 ELSE 0 END) AS critical_issue_count
FROM runs r
LEFT JOIN issues i ON i.run_id = r.id
GROUP BY r.id;
