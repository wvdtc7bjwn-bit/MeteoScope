import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildPlateDepthSurface,
  countPlateDepthSurfaceTriangles,
  maximumBridgeDistanceForDepth,
  normalizePlateDepthSurfaceTriangles
} from "../src/map/plateDepthSurfaceGeometry.js";

assert.equal(maximumBridgeDistanceForDepth(20, 40), 220);
assert.equal(maximumBridgeDistanceForDepth(480, 520), 320);
assert.equal(maximumBridgeDistanceForDepth(280, 320), 270);

const fixture = {
  type: "FeatureCollection",
  features: [
    contour("A", 20, [[140, 34], [140, 35], [140, 36]]),
    contour("A", 40, [[141, 34], [141, 35], [141, 36]]),
    contour("B", 20, [[150, 30], [150, 31]]),
    contour("B", 40, [[158, 30], [158, 31]])
  ]
};
const surface = buildPlateDepthSurface(fixture);
assert.equal(surface.features.length, 1, "far-apart contours must remain disconnected");
assert.equal(surface.features[0].properties.region, "A");
assert.equal(surface.features[0].properties.approximate, true);
assert.ok(countPlateDepthSurfaceTriangles(surface) >= 2);
const normalized = normalizePlateDepthSurfaceTriangles(surface, (depth) => depth < 30 ? "#ff0000" : "#0000ff");
assert.equal(normalized[0].length, 3);
assert.equal(normalized[0][0].depthKm, 20);
assert.deepEqual(normalized[0][0].colorComponents, [1, 0, 0]);

const splitSurface = buildPlateDepthSurface({
  type: "FeatureCollection",
  features: [
    contour("split", 20, [[140, 34], [140, 35], [140, 36]]),
    contour("split", 40, [[140.5, 34], [140.5, 35]]),
    contour("split", 40, [[140.6, 35], [140.6, 36]])
  ]
});
assert.equal(splitSurface.features.length, 2, "split contour branches should both receive a surface band");

const unevenSplitSurface = buildPlateDepthSurface({
  type: "FeatureCollection",
  features: [
    contour("uneven-split", 300, [[140, 30], [140, 32], [140, 34], [140, 36], [140, 38]]),
    contour("uneven-split", 320, [[140.4, 30], [140.4, 31], [140.4, 32]]),
    contour("uneven-split", 320, [[140.4, 36], [140.4, 37], [140.4, 38]])
  ]
});
assert.equal(unevenSplitSurface.features.length, 2, "short split branches must pair with their longer parent contour");

const connectedFragmentsSurface = buildPlateDepthSurface({
  type: "FeatureCollection",
  features: [
    contour("connected", 300, [[140, 30], [140, 32], [140, 34], [140, 36], [140, 38]]),
    contour("connected", 320, [[140.4, 30], [140.4, 32], [140.4, 34]]),
    contour("connected", 320, [[140.4, 34], [140.4, 36], [140.4, 38]])
  ]
});
assert.equal(connectedFragmentsSurface.features.length, 1, "touching contour fragments must form one seamless band");
assert.ok(
  connectedFragmentsSurface.features[0].properties.triangleCount >= 22,
  "a seamless band must contain a complete end-to-end triangle strip"
);

const shallowWideGap = buildPlateDepthSurface({
  type: "FeatureCollection",
  features: [
    contour("depth-aware", 20, [[140, 34], [140, 35]]),
    contour("depth-aware", 40, [[142.7, 34], [142.7, 35]])
  ]}, { maximumPairDistanceKm: 400 });
assert.equal(shallowWideGap.features.length, 0, "shallow bands must keep the conservative bridge limit");

const deepWideGap = buildPlateDepthSurface({
  type: "FeatureCollection",
  features: [
    contour("depth-aware", 500, [[140, 34], [140, 35]]),
    contour("depth-aware", 520, [[142.7, 34], [142.7, 35]])
  ]
}, { maximumPairDistanceKm: 400 });
assert.equal(deepWideGap.features.length, 1, "deep bands may bridge wider contour spacing");
assert.equal(deepWideGap.features[0].properties.maximumBridgeDistanceKm, 320);

const production = JSON.parse(await readFile(
  new URL("../public/data/usgs-slab2-depth-contours-japan.geojson", import.meta.url),
  "utf8"
));
const productionSurface = buildPlateDepthSurface(production);
const regions = new Set(productionSurface.features.map((feature) => feature.properties.region));
assert.deepEqual([...regions].sort(), ["Izu-Bonin", "Kuril", "Ryukyu"]);
assert.ok(productionSurface.features.length >= 80);
assert.ok(countPlateDepthSurfaceTriangles(productionSurface) >= 2_000);
for (const feature of productionSurface.features) {
  assert.ok(feature.properties.deepDepthKm - feature.properties.shallowDepthKm <= 40);
  assert.ok(feature.geometry.coordinates.length > 0);
}

const generatedSurface = JSON.parse(await readFile(
  new URL("../public/data/usgs-slab2-surface-japan.geojson", import.meta.url),
  "utf8"
));
assert.ok(countPlateDepthSurfaceTriangles(generatedSurface) >= 9_000);
const izuBonin300To320 = generatedSurface.features
  .filter((feature) => feature.properties.region === "Izu-Bonin"
    && feature.properties.shallowDepthKm === 300
    && feature.properties.deepDepthKm === 320);
assert.equal(izuBonin300To320.length, 1, "connected Izu-Bonin 300-320 km fragments must form one seamless band");
assert.ok(izuBonin300To320.every((feature) => feature.properties.triangleCount > 0));
const zeroDepthRegions = new Set(generatedSurface.features
  .filter((feature) => feature.properties.shallowDepthKm === 0)
  .map((feature) => feature.properties.region));
assert.deepEqual([...zeroDepthRegions].sort(), ["Izu-Bonin", "Kuril", "Ryukyu"]);
for (const region of zeroDepthRegions) {
  const triangleCount = generatedSurface.features
    .filter((feature) => feature.properties.shallowDepthKm === 0 && feature.properties.region === region)
    .reduce((sum, feature) => sum + feature.properties.triangleCount, 0);
  assert.ok(triangleCount >= 100, `${region} should have continuous 0-20 km surface coverage`);
}
for (const feature of generatedSurface.features) {
  assert.equal(feature.properties.approximate, true);
  assert.ok(feature.properties.deepDepthKm - feature.properties.shallowDepthKm <= 40);
}

console.log("Plate depth surface tests passed.");

function contour(region, depthKm, coordinates) {
  return {
    type: "Feature",
    properties: { region, plate: `${region} plate`, depthKm },
    geometry: { type: "LineString", coordinates }
  };
}
