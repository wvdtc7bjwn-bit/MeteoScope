import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createDeepTrenchLookup } from "../src/simulation/deepEarthquake.js";
import { estimateSimulationIntensity } from "../src/simulation/intensityModel.js";
import { getDistanceKm } from "../src/location/distance.js";

const INTERVALS = { "1": [.5, 1.5], "2": [1.5, 2.5], "3": [2.5, 3.5], "4": [3.5, 4.5], A: [4.5, 5], B: [5, 5.5], C: [5.5, 6], D: [6, 6.5], "7": [6.5, 7] };

export async function evaluateDeepIntensityObservations() {
  const fixture = JSON.parse(await readFile(new URL("../Tests/fixtures/simulation-deep-observations.json", import.meta.url), "utf8"));
  const trench = createDeepTrenchLookup(JSON.parse(await readFile(new URL("../public/data/usgs-plate-boundaries-japan.geojson", import.meta.url), "utf8")));
  const events = fixture.events.map(event => {
    const errors = event.stations.map(([longitude, latitude, intensity]) => {
      const range = INTERVALS[intensity];
      const point = [longitude, latitude];
      const predicted = estimateSimulationIntensity({ magnitude: event.mw, depthKm: event.depthKm,
        ruptureDistanceKm: Math.hypot(getDistanceKm(event.source, point), event.depthKm), trenchDistanceKm: trench(point) });
      if (!range || !Number.isFinite(predicted)) throw new Error(`Invalid validation station for ${event.id}`);
      return Math.max(0, range[0] - predicted, predicted - range[1]);
    });
    return { id: event.id, name: event.name, mw: event.mw, depthKm: event.depthKm, stations: errors.length,
      baselineIntervalMae: event.baselineIntervalMae, intervalMae: errors.reduce((a, b) => a + b, 0) / errors.length };
  });
  return { limits: fixture.limits, groundCorrection: fixture.groundCorrection, collectedEvents: fixture.events.length + fixture.auxiliaryEvents.length,
    collectedReports: [...fixture.events, ...fixture.auxiliaryEvents].reduce((sum, e) => sum + e.stations.length, 0),
    excludedFromMwAverage: fixture.auxiliaryEvents.map(e => ({ id: e.id, name: e.name, depthKm: e.depthKm, reason: "No verified CMT Mw; JMA magnitude is not silently substituted" })), events,
    baselineMean: events.reduce((sum, event) => sum + event.baselineIntervalMae, 0) / events.length,
    mean: events.reduce((sum, event) => sum + event.intervalMae, 0) / events.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await evaluateDeepIntensityObservations(), null, 2));
