import assert from "node:assert/strict";

import { classifyLightningActivityColor } from "../src/location/lightningStatus.js";
import { formatRadarIntensityBand, lngLatToTilePixel } from "../src/location/radarTimeline.js";

assert.equal(formatRadarIntensityBand(0), "0mm/h");
assert.equal(formatRadarIntensityBand(0.1), "0.1〜1mm/h");
assert.equal(formatRadarIntensityBand(1), "1〜5mm/h");
assert.equal(formatRadarIntensityBand(50), "50〜80mm/h");
assert.equal(formatRadarIntensityBand(80), "80mm/h以上");
assert.equal(formatRadarIntensityBand(80, "en"), "80mm/h or more");
assert.equal(formatRadarIntensityBand(1, "en"), "1–5mm/h");

assert.equal(classifyLightningActivityColor({ r: 200, g: 0, b: 255, a: 191 }), 4);
assert.equal(classifyLightningActivityColor({ r: 255, g: 40, b: 0, a: 191 }), 3);
assert.equal(classifyLightningActivityColor({ r: 255, g: 170, b: 0, a: 191 }), 2);
assert.equal(classifyLightningActivityColor({ r: 255, g: 245, b: 0, a: 191 }), 1);
assert.equal(classifyLightningActivityColor({ r: 0, g: 0, b: 0, a: 0 }), 0);
assert.equal(classifyLightningActivityColor({ r: 20, g: 20, b: 20, a: 255 }), 0);

const pixel = lngLatToTilePixel(135, 35, 8);
assert.equal(Number.isInteger(pixel.x), true);
assert.equal(Number.isInteger(pixel.y), true);
assert.equal(pixel.pixelX >= 0 && pixel.pixelX < 256, true);
assert.equal(pixel.pixelY >= 0 && pixel.pixelY < 256, true);

console.log("LocationNowcastStatusTests passed");
