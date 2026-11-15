import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findSimulationEpicenterName } from "../src/simulation/epicenterRegion.js";
import { prepareEarthquakeSimulation } from "../src/simulation/earthquakeSimulation.js";

const regions = JSON.parse(readFileSync(new URL("../public/data/jma-earthquake-epicenter-regions.geojson", import.meta.url), "utf8"));
const name = findSimulationEpicenterName(regions, [139.76, 35.68]);
assert.equal(name, "東京都２３区");
assert.equal(findSimulationEpicenterName(regions, [-120, 35]), "", "outside coverage never uses the nearest Japanese region");
const ring = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]];
const hole = [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]];
const synthetic = { features: [{ properties: { name: "Test" }, geometry: { type: "MultiPolygon", coordinates: [[ring, hole]] } }] };
assert.equal(findSimulationEpicenterName(synthetic, [.5, .5]), "Test");
assert.equal(findSimulationEpicenterName(synthetic, [2, 2]), "", "polygon holes are respected");
const stations = { "01": { longitude: 139.76, latitude: 35.68 } };
const simulation = await prepareEarthquakeSimulation({}, stations, { epicenterRegions: regions });
assert.equal(simulation.frame(simulation.duration).event.hypocenter, name);
console.log("Simulation epicenter names: real region match, missing coverage, multipolygon and holes passed");
