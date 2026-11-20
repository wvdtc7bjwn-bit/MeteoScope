import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DOMParser } from "@xmldom/xmldom";
import { parseLongPeriodReport, fetchEarthquakeXmlList } from "../src/jma/earthquakeXml.js";
import { attachLongPeriodReports, getLongPeriodClassLabel, normalizeLongPeriodClass, selectLatestLongPeriodReport } from "../src/earthquake/longPeriodGroundMotion.js";
import { mergeRealtimeEarthquakes, reconcileEarthquakeSources } from "../src/earthquake/realtimeEarthquake.js";
import { renderLongPeriodGroundMotion, renderLongPeriodSummary } from "../src/ui/longPeriodGroundMotion.js";
import { JMA_ENDPOINTS } from "../src/config.js";

// Unmodified JMA official sample: https://xml.kishou.go.jp/jmaxml_20261118_Samples.zip
// This is a format sample, not a record of an actual earthquake.
const sample = await readFile(new URL("./fixtures/78_01_01_240613_VXSE62.xml", import.meta.url), "utf8");
globalThis.DOMParser = DOMParser;
const entry = { code: "VXSE62", id: "sample", url: "https://www.data.jma.go.jp/sample_VXSE62.xml" };
const report = parseLongPeriodReport(sample, entry);
assert.equal(report.eventId, "20201121023300");
assert.equal(report.maxClass, 3);
assert.equal(report.areas[0].areaName, "宮城県北部");
assert.equal(report.areas[0].maxClass, 3);
const station = report.stations.find(item => item.code === "0421200");
assert.equal(station.class, 3);
assert.equal(station.sva, 20.5);
assert.deepEqual(station.periods[1], { band: "2", unit: "秒台", class: 3, sva: 50.3 });
assert.equal(station.periods[4].class, 0, "A reported below-class-1 value is retained");
for (const value of [null, undefined, "", " ", "不明", "NaN", -1, 5, "3+"]) assert.equal(normalizeLongPeriodClass(value), null);
assert.equal(normalizeLongPeriodClass("0"), 0);
assert.equal(getLongPeriodClassLabel(0), "階級1未満");
assert.equal(getLongPeriodClassLabel(null), "未取得");
assert.equal(parseLongPeriodReport(sample.replace("<Status>通常</Status>", "<Status>訓練</Status>"), entry), null);
assert.equal(parseLongPeriodReport(sample.replace("<EventID>20201121023300</EventID>", ""), entry), null);
const missing = parseLongPeriodReport(sample.replace("<MaxLgInt>3</MaxLgInt>", "<MaxLgInt/>").replace("<LgInt>3</LgInt>", "<LgInt/>").replace('<Sva unit="cm/s">20.5</Sva>', '<Sva unit="cm/s"/>'), entry);
assert.equal(missing.maxClass, null);
assert.equal(missing.stations[0].class, null);
assert.equal(missing.stations[0].sva, null);

const later = { ...report, status: "corrected", maxClass: 1, reportTimeRaw: "2020-11-21T02:40:00+09:00", stations: [] };
assert.equal(selectLatestLongPeriodReport(report, later), later);
assert.equal(selectLatestLongPeriodReport(later, report), later);
assert.equal(selectLatestLongPeriodReport(report, { ...later, eventId: "other" }), report);
const cancelled = parseLongPeriodReport(sample.replace("<InfoType>発表</InfoType>", "<InfoType>取消</InfoType>").replaceAll("2020-11-21T02:33:10+09:00", "2020-11-21T02:45:00+09:00"), entry);
assert.equal(cancelled.status, "cancelled");
assert.equal(cancelled.maxClass, null);
assert.deepEqual(cancelled.stations, []);
assert.equal(selectLatestLongPeriodReport(cancelled, later), cancelled);

const event = { id: "eq", eventId: report.eventId, eventKey: `event-id:${report.eventId}`, xmlCode: "VXSE53", reportTimeRaw: "2020-11-21T02:28:00+09:00", maxIntensity: "5-", intensityStations: [{ code: "x", intensity: "5-" }] };
const attached = attachLongPeriodReports([event, { ...event, id: "other", eventId: "other" }], [report, later]);
assert.equal(attached[0].longPeriod, later);
assert.equal(attached[1].longPeriod, undefined);
assert.equal(attached[0].maxIntensity, "5-");
assert.equal(attached[0].intensityStations, event.intensityStations, "Separate product must not replace ordinary observations");
const cancelledEvent = { ...event, longPeriod: cancelled };
const olderEvent = { ...event, longPeriod: report };
for (const items of [[olderEvent, cancelledEvent], [cancelledEvent, olderEvent]]) {
  assert.equal(mergeRealtimeEarthquakes([items[0]], [items[1]])[0].longPeriod.status, "cancelled");
}
const newerP2P = { ...event, source: "p2p", xmlCode: "", issueType: "ScaleAndDestination", reportTimeRaw: "2020-11-21T02:50:00+09:00" };
assert.equal(mergeRealtimeEarthquakes([cancelledEvent], [newerP2P])[0].longPeriod.status, "cancelled");
assert.equal(reconcileEarthquakeSources([attached[0]], [], [newerP2P], { status: "connected" })[0].longPeriod, later);

assert.equal(renderLongPeriodGroundMotion(null), "");
assert.match(renderLongPeriodSummary(report), /aria-label="長周期地震動 最大階級3"[^>]*>最大階級3</);
for (const hidden of [null, { maxClass: 0 }, { maxClass: null }, cancelled]) assert.equal(renderLongPeriodSummary(hidden), "");
const markup = renderLongPeriodGroundMotion(report);
assert.match(markup, /最大[\s\S]*階級3/);
assert.match(markup, /登米市中田町/);
assert.match(markup, /地域別/);
const belowClassOne = { ...report,
  areas: [{ areaName: "表示する地域", maxClass: 1 }, { areaName: "除外する地域", maxClass: "0" }],
  stations: [{ stationName: "表示する観測点", class: 1 }, { stationName: "除外する観測点", class: 0 }] };
const filteredMarkup = renderLongPeriodGroundMotion(belowClassOne);
assert.doesNotMatch(filteredMarkup, /階級1未満|grade-0|除外する/);
assert.match(filteredMarkup, /地域別 \(1\)/);
assert.match(filteredMarkup, /観測点別 \(1\)/);
assert.equal(belowClassOne.stations.length, 2, "Only display rows are filtered; source observations remain intact");
assert.match(renderLongPeriodGroundMotion(missing), /未取得/);
assert.doesNotMatch(renderLongPeriodGroundMotion(cancelled), /登米市中田町|grade-3/);
assert.match(renderLongPeriodGroundMotion({ ...report, stations: [{ stationName: '<img src=x onerror="bad">', class: 1 }], areas: [] }), /&lt;img/);

// Exercise the real feed -> code recognition -> fetch -> event association path.
// No external network calls, no persistent browser/test data.
const feed = `<feed xmlns="http://www.w3.org/2005/Atom"><updated>2020-11-21T02:40:00+09:00</updated>${["VXSE53", "VXSE62"].map(code => `<entry><id>${code}</id><title>地震情報</title><updated>2020-11-21T02:40:00+09:00</updated><link href="https://example.test/${code}.xml"/></entry>`).join("")}</feed>`;
const calls = [];
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async url => {
    calls.push(String(url));
    if ([JMA_ENDPOINTS.earthquakeXmlFeed, JMA_ENDPOINTS.earthquakeXmlLongFeed].includes(url)) return new Response(feed);
    if (String(url).endsWith("VXSE62.xml")) return new Response(sample);
    if (String(url).endsWith("VXSE53.xml")) return new Response(sample);
    return Response.json(url === JMA_ENDPOINTS.estimatedIntensityList ? [] : { type: "FeatureCollection", features: [] });
  };
  const data = await fetchEarthquakeXmlList();
  assert.equal(data.earthquakes.length, 1);
  assert.equal(data.earthquakes[0].xmlCode, "VXSE53");
  assert.equal(data.earthquakes[0].longPeriod.maxClass, 3);
  assert.equal(data.longPeriodStatus, "available");
  assert.equal(calls.filter(url => url.endsWith("VXSE62.xml")).length, 1, "Duplicate feed entry is fetched only once");
} finally { globalThis.fetch = originalFetch; }
console.log("Long-period: official XML, grades, missing values, cancellation, source reconciliation, UI and feed integration passed");
