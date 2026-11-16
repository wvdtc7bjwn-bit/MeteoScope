import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {estimateReferenceIntensity, estimateSimulationIntensity} from "../src/simulation/intensityModel.js";
import {getSimulationGround} from "../src/simulation/groundModel.js";
import {getDistanceKm} from "../src/location/distance.js";

function metrics(rows) {
  return {count: rows.length,
    mae: rows.reduce((sum, row) => sum + Math.abs(row.predicted - row.observed), 0) / rows.length,
    bias: rows.reduce((sum, row) => sum + row.predicted - row.observed, 0) / rows.length,
    maximum: Math.max(...rows.map(row => row.predicted)),
    sevenCount: rows.filter(row => row.predicted >= 6.5).length};
}

export async function evaluateShallowIntensityObservations({groundModel = null} = {}) {
  const fixture = JSON.parse(await readFile(new URL("../Tests/fixtures/simulation-shallow-observations.json", import.meta.url), "utf8"));
  const events = fixture.events.map(event => {
    const rows = event.stations.map(([code, longitude, latitude, observed]) => {
      const groundArv = getSimulationGround(groundModel, [longitude, latitude])?.arv ?? 1;
      const ruptureDistanceKm = Math.hypot(event.depthKm, getDistanceKm(event.source, [longitude, latitude]));
      const parameters = {magnitude: event.mw, depthKm: event.depthKm, ruptureDistanceKm, groundArv};
      return {code, observed, baseline: estimateReferenceIntensity(parameters),
        revised: estimateSimulationIntensity({...parameters, pointSource: true, simulationCalibration: true})};
    });
    const summarize = selected => Object.fromEntries(["baseline", "revised"].map(key => [key,
      metrics(selected.map(row => ({observed: row.observed, predicted: row[key]})))]));
    return {id: event.id, name: event.name, split: event.split, mw: event.mw, depthKm: event.depthKm,
      excluded: event.excluded.length, all: summarize(rows), strong: summarize(rows.filter(row => row.observed >= 4.5))};
  });
  const mean = (selected, group, key) => selected.reduce((sum, e) => sum + e[group][key].mae, 0) / selected.length;
  return {limits: fixture.limits, groundCorrection: groundModel ? "J-SHIS-derived 1 km ARV" : "none",
    collectedObservations: events.reduce((sum, e) => sum + e.all.baseline.count, 0), events,
    summary: Object.fromEntries(["development", "holdout", "all"].map(split => {
      const selected = split === "all" ? events : events.filter(e => e.split === split);
      return [split, {events: selected.length,
        all: {baselineMae: mean(selected, "all", "baseline"), revisedMae: mean(selected, "all", "revised")},
        strong: {baselineMae: mean(selected, "strong", "baseline"), revisedMae: mean(selected, "strong", "revised")}}];
    }))};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const groundPath = process.argv[2];
  const groundModel = groundPath ? JSON.parse(await readFile(groundPath, "utf8")) : null;
  console.log(JSON.stringify(await evaluateShallowIntensityObservations({groundModel}), null, 2));
}
