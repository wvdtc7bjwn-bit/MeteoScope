import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  addMonthsToSourceDate,
  doesHypocenterDistributionCoverRange,
  filterHypocentersByPolygon,
  getPolygonBounds,
  HYPOCENTER_DISTRIBUTION_MAX_RANGE_MONTHS,
  HYPOCENTER_DISTRIBUTION_RANGE_TOO_LONG_MESSAGE,
  isHypocenterDistributionRangeWithinLimit,
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
assert.deepEqual(
  normalizeHypocenterDistributionRange("2026-05-01", "2026-07-29"),
  { startDate: "2026-05-01", endDate: "2026-07-29" }
);
assert.equal(HYPOCENTER_DISTRIBUTION_MAX_RANGE_MONTHS, 5);
assert.equal(addMonthsToSourceDate("2026-01-31", 5), "2026-06-30");
assert.equal(isHypocenterDistributionRangeWithinLimit("2026-01-01", "2026-06-01"), true);
assert.equal(isHypocenterDistributionRangeWithinLimit("2026-01-01", "2026-06-02"), false);
assert.match(HYPOCENTER_DISTRIBUTION_RANGE_TOO_LONG_MESSAGE, /5か月を超えています/u);
assert.equal(
  doesHypocenterDistributionCoverRange({
    rangeMode: true,
    rangeStartDate: "2026-07-01",
    rangeEndDate: "2026-07-30",
    rangeDayCount: 30,
    availableDates: [
      "2026-07-30",
      "2026-07-29",
      "2026-07-01",
      "2026-01-01"
    ]
  }, "2026-01-01", "2026-07-30"),
  false,
  "a server response trimmed to 30 days must not be accepted as a complete range"
);
assert.equal(
  doesHypocenterDistributionCoverRange({
    rangeMode: true,
    rangeStartDate: "2026-01-01",
    rangeEndDate: "2026-07-30",
    rangeDayCount: 4,
    availableDates: [
      "2026-07-30",
      "2026-07-29",
      "2026-07-01",
      "2026-01-01"
    ]
  }, "2026-01-01", "2026-07-30"),
  true
);
assert.deepEqual(
  filterHypocentersByPolygon([
    { id: "inside", longitude: 135, latitude: 35 },
    { id: "outside", longitude: 145, latitude: 35 }
  ], polygon).map((item) => item.id),
  ["inside"]
);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [app, panel, map, worker, client] = await Promise.all([
  fs.readFile(path.join(root, "src", "app.js"), "utf8"),
  fs.readFile(path.join(root, "src", "ui", "leftPanel.js"), "utf8"),
  fs.readFile(path.join(root, "src", "map", "weatherMap.js"), "utf8"),
  fs.readFile(path.join(root, "workers", "earthquake-realtime", "src", "jmaDailyHypocenters.js"), "utf8"),
  fs.readFile(path.join(root, "src", "jma", "hypocenterDistribution.js"), "utf8")
]);

assert.match(client, /!doesHypocenterDistributionCoverRange\(/u);
assert.doesNotMatch(client, /parameters\.delete\("bounds"\)/u);
assert.match(panel, /data-earthquake-distribution-area-search/u);
assert.match(panel, /aria-pressed="\$\{areaDrawing \? "true" : "false"\}"/u);
assert.match(panel, /範囲選択を中止/u);
assert.match(panel, /data-earthquake-distribution-range-date="startDate"/u);
assert.match(panel, /data-earthquake-distribution-range-date="endDate"/u);
assert.match(panel, /data-earthquake-distribution-range-search/u);
assert.match(panel, /validateDistributionRangeDraft/u);
assert.match(panel, /指定期間の震央分布を取得中です。/u);
assert.match(panel, /指定期間を検索しています/u);
assert.match(panel, /取得中…/u);
assert.doesNotMatch(
  panel,
  /target\.dataset\.earthquakeDistributionRangeDate\]: target\.value/u,
  "changing a calendar value must not fetch until the search button is pressed"
);
assert.match(panel, /const presets = \[7, 15, 30\]/u);
assert.match(panel, /type="date"/u);
assert.doesNotMatch(panel, /data-earthquake-distribution-range-date-open/u);
assert.doesNotMatch(panel, /最大30日/u);
assert.doesNotMatch(panel, /90日/u);
assert.match(app, /startHypocenterAreaSelection/u);
assert.match(app, /earthquakeDistributionAreaDrawing/u);
assert.match(map, /hypocenter-area-selection/u);
assert.match(map, /cancelHypocenterAreaDrawing/u);
assert.match(worker, /requestedStartDate/u);
assert.match(worker, /requestedBounds/u);
assert.doesNotMatch(worker, /\.slice\(0, 30\)/u);

console.log("Hypocenter distribution range tests passed.");
