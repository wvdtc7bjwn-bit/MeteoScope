import assert from "node:assert/strict";
import {
  EEW_CANCEL_DISPLAY_MS,
  EEW_CANCEL_TOMBSTONE_MS,
  createWolfxEewClient,
  createWolfxEewEventStore,
  isWolfxEewActive,
  normalizeWolfxEew
} from "../src/eew/wolfxEew.js";

const BASE_TIME = Date.parse("2026-11-10T12:00:00+09:00");

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
  const assumption = normalizeWolfxEew(makeEew({ isAssumption: true }), { receivedAt: BASE_TIME });
  assert.equal(isWolfxEewActive(assumption, BASE_TIME), true, "仮定震源要素でも速報自体は表示する");
  assert.equal(assumption.canRenderWaves, false, "仮定震源要素では到達円を描かない");
  assert.match(assumption.uncertaintyLabel, /仮定震源/);

  const plum = normalizeWolfxEew(makeEew({ isPlum: true }), { receivedAt: BASE_TIME });
  assert.equal(plum.isPlum, true);
  assert.equal(plum.canRenderWaves, false, "PLUM法では到達円を描かない");
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
  const client = createWolfxEewClient({
    WebSocketImpl: FakeWebSocket,
    now: () => BASE_TIME,
    fetchImpl: async () => ({ ok: true, json: async () => makeEew({ Serial: 1 }) }),
    onUpdate: (snapshot) => snapshots.push(snapshot),
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
  client.stop();
}

console.log("Wolfx EEW tests passed");
