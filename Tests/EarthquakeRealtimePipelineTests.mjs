import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createEarthquakeSummaryOverride } from "../src/earthquake/summaryOverride.js";
import { createRealtimeEarthquakeClient, normalizeP2pEarthquake, mergeRealtimeEarthquakes, reconcileEarthquakeSources, isConfirmedEarthquakeReport, isNewEarthquakeReport } from "../src/earthquake/realtimeEarthquake.js";
import * as format from "../src/earthquakeFormat.js";
import { escapeHtml } from "../src/utils/html.js";

const issued = Date.parse("2026-11-13T10:54:00+09:00");
const prompt = normalizeP2pEarthquake({ code: 551, id: "prompt", issue: { type: "ScalePrompt", time: "2026/11/13 10:54:00" }, earthquake: { time: "2026/11/13 10:52:00", maxScale: 30 } });
const destination = normalizeP2pEarthquake({ code: 551, id: "destination", issue: { type: "Destination", time: "2026/11/13 10:55:00" }, earthquake: { time: "2026/11/13 10:52:00", hypocenter: { name: "熊本県熊本地方", latitude: 32.8, longitude: 130.7, depth: 10, magnitude: 4 } } });
const xmlPrompt = { ...prompt, source: "xml", issueType: "", xmlCode: "VXSE51", reportPriority: 10 };
const xmlDestination = { ...destination, source: "xml", issueType: "", xmlCode: "VXSE52", reportPriority: 20 };
const detail = { ...destination, issueType: "ScaleAndDestination", maxIntensity: "3", reportTimeRaw: "2026-11-13T10:56:00+09:00" };
const xmlDetail = { ...detail, source: "xml", issueType: "", xmlCode: "VXSE53", reportPriority: 30 };

for (const pair of [[xmlPrompt, destination], [destination, xmlPrompt]]) {
  const [result] = mergeRealtimeEarthquakes([pair[0]], [pair[1]]);
  assert.equal(result.hypocenterName, "熊本県熊本地方", "XML優先度10でP2P震源情報を巻き戻さない");
  assert.equal(result.issueType, "Destination");
  assert.equal(result.xmlCode, "", "旧XMLの種別をP2P新報へ混入しない");
  assert.equal(result.maxIntensity, "3", "震度速報の区域震度を維持");
  assert.equal(result.depth, 10);
}
const updated = { ...destination, hypocenterName: "熊本県阿蘇地方", reportTimeRaw: "2026-11-13T10:55:10+09:00" };
assert.equal(mergeRealtimeEarthquakes([xmlDestination], [updated])[0].hypocenterName, updated.hypocenterName, "同種別では新しい発表時刻を優先");
assert.equal(mergeRealtimeEarthquakes([destination], [{ ...xmlDetail, hypocenterName: "震源調査中" }])[0].hypocenterName, destination.hypocenterName, "欠損した震源名で既知値を失わない");
assert.equal(isConfirmedEarthquakeReport(prompt), false);
assert.equal(isConfirmedEarthquakeReport(destination), false);
assert.equal(isConfirmedEarthquakeReport(detail), true);
assert.equal(isConfirmedEarthquakeReport(xmlDetail), true);
assert.equal(isNewEarthquakeReport(xmlPrompt, [destination]), false);
assert.equal(isNewEarthquakeReport(destination, [destination]), false);
assert.equal(isNewEarthquakeReport(updated, [destination]), true);

const connected = { status: "connected" };
assert.equal(reconcileEarthquakeSources([xmlPrompt, xmlDestination], [], [], connected).length, 0, "正常時XML速報を照合しない");
assert.equal(reconcileEarthquakeSources([xmlDetail], [], [destination], connected)[0].xmlCode, "VXSE53");
for (const status of ["error", "disconnected", "connecting", "stopped"]) {
  assert.equal(reconcileEarthquakeSources([xmlPrompt], [], [], { status })[0].xmlCode, "VXSE51");
  assert.equal(reconcileEarthquakeSources([xmlDestination], [prompt], [], { status })[0].hypocenterName, destination.hypocenterName);
  assert.equal(reconcileEarthquakeSources([xmlPrompt], [destination], [], { status })[0].hypocenterName, destination.hypocenterName, "障害中も旧報に巻き戻さない");
}
const previousEvent = { ...xmlDetail, eventKey: "older", eventTimeRaw: "2026-11-12T01:00:00+09:00" };
assert.equal(reconcileEarthquakeSources([previousEvent, xmlPrompt], [destination], [destination], connected).length, 2, "既往地震の一覧を維持");

let now = issued;
let nextTimer = 0;
let expired = 0;
const timers = new Map();
const controller = createEarthquakeSummaryOverride({ now: () => now,
  setTimer: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id; },
  clearTimer: (id) => timers.delete(id), onExpire: () => expired++ });
function advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); } }
assert.equal(controller.accept(prompt), true);
advance(9999);
assert.equal(controller.get().issueType, "ScalePrompt");
assert.equal(controller.accept(prompt, [prompt]), false, "重複で10秒を延長しない");
advance(1);
assert.equal(controller.get(), null);
assert.equal(expired, 1);
now = issued + 60_000;
assert.equal(controller.accept(destination, [prompt]), true);
assert.equal(controller.get().maxIntensity, "3", "震源情報要約も既知の最大震度を保持");
advance(5000);
assert.equal(controller.accept(updated, [destination]), true);
advance(5000);
assert.equal(controller.get().hypocenterName, updated.hypocenterName);
assert.equal(timers.size, 1, "旧タイマーを解放");
advance(5000);
assert.equal(controller.get(), null);
assert.equal(controller.accept(detail, [destination]), false, "確定震度は一時割込対象外");
assert.equal(controller.accept(prompt, [detail]), false, "古い速報では割り込まない");
now = issued + 180_000;
assert.equal(controller.accept(prompt), false, "起動時の古い速報では割り込まない");
now = issued - 31_000;
assert.equal(controller.accept(prompt), false, "未来時刻を排除");
now = issued;
assert.equal(controller.accept({ ...prompt, reportTimeRaw: "invalid" }), false);
controller.accept(prompt);
controller.clear();
assert.equal(timers.size, 0);
assert.equal(controller.get(), null);

assert.equal(format.getEarthquakeUnknownText(prompt), "調査中");
assert.equal(format.getEarthquakeUnknownText(detail), "調査中");
assert.equal(format.formatEarthquakeHypocenterText({ hypocenterName: "不明" }), "調査中");
assert.equal(format.formatEarthquakeDepthText(0), "ごく浅い");

// 実際の要約テンプレートを実行して文字と値を検査する。
const panelSource = readFileSync(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8");
const summarySource = panelSource.slice(panelSource.indexOf("function buildEarthquakeMobileContextMarkup("), panelSource.indexOf("function getTyphoonClassificationItems("));
const metricSource = panelSource.slice(panelSource.indexOf("function formatEarthquakeUnknownMetric("), panelSource.indexOf("function getEarthquakeTsunamiState("));
const ctx = vm.createContext({ ...format, escapeHtml, Number, localizeText: (s) => s,
  getEarthquakeIntensityColor: () => "#ffff00", getEarthquakeIntensityTextClass: () => "intensity-dark",
  formatMobileEarthquakeTime: (s) => s, buildEarthquakeMobileViewSwitch: () => "",
  buildMobileTsunamiStatusMarkup: () => "調査中", buildMobileEarthquakeSummaryCarousel: (data) => data.primaryMarkup });
vm.runInContext(metricSource + summarySource, ctx);
const markup = ctx.buildEarthquakeMobileContextMarkup(prompt, null, "none", null, "ok", null, [], null, true);
assert.match(markup, /震度速報/);
assert.match(markup, /調査中/);
assert.doesNotMatch(markup, /不明|M0\.0/);
const knownMarkup = ctx.buildEarthquakeMobileContextMarkup(destination);
assert.match(knownMarkup, /熊本県熊本地方/);
assert.match(knownMarkup, /M4\.0\/10km/);

// 実アプリの受信ハンドラーも、速報ではXMLを追加取得せず、EEW地図を維持する。
const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const handler = app.slice(app.indexOf("  async function handleRealtimeEarthquakeUpdate("), app.indexOf("  function followLatestEarthquakeUpdate("));
let xmlRequests = 0;
let waveUpdates = 0;
let panelUpdates = 0;
const eewEvents = [{ eventId: "eew-A", canRenderWaves: true }];
const calls = [];
const appCtx = vm.createContext({ realtimeEarthquakeUpdateId: 0, realtimeEarthquakeState: { connection: connected },
  latestDataByTab: { earthquake: { earthquakes: [] } }, activeEarthquakeId: "", activeTab: "earthquake", earthquakeContentMode: "earthquake",
  TABS: [{ id: "earthquake" }], recordDiagnostic() {}, getDisplayedEewEvents: () => eewEvents,
  earthquakeSummaryOverride: { accept: (report) => { calls.push(report.issueType); return true; } }, refreshActivePanel() { panelUpdates++; },
  isNewEarthquakeReport, isConfirmedEarthquakeReport, refreshEarthquakeTabData() { xmlRequests++; return Promise.resolve(); },
  mergeEarthquakeRealtimeData: async (data, items) => ({ ...data, earthquakes: mergeRealtimeEarthquakes(data.earthquakes, items) }),
  followLatestEarthquakeUpdate() {}, syncEewWaveAnimation() { waveUpdates++; }, updateCurrentView() { panelUpdates++; } });
vm.runInContext(handler, appCtx);
for (const item of [prompt, destination, detail]) await appCtx.handleRealtimeEarthquakeUpdate({ earthquakes: [item], incoming: item, connection: connected });
assert.deepEqual(calls, ["ScalePrompt", "Destination", "ScaleAndDestination"]);
assert.equal(xmlRequests, 1, "確定震度だけXML照合を要求");
assert.equal(waveUpdates, 3);
assert.equal(eewEvents.length, 1, "要約切替でEEW状態を消さない");
await appCtx.handleRealtimeEarthquakeUpdate({ earthquakes: [detail], connection: { status: "disconnected" } });
assert.equal(xmlRequests, 2, "P2P切断時にXMLへ即時フォールバック");
assert.ok(panelUpdates > 0);

// XMLの地図準備中に続報を受けた競合も実際の統合関数で再現する。
const mergeSource = app.slice(app.indexOf("  async function mergeEarthquakeRealtimeData("), app.indexOf("  function syncEewConnectionIndicator("));
let releaseMap;
let mapCalls = 0;
const mergeCtx = vm.createContext({ latestDataByTab: { earthquake: { earthquakes: [prompt] } },
  realtimeEarthquakeUpdateId: 1, realtimeEarthquakeState: { earthquakes: [prompt], connection: connected },
  mergeRealtimeEarthquakes, reconcileEarthquakeSources, isNewEarthquakeReport,
  getDisplayedEewEvents: () => [],
  attachEarthquakeMapDataList: async (items) => { if (mapCalls++ === 0) await new Promise((resolve) => { releaseMap = resolve; }); return items; } });
vm.runInContext(mergeSource, mergeCtx);
const pendingXml = mergeCtx.mergeEarthquakeRealtimeData({ earthquakes: [xmlPrompt] }, undefined, { fromXml: true });
mergeCtx.realtimeEarthquakeState.earthquakes = [destination];
mergeCtx.realtimeEarthquakeUpdateId++;
mergeCtx.latestDataByTab.earthquake = { earthquakes: [destination] };
releaseMap();
const raceResult = await pendingXml;
assert.equal(raceResult.earthquakes[0].hypocenterName, destination.hypocenterName, "非同期XML結果でP2P続報を上書きしない");
assert.equal(raceResult.earthquakes[0].magnitude, "4.0");
assert.equal(mapCalls, 2, "変更があった場合だけ再統合する");
await appCtx.handleRealtimeEarthquakeUpdate({ earthquakes: [detail], connection: connected });
await appCtx.handleRealtimeEarthquakeUpdate({ earthquakes: [detail], connection: { status: "stopped" } });
assert.equal(xmlRequests, 2, "ページ非表示で意図的に停止したときはXMLを追加取得しない");
assert.match(app, /function getDisplayedEewEvents\(\) \{\s*return localEewTestEvent \? \[localEewTestEvent\] : eewState\.activeEvents;/, "地図に渡すEEWは要約タイマーに依存しない");

// onerrorを伴わない正常closeでもconnectedのまま残さない。
class Socket { static sockets = []; constructor() { Socket.sockets.push(this); } close() {} }
const statuses = [];
const client = createRealtimeEarthquakeClient({ WebSocketImpl: Socket, fetchImpl: async () => ({ ok: true, json: async () => [] }), onStatus: (s) => statuses.push(s.status) });
client.start();
const socket = Socket.sockets[0];
socket.onopen();
socket.onclose();
assert.equal(client.getSnapshot().connection.status, "disconnected");
client.stop();
assert.ok(statuses.includes("disconnected"));
console.log("Earthquake realtime pipeline: source order, fallback, 10-second summary, UI labels and connection tests passed.");
