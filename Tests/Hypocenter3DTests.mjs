import assert from "node:assert/strict";
import {
  HYPOCENTER_3D_MAX_ITEMS,
  HYPOCENTER_3D_VERTICAL_EXAGGERATION,
  normalizeHypocenter3DItems,
  parseHexColor,
  projectMercatorPoint
} from "../src/map/hypocenter3DGeometry.js";

const normalized = normalizeHypocenter3DItems([
  { id: "valid", longitude: 140, latitude: 35, depthKm: 40, magnitude: 4.5 },
  { id: "deep", longitude: 141, latitude: 36, depthKm: 900, magnitude: 12 },
  { id: "invalid", longitude: null, latitude: 35, depthKm: 10 }
], (depth) => depth == null ? "#8b98a8" : "#ef362b");

assert.equal(normalized.length, 2);
assert.equal(normalized[0].depthKm, 40);
assert.equal(normalized[0].pointSize, 14.1);
assert.equal(normalized[1].depthKm, 700);
assert.equal(normalized[1].pointSize, 20);
assert.equal(HYPOCENTER_3D_VERTICAL_EXAGGERATION, 3);

const many = Array.from({ length: HYPOCENTER_3D_MAX_ITEMS + 5 }, (_, index) => ({
  id: String(index),
  longitude: 130 + index / 10000,
  latitude: 30,
  depthKm: index % 700,
  magnitude: 1
}));
assert.equal(normalizeHypocenter3DItems(many).length, HYPOCENTER_3D_MAX_ITEMS);

const identity = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
];
assert.deepEqual(
  projectMercatorPoint(identity, { x: 0, y: 0, z: 0 }, 400, 200),
  { x: 200, y: 100 }
);
assert.equal(projectMercatorPoint(identity, { x: 0, y: 0, z: 0 }, 0, 200), null);
assert.deepEqual(parseHexColor("#ff8040"), [1, 128 / 255, 64 / 255]);
assert.deepEqual(parseHexColor("invalid"), [0.55, 0.6, 0.66]);

console.log("Hypocenter 3D tests passed.");
