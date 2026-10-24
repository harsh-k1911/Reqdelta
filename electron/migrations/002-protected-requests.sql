-- Version 1 has no request-saving UI. Its collections and history stay in place.
CREATE TABLE saved_requests_next (
  id INTEGER PRIMARY KEY,
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  method TEXT NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE')),
  request_encrypted BLOB NOT NULL
    CHECK (typeof(request_encrypted) = 'blob' AND length(request_encrypted) BETWEEN 1 AND 3145728),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

DROP TABLE saved_requests;
ALTER TABLE saved_requests_next RENAME TO saved_requests;
CREATE INDEX saved_requests_collection_idx ON saved_requests(collection_id, updated_at DESC, id DESC);
