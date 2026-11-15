import assert from "node:assert/strict";
import { prepareEarthquakeSimulation } from "../src/simulation/earthquakeSimulation.js";
import { buildEewForecastAreaFeatureCollection, EEW_WARNING_AREA_COLOR } from "../src/eew/eewForecastAreas.js";
import { getEarthquakeIntensityRank } from "../src/earthquakeIntensity.js";
import { buildSimulationEewReports } from "../src/simulation/eewEstimates.js";

const rectangle = (west, south, east, north) => ({ type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] });
const areas = { type: "FeatureCollection", features: [
  { type: "Feature", properties: { code: "001", name: "Near" }, geometry: rectangle(139, 35, 140, 36) },
  { type: "Feature", properties: { code: "002", name: "Adjacent" }, geometry: rectangle(140, 35, 141, 37) },
  { type: "Feature", properties: { code: "003", name: "Far" }, geometry: rectangle(144, 42, 146, 44) }
] };
const stations = { near: { longitude: 139.76, latitude: 35.68 }, adjacent: { longitude: 140.5, latitude: 36 }, far: { longitude: 145, latitude: 43 } };
const simulation = await prepareEarthquakeSimulation({ magnitude: 6.5, depthKm: 10 }, stations, { forecastAreas: areas });
assert.equal(simulation.stations[0].forecastAreaCode, "001", "region codes retain leading zeros");
const waiting = simulation.frame(0).event;
assert.deepEqual(waiting.warnAreas, []);
assert.equal(buildEewForecastAreaFeatureCollection(areas, [waiting]).features.length, 0);
for (const report of simulation.reports) {
  const frame = simulation.frame(report.elapsedSec);
  assert.ok(frame.event.warnAreas.every(area => area.isWarning && getEarthquakeIntensityRank(area.to) >= 4));
  if (!frame.event.isWarn) assert.equal(frame.event.warnAreas.length, 0, "no warning areas before maximum intensity reaches 5-");
}
const final = simulation.frame(simulation.duration).event;
assert.ok(final.warnAreas.some(area => area.code === "001"));
assert.ok(!final.warnAreas.some(area => area.code === "003"));
const colored = buildEewForecastAreaFeatureCollection(areas, [final]);
assert.ok(colored.features.length > 0);
assert.ok(colored.features.every(feature => feature.properties.color === EEW_WARNING_AREA_COLOR && feature.properties.isSimulation));
assert.equal(buildEewForecastAreaFeatureCollection(areas, [simulation.frame(0).event]).features.length, 0, "rewind clears the red areas");
assert.equal(buildEewForecastAreaFeatureCollection(areas, []).features.length, 0, "ending simulation clears the red areas");
const progressing = buildSimulationEewReports({
  options: { model: "nankai-trough", magnitude: 9, depthKm: 20 },
  stations: [
    { forecastAreaCode: "001", forecastAreaName: "Near", epicentralDistanceKm: 10, sourceDistancesKm: [10, 1000], groundArv: 3 },
    { forecastAreaCode: "002", forecastAreaName: "Later", epicentralDistanceKm: 10, sourceDistancesKm: [1000, 10], groundArv: 3 }
  ],
  sources: [{ ruptureDelaySec: 0 }, { ruptureDelaySec: 100 }],
  schedule: [{ reportNumber: 1, elapsedSec: 5 }, { reportNumber: 2, elapsedSec: 150 }], ruptureCompleteSec: 100
});
assert.ok(progressing[0].warnAreas.some(area => area.code === "001"));
assert.ok(!progressing[0].warnAreas.some(area => area.code === "002"), "unruptured distant segments cannot generate early warning areas");
assert.ok(progressing[1].warnAreas.some(area => area.code === "002"), "warning areas expand after rupture and estimate updates");
console.log("Simulation warning areas: per-bulletin thresholds, region mapping, red fill and clearing passed");
