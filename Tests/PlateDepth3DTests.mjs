import assert from "node:assert/strict";
import {
  PLATE_DEPTH_3D_VERTICAL_EXAGGERATION,
  countPlateDepthSegments,
  normalizePlateDepthContours
} from "../src/map/plateDepth3DGeometry.js";
import {
  DEPTH_3D_MIN_ZOOM_SCALE,
  DEPTH_3D_REFERENCE_ZOOM,
  getDepth3DZoomScale
} from "../src/map/depth3DRenderer.js";

const contours = normalizePlateDepthContours({
  type: "FeatureCollection",
  features: [
    {
      properties: { depthKm: 40 },
      geometry: { type: "LineString", coordinates: [[140, 35], [141, 36], [142, 37]] }
    },
    {
      properties: { depthKm: 900 },
      geometry: {
        type: "MultiLineString",
        coordinates: [
          [[130, 30], [131, 31]],
          [[132, 32], [null, 33], [133, 33]]
        ]
      }
    },
    {
      properties: { depthKm: "unknown" },
      geometry: { type: "LineString", coordinates: [[140, 35], [141, 36]] }
    }
  ]
}, (depth) => depth < 100 ? "#ff8040" : "#2040ff");

assert.equal(contours.length, 2);
assert.equal(contours[0].depthKm, 40);
assert.deepEqual(contours[0].colorComponents, [1, 128 / 255, 64 / 255]);
assert.equal(contours[1].depthKm, 700);
assert.equal(contours[1].lines.length, 1);
assert.equal(countPlateDepthSegments(contours), 3);
assert.equal(PLATE_DEPTH_3D_VERTICAL_EXAGGERATION, 3);
assert.deepEqual(normalizePlateDepthContours(null), []);
assert.equal(DEPTH_3D_REFERENCE_ZOOM, 5);
assert.equal(getDepth3DZoomScale(3), 1);
assert.equal(getDepth3DZoomScale(5), 1);
assert.equal(getDepth3DZoomScale(6), 0.5);
assert.equal(getDepth3DZoomScale(10), DEPTH_3D_MIN_ZOOM_SCALE);
assert.equal(getDepth3DZoomScale("invalid"), 1);

console.log("Plate depth 3D tests passed.");
