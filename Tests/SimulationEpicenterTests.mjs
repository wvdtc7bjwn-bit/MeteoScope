import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findSimulationEpicenterName } from "../src/simulation/epicenterRegion.js";
import { prepareEarthquakeSimulation, getSimulationPresetOptions } from "../src/simulation/earthquakeSimulation.js";

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
const cases=[
  ["nankai-trough","full","center","四国沖"],
  ["nankai-trough","full","end","駿河湾"],
  ["nankai-trough","east","center","三重県南東沖"],
  ["nankai-trough","west","center","四国沖"],
  ["kuril-trench","full","center","北海道東方沖"],
  ["japan-trench","full","center","青森県東方沖"]
];
for(const [model,nankaiCase,ruptureOrigin,expected] of cases){
  const input={...getSimulationPresetOptions(model,nankaiCase),ruptureOrigin};
  const withRegions=await prepareEarthquakeSimulation(input,stations,{epicenterRegions:regions});
  const withoutRegions=await prepareEarthquakeSimulation(input,stations);
  const origin=withRegions.sources.find(s=>s.ruptureDelaySec===0);
  assert.equal(findSimulationEpicenterName(regions,origin.coordinates),expected);
  assert.notEqual(withRegions.name,expected,"scenario name remains separate from JMA region");
  assert.deepEqual(withRegions.reports,withoutRegions.reports,"region names do not alter EEW estimation/timing");
  assert.deepEqual(withRegions.stations,withoutRegions.stations,"names do not alter station shaking or wave arrivals");
  for(const time of [0,withRegions.reports[0].elapsedSec,withRegions.duration,10]){
    const event=withRegions.frame(time).event;
    assert.equal(event.hypocenter,expected,"reported name follows the actual rupture origin, including replay/seek");
    assert.deepEqual(event.coordinates,origin.coordinates);
    assert.equal(withoutRegions.frame(time).event.hypocenter,"震源地名不明","no fabricated region on fetch failure");
  }
}
const activeFault={FLT_ID:"F000001_00001",LTENAME:"試験断層帯",LON:139.7,LAT:35.6,DEP:2,LEN:10,WID:5,STR:0,DIP:90,MAG:-6};
const inland=await prepareEarthquakeSimulation({model:"active-fault",activeFault,magnitude:6,depthKm:5},stations,{epicenterRegions:regions});
const inlandOrigin=inland.sources.find(s=>s.ruptureDelaySec===0);
assert.equal(inland.frame(inland.duration).event.hypocenter,findSimulationEpicenterName(regions,inlandOrigin.coordinates));
assert.notEqual(inland.frame(inland.duration).event.hypocenter,activeFault.LTENAME);
console.log("Simulation epicenter names: JMA regions for point/fault/trench/full/half/rupture origins, unchanged physics, missing-data fallback, multipolygon, holes and replay passed");
