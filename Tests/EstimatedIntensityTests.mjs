import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  attachEstimatedIntensityData,
  buildEstimatedIntensityImage,
  normalizeEstimatedIntensityRecord,
  recolorEstimatedIntensityPixels
} from "../src/jma/estimatedIntensity.js";
import { getEarthquakeIntensityColor } from "../src/config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const record = normalizeEstimatedIntensityRecord({
  hypo: {
    it: "2026-07-28T19:07:19",
    at: "2026-07-28T19:03:00",
    lat: 32.64,
    lon: 130.71,
    dep: 10,
    mag: 4.2,
    epi: "熊本県熊本地方",
    maxi: 4.5
  },
  comment: "推計震度分布",
  url: "202607281903_741",
  bounds: [[32.58, 130.63], [32.71, 130.81]],
  mesh_num: ["4830", "4930"],
  datum: 2
});

assert.equal(record.id, "202607281903_741");
assert.deepEqual(record.bounds, [[130.63, 32.58], [130.81, 32.71]]);
assert.equal(record.images.length, 2);
assert.deepEqual(record.images[0].coordinates, [
  [130, 32.66666667],
  [131, 32.66666667],
  [131, 32],
  [130, 32]
]);
assert.match(record.images[0].url, /estimated_intensity_map\/data\/202607281903_741\/4830\.png$/u);

const earthquakes = attachEstimatedIntensityData([{
  id: "event-1",
  eventTimeRaw: "2026-07-28T19:03:00+09:00",
  coordinates: [130.7, 32.65]
}], [record]);
assert.equal(earthquakes[0].estimatedIntensity?.id, record.id);

const unrelated = attachEstimatedIntensityData([{
  id: "event-2",
  eventTimeRaw: "2026-07-28T18:30:00+09:00",
  coordinates: [130.7, 32.65]
}], [record]);
assert.equal(unrelated[0].estimatedIntensity, undefined);
assert.equal(buildEstimatedIntensityImage("invalid", record.id), null);
assert.equal(buildEstimatedIntensityImage("4830", record.id, 1), null);

const sourcePalette = [
  [250, 231, 151, 255],
  [255, 231, 0, 255],
  [255, 154, 0, 255],
  [255, 35, 0, 255],
  [166, 0, 27, 255],
  [181, 0, 104, 255],
  [250, 231, 151, 0]
];
const recolored = recolorEstimatedIntensityPixels(
  new Uint8ClampedArray(sourcePalette.flat())
);
const expectedColors = ["4", "5-", "5+", "6-", "6+", "7"]
  .map((intensity) => hexToRgb(getEarthquakeIntensityColor(intensity)));
expectedColors.forEach((color, index) => {
  assert.deepEqual(
    [...recolored.slice(index * 4, index * 4 + 4)],
    [...color, 255]
  );
});
assert.deepEqual([...recolored.slice(24, 28)], [250, 231, 151, 0]);

const mapSource = read("src", "map", "weatherMap.js");
const estimatedIntensitySource = read("src", "jma", "estimatedIntensity.js");
assert.match(estimatedIntensitySource, /return canvas;/u);
assert.doesNotMatch(estimatedIntensitySource, /canvas\.toDataURL/u);
assert.doesNotMatch(estimatedIntensitySource, /URL\.createObjectURL/u);
assert.match(mapSource, /hasEstimatedIntensity\s*\?\s*\[\]\s*:\s*\(earthquake\.intensityAreaFeatures/u);
assert.match(mapSource, /type:\s*"canvas"/u);
assert.match(mapSource, /canvas,\s*animate:\s*false/u);
assert.match(mapSource, /map\.getLayer\("sample-line"\)\s*\?\s*"sample-line"/u);
assert.match(mapSource, /"raster-resampling":\s*"nearest"/u);
assert.match(mapSource, /const EARTHQUAKE_STATION_RADIUS = 7\.5;/u);
assert.match(mapSource, /const EARTHQUAKE_STATION_STROKE_WIDTH = 1;/u);
assert.match(mapSource, /radius:\s*EARTHQUAKE_STATION_RADIUS,\s*strokeWidth:\s*EARTHQUAKE_STATION_STROKE_WIDTH/u);
assert.doesNotMatch(mapSource, /getEarthquakeIntensityRadius/u);
assert.doesNotMatch(mapSource, /getEarthquakeStationLabel/u);
assert.match(mapSource, /id:\s*"earthquake-area-intensity-marker"/u);
assert.match(mapSource, /id:\s*"earthquake-station-intensity-circle"/u);
assert.match(mapSource, /id:\s*"earthquake-station-intensity-label"/u);
assert.match(mapSource, /\["!=",\s*\["get",\s*"markerType"\],\s*"earthquake-station"\]/u);
assert.match(mapSource, /maxzoom:\s*7\.5/u);
assert.match(mapSource, /minzoom:\s*7\.5/u);
assert.match(mapSource, /markerType:\s*"earthquake-area-intensity"/u);
assert.match(mapSource, /markerType:\s*"earthquake-station"/u);
assert.match(mapSource, /text\.includes\("未入電"\)/u);

const panelSource = read("src", "ui", "leftPanel.js");
assert.match(panelSource, /\["estimatedIntensity",\s*"推計震度"/u);

console.log("Estimated intensity tests passed.");

function hexToRgb(value) {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu.exec(value);
  assert.ok(match);
  return match.slice(1).map((part) => Number.parseInt(part, 16));
}
