import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import {
  quizAttemptRetentionDays,
  readQuizOperationalMetrics,
  recordQuizDailyActivity,
  runQuizMaintenance
} from "../functions/_shared/quizMaintenance.js";
import {
  CURRENT_USER_QUIZ_RANK_SQL,
  PUBLIC_QUIZ_LEADERBOARD_SQL,
  UPSERT_QUIZ_DAILY_SCORE_SQL,
  quizRankingDate
} from "../functions/_shared/quizStorage.js";
import { onRequest as quizApi } from "../functions/api/quiz/[[path]].js";
import { shouldRunQuizMaintenance } from "../workers/warning-push-cron.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [appMigration, accountMigration, optimizationMigration, dailyRankingMigration] = await Promise.all([
  fs.readFile(path.join(root, "migrations", "0002_app_storage.sql"), "utf8"),
  fs.readFile(path.join(root, "migrations", "0005_quiz_accounts.sql"), "utf8"),
  fs.readFile(path.join(root, "migrations", "0006_quiz_free_tier_optimization.sql"), "utf8"),
  fs.readFile(path.join(root, "migrations", "0007_quiz_daily_points_ranking.sql"), "utf8")
]);

const sqlite = new DatabaseSync(":memory:");
sqlite.exec("PRAGMA foreign_keys = ON");
sqlite.exec(appMigration);
sqlite.exec(accountMigration);
sqlite.exec(`
  INSERT INTO quiz_accounts VALUES
    ('alice', 'alice', 'Alice', 'salt', 'hash', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
    ('bob', 'bob', 'Bob', 'salt', 'hash', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
  INSERT INTO quiz_attempts VALUES
    ('a1', 'alice', 'beginner', 7, 10, '2026-01-01T01:00:00.000Z'),
    ('a2', 'alice', 'beginner', 8, 10, '2026-01-02T01:00:00.000Z'),
    ('a3', 'alice', 'beginner', 8, 10, '2026-01-03T01:00:00.000Z'),
    ('b1', 'bob', 'beginner', 9, 10, '2026-01-04T01:00:00.000Z');
`);
sqlite.exec(optimizationMigration);
sqlite.exec(dailyRankingMigration);

assert.equal(quizRankingDate("2026-07-16T14:59:59.000Z"), "2026-07-16");
assert.equal(quizRankingDate("2026-07-16T15:00:00.000Z"), "2026-07-17");

sqlite.prepare(UPSERT_QUIZ_DAILY_SCORE_SQL).run("2026-07-17", "alice", "beginner", 7, "2026-07-16T15:01:00.000Z");
sqlite.prepare(UPSERT_QUIZ_DAILY_SCORE_SQL).run("2026-07-17", "alice", "beginner", 8, "2026-07-16T15:02:00.000Z");
sqlite.prepare(UPSERT_QUIZ_DAILY_SCORE_SQL).run("2026-07-17", "bob", "beginner", 10, "2026-07-16T15:03:00.000Z");
assert.deepEqual(
  { ...sqlite.prepare("SELECT points, attempt_count FROM quiz_daily_scores WHERE ranking_date = '2026-07-17' AND account_id = 'alice'").get() },
  { points: 15, attempt_count: 2 }
);

const leaderboard = sqlite.prepare(PUBLIC_QUIZ_LEADERBOARD_SQL).all("2026-07-17", "beginner", 20);
assert.deepEqual(leaderboard.map((row) => row.display_name), ["Alice", "Bob"]);
const bobRank = sqlite.prepare(CURRENT_USER_QUIZ_RANK_SQL).get("2026-07-17", "beginner", "bob");
assert.equal(bobRank.rank, 2);

class D1Statement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.params = [];
  }

  bind(...params) {
    this.params = params;
    return this;
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.params);
    return { meta: { changes: Number(result.changes ?? 0) } };
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.params) ?? null;
  }

  async all() {
    return { results: this.database.prepare(this.sql).all(...this.params) };
  }
}

class D1Adapter {
  constructor(database) { this.database = database; }
  prepare(sql) { return new D1Statement(this.database, sql); }
  async batch(statements) { return await Promise.all(statements.map((statement) => statement.run())); }
}

const d1 = new D1Adapter(sqlite);
const maintenanceNow = new Date("2026-07-16T15:00:00.000Z");
await recordQuizDailyActivity(d1, "alice", maintenanceNow);
await recordQuizDailyActivity(d1, "alice", maintenanceNow);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM quiz_daily_active").get().count, 1);

sqlite.exec(`
  INSERT INTO quiz_sessions VALUES ('expired-session', 'alice', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z');
  INSERT INTO quiz_challenges VALUES ('expired-challenge', 'alice', 'beginner', '[]', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z');
  INSERT INTO quiz_rate_limits VALUES ('expired', 'client', 1, '2026-01-02T00:00:00.000Z');
  INSERT INTO quiz_daily_scores VALUES ('2026-07-16', 'bob', 'beginner', 99, 11, '2026-07-16T14:59:00.000Z', '2026-07-16T14:59:00.000Z');
`);
const maintenance = await runQuizMaintenance({ NOTIFICATIONS_DB: d1, QUIZ_ATTEMPT_RETENTION_DAYS: "15" }, { now: maintenanceNow });
assert.equal(maintenance.attemptRetentionDays, 15);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM quiz_attempts").get().count, 0);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM quiz_daily_scores WHERE ranking_date = '2026-07-16'").get().count, 0);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM quiz_daily_scores WHERE ranking_date = '2026-07-17'").get().count, 2);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM quiz_sessions").get().count, 0);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM quiz_challenges").get().count, 0);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM quiz_rate_limits").get().count, 0);

const metrics = await readQuizOperationalMetrics({ NOTIFICATIONS_DB: d1, QUIZ_ATTEMPT_RETENTION_DAYS: "15" }, { now: maintenanceNow });
assert.equal(metrics.accountCount, 2);
assert.equal(metrics.dailyActiveAccounts, 1);
assert.equal(metrics.dailyScoreRows, 2);
assert.equal(metrics.maintenance.completedAt, maintenanceNow.toISOString());
assert.equal(quizAttemptRetentionDays({ QUIZ_ATTEMPT_RETENTION_DAYS: "1" }), 7);
assert.equal(quizAttemptRetentionDays({ QUIZ_ATTEMPT_RETENTION_DAYS: "999" }), 365);
assert.equal(quizAttemptRetentionDays({}), 15);

assert.equal(shouldRunQuizMaintenance(new Date("2026-07-16T15:00:00.000Z")), true);
assert.equal(shouldRunQuizMaintenance(new Date("2026-07-16T14:59:00.000Z")), false);

const leaderboardCache = new Map();
const originalCaches = globalThis.caches;
globalThis.caches = {
  default: {
    async match(request) {
      return leaderboardCache.get(request.url)?.clone() ?? null;
    },
    async put(request, response) {
      leaderboardCache.set(request.url, response.clone());
    },
    async delete(request) {
      return leaderboardCache.delete(request.url);
    }
  }
};
let leaderboardQueries = 0;
const leaderboardDb = {
  prepare(sql) {
    assert.equal(sql, PUBLIC_QUIZ_LEADERBOARD_SQL);
    return {
      bind(rankingDate, difficulty, limit) {
        assert.match(rankingDate, /^\d{4}-\d{2}-\d{2}$/u);
        assert.equal(difficulty, "beginner");
        assert.equal(limit, 20);
        return {
          async all() {
            leaderboardQueries += 1;
            return { results: [{ display_name: "Alice", points: 18, attempt_count: 2, completed_at: maintenanceNow.toISOString() }] };
          }
        };
      }
    };
  }
};
const leaderboardContext = () => ({
  request: new Request("https://meteoscope.example/api/quiz/leaderboard?difficulty=beginner"),
  env: {
    NOTIFICATIONS_DB: leaderboardDb,
    QUIZ_PASSWORD_PEPPER: "password-pepper",
    QUIZ_RATE_LIMIT_SECRET: "rate-limit-secret",
    QUIZ_LEADERBOARD_CACHE_SECONDS: "60"
  }
});
try {
  const firstLeaderboard = await (await quizApi(leaderboardContext())).json();
  const secondLeaderboard = await (await quizApi(leaderboardContext())).json();
  assert.equal(firstLeaderboard.entries[0].displayName, "Alice");
  assert.equal(firstLeaderboard.entries[0].points, 18);
  assert.deepEqual(secondLeaderboard.entries, firstLeaderboard.entries);
  assert.equal(leaderboardQueries, 1);
  assert.equal(leaderboardCache.size, 1);
} finally {
  if (originalCaches === undefined) delete globalThis.caches;
  else globalThis.caches = originalCaches;
}

sqlite.close();
console.log("Quiz storage and free-tier optimization tests passed.");
