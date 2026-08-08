import assert from "node:assert/strict";

import {
  formatEarthquakeDepthText,
  formatEarthquakeHypocenterText,
  formatEarthquakeMagnitude,
  getEarthquakeUnknownText,
  isEarthquakeReportUnderInvestigation
} from "../src/earthquakeFormat.js";
import { mergeEarthquakeReportsByPriority } from "../src/jma/earthquakeXml.js";

function report(xmlCode, reportPriority, overrides = {}) {
  return {
    id: "event-id:20260808123456",
    eventId: "20260808123456",
    eventKey: "event-id:20260808123456",
    xmlCode,
    reportPriority,
    title: xmlCode,
    reportTitle: xmlCode,
    reportTime: `2026/08/08 12:${reportPriority}`,
    reportTimeRaw: `2026-08-08T12:${reportPriority}:00+09:00`,
    eventTime: "2026/08/08 12:34",
    eventTimeRaw: "2026-08-08T12:34:56+09:00",
    hypocenterName: "震源調査中",
    coordinates: null,
    depth: null,
    magnitude: "--",
    maxIntensity: null,
    maxIntensityLabel: "震度不明",
    maxIntensityShort: "--",
    intensityAreas: [],
    intensityCities: [],
    intensityStations: [],
    headline: "",
    tsunamiComment: "",
    url: `https://example.test/${xmlCode}.xml`,
    ...overrides
  };
}

const vxse51 = report("VXSE51", 10, {
  maxIntensity: "2",
  maxIntensityLabel: "震度2",
  maxIntensityShort: "2",
  intensityAreas: [{ code: "741", intensity: "2" }]
});
const vxse52 = report("VXSE52", 20, {
  hypocenterName: "熊本県熊本地方",
  coordinates: [130.7, 32.8],
  depth: 10,
  magnitude: "M3.1",
  headline: "震源を更新"
});
const vxse53 = report("VXSE53", 30, {
  hypocenterName: "熊本県熊本地方",
  coordinates: [130.71, 32.81],
  depth: 12,
  magnitude: "M3.2",
  maxIntensity: "3",
  maxIntensityLabel: "震度3",
  maxIntensityShort: "3",
  intensityAreas: [{ code: "741", intensity: "3" }],
  tsunamiComment: "この地震による津波の心配はありません。"
});

assert.equal(isEarthquakeReportUnderInvestigation(vxse51), true);
assert.equal(isEarthquakeReportUnderInvestigation(vxse52), true);
assert.equal(isEarthquakeReportUnderInvestigation(vxse53), false);
assert.equal(getEarthquakeUnknownText(vxse51), "調査中");
assert.equal(getEarthquakeUnknownText(vxse52), "調査中");
assert.equal(getEarthquakeUnknownText(vxse53), "不明");

assert.equal(formatEarthquakeHypocenterText(vxse51), "調査中");
assert.equal(formatEarthquakeMagnitude(null, { prefix: true, unknownText: "調査中" }), "調査中");
assert.equal(formatEarthquakeDepthText(null, { compact: true, unknownText: "調査中" }), "調査中");

const afterVxse52 = mergeEarthquakeReportsByPriority([vxse51, vxse52]);
assert.equal(afterVxse52.length, 1);
assert.equal(afterVxse52[0].xmlCode, "VXSE52", "VXSE52 must supersede VXSE51");
assert.equal(afterVxse52[0].hypocenterName, "熊本県熊本地方");
assert.equal(afterVxse52[0].magnitude, "M3.1");
assert.equal(afterVxse52[0].depth, 10);
assert.equal(afterVxse52[0].maxIntensity, "2", "known VXSE51 intensity must remain available");

const afterVxse53 = mergeEarthquakeReportsByPriority([vxse51, vxse52, vxse53]);
assert.equal(afterVxse53.length, 1);
assert.equal(afterVxse53[0].xmlCode, "VXSE53", "VXSE53 must supersede VXSE52");
assert.equal(afterVxse53[0].magnitude, "M3.2");
assert.equal(afterVxse53[0].depth, 12);
assert.equal(afterVxse53[0].maxIntensity, "3");
assert.equal(afterVxse53[0].tsunamiComment, "この地震による津波の心配はありません。");
assert.equal(getEarthquakeUnknownText(afterVxse53[0]), "不明");

const reversedArrivalOrder = mergeEarthquakeReportsByPriority([vxse53, vxse52, vxse51]);
assert.equal(reversedArrivalOrder[0].xmlCode, "VXSE53", "priority must not depend on feed order");
assert.equal(reversedArrivalOrder[0].maxIntensity, "3");

console.log("Earthquake investigation tests passed.");
