import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareEarthquakeSimulation, normalizeSimulationOptions, getSimulationPresetOptions, buildSimulationSources, FAULT_MODEL_PRESETS } from "../src/simulation/earthquakeSimulation.js";
import { createWeSimulatorModel } from "../src/simulation/weSimulatorModel.js";
import { getTravelTimesByJma2001, getWaveDistancesByJma2001 } from "../src/eew/jma2001TravelTime.js";
import { estimateReferenceIntensity } from "../src/simulation/intensityModel.js";

for (const invalid of [{ magnitude: "" }, { magnitude: 10 }, { depthKm: -1 }, { latitude: 86 }, { longitude: 181 }, { model: "__proto__" }, { ruptureSpeed: 0 }, { ruptureOrigin: "invalid" }]) {
  assert.throws(() => normalizeSimulationOptions(invalid), RangeError);
}
assert.equal(normalizeSimulationOptions({ magnitude: "5.5", depthKm: "0" }).depthKm, 0);
assert.throws(() => normalizeSimulationOptions({ nankaiCase: "invalid" }), RangeError);
const reference = estimateReferenceIntensity({ magnitude: 9, depthKm: 20, ruptureDistanceKm: 100, interplate: true });
assert.ok(reference > 5 && reference < 5.1, "published reference-ground formula at Mw9 / D20 / X100 is near intensity 5, not 6+");
assert.equal(reference, estimateReferenceIntensity({ magnitude: 8.3, depthKm: 20, ruptureDistanceKm: 100, interplate: true }), "documented giant-earthquake magnitude saturation");
assert.ok(estimateReferenceIntensity({ magnitude: 9, depthKm: 20, ruptureDistanceKm: 200, interplate: true }) < reference);
for (const depth of [0, 10, 25, 100, 400, 700]) {
  for (const distance of [0, 15, 100, 500, 1000]) {
    const arrival = getTravelTimesByJma2001(depth, distance);
    assert.ok(arrival.pArrivalSec <= arrival.sArrivalSec);
    const p = getWaveDistancesByJma2001(depth, arrival.pArrivalSec);
    const s = getWaveDistancesByJma2001(depth, arrival.sArrivalSec);
    assert.ok(Math.abs(p.pDistanceKm - distance) < 1e-6, `P inverse at ${depth} / ${distance}`);
    assert.ok(Math.abs(s.sDistanceKm - distance) < 1e-6, `S inverse at ${depth} / ${distance}`);
  }
}
const model = createWeSimulatorModel({ magnitude: 6 });
assert.deepEqual(model.getStationWaveResponseProperties("station", 6), model.getStationWaveResponseProperties("station", 6), "station response is deterministic, without random visual effects");
const sample = { "0000001": { code: "0000001", name: "Test station", longitude: 139.76, latitude: 35.68 }, bad: { longitude: "", latitude: 35 } };
const point = await prepareEarthquakeSimulation({ magnitude: 6 }, sample);
assert.equal(point.stations.length, 1);
assert.equal(point.stations[0].id, "0000001", "station codes retain leading zeros");
const station = point.stations[0];
assert.equal(point.frame(0).stations.features[0].properties.arrived, false, "no shaking before P arrival");
const pFrame = point.frame(station.pArrivalSec + .1).stations.features[0].properties;
assert.equal(pFrame.arrived, true);
assert.equal(pFrame.wave, "P");
assert.equal(point.frame(station.sArrivalSec + 10).stations.features[0].properties.wave, "S");
assert.equal(point.frame(point.duration).stations.features[0].properties.active, false, "pulse ends after shaking");
assert.equal(point.frame(0).stations.features[0].properties.intensity, "0", "seeking back clears prior shaking");
assert.equal(sample["0000001"].pArrivalSec, undefined, "catalogue is not mutated");
assert.equal(point.frame(0).event.waitingForDetection, true);
assert.ok(point.frame(40).event.serial > 1, "simulated bulletin number advances");
assert.equal(point.frame(point.duration).event.isFinal, true);
assert.equal(point.frame(0).event.serial, 0, "backward seek also rewinds bulletins");
await assert.rejects(prepareEarthquakeSimulation({}, {}), /観測点/);
const tooSmall = await prepareEarthquakeSimulation({ magnitude: 1 }, sample);
assert.equal(tooSmall.frame(tooSmall.duration).event.serial, 0, "no synthetic bulletin without a detectable station");
const aborted = new AbortController(); aborted.abort();
await assert.rejects(prepareEarthquakeSimulation({}, sample, { signal: aborted.signal }));

const catalogue = JSON.parse(readFileSync(new URL("../public/data/jma-intensity-stations.json", import.meta.url), "utf8"));
for (const name of ["nankai-trough", "kuril-trench", "japan-trench"]) {
  const options = getSimulationPresetOptions(name);
  const sources = buildSimulationSources(options);
  assert.ok(sources.length >= 2 && sources.length <= 18);
  assert.ok(sources.some(s => s.ruptureDelaySec === 0));
  assert.ok(sources.some(s => s.ruptureDelaySec > 0));
  assert.equal(buildSimulationSources({ ...options, ruptureOrigin: "start" })[0].ruptureDelaySec, 0);
  assert.equal(buildSimulationSources({ ...options, ruptureOrigin: "end" }).at(-1).ruptureDelaySec, 0);
  const simulation = await prepareEarthquakeSimulation(options, catalogue);
  assert.equal(simulation.stations.length, Object.keys(catalogue).length);
  for (const second of [0, 30, 100, simulation.duration]) {
    const frame = simulation.frame(second);
    assert.equal(frame.event.isSimulation, true);
    assert.equal(frame.event.hypocenter, "震源地名不明", "missing JMA regions must not turn a scenario name into an epicentral name");
    assert.equal(simulation.name, FAULT_MODEL_PRESETS[name].name, "scenario label is retained separately");
    assert.ok(frame.stations.features.every(feature => feature.geometry.coordinates.every(Number.isFinite)));
    assert.ok(!JSON.stringify(frame).includes('"NaN"'));
    const ring = frame.fault.features[0].geometry.coordinates[0];
    assert.deepEqual(ring[0], ring.at(-1));
    if (second === 0) assert.equal(frame.stations.features.filter(f => f.properties.arrived).length, 0);
  }
}
const halfCases = await Promise.all(["east", "west"].map(async nankaiCase => {
  const preset = getSimulationPresetOptions("nankai-trough", nankaiCase);
  assert.equal(preset.magnitude,nankaiCase==="east"?8.6:8.9,"editable reference default derives from strong-motion region moments");
  const options = {...preset,magnitude:8.5}; // Explicit synthetic user setting.
  const s = await prepareEarthquakeSimulation(options, sample);
  assert.ok(options.magnitude < 9);
  assert.ok(s.name.includes("半割れ"), "half-rupture labels remain scenario metadata, not JMA epicentral names");
  return { path: s.sources, ring: s.frame(0).fault.features[0].geometry.coordinates[0] };
}));
assert.notDeepEqual(halfCases[0], halfCases[1], "east and west half ruptures have different source regions");
console.log("Earthquake simulation: ported model, JMA2001 arrivals, source rupture, 4368 station frames and cancellation passed");
