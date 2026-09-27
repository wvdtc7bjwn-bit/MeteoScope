import assert from "node:assert/strict";
import { buildEarthquakeDistributionAnalysis } from "../src/earthquakeDistributionAnalysis.js";
import { readFile } from "node:fs/promises";

const analysis = buildEarthquakeDistributionAnalysis([
  { sourceDate: "2026-09-01", latitude: 35.0, longitude: 139.0, depthKm: 8, magnitude: 2.1 },
  { sourceDate: "2026-09-02", latitude: 35.1, longitude: 139.1, depthKm: 20, magnitude: 3.2 },
  { sourceDate: "2026-09-04", latitude: 35.2, longitude: 139.2, depthKm: 42, magnitude: 4.3 },
  { originTime: "2026-09-04T16:00:00Z", latitude: 35.3, longitude: 139.3, depthKm: 65, magnitude: 3.8 },
  { sourceDate: "invalid", latitude: null, longitude: null, depthKm: null, magnitude: null }
], { startDate: "2026-09-01", endDate: "2026-09-05" });

assert.equal(analysis.count, 4);
assert.deepEqual(analysis.depth, { count: 4, min: 8, median: 31, max: 65 });
assert.deepEqual(analysis.magnitude, { count: 4, min: 2.1, median: 3.5, max: 4.3 });
assert.deepEqual(analysis.daily.map((item) => item.count), [1, 1, 0, 1, 1]);
assert.equal(analysis.activity.firstCount, 2);
assert.equal(analysis.activity.secondCount, 2);
assert.equal(analysis.activity.comparable, true);
assert.equal(analysis.crossSection.available, true);
assert.equal(analysis.crossSection.points.length, 4);
assert.ok(analysis.crossSection.spanKm > 0);

const oneDay = buildEarthquakeDistributionAnalysis([
  { sourceDate: "2026-09-01", latitude: 35, longitude: 139, depthKm: 10, magnitude: 2 }
], { startDate: "2026-09-01", endDate: "2026-09-01" });
assert.equal(oneDay.activity.comparable, false);

const plateSection = buildEarthquakeDistributionAnalysis([
  { sourceDate: "2026-09-01", latitude: 35, longitude: 139, depthKm: 10, magnitude: 2 },
  { sourceDate: "2026-09-01", latitude: 35, longitude: 139.2, depthKm: 30, magnitude: 2.5 }
], {
  plateData: {
    contours: {
      type: "FeatureCollection",
      features: [20, 40].map((depthKm, index) => ({
        type: "Feature",
        properties: { region: "Kuril", plate: "太平洋プレート（日本・千島）", depthKm },
        geometry: { type: "LineString", coordinates: [[139.07 + index * 0.02, 34.9], [139.07 + index * 0.02, 35.1]] }
      }))
    },
    boundaries: {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: { NAME: "North American:Pacific", LABEL: "Convergent Boundary" },
        geometry: { type: "LineString", coordinates: [[139.05, 34.9], [139.05, 35.1]] }
      }]
    }
  }
});
assert.equal(plateSection.crossSection.plateProfiles.length, 1);
assert.deepEqual(plateSection.crossSection.plateProfiles[0].points.map((point) => point.depthKm), [0, 20, 40]);
assert.ok(plateSection.crossSection.plateProfiles.every((profile) => profile.points[0].depthKm === 0));

const [realContours, realBoundaries] = await Promise.all([
  readFile(new URL("../public/data/usgs-slab2-depth-contours-japan.geojson", import.meta.url), "utf8"),
  readFile(new URL("../public/data/usgs-plate-boundaries-japan.geojson", import.meta.url), "utf8")
]);
const realPlateSection = buildEarthquakeDistributionAnalysis([
  { sourceDate: "2026-09-01", latitude: 37, longitude: 140, depthKm: 20, magnitude: 2 },
  { sourceDate: "2026-09-01", latitude: 37, longitude: 145, depthKm: 80, magnitude: 3 }
], { plateData: { contours: JSON.parse(realContours), boundaries: JSON.parse(realBoundaries) } });
assert.ok(realPlateSection.crossSection.plateProfiles.some((profile) => profile.points.length >= 2));

const leftPanel = await readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8");
assert.match(leftPanel, /選択範囲の地震解析/u);
assert.match(leftPanel, /深さ断面/u);
assert.match(leftPanel, /プレート境界そのものの断面ではありません/u);
assert.match(leftPanel, /data-earthquake-distribution-show-plate-layers/u);
assert.match(leftPanel, /Slab2プレート面/u);
assert.match(leftPanel, /0km収束境界/u);

console.log("Earthquake distribution analysis tests passed.");
