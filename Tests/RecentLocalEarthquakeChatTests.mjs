import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {loadWarningChatContext} from "../functions/_shared/warningChatContext.js";
import {loadRecentLocalEarthquakes, RECENT_LOCAL_EARTHQUAKE_LIMIT} from "../functions/_shared/recentLocalEarthquakes.js";
import {normalizeWarningChatInput, resolveWarningChatQuestionSelection, WARNING_CHAT_LIMITS} from "../src/ai/warningChatPolicy.js";
import {buildWarningChatMessages, parseWarningChatAnswer, warningChatModelEvidence} from "../functions/_shared/warningChatAnswer.js";
import {renderSeismicChatEvidence} from "../src/ui/seismicChatEvidence.js";
import {onRequest} from "../functions/api/warning-chat.js";
import {buildOfficialChatFacts, usesOfficialChatFacts} from "../functions/_shared/warningChatFacts.js";
import {addWarningChatKnowledge} from "../functions/_shared/warningChatKnowledge.js";

// Synthetic JMA VXSE5k fixtures. Real seven-digit City.Code was checked against
// https://www.jma.go.jp/bosai/quake/data/list.json and its VXSE5k JSON on 2026-11-14.
const NOW = Date.parse("2026-11-14T12:00:00Z");
const areaCode = "1310100";
const question = "最近の地震でここで震度を観測した地震はありますか？";
const catalog = {offices: {"130000": {name: "東京都"}}, class10s: {"130010": {parent: "130000"}}, class15s: {"130011": {parent: "130010"}}, class20s: {[areaCode]: {name: "千代田区", parent: "130011"}}};
const entry = (n, overrides = {}) => ({eid: `20261114${String(12 - n).padStart(2, "0")}0000`, rdt: "2026-11-14T15:00:00+09:00", at: `2026-11-14T${String(12 - n).padStart(2, "0")}:00:00+09:00`, json: `20261114150000_20261114${String(12 - n).padStart(2, "0")}0000_VXSE5k_1.json`, ...overrides});
function bulletin(item, {local = true, cancelled = false, observed = "2"} = {}) {
  return {Control: {Status: "通常"}, Head: {EventID: item.eid, ReportDateTime: item.rdt, InfoType: cancelled ? "取消" : "発表", Title: "震源・震度情報"}, Body: {
    Earthquake: {OriginTime: item.at, Magnitude: "3.5", Hypocenter: {Area: {Name: "試験用震源", Coordinate: "+35.0+139.0-10000/"}}},
    Intensity: {Observation: {MaxInt: "3", Pref: [{Area: [{Name: "試験区域", MaxInt: "3", City: [{Code: local ? areaCode : "1310200", Name: "試験市区", MaxInt: observed}]}]}]}}
  }};
}
function source(items, options = {}) {
  const calls = []; let concurrent = 0; let maxConcurrent = 0;
  const fetcher = async url => {
    calls.push(String(url));
    if (String(url).endsWith("area.json")) return Response.json(catalog);
    if (String(url).endsWith("list.json")) return Response.json(items);
    const index = items.findIndex(item => String(url).endsWith(item.json));
    assert.ok(index >= 0);
    concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent);
    await Promise.resolve(); await Promise.resolve();
    concurrent--;
    if (options.fail?.includes(index)) return new Response(null, {status: 503});
    return Response.json(bulletin(items[index], options.reports?.[index]));
  };
  return {fetcher, calls, get maxConcurrent() {return maxConcurrent;}};
}
const input = normalizeWarningChatInput({areaCode, topic: "weather", language: "ja", consent: true, question});
assert.deepEqual(resolveWarningChatQuestionSelection(input), {topic: "earthquake", eventId: "", forecastAreaCode: "", earthquakeScope: "recent-local"});
assert.equal(resolveWarningChatQuestionSelection({...input, question: "Were any recent earthquakes felt here?"}).earthquakeScope, "recent-local");
assert.equal(resolveWarningChatQuestionSelection({...input, question: "警報はいつまで？"}).topic, "weather");
assert.equal(resolveWarningChatQuestionSelection({...input, question: "最新の地震の津波に関する発表は？"}).topic, "earthquake");
assert.equal(resolveWarningChatQuestionSelection({...input, topic: "earthquake", earthquakeScope: "recent-local", question: "現在発表中の警報・注意報は？"}).topic, "weather");
assert.equal(resolveWarningChatQuestionSelection({...input, topic: "earthquake", question: "津波警報は？"}).topic, "tsunami");
assert.equal(resolveWarningChatQuestionSelection({...input, topic: "earthquake", earthquakeScope: "recent-local", question: "その地震はいつ？"}).earthquakeScope, "recent-local");
assert.equal(resolveWarningChatQuestionSelection({...input, topic: "earthquake", earthquakeScope: "recent-local", question: "最新の地震の震源は？"}).earthquakeScope, undefined);
const recentSelection = {topic: "earthquake", earthquakeScope: "recent-local"};
assert.ok(usesOfficialChatFacts({...input, question: "いつ？"}, recentSelection));
assert.ok(usesOfficialChatFacts({...input, language: "en", question: "When?"}, recentSelection));
for (const question of ["最近の地震はなぜ起きた？", "最近の地震でここは安全？", "その地震の津波について説明して", "Why were those earthquakes felt here?"]) {
  assert.equal(usesOfficialChatFacts({...input, question}, recentSelection), false, "Do not substitute an observation list for an explanation or risk question");
}

const items = [entry(0), entry(1), entry(2)];
const fixtures = source(items, {reports: [{local: false}, {local: true}, {cancelled: true}]});
const options = {...resolveWarningChatQuestionSelection(input), now: NOW, fetcher: fixtures.fetcher};
const context = await loadWarningChatContext(areaCode, options);
assert.equal(context.recentEarthquakes.matches.length, 1, "A local observation in the second event must not be missed");
assert.equal(context.recentEarthquakes.matches[0].eventId, items[1].eid);
assert.equal(context.recentEarthquakes.matches[0].observedIntensity, "2", "Use city observation, not national max 3");
assert.match(context.recentEarthquakes.matches[0].eventTimeJst, /11:00 JST/);
assert.equal(context.recentEarthquakes.cancelledCount, 1);
assert.equal(context.recentEarthquakes.unconfirmedMunicipalityCount, 1);
assert.equal(context.earthquake, null);
assert.equal(context.areaName, "東京都 千代田区");
assert.ok(fixtures.maxConcurrent <= 3);
const prompt = buildWarningChatMessages(input, context);
assert.match(prompt[0].content, /Answer the user's actual question directly/);
assert.match(prompt[1].content, /recentEarthquakes/);
assert.ok(new TextEncoder().encode(JSON.stringify(prompt)).byteLength <= WARNING_CHAT_LIMITS.promptBytes);
const answer = {response: JSON.stringify({answer: "はい。千代田区では11月14日11時の地震で震度2を観測しています。確認範囲は最近3件です。", evidenceIds: ["recent-earthquakes"]})};
assert.match(parseWarningChatAnswer(answer, context).answer, /はい/);
assert.match(buildOfficialChatFacts(input, context).answer, /はい。[\s\S]*当地の震度 2/);
assert.match(buildOfficialChatFacts({...input, question: "その地震はいつ起きた？"}, context).answer, /11:00:00/);
const definition = addWarningChatKnowledge({...input, question: "震度とマグニチュードはどう違うの？"}, context);
assert.match(definition.knowledge[0].text, /揺れの強さ/);
assert.ok(definition.sources.some(source => source.url.endsWith("faq27.html")));
assert.match(buildWarningChatMessages({...input, question: "震度とマグニチュードはどう違うの？"}, definition)[0].content, /General questions about terminology/);
assert.throws(() => parseWarningChatAnswer({response: JSON.stringify({answer: "震度9です", evidenceIds: ["recent-earthquakes"]})}, context));
const utcOutlook = {topic: "weather", outlookAvailable: true, outlook: [{slots: [{time: "2026-12-24T08:00:00Z", endTime: "2026-12-24T09:00:00Z"}]}]};
assert.equal(warningChatModelEvidence(utcOutlook).outlook[0].slots[0].endTime, "2026-12-24T18:00:00.000+09:00");
assert.equal(utcOutlook.outlook[0].slots[0].endTime, "2026-12-24T09:00:00Z", "Do not mutate the original official evidence");
assert.doesNotThrow(() => parseWarningChatAnswer({response: JSON.stringify({answer: "掲載された時間帯は17時から18時までです。解除時刻ではありません。", evidenceIds: ["outlook"]})}, utcOutlook));

const partial = await loadRecentLocalEarthquakes(areaCode, {now: NOW, ...source(items, {fail: [1], reports: [{local: false}, {}, {local: false}]})});
assert.equal(partial.recentEarthquakes.unavailableCount, 1);
assert.equal(partial.recentEarthquakes.matches.length, 0);
assert.match(partial.recentEarthquakes.scope, /震度0.*意味しません/);
const many = Array.from({length: 12}, (_, n) => entry(n));
const boundedSource = source(many);
const bounded = await loadRecentLocalEarthquakes(areaCode, {now: NOW, fetcher: boundedSource.fetcher});
assert.equal(bounded.recentEarthquakes.searchedCount, RECENT_LOCAL_EARTHQUAKE_LIMIT);
assert.equal(bounded.recentEarthquakes.unsearchedCount, 2);
assert.equal(boundedSource.calls.length, RECENT_LOCAL_EARTHQUAKE_LIMIT + 2);
assert.ok(boundedSource.maxConcurrent <= 3);
assert.ok(new TextEncoder().encode(JSON.stringify(buildWarningChatMessages(input, bounded))).byteLength <= WARNING_CHAT_LIMITS.promptBytes);
const empty = await loadRecentLocalEarthquakes(areaCode, {now: NOW, ...source([])});
assert.equal(empty.availability, "empty");
assert.equal(empty.recentEarthquakes.searchedCount, 0);

// Exercise API routing and the second official-data check, including a source
// update during inference. No live AI, credentials or production writes.
const originalFetch = globalThis.fetch; const RealDate = Date;
const db = {prepare(sql) {return {bind() {return this;}, async first() {
  if (sql.includes("JOIN quiz_accounts")) return {id: "test-user", display_name: "Test"};
  if (sql.startsWith("SELECT value")) return {value: '{"allowed":true}'};
  if (sql.includes("INSERT INTO app_records")) return {used: 1, accountUsed: 1};
  throw Error("Unexpected SQL");
}, async run() {return {};}};}};
try {
  globalThis.Date = class extends RealDate {constructor(...args) {super(...(args.length ? args : [NOW]));} static now() {return NOW;}};
  let calls = 0;
  globalThis.fetch = fixtures.fetcher;
  const env = {NOTIFICATIONS_DB: db, WARNING_CHAT_ENABLED: "true", AI: {async run(_model, args) {calls++; assert.match(JSON.stringify(args.messages), /recentEarthquakes/); return answer;}}};
  const request = (extra = {}) => new Request("https://meteoscope.pages.dev/api/warning-chat", {method: "POST", headers: {Authorization: "Bearer test-session", "Content-Type": "application/json"}, body: JSON.stringify({...input, consent: true, ...extra})});
  const response = await onRequest({request: request(), env});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.context.earthquakeScope, "recent-local");
  assert.equal(body.answerKind, "official");
  assert.match(body.answer, /はい/);
  assert.equal(calls, 0, "A factual lookup must not spend AI tokens or allow model prose to deny an observation");
  const latestResponse = await onRequest({request: request({topic: "earthquake", question: "最新の地震の規模と深さは？"}), env});
  assert.equal(latestResponse.status, 200);
  assert.match((await latestResponse.json()).answer, /M3\.5 · 深さ10km/);
  assert.equal(calls, 0, "Simple single-event fields also use no inference");
  globalThis.fetch = async () => {throw new Error("Live sources intentionally unavailable");};
  const glossaryResponse = await onRequest({request: request({question: "PLUM法とは？"}), env});
  assert.equal(glossaryResponse.status, 200, "Definitions do not depend on live bulletin availability");
  const glossary = await glossaryResponse.json();
  assert.equal(glossary.context.knowledgeOnly, true);
  assert.match(glossary.answer, /PLUM/);
  assert.equal(calls, 0);
  const refinement = await onRequest({request: request({question: "もっと簡単に", revision: glossary.context.revision,
    history: [{role: "user", content: "PLUM法とは？"}, {role: "assistant", content: glossary.answer}]}),
    env: {...env, AI: {async run(_model, args) {
      calls++; assert.match(JSON.stringify(args.messages), /knowledgeOnly/);
      return {response: JSON.stringify({answer: "近くで観測した揺れを使って、周りの揺れを予想する方法です。", evidenceIds: ["knowledge"]})};
    }}}});
  assert.equal(refinement.status, 200, "A terminology follow-up keeps its subject without fetching live bulletins");
  assert.equal(calls, 1, "An explicit refinement uses one inference, never an automatic retry");
  let updated = false;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith(items[1].json) && updated) return Response.json(bulletin(items[1], {observed: "3"}));
    return fixtures.fetcher(url, options);
  };
  const changing = {...env, AI: {async run() {updated = true; return answer;}}};
  assert.equal((await onRequest({request: request({topic: "earthquake", earthquakeScope: "recent-local", question: "この観測結果を説明して"}), env: changing})).status, 409);
} finally {globalThis.fetch = originalFetch; globalThis.Date = RealDate;}

const originalDocument = globalThis.document;
try {
  const element = () => ({textContent: "", children: [], append(...nodes) {this.children.push(...nodes);}});
  globalThis.document = {createElement: element};
  const panel = element(); renderSeismicChatEvidence(panel, context);
  assert.match(panel.children.map(item => item.textContent).join("\n"), /千代田区の観測震度 2/);
} finally {globalThis.document = originalDocument;}
const ui = await readFile(new URL("../src/ui/warningChatModal.js", import.meta.url), "utf8");
assert.match(ui, /value\.topic !== topic\.value/);
assert.match(ui, /clearConversation\(\{keepCurrentTurn: true\}\)/);
console.log("Recent local earthquake chat: routing, multi-event observations, city scope, cancellation, missing data, bounded concurrency, prompt budget and revision tests passed.");
