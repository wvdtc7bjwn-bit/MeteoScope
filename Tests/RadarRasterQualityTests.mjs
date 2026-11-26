import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { RAIN_RADAR_ZOOM_LEVELS } from "../src/map/radarRasterLevels.js";
import { createRadarFrameRenderer } from "../src/map/radarFrameRenderer.js";

const source = await readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8");
const legacy = [
  { id: "z2", z: 2, minzoom: 1, maxzoom: 3 }, { id: "z4", z: 4, minzoom: 3, maxzoom: 5 },
  { id: "z6", z: 6, minzoom: 5, maxzoom: 7 }, { id: "z8", z: 8, minzoom: 7, maxzoom: 9 },
  { id: "z10", z: 10, minzoom: 9, maxzoom: 22 }
];
for (const zoom of [1, 2.99, 3, 3.49, 4, 4.99, 5, 5.99, 6, 6.99, 7, 7.99, 8, 8.99, 9, 10, 21.99]) {
  const bands = RAIN_RADAR_ZOOM_LEVELS.filter(level => zoom >= level.minzoom && zoom < level.maxzoom);
  assert.equal(bands.length, 1, `One rainfall layer must cover zoom ${zoom}`);
  const level = bands[0];
  // MapLibre's raster covering zoom includes the 512/tileSize LOD offset.
  const canonicalZoom = Math.min(level.z, Math.round(zoom + Math.log2(512 / level.tileSize)));
  assert.equal(canonicalZoom, level.z, "A fixed z URL must receive x/y at the same zoom");
  if (zoom >= 3 && zoom < 6) assert.equal(level.z, 6, "Nationwide view keeps the detailed rainfall tiles");
  if (zoom >= 6 && zoom < 8) assert.equal(level.z, 8, "Regional view switches to detail before enlarging coarse tiles");
  if (zoom >= 8) assert.equal(level.z, 10, "Close views use the most detailed JMA image tier");
}
const sources = new Map(), layers = new Map();
const handlers = new Map();
let sourceAdds = 0;
const map = {
  getSource: id => sources.get(id), getLayer: id => layers.get(id),
  addSource(id, value) { sourceAdds++; sources.set(id, value); },
  addLayer(layer) { layers.set(layer.id, layer); },
  removeSource: id => sources.delete(id), removeLayer: id => layers.delete(id),
  setLayoutProperty(id, name, value) { layers.get(id).layout = { [name]: value }; },
  setPaintProperty(id, name, value) { layers.get(id).paint[name] = value; },
  getZoom: () => 4, isSourceLoaded: () => true, moveLayer() {},
  on(name, callback) { handlers.set(name, callback); }, off(name) { handlers.delete(name); }
};
const context = vm.createContext({ RADAR_ZOOM_LEVELS: legacy, RAIN_RADAR_ZOOM_LEVELS,
  RADAR_SOURCE_PREFIX: "rain-", RADAR_LAYER_PREFIX: "rain-",
  createRadarFrameRenderer, rainRadarRenderers: new WeakMap() });
vm.runInContext(source.slice(source.indexOf("function updateNowcastRasterLayer("), source.indexOf("function updateWeatherChartSatelliteLayer(")), context);
vm.runInContext(source.slice(source.indexOf("function updateRadarLayer("), source.indexOf("function updateWeatherDistributionLayer(")), context);
const tileUrl = "https://www.jma.go.jp/bosai/jmatile/data/nowc/T/none/T/surf/hrpns/{z}/{x}/{y}.png";
context.updateRadarLayer(map, "radar", { radarTileUrl: tileUrl });
handlers.get("render")();
assert.equal(sources.size, 4, "Only the four distinct rainfall image tiers are created");
assert.match(sources.get("rain-z4").tiles[0], /\/6\/\{x\}\/\{y\}/);
for (const layer of layers.values()) {
  assert.equal(layer.paint["raster-resampling"], "nearest", "Keep the rainfall palette, not a blurred color blend");
  assert.equal(layer.paint["raster-opacity"], .9);
}
context.updateRadarLayer(map, "radar", { radarTileUrl: tileUrl });
assert.equal(sourceAdds, 4, "Unchanged frames reuse their sources");
context.updateRadarLayer(map, "typhoon", { radarTileUrl: tileUrl, typhoonRadarOverlay: { visible: true } });
assert.equal(sourceAdds, 4, "Typhoon rain overlay reuses the same detailed sources");
context.updateRadarLayer(map, "warnings", { radarTileUrl: tileUrl });
assert.ok([...layers.values()].every(layer => layer.layout.visibility === "none"));

// Lightning and categorical weather forecasts retain their original LOD policy.
context.updateNowcastRasterLayer(map, { shouldShow: true, tileUrl, sourcePrefix: "other-", layerPrefix: "other-", opacity: .88 });
assert.equal(sources.get("other-z4").tileSize, 256);
assert.match(sources.get("other-z4").tiles[0], /\/4\//);
console.log("Radar raster quality: detailed overview, correct tile coordinates, palette, reuse and shared overlays passed");
