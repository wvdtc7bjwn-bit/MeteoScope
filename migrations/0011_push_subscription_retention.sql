CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated_at
  ON push_subscriptions (updated_at);
