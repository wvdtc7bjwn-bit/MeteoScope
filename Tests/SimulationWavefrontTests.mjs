import assert from "node:assert/strict";
import { exposedWavefrontArcs } from "../src/simulation/wavefrontGeometry.js";
import { destinationPoint } from "../src/typhoonGeometry.js";

function circle(center, radius) { const ring = Array.from({ length: 96 }, (_, i) => destinationPoint(center, radius, i * 360 / 96)); return { center, radius, ring: [...ring, ring[0]] }; }
assert.deepEqual(exposedWavefrontArcs([]), []);
const first = circle([140, 35], 100);
assert.equal(exposedWavefrontArcs([first]).length, 1);
assert.equal(exposedWavefrontArcs([first, first]).length, 1, "identical sources retain one visible front");
assert.equal(exposedWavefrontArcs([first, circle([140, 35], 200)]).length, 1, "contained circles draw no internal lines");
assert.equal(exposedWavefrontArcs([first, circle([145, 40], 50)]).length, 2, "disjoint fronts are retained");
const connected = [first, circle([140.5, 35], 100)];
const arcs = exposedWavefrontArcs(connected);
assert.ok(arcs.reduce((sum, arc) => sum + arc.length, 0) < 192, "overlap removes interior lines without changing radii");
assert.ok(arcs.every(arc => arc.length > 1));
const crossing = exposedWavefrontArcs([circle([179.8, 35], 200)]);
assert.ok(crossing[0].some(point => point[0] > 180));
assert.ok(crossing[0].slice(1).every((point, index) => Math.abs(point[0] - crossing[0][index][0]) < 180), "wave front is continuous across the dateline");
assert.equal(first.ring.length, 97, "source rings stay intact");
console.log("Simulation wave fronts: overlap, containment, duplicate and dateline geometry passed");
