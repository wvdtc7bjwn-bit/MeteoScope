CREATE TABLE IF NOT EXISTS ios_push_subscriptions (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ios_push_subscription_environment
  ON ios_push_subscriptions (environment, updated_at DESC);
