import assert from "node:assert/strict";
import {WARNING_CHAT_SPECIALIST_RECORDS, warningChatSpecialistPlan, SEISMIC_ADVISORY_SOURCES} from "../functions/_shared/warningChatSpecialist.js";
import {parseSeismicAdvisoryPage, buildSeismicAdvisoryContext} from "../functions/_shared/warningChatAdvisoryContext.js";
import {warningChatKnowledgeQuestion} from "../functions/_shared/warningChatGlossary.js";
import {buildWarningChatDefinitionContext} from "../functions/_shared/warningChatDefinition.js";
import {buildWarningChatMessages, parseWarningChatAnswer} from "../functions/_shared/warningChatAnswer.js";
import {WARNING_CHAT_LIMITS} from "../src/ai/warningChatPolicy.js";

const NOW = Date.parse("2026-11-14T03:00:00Z");
assert.equal(new Set(WARNING_CHAT_SPECIALIST_RECORDS.map(record => record.id)).size, WARNING_CHAT_SPECIALIST_RECORDS.length);
assert.equal(new Set(WARNING_CHAT_SPECIALIST_RECORDS.map(record => record.text)).size, WARNING_CHAT_SPECIALIST_RECORDS.length);
const input = {areaCode: "1310100", topic: "weather", language: "ja", question: "南海トラフ臨時情報の意味は？", history: []};
// Synthetic excerpts reproduce the official latest-publication block and the
// separate history table observed on the JMA pages on 2026-11-14. Not a real alert.
function page(kind, {date = "令和8年11月13日", title, headline = "試験用の公表内容です。", assessment = ""} = {}) {
  return `<div id="main"><h2>発表履歴</h2><div class="${kind === "nankai" ? "teirei" : "list"}"><div align="right">${date}<br>気象庁地震火山部</div><br><div align="center">${title ?? (kind === "nankai" ? "南海トラフ地震関連解説情報" : "北海道・三陸沖後発地震注意情報")}</div><p>＊＊　見出し　＊＊<br>${headline}<br>＊＊　本文　＊＊<br>${assessment}<br>＊＊　（参考）　＊＊<br>巨大地震警戒</p></div><ul class="historymenu"><table><tr><td>令和8年11月14日 南海トラフ地震臨時情報（巨大地震注意）</td></tr></table></ul></div>`;
}
const html = page("nankai", {assessment: "現在のところ、試験用の変化はありません。"});
const parsed = parseSeismicAdvisoryPage(html, "nankai", NOW);
assert.equal(parsed.title, "南海トラフ地震関連解説情報");
assert.equal(parsed.issuedDate, "2026-11-13");
assert.equal(parsed.currentState, "unverified");
assert.equal(parsed.datePrecision, "day");
assert.equal(parsed.assessment, "現在のところ、試験用の変化はありません。");
assert.doesNotMatch(parsed.headline, /巨大地震警戒|巨大地震注意/, "History and reference keywords are not current status");
assert.equal(parseSeismicAdvisoryPage(page("hokkaido", {date: "令和8年04月20日"}), "hokkaido", NOW).olderPublication, true);
for (const broken of ["", html.replace('class="teirei"', 'class="new-layout"'), html.replace("見出し", "別の欄"),
  html.replace("令和8年11月13日", "令和8年02月30日"), html.replace("令和8年11月13日", "令和9年11月13日"),
  html.replace("南海トラフ地震関連解説情報", "別の情報"), page("nankai", {headline: "長".repeat(901)})]) {
  assert.throws(() => parseSeismicAdvisoryPage(broken, "nankai", NOW));
}
assert.throws(() => parseSeismicAdvisoryPage(html, "untrusted", NOW));
assert.equal(warningChatSpecialistPlan({...input, question: "北海道の天気は？"}), null);
for (const question of ["南海トラフ巨大地震注意情報とは？", "北海道三陸沖後発地震注意情報について", "Nankai megathrust earthquake advisory criteria", "Hokkaido subsequent earthquake advisory"]) {
  assert.ok(warningChatSpecialistPlan({...input, question}), question);
}
const compare = warningChatSpecialistPlan({...input, question: "南海トラフと北海道・三陸沖後発地震注意情報の違いと期間は？"});
assert.deepEqual(compare.kinds, ["nankai", "hokkaido"]);
assert.equal(compare.current, false);
assert.ok(compare.records.some(record => record.id === "nankai-criteria"));
assert.ok(compare.records.some(record => record.id === "hokkaido-meaning"));
assert.ok(compare.records.some(record => record.id === "nankai-period"));
assert.ok(compare.records.some(record => record.id === "hokkaido-period"));
const slow = warningChatSpecialistPlan({...input, question: "南海トラフのゆっくりすべりでは1週間で終わる？"});
assert.ok(slow.records.some(record => record.id === "nankai-period"));
assert.ok(slow.records.some(record => record.id === "slow-slip"));
assert.match(slow.records.find(record => record.id === "nankai-period").text, /一律1週間ではなく/);
assert.match(WARNING_CHAT_SPECIALIST_RECORDS.find(record => record.id === "hokkaido-period").text, /発表からではなく先発地震/);
for (const question of ["南海トラフ情報は現在発表中？", "南海トラフの注意情報は今出てる？", "後発地震注意情報はまだ有効？", "Is the Nankai advisory currently active?"]) {
  assert.equal(warningChatSpecialistPlan({...input, question}).current, true, question);
}
assert.equal(warningChatSpecialistPlan({...input, question: "南海トラフ臨時情報が発表された場合の行動は？"}).current, false);
const followup = warningChatSpecialistPlan({...input, question: "それはいつまで？", history: [{role: "user", content: "北海道・三陸沖後発地震注意情報の意味は？"}]} );
assert.deepEqual(followup.kinds, ["hokkaido"]);
assert.ok(followup.records.some(record => record.id === "hokkaido-period"));
assert.equal(warningChatSpecialistPlan({...input, question: "それはいつまで？", history: [{role: "user", content: "南海トラフの情報"}, {role: "user", content: "大雨警報"}]}), null, "Do not revive an unrelated older subject");
const noFetch = async () => { throw new Error("General explanations must not fetch unrelated bulletins"); };
const general = await buildSeismicAdvisoryContext(input, compare, {now: NOW, fetcher: noFetch});
assert.equal(general.knowledgeOnly, true); assert.equal(general.issuedAt, null);
assert.ok(!("advisories" in general));
assert.equal(general.revision, (await buildSeismicAdvisoryContext(input, compare, {now: NOW + 1000, fetcher: noFetch})).revision);
assert.equal(new Set(general.sources.map(source => source.url)).size, general.sources.length);
for (const source of general.sources) assert.match(new URL(source.url).hostname, /(?:^|\.)jma\.go\.jp$/u);
const currentPlan = warningChatSpecialistPlan({...input, question: "現在の南海トラフと北海道・三陸沖後発地震注意情報を確認したい"});
let requests = [];
const fetcher = async (url, options) => {
  requests.push(url);
  assert.equal(options.redirect, "manual"); assert.equal(options.cf.cacheTtl, 0);
  assert.ok(Object.values(SEISMIC_ADVISORY_SOURCES).some(source => source.url === url));
  return new Response(url.includes("nteq") ? html : page("hokkaido", {date: "令和8年04月20日"}));
};
const current = await buildSeismicAdvisoryContext(input, currentPlan, {fetcher, now: NOW});
assert.equal(requests.length, 2);
assert.equal(current.knowledgeOnly, false);
assert.equal(current.advisories.length, 2);
assert.ok(current.advisories.every(item => item.currentState === "unverified"));
assert.equal(current.advisories[1].olderPublication, true);
const mixed = await buildSeismicAdvisoryContext(input, currentPlan, {now: NOW, fetcher: async url => url.includes("nteq") ? new Response(html) : new Response("failed", {status: 500})});
assert.equal(mixed.advisories[0].availability, "available");
assert.equal(mixed.advisories[1].availability, "unavailable");
assert.notEqual(current.revision, mixed.revision);
for (const response of [new Response("redirect", {status: 302}), new Response("changed markup"), new Response("x".repeat(2 * 1024 * 1024 + 1))]) {
  const failed = await buildSeismicAdvisoryContext(input, {...currentPlan, kinds: ["nankai"]}, {now: NOW, fetcher: async () => response});
  assert.equal(failed.advisories[0].availability, "unavailable");
}
for (const context of [general, current, mixed]) for (const language of ["ja", "easy", "en", "zh"]) {
  const messages = buildWarningChatMessages({...input, language, history: [{role: "user", content: "長".repeat(400)}], revision: context.revision}, context);
  assert.ok(new TextEncoder().encode(JSON.stringify(messages)).byteLength <= WARNING_CHAT_LIMITS.promptBytes);
  const evidence = JSON.parse(messages[1].content.split("\n").slice(1).join("\n"));
  assert.ok(!evidence.knowledge.some(item => item.en));
  assert.match(messages[0].content, /NOT a verified active-status feed/);
  assert.doesNotThrow(() => parseWarningChatAnswer({response: JSON.stringify({answer: "公式資料で制度を説明しています。現在の有効性は断定できません。", evidenceIds: [context.knowledgeOnly ? "knowledge" : "advisory"]})}, context));
}
assert.throws(() => parseWarningChatAnswer({response: JSON.stringify({answer: "震度9です", evidenceIds: ["knowledge"]})}, general));
assert.doesNotThrow(() => parseWarningChatAnswer({response: JSON.stringify({answer: "先発地震から1週間が目安です。", evidenceIds: ["hokkaido-period"]})}, general));
assert.throws(() => parseWarningChatAnswer({response: JSON.stringify({answer: "期間は不明です。", evidenceIds: ["made-up-source"]})}, general));
assert.throws(() => parseWarningChatAnswer({response: JSON.stringify({answer: "ゆっくりすべりの場合は変化が収まるまでです。", evidenceIds: ["nankai-period"]})}, general), /incorrect_slow_slip_period/);
for (const answer of ["現在、巨大地震注意が発表中です。", "今は発表されていません。", "The advisory is currently active.", "No advisory is in effect."]) {
  assert.throws(() => parseWarningChatAnswer({response: JSON.stringify({answer, evidenceIds: ["advisory"]})}, current), /unverified_advisory_status/);
}
for (const question of ["なぜ小さい地震でも地盤によって揺れる？", "高層ビルが共振する仕組みは？", "MwとMが違う理由を詳しく", "Why does soft ground amplify shaking?"]) {
  const terms = warningChatKnowledgeQuestion({...input, question}); assert.ok(terms?.length, question);
  const context = await buildWarningChatDefinitionContext(input, terms, NOW);
  assert.doesNotThrow(() => buildWarningChatMessages(input, context));
}
assert.ok(warningChatKnowledgeQuestion({...input, question: "Mが2増えるとエネルギーが増える仕組みは？"}).some(term => term.id === "magnitude"));
assert.doesNotThrow(() => parseWarningChatAnswer({response: JSON.stringify({answer: "現在、発表中であるかどうかは確認できません。", evidenceIds: ["explanation"]})}, current));
for (const question of ["現在の地震の規模は？", "この地震が大きく揺れた理由は？", "最新の津波でここは安全？", "未知の言葉の仕組みは？"]) {
  assert.equal(warningChatKnowledgeQuestion({...input, question}), null, question);
}
console.log("Specialist chat: criteria, comparisons, periods/slow-slip exception, follow-ups, advanced mechanisms, current-vs-general scope, official page parsing, stale/failed sources, revisions and prompt budgets passed.");
