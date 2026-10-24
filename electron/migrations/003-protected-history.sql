-- History was not recorded by earlier interfaces. Startup checks it is empty.
DROP TABLE request_history;
CREATE TABLE request_history (
  id INTEGER PRIMARY KEY,
  saved_request_id INTEGER REFERENCES saved_requests(id) ON DELETE SET NULL,
  method TEXT NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE')),
  status_code INTEGER CHECK (status_code BETWEEN 100 AND 999),
  error_code TEXT CHECK (length(error_code) BETWEEN 1 AND 80),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  snapshot_encrypted BLOB NOT NULL
    CHECK (typeof(snapshot_encrypted) = 'blob' AND length(snapshot_encrypted) BETWEEN 1 AND 17825792),
  executed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (status_code IS NOT NULL AND error_code IS NULL)
    OR (status_code IS NULL AND error_code IS NOT NULL)
  )
);
CREATE INDEX request_history_executed_idx ON request_history(executed_at DESC, id DESC);
CREATE INDEX request_history_saved_request_idx ON request_history(saved_request_id);
