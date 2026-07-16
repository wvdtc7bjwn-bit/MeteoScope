import assert from "node:assert/strict";
import {
  mapDmdataTsunami,
  mapDmdataHistoryItem,
  mergeDmdataEarthquakeStationDetails,
  normalizeDmdataIntensity
} from "../src/dmdata/earthquakes.js";
import {
  parseDmdataEarthquakeUpdate,
  toDmdataWebSocketUrl
} from "../src/dmdata/earthquakeUpdates.js";

assert.deepEqual(
  parseDmdataEarthquakeUpdate(JSON.stringify({
    type: "earthquake",
    timestamp: "2026-07-16T01:23:45Z"
  })),
  { type: "earthquake", token: "2026-07-16T01:23:45Z" }
);
assert.equal(parseDmdataEarthquakeUpdate('{"type":"status"}'), null);
assert.equal(parseDmdataEarthquakeUpdate("invalid"), null);
assert.equal(
  toDmdataWebSocketUrl("https://meteoscope.pages.dev/api/earthquakes/stream"),
  "wss://meteoscope.pages.dev/api/earthquakes/stream"
);

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

const hinoemata = mapDmdataHistoryItem(history, [{
  station_code: "0736420",
  station_name: "檜枝岐村上河原＊",
  intensity: "2",
  latitude: 37.0158,
  longitude: 139.3806
}]);
assert.equal(hinoemata.intensityStations[0].code, "0736420");
assert.equal(hinoemata.intensityStations[0].stationName, "檜枝岐村上河原＊");
assert.deepEqual(hinoemata.intensityStations[0].coordinates, [139.3806, 37.0158]);

const unloaded = mapDmdataHistoryItem(history);
assert.equal(unloaded.stationsLoaded, false);
assert.deepEqual(unloaded.intensityStations, []);

const refreshed = mergeDmdataEarthquakeStationDetails(
  { earthquakes: [summary] },
  { earthquakes: [unloaded], updatedAt: "2026-07-16T00:00:00Z" }
);
assert.equal(refreshed.earthquakes[0].intensityStations.length, 1);
assert.equal(refreshed.earthquakes[0].intensityStations[0].stationName, "宮古市田老＊");
assert.equal(refreshed.updatedAt, "2026-07-16T00:00:00Z");

const tsunami = await mapDmdataTsunami({
  receivedAt: "2026-07-16T00:00:00Z",
  data: {
    eventId: history.event_id,
    reportTime: "2026-07-16T09:00:00+09:00",
    title: "津波警報・注意報・予報",
    headline: "海岸から離れてください。",
    isCanceled: false,
    areas: [{
      code: "210",
      name: "青森県太平洋沿岸",
      kindCode: "62",
      kind: "津波注意報",
      arrivalTime: "2026-07-16T09:30:00+09:00",
      height: "1.0",
      heightUnit: "m"
    }],
    observations: [{
      code: "210",
      name: "青森県太平洋沿岸",
      stations: [{
        code: "87110",
        name: "八戸港",
        maxHeight: "0.4",
        maxHeightUnit: "m",
        offshore: false
      }]
    }]
  }
}, new Map());
assert.equal(tsunami.highestLevel, "advisory");
assert.equal(tsunami.eventId, history.event_id);
assert.equal(tsunami.areas[0].height, "1.0m");
assert.equal(tsunami.observations[0].stationName, "八戸港");

console.log("DM-D.S.S earthquake adapter tests passed");
