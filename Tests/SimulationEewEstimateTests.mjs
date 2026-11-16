import assert from "node:assert/strict";
import { prepareEarthquakeSimulation, getSimulationPresetOptions } from "../src/simulation/earthquakeSimulation.js";
import { classifyIntensity } from "../src/simulation/weSimulatorModel.js";
import { getEarthquakeIntensityRank } from "../src/earthquakeIntensity.js";

const stations = { "00001": { code: "00001", name: "Test", longitude: 139.76, latitude: 35.68 } };
for (const options of [{ magnitude: 6, depthKm: 10 }, { magnitude: 7.4, depthKm: 0 }, { magnitude: 8, depthKm: 700 }, getSimulationPresetOptions("nankai-trough")]) {
  const simulation = await prepareEarthquakeSimulation(options, stations);
  const { reports } = simulation;
  assert.ok(reports.length >= 4);
  assert.ok(reports[0].elapsedSec >= reports[0].detectedAtSec, "never emit before P-wave detection");
  assert.ok(reports[0].elapsedSec - reports[0].detectedAtSec <= .81, "no extra two-second analysis delay");
  const waiting = simulation.frame(0).event;
  assert.deepEqual([waiting.magnitude, waiting.depth, waiting.maxIntensity], [null, null, null]);
  assert.equal(waiting.simulationDetecting, reports[0].detectedAtSec > 0);
  assert.equal(simulation.frame(reports[0].detectedAtSec + .1).event.simulationDetecting, false, "show analysis phase after detection");
  const estimates = reports.map(report => simulation.frame(report.elapsedSec).event);
  assert.ok(new Set(estimates.map(event => event.magnitude)).size > 1, "M updates between bulletins");
  assert.ok(new Set(estimates.map(event => event.depth)).size > 1, "depth updates between bulletins");
  if (options.depthKm === 10) assert.ok(new Set(estimates.map(event => event.maxIntensity)).size > 1, "maximum predicted intensity follows updated estimates");
  const final = estimates.at(-1);
  assert.equal(final.magnitude, simulation.options.magnitude);
  assert.equal(final.depth, Math.max(10, Math.round(simulation.options.depthKm / 10) * 10));
  assert.equal(final.maxIntensity, simulation.intensityEstimateAvailable ? classifyIntensity(Math.max(...simulation.stations.map(station => station.predictedIntensityValue))).label : null);
  assert.ok(final.isFinal);
  assert.ok(reports.at(-1).elapsedSec >= Math.max(...simulation.sources.map(source => source.ruptureDelaySec)), "final estimates wait for rupture completion");
  assert.ok(reports.at(-1).elapsedSec <= simulation.duration);
  for (let index = 0; index < reports.length; index++) {
    const report = reports[index];
    assert.equal(estimates[index].serial, index + 1);
    assert.ok(report.depth >= 0 && report.depth <= 700);
    assert.equal(estimates[index].simulationWaveDepthKm, simulation.options.depthKm, "reported depth does not change physical wave propagation");
    if (index > 0) assert.ok(report.elapsedSec - reports[index - 1].elapsedSec < 31, "adaptive review and confirmation intervals stay bounded");
    const observedRanks = simulation.frame(report.elapsedSec).stations.features.filter(feature => feature.properties.arrived).map(feature => feature.properties.intensityRank);
    assert.ok(getEarthquakeIntensityRank(report.maxIntensity) >= Math.max(0, ...observedRanks), "published prediction includes already observed simulated shaking");
    const nextTime = reports[index + 1]?.elapsedSec ?? simulation.duration;
    const between = simulation.frame((report.elapsedSec + nextTime) / 2).event;
    assert.deepEqual([between.magnitude, between.depth, between.maxIntensity], [report.magnitude, report.depth, report.maxIntensity], "values hold until the next bulletin");
  }
  assert.deepEqual(simulation.frame(reports[0].elapsedSec).event, estimates[0], "backward seek exactly restores first estimates");
  assert.deepEqual(simulation.frame(reports[1].elapsedSec), simulation.frame(reports[1].elapsedSec), "paused time has stable estimates and shaking");
}
console.log("Simulation EEW: per-bulletin estimates, convergence, fixed wave depth and deterministic seeking passed");
