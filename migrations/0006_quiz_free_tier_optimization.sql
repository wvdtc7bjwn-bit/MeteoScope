CREATE TABLE IF NOT EXISTS quiz_best_scores (
  account_id TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('beginner', 'intermediate', 'advanced')),
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 10),
  total INTEGER NOT NULL CHECK(total = 10),
  completed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, difficulty),
  FOREIGN KEY (account_id) REFERENCES quiz_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quiz_best_scores_ranking
  ON quiz_best_scores(difficulty, score DESC, completed_at ASC, account_id ASC);

CREATE TABLE IF NOT EXISTS quiz_daily_active (
  activity_date TEXT NOT NULL,
  account_id TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  PRIMARY KEY (activity_date, account_id),
  FOREIGN KEY (account_id) REFERENCES quiz_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quiz_daily_active_account
  ON quiz_daily_active(account_id, activity_date DESC);

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_expires
  ON quiz_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_quiz_challenges_expires
  ON quiz_challenges(expires_at);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_completed
  ON quiz_attempts(completed_at);

INSERT OR IGNORE INTO quiz_best_scores
  (account_id, difficulty, score, total, completed_at, updated_at)
SELECT attempts.account_id,
       attempts.difficulty,
       scores.score,
       10,
       MIN(attempts.completed_at),
       MAX(attempts.completed_at)
FROM quiz_attempts attempts
JOIN (
  SELECT account_id, difficulty, MAX(score) AS score
  FROM quiz_attempts
  GROUP BY account_id, difficulty
) scores
  ON scores.account_id = attempts.account_id
 AND scores.difficulty = attempts.difficulty
 AND scores.score = attempts.score
GROUP BY attempts.account_id, attempts.difficulty, scores.score;
