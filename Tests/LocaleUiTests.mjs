import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { localizeText } from "../src/ui/locale.js";
import { UI_EN_ENTRIES, COMPACT_EN_TRANSLATIONS } from "../src/ui/localeUiEn.js";
import { SCIENCE_EN_ENTRIES } from "../src/ui/localeScienceEn.js";
import { CALCULATION_EN_ENTRIES } from "../src/ui/localeCalculationEn.js";
import { DISASTER_TIMELINE_EVENTS, filterDisasterTimelineEvents, formatDisasterTimelineDate } from "../src/domain/disasterTimeline.js";
import { DISASTER_TIMELINE_EN } from "../src/domain/disasterTimelineEn.js";

const japanese = /[ぁ-んァ-ヶ一-龯]/u;
const keys = new Set();
for (const entry of [...UI_EN_ENTRIES, ...SCIENCE_EN_ENTRIES, ...CALCULATION_EN_ENTRIES]) {
  assert.equal(entry.length, 2, `Malformed translation: ${entry[0]}`);
  const [source, english] = entry;
  assert.ok(source && english);
  assert.ok(!keys.has(source), `Duplicate translation: ${source}`);
  keys.add(source);
  assert.doesNotMatch(english, japanese, `English translation still contains Japanese: ${source}`);
  assert.equal(localizeText(source, "en"), english, source);
  assert.equal(localizeText(source, "ja"), source, "Japanese source must be preserved");
  assert.equal(localizeText(english, "en"), english, "Translation must be idempotent");
}

const examples = new Map([
  ["気象庁 ↗", "JMA ↗"],
  ["気象庁 防災情報XML「府県天気予報・府県週間天気予報」", "JMA Disaster Information XML: local and weekly forecasts"],
  ["縦長 1080 × 1350px・100地点掲載", "Portrait 1080 × 1350px · 100 stations included"],
  ["正方形 1080 × 1080px", "Square 1080 × 1080px"],
  ["過去の地震・2026/11/05〜", "Past earthquakes · 2026/11/05–"],
  ["137地域", "137 areas"],
  ["5弱", "5−"], ["6強", "6+"],
  ["震度5弱以上", "Intensity 5− or higher"],
  ["2026/05/02 18:28発生", "Occurred 2026/05/02 18:28 JST"],
  ["深さ65km", "Depth 65 km"],
  ["基礎・本日", "Foundation · Today"],
  ["平年最高 28.9℃ (1991-2020)", "Normal high 28.9℃ (1991-2020)"],
  ["最低Humidity 65%", "Low humidity 65%"],
  ["地図上の観測点をタップすると、Today's temperatureを表示します。", "Tap a station on the map to view today's temperature."],
  ["11/13 19:42発生 · 和歌山県北部", "Occurred 11/13 19:42 JST · Wakayama, Northern area"],
  ["11/6 19:53発表 · 三陸沖（期限切れの資料）", "Issued 11/6 19:53 JST · Off Sanriku (expired bulletin)"],
  ["Sakurajima (南岳山頂火口)", "Sakurajima (Minamidake summit crater)"],
  ["令和8年(2026年) 9月20日〜9月22日の事例(台風第25号と前線による大雨)", "2026/9/20–9/22 · Heavy rain from Typhoon No. 25 and a front"],
  ["最新の地震でChiyoda-kuの観測震度は？", "What intensity was observed in Chiyoda-ku in the latest earthquake?"],
  ["基本雲形 10 / 10 ・ 専門分類 46 / 46", "Genera 10 / 10 · Detailed classes 46 / 46"],
]);
for (const [source, english] of examples) assert.equal(localizeText(source, "en"), english, source);

for (const event of DISASTER_TIMELINE_EVENTS) {
  assert.ok(DISASTER_TIMELINE_EN.has(event.id), `Missing timeline translation: ${event.id}`);
  for (const field of [event.title, event.summary, event.region, formatDisasterTimelineDate(event)]) {
    assert.doesNotMatch(localizeText(field, "en"), japanese, `${event.id}: ${field}`);
  }
}
assert.equal(DISASTER_TIMELINE_EN.size, DISASTER_TIMELINE_EVENTS.length, "No orphaned event translations");
assert.ok(filterDisasterTimelineEvents(undefined, {query: "Noto"}).some(event => event.id === "noto-2024"));
assert.ok(filterDisasterTimelineEvents(undefined, {query: "能登"}).some(event => event.id === "noto-2024"));
assert.equal(COMPACT_EN_TRANSLATIONS.get("天気図"), "Charts");
assert.equal(localizeText("An unmodified user message", "en"), "An unmodified user message");

// Check complete phrases, including partially translated results, rather than
// merely asserting that localizeText changed at least one word.
execFileSync(process.execPath, ["scripts/audit-locale.mjs", "index.html",
  "src/ui/cloudClassificationModal.js", "src/ui/upperAirModal.js",
  "src/ui/numericalCalculationModal.js", "src/science/numericalCalculations.js",
  "src/science/numericalExplanation.js"], {cwd: new URL("..", import.meta.url), stdio: "pipe"});
console.log(`Locale UI tests passed (${keys.size} translation entries, ${examples.size} dynamic cases, ${DISASTER_TIMELINE_EVENTS.length} timeline records and static UI audit).`);
