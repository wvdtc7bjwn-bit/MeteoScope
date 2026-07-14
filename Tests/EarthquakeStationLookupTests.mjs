import assert from "node:assert/strict";
import {
  attachIntensityStationCoordinates,
  buildStationCoordinateLookup,
  normalizeStationName
} from "../src/jma/earthquakeStationLookup.js";

assert.equal(normalizeStationName("八戸市南郷＊"), "八戸市南郷");
assert.equal(normalizeStationName("八戸市南郷*"), "八戸市南郷");

const lookup = buildStationCoordinateLookup([
  {
    name: "八戸市南郷",
    latitude: 40.4,
    longitude: 141.43,
    prefectureCode: "02",
    owner: "地方公共団体"
  },
  {
    name: "蓬田村蓬田",
    latitude: 40.97,
    longitude: 140.66,
    prefectureCode: "02",
    owner: "地方公共団体"
  }
]);

const [station] = attachIntensityStationCoordinates([
  {
    code: "0220301",
    stationName: "八戸市南郷＊",
    cityName: "八戸市",
    intensity: "3"
  }
], lookup);

assert.deepEqual(station.coordinates, [141.43, 40.4]);
assert.equal(station.intensity, "3");

const [renamedStation] = attachIntensityStationCoordinates([
  {
    code: "0230400",
    stationName: "蓬田村阿弥陀川＊",
    cityName: "蓬田村",
    intensity: "2"
  }
], lookup);

assert.deepEqual(renamedStation.coordinates, [140.66, 40.97]);

const ambiguousLookup = buildStationCoordinateLookup([
  { name: "八戸市南郷", latitude: 40.4, longitude: 141.43 },
  { name: "八戸市湊町", latitude: 40.52, longitude: 141.52 }
]);
const [ambiguousStation] = attachIntensityStationCoordinates([
  { code: "unknown", stationName: "八戸市未登録＊", cityName: "八戸市", intensity: "1" }
], ambiguousLookup);
assert.equal(ambiguousStation.coordinates, null);

console.log("Earthquake station lookup tests passed");
