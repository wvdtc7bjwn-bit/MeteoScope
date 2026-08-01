import assert from "node:assert/strict";

import {
  buildDashboardEarthquakeMetrics,
  buildDisasterDashboardViewModel,
  earthquakeMatchesArea,
  reportMatchesArea,
  volcanoMatchesArea
} from "../src/ui/disasterDashboardModal.js";
import {
  formatEarthquakeDepthText,
  formatEarthquakeMagnitude
} from "../src/earthquakeFormat.js";

const areaCode = "4320200";

assert.equal(reportMatchesArea({ affectedAreas: [{ cityCode: areaCode }] }, areaCode), true);
assert.equal(reportMatchesArea({ affectedAreas: [{ cityCode: "1310160" }] }, areaCode), false);
assert.equal(earthquakeMatchesArea({ intensityCities: [{ code: areaCode }] }, areaCode), true);
assert.equal(volcanoMatchesArea({ targetAreas: [{ areas: [{ code: areaCode }] }] }, areaCode), true);
assert.equal(formatEarthquakeMagnitude("M2.5", { prefix: true, compact: true }), "M2.5");
assert.equal(formatEarthquakeMagnitude("2.5", { prefix: true, compact: true }), "M2.5");
assert.equal(formatEarthquakeDepthText(0, { compact: true }), "ごく浅い");
assert.equal(formatEarthquakeDepthText("0km", { compact: true }), "ごく浅い");
assert.equal(formatEarthquakeDepthText(10, { compact: true }), "10km");
assert.equal(formatEarthquakeDepthText(null, { compact: true }), "--");
assert.deepEqual(
  buildDashboardEarthquakeMetrics(
    { maxIntensity: "1", localIntensity: "2", magnitude: "M2.5", depth: 0 },
    { intensity: "最大震度", magnitude: "規模", depth: "深さ" },
    "ja"
  ),
  [
    { label: "最大震度", value: "1" },
    { label: "規模", value: "M2.5" },
    { label: "深さ", value: "ごく浅い" }
  ]
);

const model = buildDisasterDashboardViewModel({
  currentLocation: {
    status: "found",
    areaCode,
    areaName: "八代市",
    prefecture: "熊本県",
    coordinates: [130.6, 32.5],
    updatedAt: "2026/08/01 10:00",
    warnings: [{ label: "大雨警報", level: "warning", updatedAt: "2026/08/01 09:55" }]
  },
  riverFlood: {
    reports: [
      {
        affectedAreas: [{ cityCode: areaCode }],
        forecastAreaName: "球磨川水系",
        levelLabel: "氾濫注意情報",
        level: 2,
        updatedAt: "2026/08/01 09:50"
      }
    ]
  },
  kikikuruStatuses: {
    land: { status: "ready", rank: 2, label: "注意", color: "#ffff00" },
    inund: { status: "ready", rank: 0, label: "危険度なし", color: "#7f91a8" }
  },
  earthquake: {
    earthquakes: [
      {
        hypocenterName: "熊本県熊本地方",
        eventTime: "2026/08/01 09:40",
        magnitude: "3.2",
        depth: 10,
        maxIntensityShort: "3",
        intensityCities: [{ code: areaCode, intensityShort: "2" }]
      }
    ]
  },
  volcano: {
    reports: [
      {
        volcanoName: "阿蘇山",
        kindName: "噴火警戒レベル2",
        level: 2,
        reportTime: "2026/08/01 09:30",
        targetAreas: [{ areas: [{ code: areaCode }] }]
      }
    ]
  },
  radar: {
    latestTime: "2026/08/01 10:00",
    pointSample: { status: "ready", intensity: 1, time: "2026/08/01 10:00" }
  },
  lightning: {
    latestTime: "2026/08/01 10:00",
    pointSample: { status: "ready", level: 2, time: "2026/08/01 10:00" }
  },
  amedas: {
    latestTime: "2026/08/01 10:00",
    points: [
      {
        name: "八代",
        coordinates: [130.61, 32.51],
        values: { temperature: 31.2, precipitation: null, wind: null, humidity: null, pressure: null, snow: null }
      },
      { name: "宇土", coordinates: [130.62, 32.52], values: { precipitation: 2.5 } },
      { name: "甲佐", coordinates: [130.63, 32.53], values: { wind: 3.4 } },
      { name: "熊本", coordinates: [130.64, 32.54], values: { humidity: 70 } },
      { name: "人吉", coordinates: [130.65, 32.55], values: { pressure: 1005.6 } },
      { name: "水俣", coordinates: [130.66, 32.56], values: { snow: 0 } },
      { name: "欠測局", coordinates: [130.6001, 32.5001], values: { temperature: null, precipitation: null } },
      { name: "遠方", coordinates: [140, 40], values: { temperature: 20 } }
    ]
  },
  generatedAt: "2026-08-01T01:00:00.000Z"
}, "ja");

assert.equal(model.status, "ready");
assert.equal(model.overview.activeRiskCount, 4);
assert.equal(model.overview.tone, "attention");
assert.equal(model.warnings.length, 1);
assert.equal(model.riverReports.length, 1);
assert.equal(model.earthquake.local, true);
assert.equal(model.earthquake.localIntensity, "2");
assert.equal(model.volcanoReports.length, 1);
assert.equal(model.observations.radarPoint.intensity, 1);
assert.equal(model.observations.lightningPoint.level, 2);
assert.deepEqual(
  model.observations.nearestAmedasValues.map((item) => [item.value, item.stationName]),
  [
    ["31.2°C", "八代"],
    ["2.5mm", "宇土"],
    ["3.4m/s", "甲佐"],
    ["70%", "熊本"],
    ["1005.6hPa", "人吉"],
    ["0cm", "水俣"]
  ]
);

const missingAmedas = buildDisasterDashboardViewModel({
  currentLocation: { status: "found", areaCode, coordinates: [130.6, 32.5] },
  amedas: {
    points: [{ name: "欠測局", coordinates: [130.61, 32.51], values: { temperature: null, snow: undefined } }]
  }
}, "ja");
assert.deepEqual(missingAmedas.observations.nearestAmedasValues, []);

const noLocation = buildDisasterDashboardViewModel({
  currentLocation: { status: "error" }
}, "en");
assert.equal(noLocation.status, "location-required");

const critical = buildDisasterDashboardViewModel({
  currentLocation: { status: "found", areaCode },
  kikikuruStatuses: {
    land: { status: "ready", rank: 4, label: "危険" },
    inund: { status: "ready", rank: 0, label: "危険度なし" }
  }
}, "ja");
assert.equal(critical.overview.tone, "critical");

console.log("DisasterDashboardTests passed");
