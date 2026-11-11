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
  createEewForecastAreaSignature
} from "../src/eew/eewForecastAreas.js";
import { parseJstDateTime } from "../src/utils/jstDateTime.js";
import {
  createLocalEewTestEvent,
  isLocalEewTestEnvironment
} from "../src/eew/localEewTest.js";

const BASE_TIME = Date.parse("2026-11-10T12:00:00+09:00");

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
      { Code: "310", Chiiki: "茨城県北部", Shindo1: "4", Shindo2: "5弱" },
      { Code: "311", Chiiki: "茨城県南部", Shindo1: "4", Shindo2: "4" }
    ]
  }), { receivedAt: BASE_TIME });
  assert.equal(warning.warnAreas[0].code, "310", "WolfxのEEW予報区コードを保持する");

  const colored = buildEewForecastAreaFeatureCollection(areaGeoJson, [warning]);
  assert.equal(colored.features.length, 2, "警報で予想震度がある区域だけを地図化する");
  assert.equal(colored.features[0].properties.intensity, "5-", "予想震度範囲の上限を代表色にする");
  assert.equal(colored.features[0].properties.intensityRange, "4～5-");
  assert.equal(colored.features[0].properties.color, "#f93904", "アプリ共通の震度色を使う");
  assert.match(createEewForecastAreaSignature([warning]), /茨城県北部/u);

  const forecastOnly = { ...warning, isWarn: false };
  assert.equal(
    buildEewForecastAreaFeatureCollection(areaGeoJson, [forecastOnly]).features.length,
    2,
    "EEW予報でも区域別の予想震度があれば塗り分ける"
  );
}

{
  const assumption = normalizeWolfxEew(makeEew({ isAssumption: true }), { receivedAt: BASE_TIME });
  assert.equal(isWolfxEewActive(assumption, BASE_TIME), true, "仮定震源要素でも速報自体は表示する");
  assert.equal(assumption.canRenderWaves, false, "仮定震源要素では到達円を描かない");
  assert.match(assumption.uncertaintyLabel, /仮定震源/);

  const plum = normalizeWolfxEew(makeEew({ isPlum: true }), { receivedAt: BASE_TIME });
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
  const surface = normalizeWolfxEew(makeEew({ Depth: 0 }), { receivedAt: BASE_TIME });
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
  socket.dispatch("message", { data: "ping" });
  assert.equal(socket.sent.includes("pong"), true, "サーバーのpingへ応答する");
  client.refresh();
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
