import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AMEDAS_TEMPERATURE_NORMAL_PERIOD,
  getAmedasDailyTemperatureNormals
} from "../src/amedasTemperatureNormal.js";

const normalData = {
  period: AMEDAS_TEMPERATURE_NORMAL_PERIOD,
  stations: {
    "11001": {
      maximum: Array.from({ length: 12 * 31 }, (_, index) => index + 100),
      minimum: Array.from({ length: 12 * 31 }, (_, index) => index - 100)
    }
  }
};

assert.deepEqual(
  getAmedasDailyTemperatureNormals(normalData, "11001", "20260928"),
  { maximum: 37.5, minimum: 17.5, period: "1991-2020" }
);
assert.equal(getAmedasDailyTemperatureNormals(normalData, "11001", "20261301"), null);
assert.equal(getAmedasDailyTemperatureNormals(normalData, "missing", "20260928"), null);

const [amedasSource, panelSource, scriptSource] = await Promise.all([
  readFile(new URL("../src/jma/amedas.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8"),
  readFile(new URL("../scripts/build-amedas-temperature-normal-data.mjs", import.meta.url), "utf8")
]);

assert.match(amedasSource, /fetchAmedasDailyTemperatureNormals/);
assert.match(panelSource, /平年最高/);
assert.match(panelSource, /平年最低/);
assert.doesNotMatch(panelSource, /観測平均/);
assert.match(panelSource, /amedas-temperature-chart-reference-lines/);
assert.match(scriptSource, /normal_amedas_daily\.zip/);
for (const element of ["0600", "0700"]) assert.match(scriptSource, new RegExp(`"${element}"`));
assert.doesNotMatch(scriptSource, /"0500"/);

console.log("AMeDAS temperature normal tests passed");
