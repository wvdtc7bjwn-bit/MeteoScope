import assert from "node:assert/strict";
import { createSimulationCamera } from "../src/simulation/camera.js";
import { prepareEarthquakeSimulation } from "../src/simulation/earthquakeSimulation.js";

let wall = 0;
const fits = [], changes = [];
const camera = createSimulationCamera({ now: () => wall, fitToCoordinates: (points, options) => fits.push({points, options}), onFollowingChange: value => changes.push(value) });
const source = (coordinates, ruptureDelaySec = 0) => ({coordinates, ruptureDelaySec});
const feature = (coordinates, active = true) => ({geometry: {coordinates}, properties: {active}});
const frame = (elapsed, features = []) => ({elapsed, stations: {features}});
const contains = (points, [x, y]) => points[0][0] <= x && points[0][1] <= y && points[1][0] >= x && points[1][1] >= y;
camera.setScene([source([140, 36]), source([145, 40], 20)], [
  {coordinates:[130, 32],predictedIntensityValue:2}, {coordinates:[0, 0],predictedIntensityValue:.1},
], 6.8);
camera.update(frame(0)); assert.equal(fits.length, 0, "default manual view does not move the map");
camera.follow(frame(0, [feature([150, 45], false)]));
assert.equal(fits.length, 1);
assert.equal(fits[0].options.duration, 0);
assert.ok(contains(fits[0].points,[140,36]));
assert.ok(!contains(fits[0].points,[145,40]), "future rupture does not pull the initial focus away");
camera.update(frame(1, [feature([143, 38])])) ;
assert.equal(fits.length, 1, "do not refit on every simulation frame");
wall = 2100; camera.update(frame(2,[feature([143,38])]));
assert.equal(fits.length, 2); assert.ok(contains(fits.at(-1).points,[143,38]));
assert.ok(contains(fits.at(-1).points,[140,36]));
const expanded = structuredClone(fits.at(-1));
wall = 5000; camera.update(frame(11));
assert.equal(fits.length, 2, "fading or absent shaking cannot zoom back in");
camera.update(frame(21)); assert.ok(contains(fits.at(-1).points,[145,40]), "follow later finite rupture");
wall = 5100; camera.update(frame(0));
assert.ok(!contains(fits.at(-1).points,[145,40]), "rewind may restore the initial source view immediately");
camera.stopFollowing(); const stoppedCount = fits.length;
wall = 9000; camera.update(frame(25,[feature([150,45])]));
assert.equal(fits.length, stoppedCount, "manual interruption stops camera updates");
camera.showOverview(); assert.equal(camera.following,false);
assert.ok(contains(fits.at(-1).points,[130,32]));
assert.ok(contains(fits.at(-1).points,[145,40]));
assert.ok(!contains(fits.at(-1).points,[0,0]), "unfelt sites do not force a global overview");
camera.showSource(); assert.ok(contains(fits.at(-1).points,[145,40]));
camera.setScene([source([179,35]),source([-179,36])],[],5.6); camera.showSource();
assert.ok(fits.at(-1).points[1][0] - fits.at(-1).points[0][0] < 3, "date-line source uses nearby world copy");
camera.reset(); camera.update(frame(100)); assert.equal(camera.following,false);

// Exercise real generated frame properties, including current-vs-maximum mode.
const simulation = await prepareEarthquakeSimulation({magnitude:7}, {
  a:{longitude:139.76,latitude:35.68},b:{longitude:143,latitude:38},c:{longitude:136,latitude:34},
});
camera.setScene(simulation.sources,simulation.stations,6.8);
camera.follow(simulation.frame(0));
const initial = structuredClone(fits.at(-1).points);
wall += 2100; const spread = simulation.frame(100,{intensityDisplay:"maximum"}); camera.update(spread);
for (const f of spread.stations.features.filter(f => f.properties.active)) assert.ok(contains(fits.at(-1).points,f.geometry.coordinates));
assert.ok(fits.at(-1).points[1][0] - fits.at(-1).points[0][0] > initial[1][0] - initial[0][0]);
const count = fits.length; wall += 2100; camera.update(simulation.frame(simulation.duration));
assert.equal(fits.length,count,"settled final state retains the expanded view");
assert.equal(changes.at(-1),true);
console.log("Simulation camera: opt-in, spreading/finite-source expansion, throttle, retained extent, manual stop, source/overview, rewind and date-line handling passed");
