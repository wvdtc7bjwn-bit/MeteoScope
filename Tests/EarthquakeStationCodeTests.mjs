import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildStationCoordinateLookup, findStationCoordinate, normalizeStationName } from "../src/jma/earthquakeStationLookup.js";

const reference = JSON.parse(await readFile(
  new URL("../scripts/data/jma-intensity-station-codes-20260707.json", import.meta.url),
  "utf8"
));
const coordinates = JSON.parse(await readFile(
  new URL("../public/data/jma-intensity-stations.json", import.meta.url),
  "utf8"
));

assert.equal(reference.source, "https://xml.kishou.go.jp/jmaxml_20260707_Code.zip");
assert.equal(reference.table, "24");
assert.equal(reference.stations.length, 4360);
assert.equal(new Set(reference.stations.map((station) => station.code)).size, 4360);
assert.equal(new Set(reference.stations.map((station) => normalizeStationName(station.name))).size, 4360);

const officialByCode = new Map(reference.stations.map((station) => [station.code, station]));
const codedCoordinates = coordinates.filter((station) => station.code);
assert.equal(codedCoordinates.length, 4326);
assert.equal(new Set(codedCoordinates.map((station) => station.code)).size, codedCoordinates.length);
codedCoordinates.forEach((station) => {
  const official = officialByCode.get(station.code);
  assert.ok(official, `Unknown JMA station code: ${station.code}`);
  assert.equal(normalizeStationName(station.name), normalizeStationName(official.name));
});

const lookup = buildStationCoordinateLookup(coordinates);
assert.equal(findStationCoordinate({ code: "4520137", stationName: "宮崎市清武町西新町＊" }, lookup), null);
assert.equal(findStationCoordinate({ code: "4622201", stationName: "奄美市名瀬矢之脇町" }, lookup), null);

console.log("Earthquake station code tests passed");
