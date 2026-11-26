import assert from "node:assert/strict";
import vm from "node:vm";
import { buildAmedasTemperatureNormalData } from "../scripts/lib/amedasTemperatureNormals.mjs";
import { readFile } from "node:fs/promises";
import {
  AMEDAS_TEMPERATURE_NORMAL_PERIOD,
  AMEDAS_DAILY_TEMPERATURE_NORMALS_URL,
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
const dailyRow = (id, element, values) => [25, id, element, 30, 1991, 2020, 11, ...values.flat()].join(",");
const parsed = buildAmedasTemperatureNormalData([{text: [
  dailyRow("11001", "0600", [["0", "0"], ["0", "8"], ["", "8"], ["45", "1"]]),
  dailyRow("11001", "0700", [["-25", "8"], ["0", "0"]]),
  dailyRow("11002", "0600", [["0", "0"]])
].join("\n")}]);
assert.deepEqual(getAmedasDailyTemperatureNormals(parsed, "11001", "20261101"), {maximum:null,minimum:-2.5,period:"1991-2020"});
assert.deepEqual(getAmedasDailyTemperatureNormals(parsed, "11001", "20261102"), {maximum:0,minimum:null,period:"1991-2020"});
assert.equal(getAmedasDailyTemperatureNormals(parsed, "11001", "20261103"), null);
assert.equal(getAmedasDailyTemperatureNormals(parsed, "11001", "20261104"), null);
assert.equal(parsed.stations["11002"], undefined);

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
const parserSource = await readFile(new URL("../scripts/lib/amedasTemperatureNormals.mjs", import.meta.url), "utf8");
for (const element of ["0600", "0700"]) assert.match(parserSource, new RegExp(`"${element}"`));
assert.doesNotMatch(parserSource, /"0500"/);

console.log("AMeDAS temperature normal tests passed");

// Reopening a station must retain its official normals when the network drops.
const storedNormals = JSON.parse(await readFile(new URL("../public/data/amedas-daily-high-low-temperature-normals-1991-2020.json", import.meta.url), "utf8"));
assert.deepEqual(getAmedasDailyTemperatureNormals(storedNormals, "64036", "20261124"),
  { maximum: 15.3, minimum: 5.8, period: "1991-2020" });
const workerSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const listeners = new Map();
const cache = new Map();
let online = true;
let networkRequests = 0;
const worker = vm.createContext({
  URL, Response,
  self: { location: { origin: "https://example.test" }, addEventListener: (name, fn) => listeners.set(name, fn) },
  caches: { open: async () => ({ match: async request => cache.get(request.url), put: async (request, response) => cache.set(request.url, response) }) },
  fetch: async () => { networkRequests++; if (!online) throw new TypeError("offline"); return Response.json(storedNormals); }
});
vm.runInContext(workerSource, worker);
function requestStatic(url) {
  let result;
  listeners.get("fetch")({ request: { method: "GET", mode: "cors", url }, respondWith: promise => { result = promise; } });
  return result;
}
const staticUrl = new URL(AMEDAS_DAILY_TEMPERATURE_NORMALS_URL,"https://example.test").href;
const firstNormalResponse = await requestStatic(staticUrl);
assert.equal(firstNormalResponse.ok, true);
online = false;
const cachedNormalResponse = await requestStatic(staticUrl);
assert.equal(networkRequests, 1, "offline display must reuse downloaded normals without another request");
assert.equal(getAmedasDailyTemperatureNormals(await cachedNormalResponse.json(), "64036", "20261124").maximum, 15.3);
await assert.rejects(requestStatic(staticUrl + "-new-version"), /offline/, "another data version must not reuse old normals");
assert.equal(requestStatic("https://example.test/api/amedas/latest"), undefined, "live data must not use the static-normal cache route");
console.log("AMeDAS normals: Nara values, offline cache reuse and version isolation passed");
