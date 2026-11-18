import assert from "node:assert/strict";
import { prepareEarthquakeSimulation } from "../src/simulation/earthquakeSimulation.js";

const stations = { "00001": { name: "Near source", longitude: 139.76, latitude: 35.68 } };
const options = { magnitude: 6, depthKm: 10 };
const simulation = await prepareEarthquakeSimulation(options, stations);
const { reports } = simulation;
const hasBothDirections = values => values.some((v, i) => i > 0 && v > values[i - 1])
  && values.some((v, i) => i > 0 && v < values[i - 1]);
assert.ok(hasBothDirections(reports.map(r => r.magnitude)), "M must include upward and downward analysis revisions");
assert.ok(hasBothDirections(reports.map(r => r.depth)), "depth must include upward and downward analysis revisions");
assert.ok(new Set(reports.map(r => r.maxIntensity)).size > 1, "calculated intensity follows the developing estimate without forcing an overshoot");
assert.ok(reports.some(r => r.magnitude < options.magnitude), "early analysis can underestimate the configured magnitude");
assert.ok(reports.every(r => r.magnitude <= options.magnitude + .1), "do not force a large overshoot just to demonstrate bidirectional revisions");
const earlyError = Math.max(...reports.slice(0, 4).map(r => Math.abs(r.magnitude - options.magnitude)));
const laterError = Math.max(...reports.slice(-3).map(r => Math.abs(r.magnitude - options.magnitude)));
assert.ok(laterError < earlyError, "the late analysis settles instead of sustaining initial uncertainty");
assert.deepEqual(reports, (await prepareEarthquakeSimulation(options, stations)).reports, "fresh replays generate exactly the same revision history");
const revised = simulation.frame(reports[2].elapsedSec).event;
simulation.frame(simulation.duration);
assert.deepEqual(simulation.frame(reports[2].elapsedSec).event, revised, "rewind restores the downward revision");
assert.equal(reports[0].elapsedSec, 2.37, "initial P detection and processing delay are unchanged");
assert.ok(reports.at(-1).confirmationForSec >= 25, "sparse observations require stability confirmation after maturity");
assert.equal(reports.at(-1).magnitude, 6);
assert.equal(reports.at(-1).depth, 10);
assert.equal(reports.at(-1).maxIntensity, "5+", "finite-source distance is used consistently for the final forecast");

for (const [depthKm, bulletinDepth] of [[0,10],[4,10],[12,10],[25,30],[150,150],[151,150],[172,170],[700,700]]) {
  const event = await prepareEarthquakeSimulation({ magnitude: 9.5, depthKm }, stations);
  assert.ok(event.reports.every(r => r.magnitude >= 1 && r.magnitude <= 9.5 && r.depth >= 0 && r.depth <= 700));
  if (depthKm <= 150) assert.ok(event.reports.every(r => r.depth <= 150), "shallow estimates remain in the model domain without deep-path data");
  else assert.ok(event.reports.slice(0, -1).every(r => !r.analysisMature ? r.depth >= 160 : r.depth === bulletinDepth), "deep revisions retain coarse early depths and rounded mature depths");
  assert.ok(event.reports.every(r => r.depth >= 10 && r.depth % 10 === 0), "all bulletins, including the final one, use 10 km units");
  for (const r of event.reports) assert.equal(event.frame(r.elapsedSec).event.simulationWaveDepthKm, depthKm);
  assert.equal(event.reports.at(-1).magnitude, 9.5);
  assert.equal(event.reports.at(-1).depth, bulletinDepth, "final EEW depth is rounded while physical depth is retained");
}
console.log("EEW revisions: bidirectional M/depth/calculated intensity, shrinking error, repeatable replay/seek, fixed timing and wave depth, 10 km bulletin depths, valid model domains and exact physical depths passed");
