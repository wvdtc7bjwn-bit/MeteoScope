import assert from "node:assert/strict";
import { fetchWarningMap } from "../src/jma/warnings.js";
import { JMA_ENDPOINTS } from "../src/config.js";

const originalFetch = globalThis.fetch;
const originalScheduler = Object.getOwnPropertyDescriptor(globalThis, "scheduler");
const originalPerformance = Object.getOwnPropertyDescriptor(globalThis, "performance");
const originalDateNow = Date.now;
let elapsed = 0;
let workPerCheck = 0.01;
let yields = 0;
let wallTime = Date.parse("2026-11-25T10:00:00Z");
const areas = Array.from({ length: 100 }, (_, i) => ({ code: String(2920100 + i), name: `地点${i}` }));
const reports = Array.from({ length: 300 }, (_, i) => ({
  reportDatetime: new Date(Date.parse("2026-11-25T00:00:00Z") + i * 1000).toISOString(),
  warning: { class20Items: [{
    areaCode: areas[i % areas.length].code,
    kinds: [{ code: i < 100 ? "14" : "03", status: i < 200 ? "発表" : "解除" }]
  }] }
}));
let payload = reports;
let timestamp = reports.at(-1).reportDatetime;
let mapRequests = 0;

try {
  Date.now = () => wallTime;
  Object.defineProperty(globalThis, "performance", {
    configurable: true, value: { now: () => (elapsed += workPerCheck) }
  });
  Object.defineProperty(globalThis, "scheduler", {
    configurable: true, value: { yield: async () => { yields += 1; } }
  });
  globalThis.fetch = async (url) => {
    if (url === JMA_ENDPOINTS.warningMunicipalityIndex) return Response.json({ areas });
    if (url === JMA_ENDPOINTS.warningsMapTime) return Response.json({ latestControlDatetime: timestamp });
    assert.equal(url, JMA_ENDPOINTS.warningsMap, "地図の色付けに不要な詳細取得を増やさない");
    mapRequests += 1;
    return Response.json(payload);
  };

  const fast = await fetchWarningMap();
  assert.equal(fast.activeAreas.length, 100);
  assert.ok(fast.activeAreas.every(area => area.level === "advisory"), "後の警報解除を適用し、残る注意報を保持する");
  assert.ok(fast.activeAreas.every(area => area.warnings.length === 1 && area.warnings[0].code === "14"));
  assert.ok(yields < 5, "軽い処理を報告件数だけで繰り返し待機させない");

  yields = 0;
  workPerCheck = 2;
  const slow = await fetchWarningMap();
  assert.deepEqual(slow, fast, "分割回数にかかわらず警報の結果を維持する");
  assert.ok(yields > 10, "遅い端末では処理を分割し、操作へ制御を戻す");
  assert.equal(mapRequests, 1, "同じ発表時刻なら既存の取得キャッシュを利用する");

  wallTime += 21_000;
  timestamp = new Date(Date.parse(timestamp) + 1000).toISOString();
  payload = [...reports, {
    reportDatetime: timestamp,
    warning: { class20Items: [{ areaCode: areas[0].code, kinds: [{ code: "14", status: "解除" }] }] }
  }];
  const updated = await fetchWarningMap();
  assert.equal(mapRequests, 2);
  assert.equal(updated.activeAreas.length, 99, "次の発表の解除も地図へ反映できる");
  assert.ok(!updated.activeAreas.some(area => area.areaCode === areas[0].code));
} finally {
  globalThis.fetch = originalFetch;
  Date.now = originalDateNow;
  if (originalScheduler) Object.defineProperty(globalThis, "scheduler", originalScheduler);
  else delete globalThis.scheduler;
  Object.defineProperty(globalThis, "performance", originalPerformance);
}

console.log("Warning map preparation tests passed");
