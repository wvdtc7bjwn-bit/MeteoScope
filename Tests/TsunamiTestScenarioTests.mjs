import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const {
  buildLocalTsunamiTestData,
  createLocalTsunamiTestReport,
  getLocalTsunamiTestScenario
} = await import("../src/dev/tsunamiTestScenario.js");

const areaGeoJson = JSON.parse(await readFile(
  new URL("../public/data/jma-tsunami-forecast-areas.geojson", import.meta.url),
  "utf8"
));
const stationData = JSON.parse(await readFile(
  new URL("../public/data/jma-tsunami-observation-stations.json", import.meta.url),
  "utf8"
));
const now = new Date("2026-07-24T02:30:00.000Z");
const baseData = {
  earthquakes: [{
    id: "earthquake-test",
    eventId: "20260724113000",
    hypocenterName: "房総半島南東沖"
  }],
  tsunami: null,
  tsunamiStatus: "none"
};

assert.equal(getLocalTsunamiTestScenario("?tab=earthquake&tsunamiTest=warning"), "warning");
assert.equal(getLocalTsunamiTestScenario("?tsunamiTest=invalid"), "");

const warningReport = createLocalTsunamiTestReport("warning", { now, eventId: "event-test" });
assert.equal(warningReport.highestLevel, "warning");
assert.equal(warningReport.isActive, true);
assert.equal(warningReport.isTestScenario, true);
assert.equal(warningReport.eventId, "event-test");
assert.match(warningReport.headline, /避難/u);
assert.equal(warningReport.areas.length, 4);
assert.deepEqual(
  warningReport.areas.map((area) => area.level),
  ["warning", "warning", "advisory", "advisory"]
);

const advisoryReport = createLocalTsunamiTestReport("advisory", { now, eventId: "event-advisory" });
assert.equal(advisoryReport.highestLevel, "advisory");
assert.equal(advisoryReport.areas.length, 3);
assert.ok(advisoryReport.areas.every((area) => area.level === "advisory"));

const majorWarningData = buildLocalTsunamiTestData(
  baseData,
  "major-warning",
  areaGeoJson,
  stationData,
  { now }
);
assert.equal(majorWarningData.tsunamiStatus, "available");
assert.equal(majorWarningData.tsunami.highestLevel, "major-warning");
assert.equal(majorWarningData.tsunami.eventId, "20260724113000");
assert.ok(majorWarningData.tsunami.mapFeatures.some(
  (feature) => feature.properties.tsunamiLevel === "major-warning"
));
assert.ok(majorWarningData.tsunami.mapFeatures.some(
  (feature) => feature.properties.tsunamiLevel === "warning"
));

const observationData = buildLocalTsunamiTestData(
  baseData,
  "observation",
  areaGeoJson,
  stationData,
  { now }
);
assert.equal(observationData.tsunami.observations.length, 2);
assert.equal(observationData.tsunami.offshoreObservations.length, 1);
assert.deepEqual(observationData.tsunami.observations[0].coordinates, [140.56667, 36.3]);
assert.equal(
  observationData.tsunami.mapFeatures.filter(
    (feature) => feature.properties.markerType === "tsunami-coastal"
  ).length,
  2
);
assert.equal(
  observationData.tsunami.mapFeatures.filter(
    (feature) => feature.properties.markerType === "tsunami-offshore"
  ).length,
  1
);

const noAlertData = buildLocalTsunamiTestData(
  baseData,
  "none",
  areaGeoJson,
  stationData,
  { now }
);
assert.equal(noAlertData.tsunami.highestLevel, "none");
assert.equal(noAlertData.tsunami.isActive, false);
assert.equal(noAlertData.tsunami.mapFeatures.length, 0);

console.log("Local tsunami test scenario tests passed");
