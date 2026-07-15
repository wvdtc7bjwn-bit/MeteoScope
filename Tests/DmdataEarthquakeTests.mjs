import assert from "node:assert/strict";
import {
  mapDmdataHistoryItem,
  normalizeDmdataIntensity
} from "../src/dmdata/earthquakes.js";

assert.equal(normalizeDmdataIntensity("5弱"), "5-");
assert.equal(normalizeDmdataIntensity("震度6強"), "6+");
assert.equal(normalizeDmdataIntensity("7"), "7");
assert.equal(normalizeDmdataIntensity("不明"), null);

const history = {
  event_id: "20260715212943",
  telegram_type: "VXSE53",
  place: "岩手県沖",
  origin_time: "2026-07-15T21:29:00+09:00",
  updated_at: "2026-07-15T12:33:00.000Z",
  magnitude: "4.4",
  depth: "40",
  max_intensity: "1",
  tsunami_status: "心配なし",
  latitude: 40.1,
  longitude: 142.5,
  regions: [{ code: "210", name: "岩手県沿岸北部", maxInt: "1" }]
};

const summary = mapDmdataHistoryItem(history, [{
  station_code: "0320224",
  station_name: "宮古市田老＊",
  intensity: "1",
  latitude: 39.7356,
  longitude: 141.9669
}]);

assert.equal(summary.id, history.event_id);
assert.equal(summary.hypocenterName, "岩手県沖");
assert.equal(summary.magnitude, "M4.4");
assert.equal(summary.depth, 40);
assert.equal(summary.maxIntensity, "1");
assert.deepEqual(summary.coordinates, [142.5, 40.1]);
assert.equal(summary.intensityAreas[0].code, "210");
assert.equal(summary.intensityStations[0].prefecture, "岩手県");
assert.deepEqual(summary.intensityStations[0].coordinates, [141.9669, 39.7356]);
assert.equal(summary.stationsLoaded, true);
assert.match(summary.tsunamiComment, /津波の心配はありません/u);

const unloaded = mapDmdataHistoryItem(history);
assert.equal(unloaded.stationsLoaded, false);
assert.deepEqual(unloaded.intensityStations, []);

console.log("DM-D.S.S earthquake adapter tests passed");
