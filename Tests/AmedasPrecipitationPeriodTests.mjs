import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AMEDAS_PRECIPITATION_PERIODS,
  applyAmedasPrecipitationPeriod,
  getAmedasObservationField,
  normalizeAmedasPrecipitationPeriod
} from "../src/amedasPrecipitationPeriod.js";

assert.deepEqual(
  AMEDAS_PRECIPITATION_PERIODS.map((period) => period.id),
  ["10m", "1h", "3h", "24h"]
);
assert.equal(normalizeAmedasPrecipitationPeriod("24h"), "24h");
assert.equal(normalizeAmedasPrecipitationPeriod("invalid"), "1h");
assert.equal(getAmedasObservationField("precipitation", "10m"), "precipitation10m");
assert.equal(getAmedasObservationField("precipitation", "3h"), "precipitation3h");
assert.equal(getAmedasObservationField("temperature", "24h"), "temp");

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

const [appSource, amedasSource, panelSource, indexSource] = await Promise.all([
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/jma/amedas.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8")
]);

for (const field of ["precipitation10m", "precipitation1h", "precipitation3h", "precipitation24h"]) {
  assert.match(amedasSource, new RegExp(field));
}
assert.match(appSource, /applyAmedasPrecipitationPeriod/);
assert.match(appSource, /AMEDAS_PRECIPITATION_PERIOD_STORAGE_KEY/);
assert.match(panelSource, /setupAmedasPrecipitationPeriods/);
assert.match(panelSource, /mobile-dock-amedas-period-cycle/);
assert.match(indexSource, /id="amedas-precipitation-periods"/);

console.log("AMeDAS precipitation period tests passed");
