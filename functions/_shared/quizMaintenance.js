import { readJson, requireD1, writeJson } from "./d1Store.js";
import { quizRankingDate } from "./quizStorage.js";

const MAINTENANCE_KEY = "quiz-maintenance-health";
const DEFAULT_ATTEMPT_RETENTION_DAYS = 15;
const DAILY_ACTIVITY_RETENTION_DAYS = 90;

export function quizAttemptRetentionDays(env = {}) {
  const configured = Number.parseInt(env.QUIZ_ATTEMPT_RETENTION_DAYS, 10);
  if (!Number.isFinite(configured)) return DEFAULT_ATTEMPT_RETENTION_DAYS;
  return Math.min(365, Math.max(7, configured));
}

export async function recordQuizDailyActivity(db, accountID, now = new Date()) {
  if (!accountID) return;
  const observedAt = validDate(now).toISOString();
  await requireD1(db).prepare(
    `INSERT OR IGNORE INTO quiz_daily_active
       (activity_date, account_id, first_seen_at)
     VALUES (?1, ?2, ?3)`
  ).bind(observedAt.slice(0, 10), accountID, observedAt).run();
}

export async function runQuizMaintenance(env, options = {}) {
  const db = requireD1(env.NOTIFICATIONS_DB);
  const now = validDate(options.now ?? new Date());
  const retentionDays = quizAttemptRetentionDays(env);
  const attemptCutoff = new Date(now.getTime() - retentionDays * 86400000).toISOString();
  const activityCutoff = new Date(now.getTime() - DAILY_ACTIVITY_RETENTION_DAYS * 86400000)
    .toISOString().slice(0, 10);
  const nowISO = now.toISOString();
  const rankingDate = quizRankingDate(now);
  const results = await db.batch([
    db.prepare("DELETE FROM quiz_daily_scores WHERE ranking_date < ?1").bind(rankingDate),
    db.prepare("DELETE FROM quiz_attempts WHERE completed_at < ?1").bind(attemptCutoff),
    db.prepare("DELETE FROM quiz_sessions WHERE expires_at <= ?1").bind(nowISO),
    db.prepare("DELETE FROM quiz_challenges WHERE expires_at <= ?1").bind(nowISO),
    db.prepare("DELETE FROM quiz_rate_limits WHERE expires_at <= ?1").bind(nowISO),
    db.prepare("DELETE FROM quiz_daily_active WHERE activity_date < ?1").bind(activityCutoff)
  ]);
  const deleted = results.reduce((sum, result) => sum + Number(result?.meta?.changes ?? 0), 0);
  const health = {
    completedAt: nowISO,
    attemptRetentionDays: retentionDays,
    attemptCutoff,
    deletedRows: deleted
  };
  await writeJson(db, MAINTENANCE_KEY, health);
  return health;
}

export async function readQuizOperationalMetrics(env, options = {}) {
  if (!env.NOTIFICATIONS_DB) return { configured: false };
  const now = validDate(options.now ?? new Date());
  const today = now.toISOString().slice(0, 10);
  const last24Hours = new Date(now.getTime() - 86400000).toISOString();
  try {
    const row = await env.NOTIFICATIONS_DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM quiz_accounts) AS account_count,
         (SELECT COUNT(*) FROM quiz_daily_active WHERE activity_date = ?1) AS daily_active_accounts,
         (SELECT COUNT(*) FROM quiz_attempts WHERE completed_at >= ?2) AS attempts_24h,
         (SELECT COUNT(*) FROM quiz_attempts) AS attempt_rows,
         (SELECT COUNT(*) FROM quiz_daily_scores WHERE ranking_date = ?3) AS daily_score_rows,
         (SELECT MIN(completed_at) FROM quiz_attempts) AS oldest_attempt_at`
    ).bind(today, last24Hours, quizRankingDate(now)).first();
    return {
      configured: true,
      accountCount: Number(row?.account_count ?? 0),
      dailyActiveAccounts: Number(row?.daily_active_accounts ?? 0),
      activityDateUtc: today,
      attempts24h: Number(row?.attempts_24h ?? 0),
      attemptRows: Number(row?.attempt_rows ?? 0),
      dailyScoreRows: Number(row?.daily_score_rows ?? 0),
      oldestAttemptAt: row?.oldest_attempt_at ?? null,
      attemptRetentionDays: quizAttemptRetentionDays(env),
      maintenance: await readJson(env.NOTIFICATIONS_DB, MAINTENANCE_KEY, null)
    };
  } catch {
    return { configured: false, migrationRequired: true };
  }
}


function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date();
}
