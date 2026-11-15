import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prepareEarthquakeSimulation } from "../src/simulation/earthquakeSimulation.js";
import { getDistanceKm } from "../src/location/distance.js";
import { getTravelTimesByJma2001 } from "../src/eew/jma2001TravelTime.js";

const land = JSON.parse(await readFile(new URL("../public/data/jma-intensity-stations.json", import.meta.url), "utf8"));
// User's Kuril offshore example: a long wait is physical travel, not a stalled timer.
const source = { longitude: 150.3244, latitude: 46.2434, magnitude: 7.2, depthKm: 10 };
const simulation = await prepareEarthquakeSimulation(source, land, { yieldTask: async () => {} });
const nearest = simulation.stations.toSorted((a, b) => a.pArrivalSec - b.pArrivalSec)[0];
assert.equal(nearest.id, "0169421", "retain leading zeroes in the nearest Japanese station code");
assert.ok(Math.abs(getDistanceKm([source.longitude, source.latitude], nearest.coordinates) - 462.985) < .01);
const arrival = getTravelTimesByJma2001(source.depthKm, nearest.epicentralDistanceKm).pArrivalSec;
assert.equal(simulation.reports[0].detectedAtSec, arrival);
assert.ok(Math.abs(arrival - 65.394) < .01);
assert.equal(simulation.reports[0].elapsedSec, 65.99, "do not impose a fake shorter offshore detection deadline");
assert.equal(simulation.frame(51).event.simulationDetecting, true, "51 seconds is still before a Japanese P detection");
assert.equal(simulation.frame(65.98).event.waitingForDetection, true);
assert.equal(simulation.frame(65.99).event.serial, 1);
assert.deepEqual(simulation.frame(0).event.maxIntensity, null, "rewind returns to the pending state");
assert.equal(simulation.frame(simulation.duration).event.isFinal, true);

for (const depthKm of [20, 100]) {
  const distant = await prepareEarthquakeSimulation({ longitude: 160.5, latitude: 52.5, magnitude: 3.5, depthKm }, land, { yieldTask: async () => {} });
  assert.ok(distant.stations.every(station => station.predictedIntensityValue < .5), "exercise an instrumental detection without felt stations");
  assert.ok(distant.reports[0].elapsedSec > 60);
  assert.ok(distant.duration > distant.reports.at(-1).elapsedSec, "playback cannot end before a distant initial or final bulletin");
  assert.equal(distant.frame(distant.reports[0].elapsedSec - .01).event.waitingForDetection, true);
  assert.equal(distant.frame(distant.reports[0].elapsedSec).event.serial, 1);
  assert.equal(distant.frame(distant.duration).event.isFinal, true);
}
console.log("Offshore timing: causal 66-second Kuril detection, pending/first/final states, rewind and distant unfelt-event duration passed");
