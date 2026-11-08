import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizePlateDepthContours } from "../src/map/plateDepth3DGeometry.js";

const data = JSON.parse(await readFile(new URL("../public/data/mri-jma-plate-depth-contours.geojson", import.meta.url), "utf8"));
const features = data.features;
assert.equal(data.type, "FeatureCollection");
for (const plate of ["太平洋プレート", "フィリピン海プレート"]) {
  assert.ok(features.some((feature) => feature.properties.plate === plate), `${plate}のデータが必要です`);
}
for (const feature of features) {
  assert.ok(feature.properties.depthKm > 0 && feature.properties.depthKm <= 400);
  assert.ok(feature.geometry.coordinates.length >= 2);
  for (const [lng, lat] of feature.geometry.coordinates) {
    assert.ok(Number.isFinite(lng) && Number.isFinite(lat) && lng >= 120 && lng <= 150 && lat >= 20 && lat <= 50);
  }
}
assert.equal(normalizePlateDepthContours(data).length, features.length);
console.log("MRI plate contour data tests passed.");
