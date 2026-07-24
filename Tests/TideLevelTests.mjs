import assert from "node:assert/strict";
import {
  buildTideObservationPoints,
  parseTideStationCatalog
} from "../src/jma/tideLevel.js";

const catalog = parseTideStationCatalog({
  "130010": {
    class30s: [{
      standard: { level4: 200, level5: 1030 },
      stations: [{
        code: "131000",
        name: "東京",
        lat: 35.65,
        lon: 139.77,
        typeName: "気象庁",
        addr: "東京都",
        reference: "標高",
        detail: { type: "検潮所" },
        max: {
          level: 115,
          datetime: "2024-01-01T00:00:00+09:00",
          description: "過去最高潮位"
        }
      }]
    }]
  }
});

assert.equal(catalog.length, 1);
assert.deepEqual(catalog[0].coordinates, [139.77, 35.65]);
assert.equal(catalog[0].level4, 200);
assert.equal(catalog[0].level5, 1030);
assert.equal(catalog[0].historicalMaximum, 115);

const astronomicalByYear = new Map([[
  2026,
  {
    tide: {
      "0724": Array.from({ length: 24 }, (_, hour) => hour * 10)
    }
  }
]]);
const observations = [{
  time: "2026-07-24T00:00:00+09:00",
  interval: 900,
  tide: [2, 5, "///", 11, 14]
}];
const points = buildTideObservationPoints(observations, astronomicalByYear, {
  updatedAt: "2026-07-24T01:00:00+09:00",
  historyHours: 1,
  maxPoints: 100
});

assert.equal(points.length, 4);
assert.equal(points[0].observed, 2);
assert.equal(points[1].astronomical, 2.5);
assert.equal(points[1].deviation, 2.5);
assert.equal(points.at(-1).observed, 14);
assert.equal(points.at(-1).astronomical, 10);
assert.equal(points.at(-1).deviation, 4);

const downsampled = buildTideObservationPoints([{
  time: "2026-07-24T00:00:00+09:00",
  interval: 60,
  tide: Array.from({ length: 61 }, (_, index) => index)
}], astronomicalByYear, {
  updatedAt: "2026-07-24T01:00:00+09:00",
  historyHours: 1,
  maxPoints: 10
});
assert.ok(downsampled.length <= 11);
assert.equal(downsampled.at(-1).observed, 60);

console.log("Tide level tests passed.");
