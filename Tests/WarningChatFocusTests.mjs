import assert from "node:assert/strict";
import {buildOfficialChatFacts, usesOfficialChatFacts} from "../functions/_shared/warningChatFacts.js";
import {buildWarningChatMessages} from "../functions/_shared/warningChatAnswer.js";
import {warningChatFocus} from "../functions/_shared/warningChatFocus.js";
import {addWarningChatKnowledge} from "../functions/_shared/warningChatKnowledge.js";

const input = {language: "ja", topic: "earthquake", question: "最新の地震の震源と規模は？", history: [], revision: "v1"};
const context = {topic: "earthquake", areaName: "東京都 千代田区", revision: "v1", issuedAt: "2026-11-14T02:01:00Z", sources: [],
  earthquake: {eventTime: "2026-11-14T02:00:00Z", location: "試験震源", magnitude: 4.3, depthKm: 25,
    maxObservedIntensity: "3", selectedMunicipalityIntensity: "1", reportState: "発表"}};
const answer = question => buildOfficialChatFacts({...input, question}, context).answer;
assert.match(answer(input.question), /試験震源[\s\S]*M4.3/);
assert.doesNotMatch(answer(input.question), /25km|震度|発表：|発生：/);
for (const question of ["深さは？", "その深さは？", "depth?"]) {
  assert.ok(usesOfficialChatFacts({...input, question}, input));
  const text = answer(question);
  assert.match(text, /25km/);
  assert.doesNotMatch(text, /M4.3|試験震源|震度|発表：/);
}
assert.deepEqual(warningChatFocus({...input, question: "震源の深さは？"}, context).fields, ["depth"]);
assert.match(answer("最新の地震でここの観測震度は？"), /千代田区の観測震度：1/);
assert.doesNotMatch(answer("最新の地震でここの観測震度は？"), /観測最大震度|M4.3|25km/);
assert.match(answer("最新の地震でここでの最大震度は？"), /千代田区の観測震度：1/);
assert.doesNotMatch(answer("最新の地震でここでの最大震度は？"), /観測最大震度：3/);
assert.match(answer("最新の地震の最大震度は？"), /観測最大震度：3/);
assert.doesNotMatch(answer("最新の地震の最大震度は？"), /千代田区/);
assert.match(answer("最新の地震の発表時刻は？"), /11:01:00/);
assert.doesNotMatch(answer("最新の地震の発表時刻は？"), /発生：|M4.3|25km/);
const unknown = buildOfficialChatFacts({...input, question: "深さは？"}, {...context, earthquake: {...context.earthquake, depthKm: null}}).answer;
assert.equal(unknown, "深さ調査中");
assert.equal(buildOfficialChatFacts({...input, question: "深さは？"}, {...context, earthquake: {...context.earthquake, depthKm: 0}}).answer, "ごく浅い");

const recent = {...context, recentEarthquakes: {searchedCount: 10, unavailableCount: 1, matches: [
  {...context.earthquake, observedIntensity: "1"}, {...context.earthquake, location: "別の試験震源", observedIntensity: "2"}
]}};
const countInput = {...input, earthquakeScope: "recent-local", question: "最近ここで震度を観測した地震は何件？"};
const count = buildOfficialChatFacts(countInput, recent).answer;
assert.match(count, /地震は2件です/);
assert.match(count, /新しい10地震|1件の電文は取得できていません/);
assert.doesNotMatch(count, /試験震源|M4.3|25km/);
assert.match(buildOfficialChatFacts({...countInput, question: "何件？一覧も見せて"}, recent).answer, /別の試験震源/);
const magnitude = buildOfficialChatFacts({...countInput, question: "最近ここが揺れた地震の規模は？"}, recent).answer;
assert.match(magnitude, /M4.3/); assert.doesNotMatch(magnitude, /25km/);

const tsunami = {...context, topic: "tsunami", tsunami: {state: "expired", validUntil: context.issuedAt, areas: [
  {name: "試験海岸", grade: "津波注意報", expectedHeight: "1m", arrivalCondition: "既に到達と推測"}
]}};
const tsunamiAnswer = question => buildOfficialChatFacts({...input, topic: "tsunami", question}, tsunami).answer;
assert.match(tsunamiAnswer("最新の津波の予想高さは？"), /期限切れ[\s\S]*予想高さ 1m/);
assert.doesNotMatch(tsunamiAnswer("最新の津波の予想高さは？"), /既に到達|到達予想時刻/);
assert.match(tsunamiAnswer("最新の津波の到達時刻は？"), /既に到達と推測/);
assert.doesNotMatch(tsunamiAnswer("最新の津波の到達時刻は？"), /予想高さ/);
assert.doesNotMatch(tsunamiAnswer("最新の津波情報はまだ有効？"), /試験海岸|予想高さ|到達/);
assert.match(tsunamiAnswer("最新の津波の予想高さと到達時刻は？"), /予想高さ 1m[\s\S]*既に到達/);

const messages = buildWarningChatMessages({...input, question: "深さは？", history: [
  {role: "user", content: input.question}, {role: "assistant", content: "試験震源、M4.3です。"}
]}, context);
assert.match(messages[0].content, /Requested aspects: depth\./);
assert.match(messages[0].content, /Do not append unrequested fields/);
assert.equal(messages.at(-1).content, "深さは？");
assert.ok(messages.some(message => message.content === input.question), "Keep the subject for a same-revision follow-up");
assert.equal(addWarningChatKnowledge(input, context).knowledge, undefined);
const definition = addWarningChatKnowledge({...input, question: "震源とは？"}, context);
assert.ok(definition.knowledge.length, "Requested terminology explanations remain supported");
assert.match(buildWarningChatMessages({...input, question: "最近ここが揺れた地震は何件？"}, recent)[0].content, /not an event list/);
assert.deepEqual(warningChatFocus({...input, question: "南海トラフの注意期間はいつまで？"}, {...context, knowledgeOnly: true}).fields, []);
const weather = {...context, topic: "weather", warnings: [{label: "強風注意報"}, {label: "乾燥注意報"}]};
const specific = question => buildOfficialChatFacts({...input, topic: "weather", question}, weather).answer;
assert.match(specific("今、強風注意報は出ている？"), /強風注意報/);
assert.doesNotMatch(specific("今、強風注意報は出ている？"), /乾燥注意報/);
assert.match(specific("今、大雨警報は出ている？"), /大雨.*掲載されていません/);
assert.doesNotMatch(specific("今、大雨警報は出ている？"), /強風注意報|乾燥注意報/);
assert.match(specific("現在発表中の警報・注意報は？"), /強風注意報、乾燥注意報/);
console.log("Warning chat focus: requested fields only, local vs maximum intensity, count vs list, follow-up, missing values, tsunami expiry and relevant safety caveats passed.");
