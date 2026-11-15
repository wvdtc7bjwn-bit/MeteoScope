import assert from "node:assert/strict";
import { parseSimulationDetectionStations, createSimulationDetectionLoader } from "../src/simulation/detectionStations.js";
import { prepareEarthquakeSimulation } from "../src/simulation/earthquakeSimulation.js";
import { getTravelTimesByJma2001 } from "../src/eew/jma2001TravelTime.js";
import { createWeSimulatorModel } from "../src/simulation/weSimulatorModel.js";

const feature = (network, coordinates) => ({ type: "Feature", geometry: { type: "Point", coordinates }, properties: { network, code: "TEST" } });
const raw = { type: "FeatureCollection", features: [feature("S-net", [142, 38]), feature("DONET1", [135, 33]), feature("N-net", [133, 32]), feature("unknown", [142, 38]), feature("S-net", [NaN, 38])] };
const parsed = parseSimulationDetectionStations(raw);
assert.equal(parsed.length, 3);
await assert.rejects(createSimulationDetectionLoader(async () => ({ ok: false, status: 503 }))(), /503/);
await assert.rejects(createSimulationDetectionLoader(async () => ({ ok: true, json: async () => ({}) }))(), /Invalid/);
const abort = new AbortController(); abort.abort();
let requests = 0;
const load = createSimulationDetectionLoader(async () => { requests++; return { ok: requests !== 1, status: 503, json: async () => raw }; });
await assert.rejects(load({ signal: abort.signal }), { name: "AbortError" });
await assert.rejects(load(), /503/);
assert.deepEqual(await load(), parsed);
assert.deepEqual(await load(), parsed);
assert.equal(requests, 2, "failed requests can retry; successful offshore catalogue is reused");
await assert.rejects(load({ signal: abort.signal }), { name: "AbortError" }, "cached catalogue still honors cancellation");
const source = { longitude: 142, latitude: 38, magnitude: 7, depthKm: 20 };
const land = { station: { longitude: 140.8, latitude: 38 } };
const landOnly = await prepareEarthquakeSimulation(source, land);
const withSea = await prepareEarthquakeSimulation(source, land, { detectionStations: parsed });
assert.ok(withSea.reports[0].elapsedSec < landOnly.reports[0].elapsedSec, "offshore P detection advances the first bulletin");
assert.ok(withSea.reports[0].elapsedSec >= getTravelTimesByJma2001(20, 0).pArrivalSec, "never issue before the offshore P wave arrives");
assert.equal(withSea.stations.length, landOnly.stations.length, "offshore detection points are not fabricated land intensity observations");
assert.deepEqual(withSea.stations, landOnly.stations, "detector catalogue does not change simulated land shaking");
const weakSignals = [
  { pArrivalSec: 4, predictedIntensityValue: 0 },
  { pArrivalSec: 12, predictedIntensityValue: 1 }
];
const model = createWeSimulatorModel({ magnitude: 4 });
assert.equal(model.buildSyntheticSimulationMagnitudeReports(4, weakSignals, 60)[0].detectedAtSec, 4, "instrument detection does not wait for intensity 1");
assert.ok(model.buildSyntheticSimulationMagnitudeReports(3.5, [{ pArrivalSec: 4, predictedIntensityValue: 0 }], 60).length, "M3.5 can issue a simulated forecast even without felt intensity");
assert.deepEqual(model.buildSyntheticSimulationMagnitudeReports(3, [{ pArrivalSec: 4, predictedIntensityValue: 1 }], 60), [], "small events below both forecast thresholds stay unannounced");
assert.ok(model.buildSyntheticSimulationMagnitudeReports(3, [{ pArrivalSec: 4, predictedIntensityValue: 2.8 }], 60).length, "intensity 3 can qualify independently of magnitude");
console.log("Simulation detection: network filtering, earlier offshore detection, causal arrival and fallback data passed");
