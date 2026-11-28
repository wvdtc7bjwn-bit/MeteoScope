import assert from "node:assert/strict";
import { syncTsunamiInundationLayer, TSUNAMI_INUNDATION_DEPTHS } from "../src/map/tsunamiInundationLayer.js";

const layers = new Map();
const sources = new Map();
const visibilityChanges = [];
const anchorId = "earthquake-overlay";
const map = {
  getLayer: (id) => layers.get(id),
  getLayoutProperty: (id, key) => layers.get(id).layout[key],
  setLayoutProperty(id, key, value) {
    visibilityChanges.push(value);
    layers.get(id).layout[key] = value;
  },
  addSource(id, source) {
    assert.equal(sources.has(id), false);
    sources.set(id, source);
  },
  addLayer(layer, before) {
    assert.equal(before, anchorId);
    assert.equal(layers.has(layer.id), false);
    layers.set(layer.id, layer);
  }
};

syncTsunamiInundationLayer(map, true, anchorId);
assert.equal(sources.size, 0, "waits until the map style's overlay anchor is available");
layers.set(anchorId, {});
syncTsunamiInundationLayer(map, false, anchorId);
assert.equal(sources.size, 0, "off by default does not register an external raster source");

syncTsunamiInundationLayer(map, true, anchorId);
const [[id, source]] = sources;
assert.deepEqual(source.tiles, ["https://disaportaldata.gsi.go.jp/raster/04_tsunami_newlegend_data/{z}/{x}/{y}.png"]);
assert.equal(source.minzoom, 3, "avoids the offshore artifact in the zoom-2 overview");
assert.equal(source.maxzoom, 17);
assert.equal(layers.get(id).paint["raster-resampling"], "nearest");
assert.equal(layers.get(id).layout.visibility, "visible");
syncTsunamiInundationLayer(map, false, anchorId);
syncTsunamiInundationLayer(map, false, anchorId);
syncTsunamiInundationLayer(map, true, anchorId);
assert.deepEqual(visibilityChanges, ["none", "visible"]);
assert.equal(TSUNAMI_INUNDATION_DEPTHS.length, 8, "includes the regional lower-depth bands in the official key");

console.log("Tsunami inundation layer: lazy loading, layer order, and visibility passed");
