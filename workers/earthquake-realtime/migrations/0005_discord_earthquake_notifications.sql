CREATE TABLE IF NOT EXISTS discord_earthquake_notifications (
  event_id TEXT PRIMARY KEY,
  source_date TEXT NOT NULL,
  entry_url TEXT NOT NULL,
  entry_updated TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  discord_message_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_discord_earthquake_notifications_delivery
ON discord_earthquake_notifications(status, next_attempt_at, entry_updated);

CREATE INDEX IF NOT EXISTS idx_discord_earthquake_notifications_date
ON discord_earthquake_notifications(source_date);
