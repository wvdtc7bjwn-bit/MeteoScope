import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const geojson = JSON.parse(await readFile(
  new URL("public/data/usgs-plate-boundaries-japan.geojson", root),
  "utf8"
));

assert.equal(geojson.type, "FeatureCollection");
assert.equal(geojson.features.length, 19);

const expectedLabels = new Set(["Convergent Boundary", "Transform Boundary", "Other"]);
const actualLabels = new Set();
for (const feature of geojson.features) {
  assert.equal(feature.type, "Feature");
  assert.equal(feature.geometry?.type, "LineString");
  assert.ok(feature.geometry.coordinates.length >= 2);
  assert.ok(typeof feature.properties?.NAME === "string" && feature.properties.NAME.includes(":"));
  assert.ok(expectedLabels.has(feature.properties?.LABEL));
  actualLabels.add(feature.properties.LABEL);
  for (const [longitude, latitude] of feature.geometry.coordinates) {
    assert.ok(Number.isFinite(longitude) && longitude >= -180 && longitude <= 180);
    assert.ok(Number.isFinite(latitude) && latitude >= -90 && latitude <= 90);
  }
}
assert.deepEqual(actualLabels, expectedLabels);

const index = await readFile(new URL("index.html", root), "utf8");
const sources = await readFile(new URL("DATA_SOURCES.md", root), "utf8");
assert.match(index, /プレート境界: USGS/u);
assert.match(index, /境界モデル: Bird, 2003/u);
assert.match(sources, /ddbe6c7e2c0911bfbe42a5facd5e61b510bb86a9e186627f772c36bd7c626c25/u);

console.log("USGS plate boundary data tests passed");
