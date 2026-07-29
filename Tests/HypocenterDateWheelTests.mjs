import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  findHypocenterDateOffset,
  normalizeHypocenterDates
} from "../src/ui/hypocenterDateWheel.js";
import {
  countHypocenterCoordinates,
  groupHypocenterItemsByCoordinate
} from "../src/domain/hypocenterDistribution.js";

const dates = [
  "2026-07-17",
  "invalid",
  "2026-07-19",
  "2026-07-17",
  "2026-07-16"
];

assert.deepEqual(
  normalizeHypocenterDates(dates),
  ["2026-07-19", "2026-07-17", "2026-07-16"],
  "日付は重複と不正値を除き、新しい順に並ぶ"
);
assert.equal(findHypocenterDateOffset(dates, "2026-07-17"), 1, "保存済み日付を正確に選ぶ");
assert.equal(findHypocenterDateOffset(dates, "2026-07-18"), 1, "欠落日は直前の保存済み日付を選ぶ");
assert.equal(findHypocenterDateOffset(dates, "2026-08-01"), 0, "未来日は最新日に丸める");
assert.equal(findHypocenterDateOffset(dates, "2025-01-01"), 2, "保存範囲より古い日は最古日に丸める");

const groupedHypocenters = groupHypocenterItemsByCoordinate([
  { id: "latest", latitude: 32.5, longitude: 130.6, magnitude: 3.2 },
  { id: "older", latitude: 32.5, longitude: 130.6, magnitude: 4.1 },
  { id: "other", latitude: 40.7, longitude: 140.7, magnitude: 2.0 },
  { id: "invalid", latitude: null, longitude: 140.7, magnitude: 1.0 }
]);
assert.equal(groupedHypocenters.length, 2, "同一の発表座標は地図上で1マーカーにまとめる");
assert.equal(groupedHypocenters[0].id, "latest", "重なりマーカーは最新の地震を代表表示する");
assert.equal(groupedHypocenters[0].coordinateEventCount, 2, "同一座標の地震件数を保持する");
assert.equal(groupedHypocenters[0].maximumMagnitude, 4.1, "重なりマーカーの大きさに最大Mを使う");
assert.equal(countHypocenterCoordinates(groupedHypocenters), 2, "地図上の座標数を集計できる");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [appSource, distributionClientSource] = await Promise.all([
  fs.readFile(path.join(root, "src", "app.js"), "utf8"),
  fs.readFile(path.join(root, "src", "jma", "hypocenterDistribution.js"), "utf8")
]);
assert.match(
  appSource,
  /earthquakeView === "distribution"[\s\S]*refreshEarthquakeDistribution\(\{ force \}\)/u,
  "Web版の自動更新で震央分布も更新する"
);
assert.match(distributionClientSource, /ttlMs: options\.force \? 0/u);
assert.match(distributionClientSource, /cache: options\.force \? "no-store"/u);
assert.match(distributionClientSource, /includeRecentXml: filters\.includeRecentXml === false \? "0" : "1"/u);
const weatherMapSource = await fs.readFile(path.join(root, "src", "map", "weatherMap.js"), "utf8");
assert.match(
  weatherMapSource,
  /showCoordinateEventCount = !is3D[\s\S]*selectedSource === "jma-xml"[\s\S]*rangeMode !== true/u,
  "重複震央の件数は本日・前日の気象庁XML表示だけに限定する"
);
assert.match(weatherMapSource, /\["==", \["get", "showCoordinateEventCount"\], true\]/u);
console.log("Hypocenter date wheel tests passed.");
