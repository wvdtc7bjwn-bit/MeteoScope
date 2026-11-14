import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {WARNING_CHAT_GLOSSARY, findWarningChatTerms, warningChatDefinition} from "../functions/_shared/warningChatGlossary.js";
import {buildWarningChatDefinitionContext, buildWarningChatDefinitionAnswer} from "../functions/_shared/warningChatDefinition.js";
import {buildWarningChatMessages, parseWarningChatAnswer} from "../functions/_shared/warningChatAnswer.js";
import {formatWarningChatHeight} from "../src/ai/warningChatFormatting.js";
import {resolveWarningChatQuestionSelection} from "../src/ai/warningChatPolicy.js";
const input = {language: "ja", areaCode: "1310100", topic: "weather", question: "震度とマグニチュードはどう違う？", history: []};
const examples = [
  ["５弱って何？", "intensity"], ["Mって何？", "magnitude"],
  ["予想震度とは何ですか？", "predicted-intensity"], ["震源と震央の違いは？", "hypocenter"],
  ["EEW警報と予報の違いは？", "eew"], ["PLUM法ってなに？", "plum"],
  ["P波とS波の違いは？", "waves"], ["ＣＭＴ解とは？", "mechanism"],
  ["危険警報とは？", "weather-alerts"], ["キキクルって何？", "kikikuru"],
  ["線状降水帯とは何ですか？", "rainband"], ["降水確率の意味は？", "precipitation-probability"],
  ["予報円とは？", "forecast-circle"], ["暴風域と暴風警戒域の違いは？", "wind-areas"],
  ["津波警報と津波注意報の違いは？", "tsunami-alerts"], ["第一波と最大波の違いは？", "tsunami"],
  ["警報の解除という用語の意味は？", "outlook"], ["What does PLUM mean?", "plum"]
];
for (const [question, id] of examples) {
  const terms = warningChatDefinition({...input, question});
  assert.ok(terms?.some(term => term.id === id), question);
  const context = await buildWarningChatDefinitionContext(input, terms);
  assert.ok(context.knowledgeOnly); assert.equal(context.issuedAt, null);
  assert.doesNotMatch(JSON.stringify(context), /"warnings":\[\]/, "No fabricated 'no active warnings' in a terminology context");
  assert.match(buildWarningChatDefinitionAnswer(input, context).answer, /一般的な用語の説明/);
}
assert.equal(new Set(WARNING_CHAT_GLOSSARY.map(term => term.id)).size, WARNING_CHAT_GLOSSARY.length);
for (const term of WARNING_CHAT_GLOSSARY) {
  assert.match(new URL(term.url).hostname, /(?:^|\.)(?:jma\.go\.jp|jma-net\.go\.jp)$/u);
  assert.ok(term.text && term.en && term.enTitle);
}
assert.equal(warningChatDefinition({...input, question: "予想震度とは？"})[0].id, "predicted-intensity");
assert.ok(!warningChatDefinition({...input, question: "予想震度とは？"}).some(term => term.id === "intensity"));
assert.ok(warningChatDefinition({...input, question: "観測震度と予想震度の違いは？"}).some(term => term.id === "intensity"));
assert.ok(!findWarningChatTerms("津波警報と津波注意報").some(term => term.id === "weather-alerts"));
assert.ok(!findWarningChatTerms("EEW warning").some(term => term.id === "weather-alerts"));
assert.deepEqual(warningChatDefinition({...input, question: "What is the difference between intensity and magnitude?"}).map(term => term.id), ["intensity", "magnitude"]);
assert.equal(warningChatDefinition({...input, topic: "earthquake", question: "予報と警報の違いは？"})[0].id, "eew");
assert.equal(warningChatDefinition({...input, question: "もっと簡単に", history: [{role: "user", content: "PLUM法とは？"}]} )[0].id, "plum");
assert.equal(warningChatDefinition({...input, question: "もっと簡単に", history: [{role: "user", content: "最新の地震の震源は？"}]}), null);
for (const question of ["最新の地震の震度は何ですか？", "警報って何時に解除される？", "この地震のPLUM法は？", "津波警報とは何か、今ここは安全？", "What does the current tsunami bulletin say?", "知らない専門語とは？"]) assert.equal(warningChatDefinition({...input, question}), null, question);
const terms = warningChatDefinition(input);
const a = await buildWarningChatDefinitionContext(input, terms, 0);
const b = await buildWarningChatDefinitionContext(input, terms, 1000);
assert.equal(a.revision, b.revision, "Repeated glossary questions retain stable evidence revision");
const english = buildWarningChatDefinitionAnswer({...input, language: "en"}, a);
assert.match(english.answer, /Magnitude|Seismic intensity/);
assert.doesNotMatch(english.answer, /一般的な用語/);
assert.deepEqual(english.evidenceIds, ["knowledge"]);
const messages = buildWarningChatMessages({...input, language: "zh", revision: a.revision}, a);
assert.match(messages[1].content, /knowledgeOnly/);
assert.doesNotThrow(() => parseWarningChatAnswer({response: JSON.stringify({answer: "Magnitude describes earthquake size, intensity describes local shaking.", evidenceIds: ["knowledge"]})}, a));
assert.throws(() => parseWarningChatAnswer({response: JSON.stringify({answer: "No earthquake happened.", evidenceIds: ["earthquake"]})}, a));
assert.equal(resolveWarningChatQuestionSelection({...input, topic: "earthquake", eventId: "20261101000000", question: "最新の地震の規模は？"}).eventId, "");
assert.equal(formatWarningChatHeight("1"), "1m");
for (const value of [null, "1m", "巨大", "高い"]) assert.equal(formatWarningChatHeight(value), value);
const ui = await readFile(new URL("../src/ui/warningChatModal.js", import.meta.url), "utf8");
assert.match(ui, /if \(value\.knowledgeOnly\)/);
console.log(`Warning chat glossary: ${WARNING_CHAT_GLOSSARY.length} source-backed groups, ${examples.length} term questions, current-vs-general scope, language, stable revisions and safe formats passed.`);
