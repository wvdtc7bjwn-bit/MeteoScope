import assert from "node:assert/strict";
import { prepareEarthquakeSimulation, getSimulationPresetOptions } from "../src/simulation/earthquakeSimulation.js";
import { createWeSimulatorModel, getSimulationMagnitudeDurationSec } from "../src/simulation/weSimulatorModel.js";
import { buildSimulationEewReports } from "../src/simulation/eewEstimates.js";
import { buildSimulationReviewTimes } from "../src/simulation/reportTiming.js";

const review = buildSimulationReviewTimes(5, 35, 15, [6, 6.1, 6.2, 7, 8, 15, 28]);
assert.equal(review[0], 5); assert.equal(review.at(-1), 35);
assert.deepEqual(review, buildSimulationReviewTimes(5, 35, 15, [6, 6.1, 6.2, 7, 8, 15, 28]));
assert.notDeepEqual(review, buildSimulationReviewTimes(5, 35, 15), "arrival batches affect review cadence");
assert.deepEqual(buildSimulationReviewTimes(5, 5, 10), [5], "no duplicate simultaneous bulletins");

const station = { pArrivalSec: 4, predictedIntensityValue: 4, epicentralDistanceKm: 20, groundArv: 1 };
const magnitudes = [4, 5.5, 6, 7, 7.5, 8, 8.5, 9, 9.5];
let previousCount = 0, previousEnd = 0;
for (const magnitude of magnitudes) {
  const model = createWeSimulatorModel({ magnitude, depthKm: 10 });
  const schedule = model.buildSyntheticSimulationMagnitudeReports(magnitude, [station], Infinity);
  const reports = buildSimulationEewReports({ options: { magnitude, depthKm: 10, model: "point" }, stations: [station],
    sources: [{ ruptureDelaySec: 0 }], schedule, ruptureCompleteSec: 0 });
  assert.equal(reports[0].elapsedSec, 4.6, "magnitude review cannot postpone the first P-triggered bulletin");
  if (magnitude >= 7.5) assert.ok(schedule.slice(1).every((r, i) => r.elapsedSec - schedule[i].elapsedSec <= 1.7), "large-event initial reviews remain frequent despite variable intervals");
  const gaps = reports.slice(1).map((r, i) => Number((r.elapsedSec - reports[i].elapsedSec).toFixed(2)));
  assert.ok(new Set(gaps).size > 2, "bulletins are not issued at a fixed interval");
  assert.deepEqual(reports.slice(0, schedule.length).map(r => r.elapsedSec), schedule.map(r => r.elapsedSec), "retain all fast initial report times");
  assert.equal(reports[schedule.length - 1].magnitude, magnitude, "initial M convergence is retained before the longer review");
  assert.ok(reports.slice(0, -1).every(r => !r.isFinal));
  assert.equal(reports.at(-1).isFinal, true);
  assert.equal(reports.at(-1).magnitude, magnitude);
  assert.equal(reports.at(-1).depth, 10);
  for (let i = 0; i < reports.length; i++) {
    assert.equal(reports[i].reportNumber, i + 1);
    if (i) assert.ok(reports[i].elapsedSec > reports[i - 1].elapsedSec && reports[i].elapsedSec - reports[i - 1].elapsedSec <= 4.8);
  }
  if (magnitude <= 7) assert.equal(reports.length, schedule.length, "small and moderate scenarios retain their existing duration/count");
  if (magnitude >= 8) {
    assert.ok(reports.length > 10);
    assert.ok(reports.at(-1).elapsedSec >= 4 + getSimulationMagnitudeDurationSec(magnitude) + 8, "giant events wait for magnitude-scaled confirmation");
    assert.equal(reports[schedule.length - 1].isFinal, false, "the previous premature final bulletin becomes an intermediate report");
  }
  assert.ok(reports.length >= previousCount && reports.at(-1).elapsedSec >= previousEnd);
  previousCount = reports.length; previousEnd = reports.at(-1).elapsedSec;
}
const stations = { "00001": { longitude: 139.76, latitude: 35.68 }, "00002": { longitude: 145, latitude: 43 } };
for (const options of [
  { magnitude: 9.5, depthKm: 10 },
  { longitude: 160.5, latitude: 52.5, magnitude: 9.5, depthKm: 25 },
  { magnitude: 8.1, depthKm: 590 },
  { ...getSimulationPresetOptions("nankai-trough"), ruptureSpeed: .5 },
  { ...getSimulationPresetOptions("nankai-trough"), nankaiCase: "east" }
]) {
  const simulation = await prepareEarthquakeSimulation(options, stations);
  const final = simulation.reports.at(-1);
  assert.ok(final.elapsedSec >= Math.max(...simulation.sources.map(source => source.ruptureDelaySec)) + 2);
  assert.ok(simulation.duration >= final.elapsedSec + 8, "playback cannot finish before the expanded report timeline");
  const time = simulation.reports[10].elapsedSec;
  const event = simulation.frame(time).event;
  assert.equal(event.serial, 11, "the actual frame advances beyond report 10");
  assert.equal(event.isFinal, false);
  assert.equal(event.simulationWaveDepthKm, simulation.options.depthKm);
  simulation.frame(simulation.duration);
  assert.deepEqual(simulation.frame(time).event, event, "seeking restores report 11 without future state");
  assert.equal(simulation.frame(final.elapsedSec).event.isFinal, true);
  if (options.depthKm > 150) assert.deepEqual(event.warnAreas, [], "deep target regions remain suppressed");
}
console.log("Simulation reports: magnitude-scaled duration/count, preserved first/initial estimates, sequential updates beyond report 10, late detection, deep/fault scenarios and seek/final states passed");
