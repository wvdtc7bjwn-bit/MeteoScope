import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  filterHypocentersByPolygon,
  getPolygonBounds,
  HYPOCENTER_DISTRIBUTION_MAX_RANGE_DAYS,
  normalizeHypocenterDistributionRange,
  pointInPolygon
} from "../src/jma/hypocenterDistribution.js";

const polygon = [
  [130, 30],
  [140, 30],
  [140, 40],
  [130, 40]
];

assert.equal(pointInPolygon([135, 35], polygon), true);
assert.equal(pointInPolygon([145, 35], polygon), false);
assert.deepEqual(getPolygonBounds(polygon), [130, 30, 140, 40]);
assert.equal(HYPOCENTER_DISTRIBUTION_MAX_RANGE_DAYS, 30);
assert.deepEqual(
  normalizeHypocenterDistributionRange("2026-05-01", "2026-07-29"),
  { startDate: "2026-06-30", endDate: "2026-07-29" }
);
assert.deepEqual(
  filterHypocentersByPolygon([
    { id: "inside", longitude: 135, latitude: 35 },
    { id: "outside", longitude: 145, latitude: 35 }
  ], polygon).map((item) => item.id),
  ["inside"]
);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [app, panel, map, worker] = await Promise.all([
  fs.readFile(path.join(root, "src", "app.js"), "utf8"),
  fs.readFile(path.join(root, "src", "ui", "leftPanel.js"), "utf8"),
  fs.readFile(path.join(root, "src", "map", "weatherMap.js"), "utf8"),
  fs.readFile(path.join(root, "workers", "earthquake-realtime", "src", "jmaDailyHypocenters.js"), "utf8")
]);

assert.match(panel, /data-earthquake-distribution-area-search/u);
assert.match(panel, /data-earthquake-distribution-range-date="startDate"/u);
assert.match(panel, /data-earthquake-distribution-range-date="endDate"/u);
assert.match(panel, /const presets = \[7, 15, 30\]/u);
assert.doesNotMatch(panel, /90日/u);
assert.match(app, /startHypocenterAreaSelection/u);
assert.match(map, /hypocenter-area-selection/u);
assert.match(worker, /requestedStartDate/u);
assert.match(worker, /requestedBounds/u);
assert.match(worker, /\.slice\(0, 30\)/u);

console.log("Hypocenter distribution range tests passed.");
