CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_pending_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_pending_subscription
  ON push_pending_messages (subscription_id, id DESC);

CREATE TABLE IF NOT EXISTS push_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
