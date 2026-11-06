import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";
import { EARTHQUAKE_REFRESH_INTERVAL_MS, JMA_ENDPOINTS } from "../src/config.js";
import { fetchEarthquakeXmlList } from "../src/jma/earthquakeXml.js";
import { fetchVolcanoXmlList } from "../src/jma/volcanoXml.js";

assert.equal(EARTHQUAKE_REFRESH_INTERVAL_MS, 30000);
const oldUrl = "https://example.test/old_VXSE53.xml";
const newUrl = "https://example.test/new_VXSE53.xml";
const entry = (url, time) => `<entry><id>${url}</id><title>震源・震度情報</title><updated>${time}</updated><link href="${url}"/></entry>`;
const oldEntry = entry(oldUrl, "2026-11-06T08:00:00+09:00");
const newEntry = entry(newUrl, "2026-11-06T08:01:00+09:00");
const report = (id, time) => `<Report><Head><Title>震源・震度情報</Title><EventID>${id}</EventID><ReportDateTime>${time}</ReportDateTime></Head><Body><Earthquake><OriginTime>${time}</OriginTime><Hypocenter><Area><Name>試験地域</Name><Coordinate>+35.0+140.0-10000/</Coordinate></Area></Hypocenter><Magnitude>3.0</Magnitude></Earthquake><Intensity><Observation><MaxInt>1</MaxInt></Observation></Intensity></Body></Report>`;

const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const originalParser = globalThis.DOMParser;
let now = 1700000000000;
const requests = new Map();
globalThis.DOMParser = DOMParser;
Date.now = () => now;
globalThis.fetch = async (url) => {
  url = String(url);
  requests.set(url, (requests.get(url) ?? 0) + 1);
  if (url === JMA_ENDPOINTS.earthquakeXmlFeed) {
    return new Response(`<feed>${now >= 1700000030000 ? newEntry : ""}${oldEntry}</feed>`);
  }
  if (url === JMA_ENDPOINTS.earthquakeXmlLongFeed) return new Response(`<feed>${oldEntry}</feed>`);
  if (url === oldUrl) return new Response(report("20261106080000", "2026-11-06T08:00:00+09:00"));
  if (url === newUrl) return new Response(report("20261106080100", "2026-11-06T08:01:00+09:00"));
  if (url === JMA_ENDPOINTS.estimatedIntensityList) return Response.json([]);
  return Response.json({});
};

try {
  await fetchVolcanoXmlList();
  const first = await fetchEarthquakeXmlList();
  assert.equal(first.earthquakes[0].eventId, "20261106080000");
  now += 29000;
  await fetchEarthquakeXmlList();
  assert.equal(requests.get(JMA_ENDPOINTS.earthquakeXmlFeed), 1, "30秒以内はフィードを再取得しない");
  now += 1001;
  const refreshed = await fetchEarthquakeXmlList();
  assert.equal(refreshed.earthquakes[0].eventId, "20261106080100", "新しい地震情報を表示する");
  assert.equal(requests.get(JMA_ENDPOINTS.earthquakeXmlFeed), 2);
  assert.equal(requests.get(JMA_ENDPOINTS.earthquakeXmlLongFeed), 1, "長期フィードを不要に再取得しない");
  assert.equal(requests.get(oldUrl), 1, "取得済み電文を不要に再取得しない");
  assert.equal(requests.get(newUrl), 1);
} finally {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  if (originalParser === undefined) delete globalThis.DOMParser;
  else globalThis.DOMParser = originalParser;
}

console.log("Earthquake refresh tests passed");
