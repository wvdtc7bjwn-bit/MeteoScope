import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prepareEarthquakeSimulation } from "../src/simulation/earthquakeSimulation.js";
import { DEEP_PATH_BLEND_END_KM } from "../src/simulation/intensityModel.js";
import { simulationGroundMeshCode } from "../src/simulation/groundModel.js";
import { buildEewForecastAreaFeatureCollection } from "../src/eew/eewForecastAreas.js";

const stations = JSON.parse(await readFile(new URL("../public/data/jma-intensity-stations.json", import.meta.url), "utf8"));
const plateBoundaries = JSON.parse(await readFile(new URL("../public/data/usgs-plate-boundaries-japan.geojson", import.meta.url), "utf8"));
const forecastAreas = JSON.parse(await readFile(new URL("../public/data/earthquake-areas.geojson", import.meta.url), "utf8"));
// Synthetic site factors isolate the bug without downloading external ground data.
const groundModel = { meshes: Object.fromEntries(Object.values(stations).map(s => [simulationGroundMeshCode([s.longitude, s.latitude]), [2, 300]]).filter(([code]) => code)) };
for (const depthKm of [151, 156, 172, 200, 590, 700]) {
  const simulation = await prepareEarthquakeSimulation({ longitude: 137.5, latitude: 33.5, magnitude: 8.1, depthKm, groundCorrection: "jshis-1km" }, stations,
    { plateBoundaries, forecastAreas, groundModel, yieldTask: async () => {} });
  const final = simulation.reports.at(-1);
  const bulletinDepth = Math.round(depthKm / 10) * 10;
  assert.ok(simulation.reports.slice(0, -1).every(report => !report.analysisMature ? report.depth >= DEEP_PATH_BLEND_END_KM : report.depth === bulletinDepth), "synthetic early depth cannot disable the configured deep path model");
  assert.equal(final.depth, bulletinDepth, "EEW depth uses 10 km units, independently of the physical depth");
  assert.equal(final.magnitude, 8.1);
  assert.ok(simulation.reports.every(report => simulation.frame(report.elapsedSec).event.simulationWaveDepthKm === depthKm));
  assert.ok(final.maxIntensity !== null, "keep deep reference intensity estimates");
  assert.ok(simulation.stations.some(station => station.predictedIntensityValue >= .5), "keep station shaking");
  for (const elapsed of [0, ...simulation.reports.map(report => report.elapsedSec), simulation.duration]) {
    const event = simulation.frame(elapsed).event;
    assert.deepEqual(event.warnAreas, [], "deep scenarios never expose target region names, including before and after reports");
    assert.equal(buildEewForecastAreaFeatureCollection(forecastAreas, [event]).features.length, 0, "deep scenarios never paint red forecast polygons");
  }
  const first = simulation.frame(simulation.reports[0].elapsedSec).event;
  simulation.frame(simulation.duration);
  assert.deepEqual(simulation.frame(simulation.reports[0].elapsedSec).event, first, "rewind restores the initial warning areas");
}
const shallow = await prepareEarthquakeSimulation({ magnitude: 8.1, depthKm: 10 }, stations,
  { forecastAreas, yieldTask: async () => {} });
assert.equal(shallow.reports[0].depth, 20, "shallow early estimates keep their existing behavior");
const initial = shallow.reports[0];
assert.ok(initial.warnAreas.length > 0);
assert.ok(initial.warnAreas.some(area => shallow.stations.filter(s => s.forecastAreaCode === area.code).every(s => s.sArrivalSec > initial.elapsedSec)), "genuine forecasts still warn before S-wave arrival; no wavefront or elapsed-time gate");
assert.ok(buildEewForecastAreaFeatureCollection(forecastAreas, [shallow.frame(shallow.duration).event]).features.length > 0, "shallow red regions still render after a deep scenario");
// Real bulletins continue using the supplied warning areas regardless of depth.
const real = { isWarn: true, depth: 590, warnAreas: [{ code: forecastAreas.features[0].properties.code, isWarning: true, from: "5-", to: "5-" }] };
assert.equal(buildEewForecastAreaFeatureCollection(forecastAreas, [real]).features.length, 1);
console.log("EEW regions: deep targets and red polygons suppressed; shaking, estimates, waves, seeking, shallow advance warnings and real bulletins retained");
