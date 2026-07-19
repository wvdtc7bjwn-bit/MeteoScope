import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const geojson = JSON.parse(await readFile(
  new URL("public/data/usgs-plate-boundaries-japan.geojson", root),
  "utf8"
));
const slab2Contours = JSON.parse(await readFile(
  new URL("public/data/usgs-slab2-depth-contours-japan.geojson", root),
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

assert.equal(slab2Contours.type, "FeatureCollection");
assert.equal(slab2Contours.features.length, 117);
const slab2SeamAdjustedContours = slab2Contours.features.filter((feature) => feature.properties?.seamAdjusted);
const slab2SeamAdjustments = slab2SeamAdjustedContours.flatMap((feature) => (
  feature.properties.seamAdjustments.map((adjustment) => ({ feature, adjustment }))
));
assert.equal(slab2SeamAdjustedContours.length, 28);
assert.equal(slab2SeamAdjustments.length, 32);
const expectedRegions = new Set(["Kuril", "Izu-Bonin", "Ryukyu"]);
const actualRegions = new Set();
for (const feature of slab2Contours.features) {
  assert.equal(feature.type, "Feature");
  assert.equal(feature.geometry?.type, "LineString");
  assert.ok(feature.geometry.coordinates.length >= 2);
  assert.ok(expectedRegions.has(feature.properties?.region));
  assert.ok(typeof feature.properties?.plate === "string" && feature.properties.plate.length > 0);
  assert.ok(Number.isInteger(feature.properties?.depthKm));
  assert.ok(feature.properties.depthKm >= 20 && feature.properties.depthKm <= 660);
  assert.equal(feature.properties.depthKm % 20, 0);
  assert.equal(feature.properties.label, `${feature.properties.depthKm}km`);
  actualRegions.add(feature.properties.region);
  for (const [longitude, latitude] of feature.geometry.coordinates) {
    assert.ok(Number.isFinite(longitude) && longitude >= 118 && longitude <= 160);
    assert.ok(Number.isFinite(latitude) && latitude >= 15 && latitude <= 55);
  }
}
assert.deepEqual(actualRegions, expectedRegions);

const seamAdjustmentCounts = new Map();
for (const { feature, adjustment } of slab2SeamAdjustments) {
  assert.equal(feature.properties.region, "Izu-Bonin");
  assert.ok(["kuril-izu-35n", "izu-bonin-27n"].includes(adjustment.id));
  assert.ok(["start", "end"].includes(adjustment.endpoint));
  assert.ok(adjustment.distanceKm > 0 && adjustment.distanceKm <= 12);
  const endpoint = adjustment.endpoint === "start"
    ? feature.geometry.coordinates[0]
    : feature.geometry.coordinates.at(-1);
  const matchingFixedContour = slab2Contours.features.find((candidate) => (
    candidate !== feature
      && candidate.properties.region === adjustment.adjustedTo
      && candidate.properties.depthKm === feature.properties.depthKm
      && [candidate.geometry.coordinates[0], candidate.geometry.coordinates.at(-1)]
        .some((candidateEndpoint) => candidateEndpoint[0] === endpoint[0] && candidateEndpoint[1] === endpoint[1])
  ));
  assert.ok(matchingFixedContour, `Fixed seam endpoint missing for ${feature.properties.depthKm}km`);
  seamAdjustmentCounts.set(adjustment.id, (seamAdjustmentCounts.get(adjustment.id) ?? 0) + 1);
}
assert.equal(seamAdjustmentCounts.get("kuril-izu-35n"), 19);
assert.equal(seamAdjustmentCounts.get("izu-bonin-27n"), 13);

const index = await readFile(new URL("index.html", root), "utf8");
const sources = await readFile(new URL("DATA_SOURCES.md", root), "utf8");
const app = await readFile(new URL("src/app.js", root), "utf8");
const map = await readFile(new URL("src/map/weatherMap.js", root), "utf8");
const panel = await readFile(new URL("src/ui/leftPanel.js", root), "utf8");
assert.match(index, /プレート境界: USGS/u);
assert.match(index, /境界モデル: Bird, 2003/u);
assert.match(index, /プレート等深線: USGS Slab2/u);
assert.match(sources, /ddbe6c7e2c0911bfbe42a5facd5e61b510bb86a9e186627f772c36bd7c626c25/u);
assert.match(sources, /d90214969b6fa4a4411d244694c0d337d073ba080c32b03edc66d47821a3d0f9/u);
assert.match(app, /setPlateBoundaryVisible/u);
assert.match(app, /setPlateDepthContoursVisible/u);
assert.match(map, /activeMode === "earthquake" && plateBoundaryVisible/u);
assert.match(map, /activeMode === "earthquake" && plateDepthContoursVisible/u);
assert.match(panel, /data-earthquake-map-layer/u);
assert.match(panel, /legend-plate-depth/u);

console.log("USGS plate boundary and Slab2 contour data tests passed");
