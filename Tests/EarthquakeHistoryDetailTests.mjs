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
const legacyScaleEvent = normalizeEarthquakeHistoryEvent({
  hypocenter: {
    id: "19950905123456", originTime: "1995/09/05 12:34:56.0", place: "旧階級の地震",
    lat: "35.0", lon: "139.0", depth: "20 km", magnitude: "6.0", maxIntensity: "震度6"
  },
  stations: [
    { name: "旧階級震度5地点", latitude: "35.1", longitude: "139.1", code: "L05", intensity: "震度５" },
    { name: "旧階級震度6地点", latitude: "35.2", longitude: "139.2", code: "L06", intensity: "震度６" }
  ]
}, "19950905123456");
assert.deepEqual(legacyScaleEvent.stations.map(({ intensity, intensityLabel }) => [intensity, intensityLabel]), [
  ["6", "震度6"], ["5", "震度5"]
], "1996年10月以前の震度5・6を捨てず、弱・強を付加せずそのまま表示する");
assert.deepEqual(legacyScaleEvent.stations.map(({ intensity }) => getEarthquakeIntensityRank(intensity)), [7, 5],
  "旧階級の震度5・6も正しい強さ順でソートできる");
assert.equal(getEarthquakeIntensityRank("5"), getEarthquakeIntensityRank("5-"),
  "旧階級震度5は区域集計上の5弱相当として色・優先順位を保つ");
assert.equal(getEarthquakeIntensityRank("6"), getEarthquakeIntensityRank("6-"),
  "旧階級震度6は区域集計上の6弱相当として色・優先順位を保つ");
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

const boundaryRecoveryAreas = buildHistoricalIntensityAreaFeatures([
  { coordinates: [140.001, 36.001], intensity: "2" },
  { coordinates: [140.2, 36.2], intensity: "4" }
], {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { code: "A", name: "境界区域" }, geometry: { type: "Polygon", coordinates: [[[140, 36], [140.01, 36], [140.01, 36.01], [140, 36.01], [140, 36]]] } },
    { type: "Feature", properties: { code: "A", name: "境界区域の別ポリゴン" }, geometry: { type: "Polygon", coordinates: [[[140.02, 36], [140.03, 36], [140.03, 36.01], [140.02, 36.01], [140.02, 36]]] } }
  ]
});
assert.equal(boundaryRecoveryAreas.length, 1, "同じ区域コードの複数ポリゴンは1区域へ統合する");
assert.equal(boundaryRecoveryAreas[0].properties.intensity, "2", "ポリゴン境界から5km以内の観測点は区域最大震度に反映する");
assert.equal(boundaryRecoveryAreas[0].geometry.coordinates.length, 2, "同じ区域コードの全ポリゴン形状を保持する");

const distantStationAreas = buildHistoricalIntensityAreaFeatures([
  { coordinates: [140.2, 36.2], intensity: "4" }
], {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { code: "A" }, geometry: { type: "Polygon", coordinates: [[[140, 36], [140.01, 36], [140.01, 36.01], [140, 36.01], [140, 36]]] } }
  ]
});
assert.deepEqual(distantStationAreas, [], "5kmより遠い未割当観測点を誤って区域へ割り当てない");

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
assert.match(map, /const EARTHQUAKE_STATION_RADIUS = 10;/u,
  "最新・過去地震の観測点マーカー半径を少し大きくする");
assert.match(map, /id: "earthquake-area-intensity-marker"[\s\S]{0,100}?maxzoom: 6\.5/u,
  "広域表示では細分区域の四角マーカーを使う");
assert.match(map, /id: "earthquake-station-intensity-circle"[\s\S]{0,100}?minzoom: 6\.5/u,
  "ズームイン開始時に各地の震度を丸で表示する");
assert.match(map, /id: "earthquake-station-intensity-label"[\s\S]{0,100}?minzoom: 6\.5/u);
const areaIntensityLayer = map.slice(
  map.indexOf('id: "earthquake-area-intensity-marker"'),
  map.indexOf('id: "earthquake-station-intensity-circle"')
);
const stationIntensityLabelLayer = map.slice(
  map.indexOf('id: "earthquake-station-intensity-label"'),
  map.indexOf('id: "sample-wind-arrow"')
);
assert.match(areaIntensityLayer, /icon-image": EARTHQUAKE_AREA_INTENSITY_MARKER_IMAGE_ID/u,
  "細分区域の最大震度は四角マーカーで表示する");
assert.match(areaIntensityLayer, /\["get", "markerType"\], "earthquake-area-intensity"/u);
assert.doesNotMatch(stationIntensityLabelLayer, /icon-image|icon-color/u,
  "各地の観測点は四角アイコンを重ねず、円マーカー上に震度数字だけを表示する");
assert.match(stationIntensityLabelLayer, /\["get", "markerType"\], "earthquake-station"/u);
assert.match(stationIntensityLabelLayer, /7\.5,\s*11,\s*10,\s*13/u,
  "震度数字だけを少し大きくし、色や配置は維持する");
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
