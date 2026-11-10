import assert from "node:assert/strict";
import {
  mergeRealtimeEarthquakes,
  normalizeP2pEarthquake,
  normalizeRealtimeIntensity,
  shouldTemporarilyShowEarthquakeInfo
} from "../src/earthquake/realtimeEarthquake.js";

assert.equal(normalizeRealtimeIntensity(45), "5-");
assert.equal(normalizeRealtimeIntensity("6強"), "6+");
assert.equal(normalizeRealtimeIntensity(-1), "");

const scalePrompt = normalizeP2pEarthquake({
  code: 551,
  id: "prompt-1",
  issue: { type: "ScalePrompt", time: "2026/11/10 14:21:20", source: "気象庁" },
  earthquake: {
    time: "2026/11/10 14:20:00",
    maxScale: 30,
    domesticTsunami: "Checking",
    hypocenter: { depth: -1, latitude: -200, longitude: -200, magnitude: -1, name: "" }
  },
  points: [{ addr: "茨城県北部", pref: "茨城県", isArea: true, scale: 30 }]
});

assert.equal(scalePrompt.issueType, "ScalePrompt");
assert.equal(scalePrompt.maxIntensity, "3");
assert.equal(scalePrompt.coordinates, null);
assert.equal(scalePrompt.depth, null);
assert.equal(scalePrompt.magnitude, "--");
assert.equal(scalePrompt.intensityAreas[0].areaName, "茨城県北部");
assert.equal(shouldTemporarilyShowEarthquakeInfo(scalePrompt), true);

const detail = normalizeP2pEarthquake({
  code: 551,
  id: "detail-1",
  issue: { type: "DetailScale", time: "2026/11/10 14:23:00", source: "気象庁" },
  earthquake: {
    time: "2026/11/10 14:20:00",
    maxScale: 40,
    domesticTsunami: "None",
    hypocenter: { depth: 30, latitude: 36.2, longitude: 141.5, magnitude: 4.5, name: "茨城県沖" }
  },
  points: [{ addr: "水戸市金町", pref: "茨城県", isArea: false, scale: 40 }]
});

const mergedReports = mergeRealtimeEarthquakes([scalePrompt], [detail]);
assert.equal(mergedReports.length, 1, "同じ発生時刻の続報は1地震として統合する");
assert.equal(mergedReports[0].issueType, "DetailScale");
assert.equal(mergedReports[0].maxIntensity, "4");
assert.equal(mergedReports[0].intensityStations[0].stationName, "水戸市金町");

const minuteShiftedSameEvent = {
  ...detail,
  id: "xml:202611101419",
  eventId: "20261110142013",
  eventKey: "20261110142013",
  source: "xml",
  eventTimeRaw: "2026-11-10T14:19:00+09:00",
  magnitude: "M4.5"
};
assert.equal(
  mergeRealtimeEarthquakes([minuteShiftedSameEvent], [detail]).length,
  1,
  "配信元による1分の時刻差があっても震源要素が一致すれば重複させない"
);
assert.equal(
  mergeRealtimeEarthquakes([{ ...minuteShiftedSameEvent, magnitude: "4.7" }], [detail]).length,
  2,
  "近い時刻でも規模が異なる地震は統合しない"
);

const retained = mergeRealtimeEarthquakes([], [
  detail,
  { ...detail, id: "eq:older", eventId: "eq:older", eventKey: "eq:older", eventTimeRaw: "2026-11-09T00:00:00+09:00" }
]);
assert.equal(retained.length, 2, "最新情報だけでなく過去の複数件も保持する");

console.log("Realtime earthquake tests passed");
