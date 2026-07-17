import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import questions from "../ios/MeteoScope/Resources/disaster-quiz.json" with { type: "json" };
import { onRequest } from "../functions/api/quiz/[[path]].js";
import {
  hashQuizPassword,
  randomQuizToken,
  validateQuizAccountInput,
  verifyQuizPassword
} from "../functions/_shared/quizSecurity.js";
import {
  QUIZ_QUESTION_COUNT,
  createQuizQuestionIDs,
  scoreQuizAnswers
} from "../functions/_shared/quizCatalog.js";

assert.deepEqual(validateQuizAccountInput({
  username: " Meteo_User ", displayName: " 防災 太郎 ", password: "long-password"
}), { username: "meteo_user", displayName: "防災 太郎", password: "long-password" });
assert.match(validateQuizAccountInput({ username: "x", displayName: "防災", password: "long-password" }).error, /アカウントID/u);
assert.match(validateQuizAccountInput({ username: "valid_user", displayName: "<script>", password: "long-password" }).error, /表示名/u);
assert.match(validateQuizAccountInput({ username: "valid_user", displayName: "防災", password: "short" }).error, /パスワード/u);

const salt = randomQuizToken(16);
const hash = await hashQuizPassword("correct horse battery staple", salt, "test-only-pepper");
assert.equal(await verifyQuizPassword("correct horse battery staple", salt, hash, "test-only-pepper"), true);
assert.equal(await verifyQuizPassword("wrong password", salt, hash, "test-only-pepper"), false);
assert.doesNotMatch(hash, /correct horse/u);

const ids = createQuizQuestionIDs("beginner", () => 0);
assert.equal(ids.length, QUIZ_QUESTION_COUNT);
assert.equal(new Set(ids).size, QUIZ_QUESTION_COUNT);
const byID = new Map(questions.map((question) => [question.id, question]));
const correctAnswers = ids.map((id) => {
  const question = byID.get(id);
  return { questionId: id, answer: question.choices[question.correctIndex] };
});
assert.equal(scoreQuizAnswers(ids, correctAnswers), QUIZ_QUESTION_COUNT);
assert.equal(scoreQuizAnswers(ids, correctAnswers.map((item, index) => index === 0 ? { ...item, answer: "不正解" } : item)), 9);
assert.equal(scoreQuizAnswers(ids, correctAnswers.slice(1)), null);
assert.equal(scoreQuizAnswers(ids, correctAnswers.map((item, index) => index === 0 ? { ...item, questionId: "tampered" } : item)), null);

const configResponse = await onRequest({
  request: new Request("https://meteoscope.pages.dev/api/quiz/config"),
  env: {}
});
assert.equal(configResponse.status, 200);
assert.equal((await configResponse.json()).enabled, false);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [
  routeSource,
  migration,
  optimizationMigration,
  dailyRankingMigration,
  webClient,
  iosService,
  privacyManifest,
  privacyPage,
  supportPage,
  indexPage,
  settingsScript,
  appSource,
  iosSettings,
  accountAuthSource,
  leaderboardCacheSource
] = await Promise.all([
  fs.readFile(path.join(root, "functions", "api", "quiz", "[[path]].js"), "utf8"),
  fs.readFile(path.join(root, "migrations", "0005_quiz_accounts.sql"), "utf8"),
  fs.readFile(path.join(root, "migrations", "0006_quiz_free_tier_optimization.sql"), "utf8"),
  fs.readFile(path.join(root, "migrations", "0007_quiz_daily_points_ranking.sql"), "utf8"),
  fs.readFile(path.join(root, "src", "domain", "quizRankingClient.js"), "utf8"),
  fs.readFile(path.join(root, "ios", "MeteoScope", "Services", "QuizRankingService.swift"), "utf8"),
  fs.readFile(path.join(root, "ios", "MeteoScope", "Support", "PrivacyInfo.xcprivacy"), "utf8"),
  fs.readFile(path.join(root, "public", "privacy.html"), "utf8"),
  fs.readFile(path.join(root, "public", "support.html"), "utf8"),
  fs.readFile(path.join(root, "index.html"), "utf8"),
  fs.readFile(path.join(root, "src", "ui", "settingsModal.js"), "utf8"),
  fs.readFile(path.join(root, "src", "app.js"), "utf8"),
  fs.readFile(path.join(root, "ios", "MeteoScope", "Views", "SettingsView.swift"), "utf8"),
  fs.readFile(path.join(root, "functions", "_shared", "accountAuth.js"), "utf8"),
  fs.readFile(path.join(root, "functions", "_shared", "quizLeaderboardCache.js"), "utf8")
]);
for (const table of ["quiz_accounts", "quiz_sessions", "quiz_challenges", "quiz_attempts", "quiz_rate_limits"]) {
  assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "u"));
}
for (const table of ["quiz_daily_active"]) {
  assert.match(optimizationMigration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "u"));
}
assert.match(dailyRankingMigration, /CREATE TABLE IF NOT EXISTS quiz_daily_scores/u);
assert.match(dailyRankingMigration, /DROP TABLE IF EXISTS quiz_best_scores/u);
for (const route of ["register", "login", "logout", "leaderboard", "challenge", "submit"]) {
  assert.match(routeSource, new RegExp(`route === "${route}"`, "u"));
}
assert.match(accountAuthSource, /HttpOnly; Secure; SameSite=Strict/u);
assert.match(routeSource, /QUIZ_PASSWORD_PEPPER/u);
assert.doesNotMatch(routeSource, /console\.(?:log|error).*password/iu);
assert.match(webClient, /sessionStorage/u);
assert.match(webClient, /github\.io/u);
assert.match(routeSource, /wvdtc7bjwn-bit\.github\.io/u);
assert.match(routeSource, /PUBLIC_QUIZ_LEADERBOARD_SQL/u);
assert.match(routeSource, /QUIZ_LEADERBOARD_CACHE_SECONDS/u);
assert.match(routeSource, /quizRankingDate/u);
assert.match(routeSource, /invalidateAllQuizLeaderboardCaches\(\)/u);
assert.match(leaderboardCacheSource, /QUIZ_DIFFICULTIES\.map\(\(difficulty\) => invalidateQuizLeaderboardCache\(difficulty, rankingDate\)\)/u);
assert.doesNotMatch(routeSource, /function bestScoresCTE/u);
assert.match(iosService, /kSecClassGenericPassword/u);
assert.match(iosService, /kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/u);
assert.match(privacyManifest, /NSPrivacyCollectedDataTypeUserID/u);
assert.match(privacyManifest, /NSPrivacyCollectedDataTypeGameplayContent/u);
assert.match(privacyPage, /MeteoScopeアカウント/u);
assert.match(supportPage, /MeteoScopeアカウント/u);
assert.match(indexPage, /<div class="settings-modal-body">\s*<section class="settings-group settings-account-group">/u);
assert.match(indexPage, /data-settings-open-account/u);
assert.match(settingsScript, /QuizRankingClient\.configuration\(\)/u);
assert.match(settingsScript, /QuizRankingClient\.account\(\)/u);
assert.match(appSource, /onOpenAccount: openDisasterQuizModal/u);
assert.match(iosSettings, /Form \{\s*Section\("MeteoScopeアカウント"\)/u);
assert.match(iosSettings, /account\.refresh\(difficulty: \.beginner\)/u);
assert.doesNotMatch([privacyPage, supportPage, indexPage, iosSettings].join("\n"), /クイズアカウント/u);

console.log("Quiz account and leaderboard tests passed.");
