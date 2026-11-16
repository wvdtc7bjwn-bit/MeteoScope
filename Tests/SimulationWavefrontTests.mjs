import assert from "node:assert/strict";
import { exposedWavefrontArcs } from "../src/simulation/wavefrontGeometry.js";
import { destinationPoint } from "../src/typhoonGeometry.js";
import { getDistanceKm } from "../src/location/distance.js";
import { buildSimulationSources, getSimulationPresetOptions } from "../src/simulation/earthquakeSimulation.js";
import { getWaveDistancesByJma2001 } from "../src/eew/jma2001TravelTime.js";
import { JMA2001_TRAVEL_TIME_TABLE } from "../src/eew/jma2001TravelTimeData.js";

function circle(center, radius) { const ring = Array.from({ length: 96 }, (_, i) => destinationPoint(center, radius, i * 360 / 96)); return { center, radius, ring: [...ring, ring[0]] }; }
assert.deepEqual(exposedWavefrontArcs([]), []);
const first = circle([140, 35], 100);
assert.equal(exposedWavefrontArcs([first]).length, 1);
assert.equal(exposedWavefrontArcs([first, first]).length, 1, "identical sources retain one visible front");
assert.equal(exposedWavefrontArcs([first, circle([140, 35], 200)]).length, 1, "contained circles draw no internal lines");
assert.equal(exposedWavefrontArcs([first, circle([145, 40], 50)]).length, 2, "disjoint fronts are retained");
const connected = [first, circle([140.5, 35], 100)];
const arcs = exposedWavefrontArcs(connected);
const movedCenter = [140.5, 35];
const mutableCircles = [circle([140, 35], 100), circle(movedCenter, 100)];
const beforeMove = exposedWavefrontArcs(mutableCircles);
assert.deepEqual(exposedWavefrontArcs(mutableCircles),beforeMove,"repeated P/S geometry is identical");
movedCenter[0] = 141;
mutableCircles[1] = circle(movedCenter,100);
const afterMove = exposedWavefrontArcs(mutableCircles);
assert.notDeepEqual(afterMove,beforeMove,"moving an existing center invalidates its relative-position cache");
assert.deepEqual(afterMove,exposedWavefrontArcs([circle([140,35],100),circle([141,35],100)]),"cached and fresh center calculations agree exactly");
assert.ok(arcs.reduce((sum, arc) => sum + arc.length, 0) < 192, "overlap removes interior lines without changing radii");
assert.ok(arcs.every(arc => arc.length > 1));
const crossing = exposedWavefrontArcs([circle([179.8, 35], 200)]);
assert.ok(crossing[0].some(point => point[0] > 180));
assert.ok(crossing[0].slice(1).every((point, index) => Math.abs(point[0] - crossing[0][index][0]) < 180), "wave front is continuous across the dateline");
assert.equal(first.ring.length, 97, "source rings stay intact");
const lateSources = buildSimulationSources(getSimulationPresetOptions("nankai-trough"));
const stalled = lateSources.map(source => circle(source.coordinates, 2000));
const lateOutline = exposedWavefrontArcs(stalled);
assert.equal(lateOutline.length, 1, "the old 413-second geometry forms one continuous outline, not isolated dashes");
assert.deepEqual(lateOutline[0][0], lateOutline[0].at(-1));
for (const radius of [100, 800, 2000]) {
  const overlap = [circle([140, 35], radius), circle([140.5, 35], radius), circle([141, 35.3], radius)];
  const outline = exposedWavefrontArcs(overlap);
  assert.equal(outline.length, 1);
  assert.deepEqual(outline[0][0], outline[0].at(-1), "intersection arcs join with no visible gap");
  for (const point of outline[0]) {
    const margins = overlap.map(c => getDistanceKm(point, c.center) * 6371.0088 / 6371 - c.radius);
    assert.ok(Math.min(...margins.map(Math.abs)) < 1e-5, "each vertex stays on an original physical circle");
    assert.ok(margins.every(margin => margin > -1e-5), "do not draw arcs inside another wave circle");
  }
}
const dateOverlap = exposedWavefrontArcs([circle([179, 55], 1200), circle([-179, 55], 1200)]);
assert.equal(dateOverlap.length, 1);
assert.deepEqual(dateOverlap[0][0], dateOverlap[0].at(-1));
assert.ok(dateOverlap[0].slice(1).every((point, index) => Math.abs(point[0] - dateOverlap[0][index][0]) < 180));
for (const [depth, table] of Object.entries(JMA2001_TRAVEL_TIME_TABLE)) {
  const last = table.at(-1);
  assert.equal(getWaveDistancesByJma2001(Number(depth), last[1]).pDistanceKm, last[0]);
  assert.equal(getWaveDistancesByJma2001(Number(depth), last[1] + .001).pDistanceKm, null, "P range ends without a stationary ring");
  assert.ok(getWaveDistancesByJma2001(Number(depth), last[1] + .001).sDistanceKm > 0, "S can continue after P goes out of range");
  assert.equal(getWaveDistancesByJma2001(Number(depth), last[2] + .001).sDistanceKm, null, "S ends at its own time limit");
}
console.log("Simulation wave fronts: overlap, containment, duplicate and dateline geometry passed");
