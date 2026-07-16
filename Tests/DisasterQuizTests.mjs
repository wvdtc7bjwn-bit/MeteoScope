import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DISASTER_QUIZ_DIFFICULTIES,
  getDisasterQuizQuestions,
  shuffledDisasterQuizQuestions,
  validateDisasterQuizQuestions
} from "../src/domain/disasterQuiz.js";

assert.deepEqual(validateDisasterQuizQuestions(), []);
assert.deepEqual(DISASTER_QUIZ_DIFFICULTIES.map((item) => item.id), [
  "beginner",
  "intermediate",
  "advanced"
]);

const allIDs = new Set();
for (const difficulty of DISASTER_QUIZ_DIFFICULTIES) {
  const questions = getDisasterQuizQuestions(difficulty.id);
  assert.equal(questions.length, 10);
  for (const question of questions) {
    assert.equal(allIDs.has(question.id), false);
    allIDs.add(question.id);
    assert.ok(question.choices.length >= 3);
    assert.ok(question.correctIndex >= 0 && question.correctIndex < question.choices.length);
    assert.match(question.sourceURL, /^https:\/\/(?:www\.)?(?:data\.)?(?:jma\.go\.jp|bousai\.go\.jp|fdma\.go\.jp)\//u);
  }
}
assert.equal(allIDs.size, 30);
assert.deepEqual(getDisasterQuizQuestions("unknown"), []);

const original = getDisasterQuizQuestions("beginner").map((item) => item.id);
const shuffled = shuffledDisasterQuizQuestions("beginner", () => 0).map((item) => item.id);
assert.equal(shuffled.length, 10);
assert.deepEqual([...shuffled].sort(), [...original].sort());
assert.notDeepEqual(shuffled, original);
assert.ok(shuffledDisasterQuizQuestions("beginner", () => 0).some((item) => item.correctIndex !== 0));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [html, appSource, styleSource, iosDashboardSource] = await Promise.all([
  fs.readFile(path.join(root, "index.html"), "utf8"),
  fs.readFile(path.join(root, "src", "app.js"), "utf8"),
  fs.readFile(path.join(root, "src", "style.css"), "utf8"),
  fs.readFile(path.join(root, "ios", "MeteoScope", "Views", "FeatureDashboardCards.swift"), "utf8")
]);
assert.match(html, /id="disaster-quiz-button"[\s\S]*id="disaster-map-button"/u);
assert.match(html, /id="disaster-quiz-modal"/u);
assert.match(appSource, /setupDisasterQuizModal\(\)/u);
assert.match(styleSource, /#disaster-map-button\s*\{\s*left:\s*78px/u);
assert.match(styleSource, /\.disaster-quiz-open-button\s*\{\s*top:\s*20px;\s*left:\s*20px/u);
assert.match(styleSource, /html\[data-theme="light"\] \.disaster-quiz-feedback\[data-result="correct"\]/u);
assert.match(styleSource, /html\[data-theme="light"\] \.disaster-quiz-feedback\[data-result="incorrect"\]/u);
assert.doesNotMatch(styleSource.slice(styleSource.indexOf("/* Disaster quiz */")), /\.disaster-quiz-primary\s*\{[^}]*linear-gradient/su);
assert.match(iosDashboardSource, /case \.disasterQuiz:\s*DisasterQuizView\(\)/u);
assert.match(iosDashboardSource, /Label\("防災クイズ"[\s\S]*Label\("防災マップ"/u);

console.log("Disaster quiz tests passed.");
