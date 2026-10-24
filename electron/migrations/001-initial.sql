CREATE TABLE collections (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE saved_requests (
  id INTEGER PRIMARY KEY,
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  method TEXT NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE')),
  url TEXT NOT NULL CHECK (length(trim(url)) > 0),
  query_params_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(query_params_json) AND json_type(query_params_json) = 'array'),
  headers_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(headers_json) AND json_type(headers_json) = 'array'),
  body_mode TEXT NOT NULL DEFAULT 'none' CHECK (body_mode IN ('none', 'json')),
  body_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (method != 'GET' OR body_mode = 'none'),
  CHECK (body_mode = 'none' OR json_valid(body_text))
);

CREATE TABLE request_history (
  id INTEGER PRIMARY KEY,
  saved_request_id INTEGER REFERENCES saved_requests(id) ON DELETE SET NULL,
  request_snapshot_json TEXT NOT NULL
    CHECK (json_valid(request_snapshot_json) AND json_type(request_snapshot_json) = 'object'),
  response_snapshot_json TEXT
    CHECK (response_snapshot_json IS NULL OR (json_valid(response_snapshot_json) AND json_type(response_snapshot_json) = 'object')),
  error_code TEXT,
  error_message TEXT,
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  executed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (response_snapshot_json IS NOT NULL AND error_code IS NULL AND error_message IS NULL)
    OR (response_snapshot_json IS NULL AND error_code IS NOT NULL AND error_message IS NOT NULL)
  )
);

CREATE INDEX saved_requests_collection_idx ON saved_requests(collection_id, updated_at DESC, id DESC);
CREATE INDEX request_history_executed_idx ON request_history(executed_at DESC, id DESC);
CREATE INDEX request_history_saved_request_idx ON request_history(saved_request_id);
