CREATE TABLE usage_operations (
  owner_id TEXT NOT NULL, request_id TEXT NOT NULL,
  kind TEXT NOT NULL, day_utc TEXT NOT NULL,
  request_hash TEXT NOT NULL, state TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT,
  PRIMARY KEY(owner_id, request_id)
);
CREATE INDEX usage_by_day ON usage_operations(owner_id, day_utc, kind);
