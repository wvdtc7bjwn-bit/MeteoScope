import assert from "node:assert/strict";
import { buildAmedasPoints, fetchAmedasLatestTime, getAmedasSnowMapTime } from "../src/jma/amedas.js";
import { JMA_ENDPOINTS } from "../src/config.js";

assert.equal(getAmedasSnowMapTime("20261028083000"), "20261028080000");
assert.equal(getAmedasSnowMapTime("20261028000000"), "20261028000000");

const stations = Object.fromEntries(["a", "b", "c", "d"].map((id) => [id, {
  kjName: id,
  lat: [40, 0],
  lon: [140, 0]
}]));
const observations = {
  a: { temp: [3, 0] },
  b: { temp: [4, 0] },
  c: { temp: [5, 0] }
};
const hourly = {
  a: { snow: [37, 0], snow1h: [8, 0] },
  b: { snow: [0, 0] },
  c: { snow: [12, 1], snow1h: [4, 0] },
  d: { snow: [9, 0] }
};
const points = new Map(buildAmedasPoints(observations, stations, hourly).map((point) => [point.id, point]));
assert.equal(points.get("a").values.snow, 37);
assert.equal(points.get("a").values.temperature, 3);
assert.equal(points.get("b").values.snow, 0);
assert.equal(points.get("c").values.snow, null, "品質不良や1時間降雪量を積雪深として扱わない");
assert.equal(points.get("d").values.snow, 9, "毎時データにのみ存在する観測点も表示対象に含める");
assert.equal(buildAmedasPoints(observations, stations, null)[0].values.snow, null);

const requests = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  requests.push(String(url));
  if (url === JMA_ENDPOINTS.amedasTimeList) return new Response("2026-10-28T08:30:00+09:00");
  if (url === JMA_ENDPOINTS.amedasStationTable) return Response.json(stations);
  if (url === `${JMA_ENDPOINTS.amedasMapBase}/20261028083000.json`) return Response.json(observations);
  if (url === `${JMA_ENDPOINTS.amedasMapBase}/20261028080000.json`) return Response.json(hourly);
  return new Response("");
};
try {
  const actual = await fetchAmedasLatestTime();
  assert.ok(requests.includes(`${JMA_ENDPOINTS.amedasMapBase}/20261028080000.json`));
  assert.equal(actual.snowLatestTime, "2026/10/28 08:00");
  assert.equal(actual.points.find((point) => point.id === "a").values.snow, 37);
  assert.equal(actual.points.find((point) => point.id === "a").values.temperature, 3);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("AMeDAS snow tests passed");
