CREATE TABLE IF NOT EXISTS quiz_accounts (
  id TEXT PRIMARY KEY,
  username_normalized TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES quiz_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_account ON quiz_sessions(account_id, expires_at);

CREATE TABLE IF NOT EXISTS quiz_challenges (
  id_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  question_ids TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES quiz_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_quiz_challenges_account ON quiz_challenges(account_id, expires_at);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 10),
  total INTEGER NOT NULL CHECK(total = 10),
  completed_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES quiz_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_ranking ON quiz_attempts(difficulty, score DESC, completed_at ASC);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_account ON quiz_attempts(account_id, difficulty, score DESC);

CREATE TABLE IF NOT EXISTS quiz_rate_limits (
  bucket TEXT NOT NULL,
  client_hash TEXT NOT NULL,
  request_count INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (bucket, client_hash)
);
CREATE INDEX IF NOT EXISTS idx_quiz_rate_limits_expiry ON quiz_rate_limits(expires_at);
