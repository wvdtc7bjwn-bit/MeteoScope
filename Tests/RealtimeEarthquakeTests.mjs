import assert from "node:assert/strict";
import {
  mergeRealtimeEarthquakes,
  normalizeP2pEarthquake,
  normalizeRealtimeIntensity,
  shouldTemporarilyShowEarthquakeInfo
} from "../src/earthquake/realtimeEarthquake.js";
import {
  attachEarthquakeMapData,
  buildEarthquakeAreaLookup,
  buildIntensityAreaFeatures
} from "../src/jma/earthquakeXml.js";
import { buildStationCoordinateLookup } from "../src/jma/earthquakeStationLookup.js";

{
  const areas = buildEarthquakeAreaLookup({ features: [{
    type: "Feature", properties: { code: "310", name: "茨城県北部" },
    geometry: { type: "Polygon", coordinates: [[[140, 36], [141, 36], [141, 37], [140, 37], [140, 36]]] }
  }] });
  const stations = buildStationCoordinateLookup([
    { name: "水戸市金町", longitude: 140.5, latitude: 36.5 },
    { name: "日立市役所", longitude: 140.6, latitude: 36.6 }
  ]);
  const event = normalizeP2pEarthquake({ code: 551, id: "station-only", points: [
    { addr: "水戸市金町", scale: 20 }, { addr: "日立市役所", scale: 40 }
  ] });
  const mapped = attachEarthquakeMapData(event, areas, stations);
  const reused = attachEarthquakeMapData({ ...mapped, magnitude: "5.0", reportTimeRaw: "new" }, areas, stations);
  assert.equal(reused.intensityAreaFeatures, mapped.intensityAreaFeatures, "同一観測データの区域集計を再実行しない");
  assert.equal(reused.intensityStations, mapped.intensityStations);
  assert.equal(reused.magnitude, "5.0", "地図キャッシュで新しい報を上書きしない");
  assert.equal(reused.reportTimeRaw, "new");
  assert.notEqual(attachEarthquakeMapData({ ...event, intensityStations: [...event.intensityStations] }, areas, stations).intensityAreaFeatures, mapped.intensityAreaFeatures, "更新された観測データを再集計する");
  assert.notEqual(attachEarthquakeMapData(mapped, new Map(areas), stations).intensityAreaFeatures, mapped.intensityAreaFeatures, "区域データ更新時は再集計する");
  assert.equal(mapped.intensityAreaFeatures.length, 1, "観測点のみのP2P情報も区域を色付けする");
  assert.equal(mapped.intensityAreaFeatures[0].properties.intensity, "4", "区域内の最大観測震度を使う");
  assert.deepEqual(attachEarthquakeMapData(mapped, areas, stations).intensityAreaFeatures, mapped.intensityAreaFeatures, "履歴の再処理で色付けを失わない");
  assert.deepEqual(attachEarthquakeMapData(mapped, new Map(), stations).intensityAreaFeatures, mapped.intensityAreaFeatures, "区域データ取得失敗で既存の色付けを消さない");
  const prompt = { ...event, intensityAreas: [{ code: "310", areaName: "茨城県北部", intensity: "3", rank: 3 }] };
  assert.equal(attachEarthquakeMapData(prompt, areas, stations).intensityAreaFeatures[0].properties.intensity, "4", "続報の観測点で区域最大震度を更新する");
  assert.equal(attachEarthquakeMapData({ intensityStations: [] }, areas, stations).intensityAreaFeatures.length, 0, "別の地震へ色付けを引き継がない");
}

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

{
  const geometry = { type: "Polygon", coordinates: [[[140, 36], [141, 36], [141, 37], [140, 36]]] };
  const areaLookup = buildEarthquakeAreaLookup({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      geometry,
      properties: { code: "310", name: "茨城県北部" }
    }]
  });
  const features = buildIntensityAreaFeatures(scalePrompt.intensityAreas, areaLookup);
  assert.equal(features.length, 1, "コードを持たないP2P区域も区域名から地図形状へ対応付ける");
  assert.deepEqual(features[0].geometry, geometry);
  assert.equal(features[0].properties.intensity, "3");
}

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
