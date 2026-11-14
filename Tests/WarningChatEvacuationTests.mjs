import assert from "node:assert/strict";
import {WARNING_CHAT_EVACUATION, warningChatEvacuationGuidance, generalWarningChatEvacuation,
  buildWarningChatEvacuationContext, buildWarningChatEvacuationAnswer} from "../functions/_shared/warningChatEvacuation.js";
import {addWarningChatKnowledge} from "../functions/_shared/warningChatKnowledge.js";
import {buildWarningChatMessages, parseWarningChatAnswer, warningChatModelEvidence} from "../functions/_shared/warningChatAnswer.js";
import {usesOfficialChatFacts} from "../functions/_shared/warningChatFacts.js";
import {warningChatQuestions, resolveWarningChatQuestionSelection, isWarningChatEvacuationQuestion, WARNING_CHAT_LIMITS} from "../src/ai/warningChatPolicy.js";

// General actions reviewed against the three linked JMA pages on 2026-11-14.
// Every bulletin below is synthetic; these are not real evacuation notices.
const base = {topic: "weather", areaCode: "1310100", language: "ja", history: [], revision: "test"};
const basicQuestions = {
  weather: "大雨のとき、避難はどう判断する？",
  earthquake: "地震のとき、どう身を守り避難する？",
  tsunami: "津波から避難するときの行動は？"
};
for (const [topic, question] of Object.entries(basicQuestions)) {
  const input = {...base, topic, question};
  const guidance = generalWarningChatEvacuation(input);
  assert.ok(guidance?.length, question);
  assert.equal(guidance[0].topic, topic);
  assert.ok(warningChatQuestions({topic}).includes(question));
  const context = await buildWarningChatEvacuationContext(input, guidance, 0);
  assert.equal(context.issuedAt, null);
  assert.equal(context.knowledgeOnly, true);
  assert.equal(context.referenceKind, "evacuation");
  assert.equal(context.warnings, undefined, "General guidance must not manufacture an empty current-warning list");
  assert.equal(context.revision, (await buildWarningChatEvacuationContext(input, guidance, 1000)).revision);
  assert.equal(new Set(context.sources.map(source => source.url)).size, context.sources.length);
  for (const source of context.sources) assert.equal(new URL(source.url).hostname, "www.jma.go.jp");
  for (const language of ["ja", "easy", "en"]) {
    const answer = buildWarningChatEvacuationAnswer({...input, language}, context);
    assert.equal(answer.answerKind, "official");
    assert.deepEqual(answer.evidenceIds, ["evacuation"]);
    assert.match(answer.answer, language === "en" ? /general actions/ : /一般的な避難行動/);
    assert.match(answer.answer, language === "en" ? /not a current local evacuation order/ : /現在の避難指示.*示すものではありません/);
  }
  const messages = buildWarningChatMessages({...input, language: "zh"}, context);
  assert.ok(new TextEncoder().encode(JSON.stringify(messages)).byteLength <= WARNING_CHAT_LIMITS.promptBytes);
  assert.ok(!messages[1].content.includes('"easy"'), "Avoid sending duplicate translations to inference");
  assert.doesNotThrow(() => parseWarningChatAnswer({response: JSON.stringify({answer: "避難行動の基本を説明します。", evidenceIds: ["evacuation"]})}, context));
  assert.throws(() => parseWarningChatAnswer({response: JSON.stringify({answer: "現在の避難指示です。", evidenceIds: ["current"]})}, context));
}
const weatherAnswer = buildWarningChatEvacuationAnswer(base, await buildWarningChatEvacuationContext(base,
  generalWarningChatEvacuation({...base, question: basicQuestions.weather}))).answer;
assert.match(weatherAnswer, /レベル5を待たず/);
assert.match(weatherAnswer, /相当する警戒レベル.*別の情報/);
assert.match(WARNING_CHAT_EVACUATION.earthquake.text, /あわてて外へ飛び出さず/);
assert.match(WARNING_CHAT_EVACUATION.earthquake.text, /震度やMだけで.*安全は判断できません/);
assert.match(WARNING_CHAT_EVACUATION.tsunami.text, /警報を待たず/);
assert.match(WARNING_CHAT_EVACUATION.tsunami.text, /津波注意報でも海から上がり/);
assert.match(WARNING_CHAT_EVACUATION.tsunami.text, /古い電文の解除や期限切れだけで帰ってよいとは判断できません/);

for (const question of ["今ここは避難が必要？", "この地震で避難すべき？", "最新の津波情報で避難する必要は？", "避難所はどこ？", "避難経路を教えて", "避難したけど帰っていい？", "Should I evacuate now?", "Where is the nearest shelter?", "Can I return after the tsunami evacuation?"]) {
  assert.ok(isWarningChatEvacuationQuestion(question));
  assert.equal(generalWarningChatEvacuation({...base, question}), null, question);
}
const mixed = resolveWarningChatQuestionSelection({...base, topic: "earthquake", eventId: "20261114000000", question: "地震と津波で避難すべき？"});
assert.equal(mixed.topic, "tsunami"); assert.equal(mixed.eventId, "");
const recent = resolveWarningChatQuestionSelection({...base, topic: "earthquake", earthquakeScope: "recent-local", question: "最近の地震でここは避難すべき？"});
assert.equal(recent.earthquakeScope, undefined);
const pinned = resolveWarningChatQuestionSelection({...base, topic: "tsunami", eventId: "20261114000000", forecastAreaCode: "100", question: "この津波で避難すべき？"});
assert.equal(pinned.eventId, "20261114000000"); assert.equal(pinned.forecastAreaCode, "100");
for (const question of ["最新の地震の震度と避難行動は？", "現在の津波情報の予想高さと避難の方法は？", "現在発表中の警報と避難の判断は？"]) {
  assert.equal(usesOfficialChatFacts({...base, question}, resolveWarningChatQuestionSelection({...base, question})), false, "Do not replace an action question with only numerical facts");
}
assert.equal(warningChatEvacuationGuidance({...base, question: "現在の気温は？"}).length, 0);
assert.equal(warningChatEvacuationGuidance({...base, topic: "earthquake", question: "もっと具体的に", history: [{role: "user", content: "地震のときの避難は？"}]}).length, 1);

for (const [topic, situation] of Object.entries({
  weather: {warnings: [], outlookAvailable: false},
  earthquake: {earthquake: {reportState: "取消", magnitude: null, depthKm: null}},
  tsunami: {tsunami: {state: "expired", areas: []}}
})) {
  const original = {...situation, topic, revision: "official-revision", sources: []};
  const question = "今、避難したほうがいい？";
  const context = addWarningChatKnowledge({...base, topic, question}, original);
  assert.ok(context.evacuationGuidance.length);
  assert.equal(original.evacuationGuidance, undefined, "Do not mutate cached official context");
  assert.equal(context.revision, "official-revision");
  if (topic === "tsunami") assert.equal(context.tsunami.state, "expired");
  const messages = buildWarningChatMessages({...base, topic, question}, context);
  assert.match(messages[0].content, /General protective and evacuation actions.*ARE supported/);
  assert.match(messages[0].content, /not permission|not an all-clear/);
  assert.match(messages[1].content, /evacuationGuidance/);
  assert.deepEqual(warningChatModelEvidence(context).evacuationGuidance.map(item => Object.keys(item)), [["topic", "title", "text"]]);
  const twice = addWarningChatKnowledge({...base, topic, question}, context);
  assert.equal(new Set(twice.sources.map(source => source.url)).size, twice.sources.length);
}
const wind = addWarningChatKnowledge({...base, question: "今、避難すべき？"}, {topic: "weather", warnings: [{label: "暴風警報"}], sources: []});
assert.match(wind.evacuationGuidance[0].text, /風が強くなる前/);
assert.ok(!wind.evacuationGuidance.some(item => /レベル4/u.test(item.text)));
const snow = generalWarningChatEvacuation({...base, question: "大雪のとき、避難はどうする？"});
assert.match(snow[0].text, /不要不急の外出/);
assert.equal(resolveWarningChatQuestionSelection({...base, topic: "earthquake", question: "大雪のときの避難は？"}).topic, "weather");
console.log("Evacuation chat: three hazards, general/current separation, source references, multilingual guidance, follow-ups, routing, missing/expired bulletins and model budget passed.");
