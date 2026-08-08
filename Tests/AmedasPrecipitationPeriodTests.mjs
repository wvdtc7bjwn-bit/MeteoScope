import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AMEDAS_PRECIPITATION_PERIODS,
  applyAmedasPrecipitationPeriod,
  getAmedasObservationField,
  getAmedasPrecipitationLegendTicks,
  getAmedasPrecipitationLevels,
  normalizeAmedasPrecipitationPeriod
} from "../src/amedasPrecipitationPeriod.js";
import { getAmedasObservationColor } from "../src/config.js";

assert.deepEqual(
  AMEDAS_PRECIPITATION_PERIODS.map((period) => period.id),
  ["10m", "1h", "3h", "24h"]
);
assert.equal(normalizeAmedasPrecipitationPeriod("24h"), "24h");
assert.equal(normalizeAmedasPrecipitationPeriod("invalid"), "1h");
assert.equal(getAmedasObservationField("precipitation", "10m"), "precipitation10m");
assert.equal(getAmedasObservationField("precipitation", "3h"), "precipitation3h");
assert.equal(getAmedasObservationField("temperature", "24h"), "temp");
assert.deepEqual(getAmedasPrecipitationLegendTicks("10m"), [1, 3, 5, 10, 15, 20, 30]);
assert.deepEqual(getAmedasPrecipitationLegendTicks("1h"), [1, 5, 10, 20, 30, 50, 80]);
assert.deepEqual(getAmedasPrecipitationLegendTicks("3h"), [20, 40, 60, 80, 100, 120, 150]);
assert.deepEqual(getAmedasPrecipitationLegendTicks("24h"), [50, 80, 100, 150, 200, 250, 300]);
assert.equal(getAmedasPrecipitationLevels("10m")[0].min, 30);
assert.equal(getAmedasPrecipitationLevels("24h")[0].min, 300);
assert.equal(getAmedasPrecipitationLevels("invalid"), getAmedasPrecipitationLevels("1h"));
assert.equal(getAmedasObservationColor("precipitation", 30, "10m"), "#c90064");
assert.equal(getAmedasObservationColor("precipitation", 80, "1h"), "#c90064");
assert.equal(getAmedasObservationColor("precipitation", 150, "3h"), "#c90064");
assert.equal(getAmedasObservationColor("precipitation", 300, "24h"), "#c90064");
assert.equal(getAmedasObservationColor("precipitation", 15, "1h"), "#064de8");
assert.equal(getAmedasObservationColor("precipitation", 19.9, "1h"), "#064de8");
assert.equal(getAmedasObservationColor("precipitation", 20, "1h"), "#fff000");
assert.equal(getAmedasObservationColor("precipitation", 0, "1h"), "#eef2f8");
assert.notEqual(
  getAmedasObservationColor("precipitation", 40, "10m"),
  getAmedasObservationColor("precipitation", 40, "24h")
);

const source = {
  points: [{
    id: "station-1",
    values: {
      precipitation: 1,
      precipitation10m: 0.5,
      precipitation1h: 1,
      precipitation3h: 4.5,
      precipitation24h: 32
    }
  }]
};
const display = applyAmedasPrecipitationPeriod(source, "24h");
assert.equal(display.precipitationPeriod, "24h");
assert.equal(display.points[0].values.precipitation, 32);
assert.equal(source.points[0].values.precipitation, 1);
assert.notEqual(display.points, source.points);
assert.notEqual(display.points[0].values, source.points[0].values);

const [appSource, amedasSource, panelSource, mapSource, styleSource, indexSource] = await Promise.all([
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/jma/amedas.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8"),
  readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8"),
  readFile(new URL("../src/style.css", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8")
]);

for (const field of ["precipitation10m", "precipitation1h", "precipitation3h", "precipitation24h"]) {
  assert.match(amedasSource, new RegExp(field));
}
assert.match(appSource, /applyAmedasPrecipitationPeriod/);
assert.match(appSource, /AMEDAS_PRECIPITATION_PERIOD_STORAGE_KEY/);
assert.match(panelSource, /setupAmedasPrecipitationPeriods/);
assert.match(panelSource, /mobile-dock-amedas-period-cycle/);
assert.match(panelSource, /前24時間降水量（移動合計）/);
assert.match(panelSource, /古い雨が集計範囲から外れると値が下がります/);
assert.match(panelSource, /isRollingPrecipitation/);
assert.match(panelSource, /buildAmedasPrecipitationLegend/);
assert.match(panelSource, /amedas-precipitation-gradient/);
assert.match(mapSource, /getAmedasColor\(metric\.id, value, data\?\.precipitationPeriod\)/);
assert.match(mapSource, /id:\s*"sample-amedas-value"[\s\S]*?minzoom:\s*8\.5/);
assert.match(mapSource, /zoomStops:\s*\[\s*\[3,\s*0\.34,\s*0\.3\],\s*\[5,\s*0\.5,\s*0\.42\],\s*\[7,\s*0\.78,\s*0\.65\]/);
assert.match(mapSource, /\[9,\s*1\.2,\s*0\.85\],\s*\[10,\s*1\.38,\s*1\],\s*\[12,\s*1\.55,\s*1\]/);
assert.match(mapSource, /markerType:\s*isWind\s*\?\s*"wind"\s*:\s*"amedas"/);
assert.match(mapSource, /strokeWidth:\s*0/);
assert.match(mapSource, /if \(metricId === "precipitation"\) return 8\.5/);
assert.match(mapSource, /amedasValueLabel:\s*isWind\s*\?\s*""\s*:\s*formatAmedasValue\(value\)/);
assert.match(styleSource, /\.amedas-precipitation-gradient\s*\{[\s\S]*?height:\s*14px/);
assert.match(indexSource, /id="amedas-precipitation-periods"/);

console.log("AMeDAS precipitation period tests passed");
