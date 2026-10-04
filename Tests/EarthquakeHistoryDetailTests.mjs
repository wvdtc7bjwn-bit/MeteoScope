import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildHistoricalIntensityAreaFeatures,
  normalizeEarthquakeHistoryEvent,
  normalizeEarthquakeHistoryEventId
} from "../src/jma/earthquakeHistoryDetail.js";
import { getEarthquakeIntensityRank } from "../src/earthquakeIntensity.js";

assert.equal(normalizeEarthquakeHistoryEventId("20240101161022"), "20240101161022");
assert.equal(normalizeEarthquakeHistoryEventId("20240101161022<script>"), "");
const event = normalizeEarthquakeHistoryEvent({
  hypocenter: {
    id: "20240101161022", originTime: "2024/01/01 16:10:22.0", place: "石川県能登地方",
    lat: "37.5", lon: "137.3", depth: "16 km", magnitude: "7.6", maxIntensity: "震度７"
  },
  stations: [
    { name: "志賀町富来＊", latitude: "37.0", longitude: "136.7", code: "A01", intensity: "震度７" },
    { name: "輪島市鳳至町", latitude: "37.4", longitude: "136.9", code: "A02", intensity: "震度４" },
    { name: "七尾市本府中町", latitude: "37.0", longitude: "136.9", code: "A03", intensity: "震度６弱" },
    { name: "不正地点", latitude: "91", longitude: "136.7", code: "bad", intensity: "震度４" },
    { name: "震度なし", latitude: "37", longitude: "137", intensity: "未入電" }
  ]
}, "20240101161022");
assert.equal(event.hypocenter.magnitude, 7.6);
assert.equal(event.hypocenter.depthKm, 16);
assert.equal(event.hypocenter.maxIntensity, "7");
assert.equal(event.stations.length, 3, "無効座標・無効震度の観測点を除外");
assert.deepEqual(event.stations[0].coordinates, [136.7, 37]);
assert.equal(event.stations[0].intensity, "7");
assert.deepEqual(
  event.stations.map((station) => getEarthquakeIntensityRank(station.intensity)),
  [9, 7, 4],
  "観測点データは震度の大きい順に並ぶ"
);
assert.throws(() => normalizeEarthquakeHistoryEvent({ hypocenter: { id: "bad", lat: 0, lon: 0 } }));

const historyAreas = buildHistoricalIntensityAreaFeatures(event.stations, {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { code: "17201", name: "石川県加賀北部" }, geometry: { type: "Polygon", coordinates: [[[136.5, 36.8], [136.8, 36.8], [136.8, 37.2], [136.5, 37.2], [136.5, 36.8]]] } },
    { type: "Feature", properties: { code: "17202", name: "石川県加賀南部" }, geometry: { type: "Polygon", coordinates: [[[136.8, 36.8], [137.2, 36.8], [137.2, 37.6], [136.8, 37.6], [136.8, 36.8]]] } },
    { type: "Feature", properties: { code: "17203", name: "観測点なし" }, geometry: { type: "Polygon", coordinates: [[[138, 38], [139, 38], [139, 39], [138, 39], [138, 38]]] } }
  ]
});
assert.deepEqual(historyAreas.map((area) => [area.properties.areaCode, area.properties.intensity]), [
  ["17201", "7"], ["17202", "6-"]
], "過去地震の観測点から細分区域ごとの最大震度を求める");
assert.deepEqual(buildHistoricalIntensityAreaFeatures(event.stations, null), [], "区域境界データがないときは区域表示を作らない");

const [app, map, panel, vite, style] = await Promise.all([
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8"),
  readFile(new URL("../vite.config.js", import.meta.url), "utf8"),
  readFile(new URL("../src/style.css", import.meta.url), "utf8")
]);
assert.match(app, /fetchEarthquakeHistoryEvent\(id, \{ signal: controller\.signal \}\)/u);
assert.match(app, /earthquake-history-select/u);
assert.match(map, /earthquakeHistoryId: String\(item\.id\)/u);
assert.match(map, /isHistoricalEarthquake: true/u);
assert.match(map, /if \(feature\?\.properties\?\.isHistoricalEarthquake === true\)[\s\S]*?hideMapInfo\("earthquake-distribution"\);[\s\S]*?return;/u);
assert.match(map, /historicalEarthquakeDetailVisible === true\)[\s\S]*?hideMapInfo\("earthquake-distribution"\)/u);
assert.match(map, /markerType: detailVisible && selected \? "cross" : "hypocenter-distribution"/u);
assert.match(map, /EARTHQUAKE_INTERACTIVE_LAYERS = \["sample-circle", "sample-cross"/u);
assert.match(map, /markerType: "earthquake-station"/u);
assert.match(map, /id: "earthquake-station-intensity-circle"[\s\S]{0,100}?minzoom: 7\.5/u);
assert.match(map, /id: "earthquake-station-intensity-label"[\s\S]{0,100}?minzoom: 7\.5/u);
assert.match(map, /eventDetail\.event\?\.intensityAreaFeatures/u);
assert.match(map, /const historicalAreaMarkers = createEarthquakeAreaIntensityMarkers/u);
assert.match(map, /"text-color": "#e3342f"/u);
assert.match(map, /buildHistoricalEarthquakeStationPopup/u);
assert.match(panel, /buildHistoricalEarthquakeDetailMarkup/u);
assert.match(panel, /data-earthquake-history-detail-retry/u);
assert.match(panel, /選択した過去地震の要約/u);
assert.match(panel, /earthquake-history-summary-back/u);
assert.match(panel, /earthquake-history-detail-facts/u);
assert.match(panel, /formatMobileEarthquakeTime\(liveHypocenter\?\.originTime \|\| selected\.originTime, true\)/u,
  "過去地震の要約バーには発生年を含む日時を表示する");
assert.match(style, /@media \(max-width: 560px\)[\s\S]*?\.earthquake-history-detail-facts \{ grid-template-columns: repeat\(2/u);
assert.match(vite, /localEarthquakeHistoryEventApi\(\)/u);
assert.match(vite, /handleEarthquakeHistoryEventRequest/u);
console.log("Earthquake history detail tests passed.");
