import assert from "node:assert/strict";
import {usesOfficialChatFacts, buildOfficialChatFacts} from "../functions/_shared/warningChatFacts.js";
import {recentQuestionPeriod} from "../functions/_shared/warningChatRecentPeriod.js";
import {addWarningChatKnowledge} from "../functions/_shared/warningChatKnowledge.js";
import {resolveWarningChatQuestionSelection} from "../src/ai/warningChatPolicy.js";

const NOW = "2026-11-14T00:30:00Z";
const input = {language: "ja", question: "現在発表中の警報・注意報は？", topic: "weather", history: []};
const context = {topic: "weather", areaName: "東京都 千代田区", issuedAt: NOW, fetchedAt: NOW,
  warnings: [{label: "強風注意報"}, {label: "乾燥注意報"}]};
assert.ok(usesOfficialChatFacts(input, input));
const active = buildOfficialChatFacts(input, context);
assert.equal(active.answerKind, "official");
assert.match(active.answer, /千代田区.*強風注意報、乾燥注意報/);
assert.match(active.answer, /9:30:00/);
assert.deepEqual(active.evidenceIds, ["current"]);
const none = buildOfficialChatFacts(input, {...context, warnings: []});
assert.match(none.answer, /掲載されていません。安全を保証する表示ではありません/);
assert.match(none.answer, /指定河川洪水予報/);
assert.throws(() => buildOfficialChatFacts(input, {...context, warnings: undefined}));

const quakeInput = {...input, topic: "earthquake", question: "最新の地震の震源と規模は？"};
assert.ok(usesOfficialChatFacts(quakeInput, quakeInput));
const quake = {...context, topic: "earthquake", availability: "available", earthquake: {
  eventTime: NOW, location: "試験用震源", magnitude: null, depthKm: 0,
  maxObservedIntensity: "5+", selectedMunicipalityIntensity: null, reportState: "発表"
}};
const quakeAnswer = buildOfficialChatFacts(quakeInput, quake).answer;
assert.match(quakeAnswer, /M調査中 · ごく浅い/);
assert.doesNotMatch(quakeAnswer, /M0\.0|当地.*5\+/);
assert.match(quakeAnswer, /観測最大震度：5\+/);
assert.match(quakeAnswer, /千代田区の観測震度：この電文では確認できません/);
const cancelled = buildOfficialChatFacts(quakeInput, {...quake, earthquake: {...quake.earthquake, reportState: "取消"}}).answer;
assert.match(cancelled, /取消済み/); assert.doesNotMatch(cancelled, /試験用震源|5\+/);
assert.match(buildOfficialChatFacts(quakeInput, {...quake, earthquake: null, availability: "empty"}).answer, /確認できませんでした/);

const tsunamiInput = {...input, topic: "tsunami", question: "最新の津波情報の予想高さと到達時刻は？"};
assert.ok(usesOfficialChatFacts(tsunamiInput, tsunamiInput));
const tsunami = {...context, topic: "tsunami", tsunami: {state: "expired", validUntil: NOW, omittedAreaCount: 2,
  areas: [{name: "試験海岸", grade: "津波注意報", expectedHeight: "1m", arrivalTime: null, arrivalCondition: "既に到達と推測"}]
}};
const tsunamiAnswer = buildOfficialChatFacts(tsunamiInput, tsunami).answer;
assert.match(tsunamiAnswer, /期限切れ/); assert.match(tsunamiAnswer, /予想高さ 1m/);
assert.match(tsunamiAnswer, /既に到達と推測/); assert.match(tsunamiAnswer, /ほか2予報区/);
assert.match(tsunamiAnswer, /予想高さは観測値ではありません/);
assert.doesNotMatch(tsunamiAnswer, /現在も有効です|到達.*0時/);
const ended = buildOfficialChatFacts(tsunamiInput, {...tsunami, tsunami: {...tsunami.tsunami, state: "cancelled"}}).answer;
assert.match(ended, /解除・取消/); assert.doesNotMatch(ended, /予想高さ 1m/);
assert.match(buildOfficialChatFacts(tsunamiInput, {...tsunami, tsunami: null}).answer, /津波がないと判断したものではありません/);

const recentInput = {...input, topic: "earthquake", earthquakeScope: "recent-local", question: "最近の地震でここで震度を観測した地震は何件？"};
const recent = {...context, topic: "earthquake", recentEarthquakes: {
  searchedCount: 10, unavailableCount: 1, matches: [
    {eventTime: "2026-11-13T14:59:59Z", location: "前日震源", observedIntensity: "5-", magnitude: 6, depthKm: 20},
    {eventTime: "2026-11-13T15:00:00Z", location: "当日震源A", observedIntensity: "5+", magnitude: 5, depthKm: 10},
    {eventTime: "2026-11-14T00:00:00Z", location: "当日震源B", observedIntensity: "5+", magnitude: 5, depthKm: 10}
  ]
}};
assert.match(buildOfficialChatFacts(recentInput, recent).answer, /掲載された地震は3件です/);
const strongest = buildOfficialChatFacts({...recentInput, question: "一番強かったのは？"}, recent).answer;
assert.match(strongest, /震度5\+/); assert.match(strongest, /当日震源A/); assert.match(strongest, /当日震源B/);
assert.doesNotMatch(strongest, /前日震源/);
assert.match(buildOfficialChatFacts({...recentInput, question: "一番強かった地震は何件？"}, recent).answer, /記録した地震は2件です/);
const today = buildOfficialChatFacts({...recentInput, question: "今日ここで震度を観測した地震は何件？"}, recent).answer;
assert.match(today, /地震は2件/); assert.doesNotMatch(today, /前日震源/);
assert.match(today, /その日の全地震を網羅する検索ではありません/);
const yesterday = buildOfficialChatFacts({...recentInput, question: "昨日の地震でここが揺れたのは？"}, recent).answer;
assert.match(yesterday, /前日震源/); assert.doesNotMatch(yesterday, /当日震源/);
const followup = {...recentInput, question: "その地震はいつ？", history: [{role: "user", content: "昨日ここで震度を観測した地震は？"}]};
assert.match(buildOfficialChatFacts(followup, recent).answer, /前日震源/);
assert.doesNotMatch(buildOfficialChatFacts(followup, recent).answer, /当日震源/);
// JST midnight and year boundary, independent of the test machine timezone.
const boundary = recentQuestionPeriod({...input, question: "昨日"}, Date.parse("2026-01-01T15:00:00Z"));
assert.equal(new Date(boundary.start).toISOString(), "2025-12-31T15:00:00.000Z");
assert.equal(new Date(boundary.end).toISOString(), "2026-01-01T15:00:00.000Z");
assert.equal(resolveWarningChatQuestionSelection({...input, question: "昨日ここで震度を観測した地震は？"}).earthquakeScope, "recent-local");

for (const question of ["現在の警報はいつまで？", "警報と注意報の違いは？", "地震はなぜ起きた？", "津波は大丈夫？"]) {
  assert.equal(usesOfficialChatFacts({...input, question}, resolveWarningChatQuestionSelection({...input, question})), false);
}
for (const question of ["過去1年間にここが揺れた地震は？", "最近の地震で震度3以上は？", "最近の地震で震度３は何件？", "最近の地震を3件だけ", "最近の地震で一番規模が大きかったのは？"]) assert.equal(usesOfficialChatFacts({...recentInput, question}, recentInput), false);
const knowledge = addWarningChatKnowledge({...input, question: "それをもう少し説明して", history: [{role: "user", content: "震度とマグニチュードの違いは？"}]}, {...context, sources: []});
assert.match(knowledge.knowledge[0].text, /揺れの強さ/);
assert.ok(knowledge.sources.some(source => source.url.endsWith("faq27.html")));
assert.equal(addWarningChatKnowledge({...input, question: "現在の警報は？", history: [{role: "user", content: "津波とは？"}]}, {...context, sources: []}).knowledge.length, 1, "Unrelated old topics must not contaminate new questions");

const english = buildOfficialChatFacts({...quakeInput, language: "en"}, quake).answer;
assert.match(english, /Epicenter:|Maximum observed intensity:/);
assert.doesNotMatch(english, /深さ調査中/);
console.log("Warning chat facts: active/empty/cancelled/expired sources, missing values, JST dates, local maxima/ties/counts, scope limits and explanatory follow-ups passed.");
