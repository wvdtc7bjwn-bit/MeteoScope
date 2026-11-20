import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createEarthquakeCoordinateRange } from "../src/earthquake/coordinateRange.js";
import { normalizeP2pEarthquake, mergeRealtimeEarthquakes } from "../src/earthquake/realtimeEarthquake.js";
import { mergeEarthquakeReportsByPriority } from "../src/jma/earthquakeXml.js";

const coarse = { coordinates: [139.7, 35.6], coordinateDecimalPlaces: [1, 1] };
assert.deepEqual(createEarthquakeCoordinateRange(coarse).geometry.coordinates,
  [[139.65, 35.55], [139.75, 35.55], [139.75, 35.65], [139.65, 35.65], [139.65, 35.55]]);
const fine = { coordinates: [139.701, 35.602], coordinateDecimalPlaces: [3, 3] };
assert.deepEqual(createEarthquakeCoordinateRange(fine).geometry.coordinates[0], [139.7005, 35.6015]);
assert.equal(createEarthquakeCoordinateRange({ ...fine, coordinateDecimalPlaces: [1, 1] }), null);
for (const event of [{}, { coordinates: [0, 0] }, { coordinates: [null, 0], coordinateDecimalPlaces: [1, 1] },
  { coordinates: [180, 90], coordinateDecimalPlaces: [1, 1] }, { ...coarse, coordinateDecimalPlaces: [-1, 1] }]) {
  assert.equal(createEarthquakeCoordinateRange(event), null);
}

const xml = await readFile(new URL("../src/jma/earthquakeXml.js", import.meta.url), "utf8");
const parser = vm.createContext({});
vm.runInContext(xml.slice(xml.indexOf("function parseJmaCoordinate("), xml.indexOf("function formatMagnitude(")), parser);
assert.deepEqual(Array.from(parser.parseJmaCoordinate("+35.600+139.700-10000/").decimalPlaces), [3, 3]);
assert.deepEqual(Array.from(parser.parseJmaCoordinate("+35.6+139.7-10000/").decimalPlaces), [1, 1]);
assert.equal(parser.parseJmaCoordinate("unknown"), null);
const p2p = normalizeP2pEarthquake({ code: 551, id: "precision", issue: { type: "ScaleAndDestination", time: "2026/11/21 00:01:00" },
  earthquake: { time: "2026/11/21 00:00:00", hypocenter: { name: "東京都２３区", latitude: 35.6, longitude: 139.7 } } });
assert.deepEqual(p2p.coordinateDecimalPlaces, [1, 1]);
const later = { ...p2p, source: "xml", reportTimeRaw: "2026-11-21T00:02:00+09:00", reportPriority: 30, ...fine };
for (const merge of [items => mergeRealtimeEarthquakes(items, []), mergeEarthquakeReportsByPriority]) {
  assert.deepEqual(merge([p2p, later])[0].coordinateDecimalPlaces, [3, 3]);
  const missing = { ...later, coordinates: null, coordinateDecimalPlaces: null };
  const fallback = merge([p2p, missing])[0];
  assert.deepEqual(fallback.coordinates, p2p.coordinates);
  assert.deepEqual(fallback.coordinateDecimalPlaces, [1, 1], "Precision follows the same report as its coordinates");
}

const map = await readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8");
const renderer = vm.createContext({ createEarthquakeCoordinateRange, getEarthquakeMapView: () => "recent",
  createTideStationFeatures: () => [], createEarthquakeAreaIntensityMarkers: () => [], buildEarthquakePopup: () => "popup" });
vm.runInContext(map.slice(map.indexOf("function createEarthquakeFeatures("), map.indexOf("function createEarthquakeAreaIntensityMarkers(")), renderer);
const rendered = renderer.createEarthquakeFeatures({ earthquakes: [{ id: "selected", ...coarse }] });
assert.equal(rendered.filter(f => f.properties.markerType === "earthquake-coordinate-range").length, 1);
assert.equal(rendered.filter(f => f.properties.markerType === "cross").length, 1);
assert.equal(renderer.createEarthquakeFeatures({ earthquakes: [{ id: "unknown", coordinates: null }] }).length, 0);
console.log("Coordinate precision, report merging and selected epicenter range rendering passed");
