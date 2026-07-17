CREATE TABLE IF NOT EXISTS community_reports (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  weather TEXT NOT NULL,
  comment TEXT,
  sensation TEXT,
  temperature_tenths INTEGER,
  hazards_json TEXT NOT NULL DEFAULT '[]',
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  area_code TEXT,
  area_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES quiz_accounts(id) ON DELETE CASCADE,
  CHECK (temperature_tenths IS NULL OR temperature_tenths BETWEEN -500 AND 600),
  CHECK (comment IS NULL OR length(comment) <= 80)
);

CREATE INDEX IF NOT EXISTS idx_community_reports_expiry
  ON community_reports(expires_at);

CREATE INDEX IF NOT EXISTS idx_community_reports_recent
  ON community_reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_reports_account
  ON community_reports(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_reports_location
  ON community_reports(latitude, longitude, expires_at);

CREATE TABLE IF NOT EXISTS community_report_flags (
  report_id TEXT NOT NULL,
  reporter_account_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (report_id, reporter_account_id),
  FOREIGN KEY (report_id) REFERENCES community_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (reporter_account_id) REFERENCES quiz_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_post_daily (
  account_id TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  post_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (account_id, activity_date),
  FOREIGN KEY (account_id) REFERENCES quiz_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_community_post_daily_expiry
  ON community_post_daily(expires_at);
