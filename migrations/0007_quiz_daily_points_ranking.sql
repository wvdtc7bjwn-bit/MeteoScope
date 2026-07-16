DROP INDEX IF EXISTS idx_quiz_best_scores_ranking;
DROP TABLE IF EXISTS quiz_best_scores;

CREATE TABLE IF NOT EXISTS quiz_daily_scores (
  ranking_date TEXT NOT NULL,
  account_id TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('beginner', 'intermediate', 'advanced')),
  points INTEGER NOT NULL CHECK(points >= 0),
  attempt_count INTEGER NOT NULL CHECK(attempt_count >= 1),
  completed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ranking_date, account_id, difficulty),
  FOREIGN KEY (account_id) REFERENCES quiz_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quiz_daily_scores_ranking
  ON quiz_daily_scores(ranking_date, difficulty, points DESC, completed_at ASC, account_id ASC);

INSERT OR IGNORE INTO quiz_daily_scores
  (ranking_date, account_id, difficulty, points, attempt_count, completed_at, updated_at)
SELECT date(attempts.completed_at, '+9 hours'),
       attempts.account_id,
       attempts.difficulty,
       SUM(attempts.score),
       COUNT(*),
       MAX(attempts.completed_at),
       MAX(attempts.completed_at)
FROM quiz_attempts attempts
WHERE date(attempts.completed_at, '+9 hours') = date('now', '+9 hours')
GROUP BY attempts.account_id, attempts.difficulty;
