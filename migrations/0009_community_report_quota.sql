CREATE TABLE IF NOT EXISTS community_post_totals (
  activity_date TEXT PRIMARY KEY,
  post_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  last_reservation_id TEXT,
  CHECK (post_count >= 0)
);

ALTER TABLE community_post_daily ADD COLUMN last_reservation_id TEXT;
