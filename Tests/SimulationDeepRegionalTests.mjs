import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prepareEarthquakeSimulation } from "../src/simulation/earthquakeSimulation.js";
import { createSimulationRegionLookup } from "../src/simulation/epicenterRegion.js";
import { estimateReferenceIntensity, estimateSimulationIntensity } from "../src/simulation/intensityModel.js";

const fixture = JSON.parse(await readFile(new URL("./fixtures/simulation-deep-observations.json", import.meta.url), "utf8"));
const catalogue = JSON.parse(await readFile(new URL("../public/data/jma-intensity-stations.json", import.meta.url), "utf8"));
const plateBoundaries = JSON.parse(await readFile(new URL("../public/data/usgs-plate-boundaries-japan.geojson", import.meta.url), "utf8"));
const forecastAreas = JSON.parse(await readFile(new URL("../public/data/earthquake-areas.geojson", import.meta.url), "utf8"));
const region = createSimulationRegionLookup(forecastAreas);
const KINKI = /^(大阪府|京都府|兵庫県|滋賀県|奈良県|和歌山県)/;
const TOKAI = /^(静岡県|愛知県|岐阜県|三重県)/;
assert.equal(KINKI.test("東京都２３区"), false, "Kyoto must not accidentally match the substring in Tokyo-to");
assert.equal([...fixture.events, ...fixture.auxiliaryEvents].reduce((sum, e) => sum + e.stations.length, 0), 9556);

for (const id of ["20070116031757", "20140505051825", "20240530021456"]) {
  const event = [...fixture.events, ...fixture.auxiliaryEvents].find(e => e.id === id);
  // 2007 has no verified CMT Mw; its JMA magnitude is explicitly a sensitivity
  // proxy here, excluded from the quantitative Mw-based error average.
  const simulation = await prepareEarthquakeSimulation({ longitude: event.source[0], latitude: event.source[1],
    magnitude: event.mw ?? event.magnitudeJma, depthKm: event.depthKm }, catalogue,
  { plateBoundaries, forecastAreas, yieldTask: async () => {} });
  const observed = re => event.stations.filter(([lo, la]) => re.test(region([lo, la])?.name ?? "")).length;
  const displayed = re => simulation.stations.filter(s => re.test(s.forecastAreaName) && s.predictedIntensityValue >= .5).length;
  assert.equal(displayed(KINKI), 0, "the model must not paint widespread felt Kinki shaking in these deep source configurations");
  if (id === "20240530021456") { assert.equal(observed(TOKAI), 0); assert.equal(displayed(TOKAI), 0); }
  else { assert.ok(observed(TOKAI) > 0); assert.ok(displayed(TOKAI) > 0, "retain cases with observed Tokai shaking; no fixed regional zero mask"); }
  assert.ok(simulation.stations.some(s => /^千葉県|^神奈川県|^東京都/.test(s.forecastAreaName) && s.predictedIntensityValue >= .5));
  console.log(`${id}: Kinki reported ${observed(KINKI)}, modeled ${displayed(KINKI)}; Tokai reported ${observed(TOKAI)}, modeled ${displayed(TOKAI)} (different station catalogues; absence is not a station-level zero observation)`);
}
const params = { magnitude: 6.3, depthKm: 172, ruptureDistanceKm: 300, trenchDistanceKm: 600 };
assert.ok(estimateSimulationIntensity(params) < .5);
assert.ok(estimateSimulationIntensity({ ...params, trenchDistanceKm: 200 }) > 1.5, "same source distance can produce contrasting fore-arc/back-arc intensity");
assert.ok(Math.abs(estimateSimulationIntensity({ ...params, depthKm: 150.00001 }) - estimateReferenceIntensity({ ...params, depthKm: 150 })) < .001, "the faster negative-path blend stays continuous at the standard model boundary");
