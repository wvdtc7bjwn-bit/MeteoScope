import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import simplify from "@turf/simplify";

const DISPLAY_TOLERANCE = 0.0008;
const DATA_DIR = path.resolve("public/data");
const TARGETS = [
  {
    input: "jma-weather-warning-municipalities.geojson",
    output: "jma-weather-warning-municipalities-map.geojson",
    expectedFeatures: 1820,
    property: "code"
  },
  {
    input: "japan-prefectures.geojson",
    output: "japan-prefectures-map.geojson",
    expectedFeatures: 47,
    property: "code"
  }
];

for (const target of TARGETS) {
  const inputPath = path.join(DATA_DIR, target.input);
  const outputPath = path.join(DATA_DIR, target.output);
  const collection = JSON.parse(await readFile(inputPath, "utf8"));
  if (!Array.isArray(collection?.features) || collection.features.length !== target.expectedFeatures) {
    throw new Error(`Unexpected feature count in ${target.input}`);
  }

  const ids = new Set();
  let fallbackCount = 0;
  const features = collection.features.map((feature, index) => {
    const id = String(feature?.properties?.[target.property] ?? "");
    if (id) {
      if (ids.has(id)) throw new Error(`Duplicate ${target.property} in ${target.input}: ${id}`);
      ids.add(id);
    } else if (target.input === "japan-prefectures.geojson") {
      throw new Error(`Missing ${target.property} in ${target.input} at ${index}`);
    }

    try {
      return roundFeature(simplify(feature, {
        tolerance: DISPLAY_TOLERANCE,
        highQuality: true,
        mutate: false
      }));
    } catch {
      fallbackCount += 1;
      return roundFeature(structuredClone(feature));
    }
  });

  const output = JSON.stringify({ type: "FeatureCollection", features });
  await writeFile(outputPath, output);
  console.log(`${target.output}: ${features.length} features, ${Buffer.byteLength(output)} bytes, ${fallbackCount} fallback`);
}

function roundFeature(feature) {
  if (!feature?.geometry?.coordinates) return feature;
  feature.geometry.coordinates = roundCoordinates(feature.geometry.coordinates);
  return feature;
}

function roundCoordinates(value) {
  if (!Array.isArray(value)) return value;
  if (typeof value[0] === "number") {
    return value.map((coordinate) => Math.round(coordinate * 100000) / 100000);
  }
  return value.map(roundCoordinates);
}
