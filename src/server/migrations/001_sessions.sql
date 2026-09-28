CREATE TABLE learning_sessions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  payload TEXT,
  deleted_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK ((deleted_at IS NULL AND payload IS NOT NULL)
    OR (deleted_at IS NOT NULL AND payload IS NULL))
);
CREATE INDEX sessions_by_owner ON learning_sessions(owner_id, updated_at);
CREATE TABLE save_keys (
  owner_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  session_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  PRIMARY KEY(owner_id, idempotency_key)
);
CREATE INDEX save_keys_by_session ON save_keys(owner_id, session_id);
