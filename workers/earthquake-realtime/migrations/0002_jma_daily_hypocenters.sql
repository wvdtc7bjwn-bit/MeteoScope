CREATE TABLE IF NOT EXISTS jma_daily_hypocenter_days (
  source_date TEXT PRIMARY KEY,
  record_count INTEGER NOT NULL,
  payload_bytes INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jma_daily_hypocenter_sync (
  source_date TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  fetched_at TEXT,
  error TEXT
);
