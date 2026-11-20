import assert from "node:assert/strict";
import {
  EEW_CANCEL_DISPLAY_MS,
  EEW_CANCEL_TOMBSTONE_MS,
  createWolfxEewClient,
  createWolfxEewEventStore,
  isWolfxEewActive,
  normalizeWolfxEew
} from "../src/eew/wolfxEew.js";
import { getWaveDistancesByJma2001 } from "../src/eew/jma2001TravelTime.js";
import {
  buildEewForecastAreaFeatureCollection,
  createEewForecastAreaSignature,
  EEW_WARNING_AREA_COLOR
} from "../src/eew/eewForecastAreas.js";
import { parseJstDateTime } from "../src/utils/jstDateTime.js";
import { createEewAutoFocus } from "../src/eew/eewAutoFocus.js";
import {
  createLocalEewTestEvent,
  isLocalEewTestEnvironment
} from "../src/eew/localEewTest.js";

const BASE_TIME = Date.parse("2026-11-10T12:00:00+09:00");

// CodeType identifies intensity-only level-method announcements, including
// compatible values that could otherwise look like a usable source estimate.
for (const Accuracy of [{}, { Epicenter: "IPF法(3点)", Depth: "IPF法(3点)" }]) {
  const event = normalizeWolfxEew(makeEew({ CodeType: "最大予測震度のみの緊急地震速報",
    Accuracy, Magnitude: 0, Depth: 10, isAssumption: false }), { receivedAt: BASE_TIME });
  assert.equal(event.methodType, "level");
  assert.equal(event.hypocenterMethod, "level");
  assert.equal(event.hypocenterReliability, "low");
  assert.equal(event.canRenderWaves, false, "compatible detection time and assumed depth cannot produce P/S fronts");
  assert.equal(event.isAssumption, false, "level method is distinct from JMA's formal assumed source flag");
  assert.equal(event.hypocenterMarkerUncertain, true);
  assert.equal(event.hypocenterStatusLabel, "震源調査中");
  assert.equal(isWolfxEewActive(event, BASE_TIME), true, "intensity-only bulletins are still displayed");
}
for (const CodeType of ["Ｍ、最大予測震度及び主要動到達予測時刻の緊急地震速報", "最大予測震度のみの緊急地震速報ではない", "不明", null]) {
  assert.equal(normalizeWolfxEew(makeEew({ CodeType })).methodType, "unknown", "CodeType does not classify all other source methods");
}
{
  const store = createWolfxEewEventStore({ now: () => BASE_TIME });
  const focus = createEewAutoFocus({ getItem: () => "1" });
  const moves = [];
  store.accept(makeEew({ CodeType: "最大予測震度のみの緊急地震速報", Depth: 10, Magnitude: 0 }));
  assert.equal(focus.focus(store.getSnapshot().activeEvents, point => moves.push(point)), false, "level reports never move the map to a provisional source");
  store.accept(makeEew({ Serial: 2, AnnouncedTime: "2026/11/10 11:59:55", CodeType: "Ｍ、最大予測震度及び主要動到達予測時刻の緊急地震速報",
    Accuracy: { Epicenter: "IPF法(3点)", Depth: "IPF法(3点)" } }));
  const revised = store.getSnapshot().activeEvents[0];
  assert.equal(revised.hypocenterMethod, "ipf");
  assert.equal(revised.canRenderWaves, true);
  assert.equal(revised.hypocenterMarkerUncertain, false);
  assert.equal(revised.hypocenterStatusLabel, "");
  assert.equal(focus.focus([revised], point => moves.push(point)), true, "a later usable report restores normal handling for the same event");
  assert.equal(moves.length, 1);
}

// Wolfx HTTP response checked 2026-11-12: Accuracy contains spaced IPF labels.
// https://api.wolfx.jp/jma_eew.json (event 20261111125704)
for (const label of ["IPF 法（5 点以上）", "IPF法(5点以上)", "IPF 法（3 点）"]) {
  const payload = { EventID: "ipf-format", OriginTime: "2026/11/10 11:59:30",
    AnnouncedTime: "2026/11/10 12:00:00", Latitude: 36.3, Longitude: 141.7,
    Depth: 30, Magnitude: 4.5, Accuracy: { Epicenter: label, Depth: label }, isFinal: true };
  const event = normalizeWolfxEew(payload, { receivedAt: BASE_TIME });
  assert.equal(event.hypocenterReliability, "usable", label);
  assert.equal(event.canRenderWaves, true, label);
  const waves = getWaveDistancesByJma2001(event.depth, 30);
  assert.ok(waves.pDistanceKm > waves.sDistanceKm && waves.sDistanceKm > 0);
  for (const invalid of ["IPF 法（1 点）", "IPF法(6点)", "不明", ""]) {
    const excluded = normalizeWolfxEew({ ...payload, Accuracy: { Epicenter: invalid, Depth: invalid } });
    assert.equal(excluded.canRenderWaves, false, invalid);
  }
  assert.equal(normalizeWolfxEew({ ...payload, isAssumption: true }).canRenderWaves, false);
  assert.equal(normalizeWolfxEew({ ...payload, Depth: null }).canRenderWaves, false);
}

for (const scenario of ["level", "accuracy-unknown", "depth-unknown", "one-point", "plum", "assumption"]) {
  assert.equal(createLocalEewTestEvent(scenario, { now: BASE_TIME }).canRenderWaves, false, scenario);
}
assert.equal(createLocalEewTestEvent("mixed", { now: BASE_TIME }).canRenderWaves, true);
for (const scenario of ["transition-one", "transition-assumption", "transition-mixed"]) {
  const first = createLocalEewTestEvent(scenario, { now: BASE_TIME, step: 0 });
  const second = createLocalEewTestEvent(scenario, { now: BASE_TIME + 5000, step: 1 });
  assert.equal(first.eventId, second.eventId);
  assert.ok(second.serial > first.serial);
  assert.equal(second.canRenderWaves, true);
  assert.equal(second.isAssumption, false);
}
for (const OriginalText of ["PLUM法とは揺れから予測する手法です", "PLUM法を使用していません"]) {
  assert.equal(normalizeWolfxEew({ EventID: "negative", OriginalText, isPlum: true }).isPlum, false);
}
{
  const region = normalizeWolfxEew({ EventID: "regions", WarnArea: [{ Chiiki: "茨城県北部", Type: "警報", Time: "2026/11/10 12:00:00" }] }).warnAreas[0];
  assert.equal(region.intensityMethod, "unknown");
  assert.equal(region.arrivalTime, null);
  assert.equal(region.isWarning, true);
  assert.equal(region.announcedTime, null, "regional Time is not a bulletin announcement time");
  assert.equal(region.regionalTime, "2026-11-10T03:00:00.000Z");
  assert.equal(region.arrived, null);
}

for (const [announced, time, expected] of [
  ["2026/11/10 12:00:00", "120030", "2026-11-10T03:00:30.000Z"],
  ["2026/11/10 23:59:58", "000010", "2026-11-10T15:00:10.000Z"],
  ["2026/11/11 00:00:02", "235958", "2026-11-10T14:59:58.000Z"],
  ["2026/11/10 12:00:00", "//////", null],
  ["2026/11/10 12:00:00", "246000", null],
  ["2026/11/10 12:00:00", "126001", null],
  [null, "120030", null]
]) {
  const event = normalizeWolfxEew(makeEew({AnnouncedTime:announced, WarnArea:[{Chiiki:"茨城県北部",Time:time,Arrive:"主要動到達時刻の予測"}]}));
  assert.equal(event.warnAreas[0].arrivalTime,expected, `${announced} / ${time}`);
  assert.equal(event.warnAreas[0].announcedTime,null);
}
{
  const event = normalizeWolfxEew(makeEew({Accuracy:{Epicenter:"IPF法(3点)",Depth:"IPF法(3点)"},isAssumption:false,
    WarnArea:[{Chiiki:"茨城県北部",Time:"120030",Arrive:"主要動到達時刻の予測なし（PLUM 法による予測）",Type:"警報",Shindo1:"5強",Shindo2:"4"}]}));
  const area=event.warnAreas[0];
  assert.equal(area.arrivalTime,null,"PLUM first-prediction time must never become an arrival countdown");
  assert.equal(area.plumPredictionTime,"2026-11-10T03:00:30.000Z");
  assert.equal(area.intensityMethod,"plum");
  assert.equal(area.arrived,null);
  assert.equal(event.isAssumption,false,"regional PLUM does not imply a formally assumed source");
  assert.equal(event.canRenderWaves,true,"regional PLUM does not discard a usable normal hypocenter");
  for(const Arrive of ["未定義の説明","PLUM法による予測ではない",null]) {
    const row=normalizeWolfxEew(makeEew({WarnArea:[{Chiiki:"茨城県北部",Time:"120030",Arrive}]})).warnAreas[0];
    assert.equal(row.intensityMethod,"unknown");
    assert.equal(row.arrived,null,"an unknown description must not mean not-yet-arrived");
    assert.equal(row.arrivalTime,null);
    assert.equal(row.regionalTime,"2026-11-10T03:00:30.000Z");
  }
  for(const Arrive of [true,false]) {
    const row=normalizeWolfxEew(makeEew({WarnArea:[{Chiiki:"茨城県北部",Time:"120030",Arrive}]})).warnAreas[0];
    assert.equal(row.arrived,Arrive,"legacy boolean values remain compatible");
  }
  const arrived=normalizeWolfxEew(makeEew({WarnArea:[{Chiiki:"茨城県北部",Time:"//////",Arrive:"既に主要動到達と予測"}]})).warnAreas[0];
  assert.equal(arrived.arrived,true);
  assert.equal(arrived.arrivalTime,null);
}

for (const [originalText, expected] of [
  ["1観測点", "confirmed"], ["１観測点", "confirmed"],
  ["1つの観測点", "confirmed"], ["11観測点", "not-one-point"],
  ["21観測点", "not-one-point"], ["101観測点", "not-one-point"],
  ["1観測点ではない", "not-one-point"], ["1観測点ではありません", "not-one-point"],
  ["2観測点", "not-one-point"], ["記載なし", "unknown"],
  ["1観測点、続いて2観測点", "unknown"]
]) {
  const event = normalizeWolfxEew({ EventID: "detection-test", OriginalText: originalText });
  assert.equal(event.onePointDetectionStatus, expected, originalText);
  assert.equal(event.isOnePointDetection, expected === "confirmed", originalText);
}

for (const code of [1, 2, 3, 4, 9, "独自の説明1", null]) {
  const event = normalizeWolfxEew({ EventID: "accuracy-test", Accuracy: { Epicenter: code } });
  assert.equal(event.onePointDetectionStatus, "unknown", "精度コードだけで観測点数を断定しない");
}

assert.equal(isLocalEewTestEnvironment({ hostname: "localhost" }), true);
assert.equal(isLocalEewTestEnvironment({ hostname: "127.0.0.1" }), true);
assert.equal(isLocalEewTestEnvironment({ hostname: "::1" }), true);
assert.equal(isLocalEewTestEnvironment({ hostname: "meteoscope.pages.dev" }), false);
assert.equal(createLocalEewTestEvent("none", { now: BASE_TIME }), null);

{
  const forecast = createLocalEewTestEvent("forecast", { now: BASE_TIME });
  const warning = createLocalEewTestEvent("warning", { now: BASE_TIME });
  const onePoint = createLocalEewTestEvent("one-point", { now: BASE_TIME });
  const plum = createLocalEewTestEvent("plum", { now: BASE_TIME });
  const assumption = createLocalEewTestEvent("assumption", { now: BASE_TIME });
  const final = createLocalEewTestEvent("final", { now: BASE_TIME });
  const cancellation = createLocalEewTestEvent("cancel", { now: BASE_TIME });
  assert.equal(forecast.isLocalTest, true, "ローカルテスト速報を明示する");
  assert.equal(forecast.isWarn, false, "予報シナリオを生成する");
  assert.equal(warning.isWarn, true, "警報シナリオを生成する");
  assert.ok(warning.warnAreas.every(area => area.isWarning === true));
  assert.ok(forecast.warnAreas.every(area => area.isWarning === false));
  assert.equal(onePoint.isOnePointDetection, true, "1点検知シナリオは明示情報から判定する");
  assert.equal(plum.methodType, "plum", "PLUM法シナリオを生成する");
  assert.equal(plum.canRenderWaves, false, "PLUM法テストでは到達円を描かない");
  assert.equal(assumption.methodType, "assumption", "仮定震源要素シナリオを生成する");
  assert.equal(assumption.canRenderWaves, false, "仮定震源要素では到達円を描かない");
  assert.equal(final.isFinal, true, "最終報シナリオを生成する");
  assert.equal(cancellation.isCancel, true, "取消報シナリオを生成する");
}

assert.equal(parseJstDateTime("2026/11/10 05:21"), "2026-11-09T20:21:00.000Z", "秒なしの日時も日本時間として解釈する");
assert.equal(parseJstDateTime("2026-11-10T05:21:30"), "2026-11-09T20:21:30.000Z", "端末タイムゾーンに依存しない");
assert.equal(parseJstDateTime(""), null);

{
  const exact = getWaveDistancesByJma2001(0, 0.831);
  assert.equal(exact.pDistanceKm, 4, "JMA2001走時表の一致点をそのまま使用する");

  const interpolated = getWaveDistancesByJma2001(0, (0.416 + 0.831) / 2);
  assert.ok(Math.abs(interpolated.pDistanceKm - 3) < 1e-9, "走時表の間は距離を線形補間する");

  const invalid = getWaveDistancesByJma2001(50, Number.NaN);
  assert.deepEqual(invalid, { pDistanceKm: 0, sDistanceKm: 0 }, "不正な経過時間では円を広げない");

  const deep = getWaveDistancesByJma2001(999, 10);
  const clamped = getWaveDistancesByJma2001(700, 10);
  assert.deepEqual(deep, clamped, "走時表の範囲外の深さは700kmへ制限する");
}

function makeEew(overrides = {}) {
  return {
    Title: "緊急地震速報（予報）",
    CodeType: "JMA_EEW",
    Issue: { Source: "気象庁", Status: "通常" },
    EventID: "202611100001",
    Serial: 1,
    AnnouncedTime: "2026/11/10 11:59:50",
    OriginTime: "2026/11/10 11:59:40",
    Hypocenter: "茨城県南部",
    Latitude: 36.0,
    Longitude: 140.0,
    Depth: 50,
    Magnitude: 5.2,
    MaxIntensity: "5弱",
    isWarn: false,
    isFinal: false,
    isCancel: false,
    isTraining: false,
    isAssumption: false,
    WarnArea: [],
    ...overrides
  };
}

{
  const normalized = normalizeWolfxEew(makeEew({
    Magnitude: null,
    Magunitude: "5.4",
    Depth: "",
    Latitude: null,
    Longitude: ""
  }), { receivedAt: BASE_TIME });
  assert.equal(normalized.magnitude, 5.4, "旧フィールド Magunitude を維持する");
  assert.equal(normalized.depth, null, "空の深さを0kmにしない");
  assert.equal(normalized.coordinates, null, "欠損座標を0度にしない");
}

// Wolfx Open API and WebSocket specifications checked 2026-11-16.
// Magnitude is preferred; the deprecated Magunitude alias may be removed.
for (const [fields, expected] of [
  [{ Magnitude: 5.3 }, 5.3],
  [{ Magunitude: 5.4 }, 5.4],
  [{ Magnitude: 5.5, Magunitude: 5.5 }, 5.5],
  [{ Magnitude: 5.6, Magunitude: 4.1 }, 5.6],
  [{ Magnitude: 0, Magunitude: 5.7 }, null]
]) {
  const payload = makeEew();
  delete payload.Magnitude;
  assert.equal(normalizeWolfxEew({ ...payload, ...fields }).magnitude, expected);
}

for (const [upper, lower, from, to] of [
  ["6弱", "5弱", "5-", "6-"],
  ["5弱", "6弱", "5-", "6-"],
  ["4", "4", "4", "4"],
  ["6強", null, "", "6+"],
  [null, "4", "4", ""],
  ["不明", "不明", "", ""]
]) {
  const area = normalizeWolfxEew(makeEew({ WarnArea: [{ Chiiki: "茨城県北部", Shindo1: upper, Shindo2: lower, Type: "警報" }] })).warnAreas[0];
  assert.equal(area.from, from);
  assert.equal(area.to, to);
  assert.equal(area.isWarning, true);
}

{
  const areaGeoJson = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "Polygon", coordinates: [] }, properties: { code: "310", name: "茨城県北部" } },
      { type: "Feature", geometry: { type: "Polygon", coordinates: [] }, properties: { code: "311", name: "茨城県南部" } }
    ]
  };
  const warning = normalizeWolfxEew(makeEew({
    isWarn: true,
    WarnArea: [
      { Code: "310", Chiiki: "茨城県北部", Shindo1: "5弱", Shindo2: "4" },
      { Code: "311", Chiiki: "茨城県南部", Shindo1: "4", Shindo2: "4" }
    ]
  }), { receivedAt: BASE_TIME });
  assert.equal(warning.warnAreas[0].code, "310", "WolfxのEEW予報区コードを保持する");

  const colored = buildEewForecastAreaFeatureCollection(areaGeoJson, [warning]);
  assert.equal(colored.features.length, 2, "警報で予想震度がある区域だけを地図化する");
  assert.equal(colored.features[0].properties.intensity, "5-", "予想震度範囲の上限を代表色にする");
  assert.equal(colored.features[0].properties.intensityRange, "4～5-");
  assert.equal(colored.features[0].properties.color, EEW_WARNING_AREA_COLOR, "警報対象地域を赤く表示する");
  assert.equal(colored.features[1].properties.color, EEW_WARNING_AREA_COLOR, "震度4の警報対象地域も赤く表示する");
  assert.match(createEewForecastAreaSignature([warning]), /茨城県北部/u);

  const forecastOnly = { ...warning, isWarn: false };
  assert.equal(
    buildEewForecastAreaFeatureCollection(areaGeoJson, [forecastOnly]).features.length,
    2,
    "EEW予報でも区域別の予想震度があれば塗り分ける"
  );
  assert.equal(buildEewForecastAreaFeatureCollection(areaGeoJson, [forecastOnly]).features[0].properties.color, "#f93904", "警報対象でない予報区は従来の震度色");
  assert.notEqual(createEewForecastAreaSignature([warning]), createEewForecastAreaSignature([forecastOnly]), "警報状態が変われば同じ予測値でも地図を更新する");
  const explicitForecast = { ...warning, warnAreas: [{ ...warning.warnAreas[0], isWarning: false, type: "予報" }] };
  assert.equal(buildEewForecastAreaFeatureCollection(areaGeoJson, [explicitForecast]).features[0].properties.isWarning, false, "明示された予報区を警報対象と推測しない");
  const unknownWarning = { ...warning, warnAreas: [{ code: "310", name: "茨城県北部", isWarning: true }] };
  assert.equal(buildEewForecastAreaFeatureCollection(areaGeoJson, [unknownWarning]).features[0].properties.color, EEW_WARNING_AREA_COLOR, "対象地域の明示があれば震度未取得でも赤");
  assert.equal(buildEewForecastAreaFeatureCollection(areaGeoJson, [{ ...warning, isCancel: true }]).features.length, 0, "取消後に対象地域を残さない");
  assert.equal(buildEewForecastAreaFeatureCollection(areaGeoJson, [explicitForecast, warning]).features[0].properties.isWarning, true, "複数地震では警報対象の赤を優先");
}

{
  const assumption = normalizeWolfxEew(makeEew({ isAssumption: true }), { receivedAt: BASE_TIME });
  assert.equal(isWolfxEewActive(assumption, BASE_TIME), true, "仮定震源要素でも速報自体は表示する");
  assert.equal(assumption.canRenderWaves, false, "仮定震源要素では到達円を描かない");
  assert.match(assumption.uncertaintyLabel, /仮定震源/);

  const plum = normalizeWolfxEew(makeEew({ OriginalText: "PLUM法による緊急地震速報" }), { receivedAt: BASE_TIME });
  assert.equal(plum.isPlum, true);
  assert.equal(plum.methodType, "plum");
  assert.equal(plum.canRenderWaves, false, "PLUM法では到達円を描かない");

  const mixed = normalizeWolfxEew(makeEew({ isPlum: true, OriginalText: "IPF法とPLUM法を併用" }), { receivedAt: BASE_TIME });
  assert.equal(mixed.methodType, "mixed", "混合方式はPLUM単独と区別する");
  assert.equal(mixed.canRenderWaves, false, "混合方式で独自の到達円を描かない");

  const unknownPointCount = normalizeWolfxEew(makeEew(), { receivedAt: BASE_TIME });
  assert.equal(unknownPointCount.onePointDetectionStatus, "unknown", "第1報だけで1点検知と推測しない");
  assert.equal(unknownPointCount.isOnePointDetection, false);

  const onePoint = normalizeWolfxEew(makeEew({ OriginalText: "1観測点のデータによる解析" }), { receivedAt: BASE_TIME });
  assert.equal(onePoint.onePointDetectionStatus, "confirmed", "明示された観測点数だけで1点検知を識別する");
  assert.equal(onePoint.isOnePointDetection, true);
}

{
  const surface = normalizeWolfxEew(makeEew({ Depth: 0, Accuracy: { Epicenter: "IPF法(3点)", Depth: "IPF法(3点)" } }), { receivedAt: BASE_TIME });
  assert.equal(surface.depth, 0, "正当な深さ0kmを欠損値と区別する");
  assert.equal(surface.canRenderWaves, true);
}

{
  let now = BASE_TIME;
  const store = createWolfxEewEventStore({ now: () => now });
  assert.equal(store.accept(makeEew(), { transport: "websocket" }).accepted, true);
  assert.equal(store.accept(makeEew({ EventID: "202611100002", Hypocenter: "福島県沖" }), { transport: "websocket" }).accepted, true);
  assert.equal(store.getSnapshot().activeEvents.length, 2, "複数イベントを独立保持する");

  assert.equal(store.accept(makeEew({ Serial: 2, AnnouncedTime: "2026/11/10 11:59:55" }), { transport: "websocket" }).accepted, true);
  assert.equal(store.accept(makeEew({ Serial: 1 }), { transport: "http" }).reason, "older-or-duplicate", "HTTPスナップショットで新報を上書きしない");
  assert.equal(store.getSnapshot().activeEvents.find((item) => item.eventId === "202611100001").serial, 2);

  const oldCancel = store.accept(makeEew({ Serial: 1, isCancel: true, Latitude: null, Longitude: null }), { transport: "websocket" });
  assert.equal(oldCancel.reason, "older-or-duplicate", "古い取消報で新報を消さない");

  const cancellation = store.accept(makeEew({ Serial: 3, isCancel: true, Latitude: null, Longitude: null, Magnitude: null }), { transport: "websocket" });
  assert.equal(cancellation.accepted, true, "座標や規模がない取消報も受理する");
  assert.equal(store.getSnapshot().activeEvents.some((item) => item.eventId === "202611100002"), true, "別イベントには影響しない");
  assert.equal(store.accept(makeEew({ Serial: 2 }), { transport: "websocket" }).reason, "cancelled-event", "取消後の古い報を復活させない");

  now += EEW_CANCEL_DISPLAY_MS + 1;
  assert.equal(store.getSnapshot().activeEvents.some((item) => item.eventId === "202611100001"), false, "取消表示は短時間で終了する");
  assert.equal(store.accept(makeEew({ Serial: 4 }), { transport: "websocket" }).reason, "cancelled-event", "表示終了後も取消状態を保持する");
  now += EEW_CANCEL_TOMBSTONE_MS;
  assert.equal(store.accept(makeEew({ Serial: 4, AnnouncedTime: "2026/11/10 12:15:10" }), { transport: "websocket" }).accepted, true, "保持期限後は新しい情報を受理できる");
}

{
  const stale = normalizeWolfxEew(makeEew({ AnnouncedTime: "2026/11/10 11:40:00" }), { receivedAt: BASE_TIME });
  const future = normalizeWolfxEew(makeEew({ AnnouncedTime: "2026/11/10 12:02:00" }), { receivedAt: BASE_TIME });
  assert.equal(isWolfxEewActive(stale, BASE_TIME), false, "古い速報を発表中にしない");
  assert.equal(isWolfxEewActive(future, BASE_TIME), false, "不正な未来時刻を発表中にしない");
}

{
  class FakeWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static instances = [];

    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      this.listeners = new Map();
      this.sent = [];
      FakeWebSocket.instances.push(this);
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    dispatch(type, value = {}) {
      for (const listener of this.listeners.get(type) ?? []) listener(value);
    }

    open() {
      this.readyState = FakeWebSocket.OPEN;
      this.dispatch("open");
    }

    send(value) {
      this.sent.push(value);
    }

    close() {
      this.readyState = 3;
      this.dispatch("close");
    }
  }

  const snapshots = [];
  const pageListeners = new Map();
  const windowRef = {
    addEventListener(type, listener) { pageListeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (pageListeners.get(type) === listener) pageListeners.delete(type);
    }
  };
  const client = createWolfxEewClient({
    WebSocketImpl: FakeWebSocket,
    now: () => BASE_TIME,
    fetchImpl: async () => ({ ok: true, json: async () => makeEew({ Serial: 1 }) }),
    onUpdate: (snapshot) => snapshots.push(snapshot),
    windowRef,
    documentRef: { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" }
  });
  client.start();
  const socket = FakeWebSocket.instances[0];
  socket.open();
  assert.equal(socket.sent.includes("query_jmaeew"), true, "接続時に最新報を問い合わせる");
  socket.dispatch("message", { data: JSON.stringify({ type: "heartbeat", ver: 1, id: "test-only", timestamp: String(BASE_TIME) }) });
  assert.equal(socket.sent.at(-1), "ping", "JSON heartbeatには仕様のpingコマンドを返す");
  const afterHeartbeat = socket.sent.length;
  socket.dispatch("message", { data: JSON.stringify({ type: "pong", timestamp: String(BASE_TIME) }) });
  assert.equal(socket.sent.length, afterHeartbeat, "JSON pongへ返信を繰り返さない");
  assert.equal(client.getSnapshot().activeEvents.length, 0, "heartbeatやpongを速報として登録しない");
  socket.dispatch("message", { data: "ping" });
  assert.equal(socket.sent.includes("pong"), true, "サーバーのpingへ応答する");
  client.refresh();
  client.start();
  assert.equal(FakeWebSocket.instances.length, 1, "開始や再取得を繰り返しても有効接続を重複させない");
  assert.equal(socket.sent.filter((value) => value === "query_jmaeew").length >= 2, true, "接続済みでも再問い合わせる");
  socket.dispatch("message", { data: JSON.stringify(makeEew({ Serial: 2, AnnouncedTime: "2026/11/10 11:59:55" })) });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(client.getLatest().serial, 2, "WebSocketの新報をHTTPの旧報で上書きしない");
  assert.equal(snapshots.some((snapshot) => snapshot.connection.status === "connected"), true);
  pageListeners.get("pagehide")?.();
  assert.equal(client.getSnapshot().connection.status, "suspended", "ページ非表示時は接続とタイマーを停止する");
  pageListeners.get("pageshow")?.();
  assert.equal(FakeWebSocket.instances.length, 2, "ページ復帰時に新しい世代の接続を開始する");
  client.stop();
  assert.equal(pageListeners.size, 0, "停止時にページライフサイクルの購読を解除する");
}

console.log("Wolfx EEW tests passed");
