export const UPSERT_QUIZ_DAILY_SCORE_SQL = `
  INSERT INTO quiz_daily_scores
    (ranking_date, account_id, difficulty, points, attempt_count, completed_at, updated_at)
  VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)
  ON CONFLICT(ranking_date, account_id, difficulty) DO UPDATE SET
    points = quiz_daily_scores.points + excluded.points,
    attempt_count = quiz_daily_scores.attempt_count + 1,
    completed_at = excluded.completed_at,
    updated_at = excluded.updated_at
`;

export const PUBLIC_QUIZ_LEADERBOARD_SQL = `
  SELECT accounts.display_name, scores.points, scores.attempt_count, scores.completed_at
  FROM quiz_daily_scores scores
  JOIN quiz_accounts accounts ON accounts.id = scores.account_id
  WHERE scores.ranking_date = ?1 AND scores.difficulty = ?2
  ORDER BY scores.points DESC, scores.completed_at ASC, scores.account_id ASC
  LIMIT ?3
`;

export const CURRENT_USER_QUIZ_RANK_SQL = `
  WITH ranked AS (
    SELECT account_id,
           points,
           attempt_count,
           completed_at,
           ROW_NUMBER() OVER (
             ORDER BY points DESC, completed_at ASC, account_id ASC
           ) AS rank
    FROM quiz_daily_scores
    WHERE ranking_date = ?1 AND difficulty = ?2
  )
  SELECT rank, points, attempt_count, completed_at
  FROM ranked
  WHERE account_id = ?3
  LIMIT 1
`;

export function quizRankingDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const valid = Number.isFinite(date.getTime()) ? date : new Date();
  return new Date(valid.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
