import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { DEFAULT_VIEW } from "../src/config.js";

const source = await readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8");
const limitFunction = source.slice(source.indexOf("function setRadarOverlayZoomLimit("), source.indexOf("function updateKikikuruLayer("));
const constants = ["EARTHQUAKE_MAX_ZOOM", "LIGHTNING_MAX_ZOOM", "WEATHER_CHART_MAX_ZOOM"]
  .map(name => source.match(new RegExp(`const ${name} = [^;]+;`))[0]).join("\n");
const context = vm.createContext({ DEFAULT_VIEW, radarOverlayZoomLimitCache: new WeakMap() });
vm.runInContext(`${constants}\n${limitFunction}`, context);
const writes = [], moves = [];
let zoom = 8;
const map = {
  setMaxZoom: value => writes.push(value),
  getZoom: () => zoom,
  easeTo: options => { moves.push(options); zoom = options.zoom; }
};
const setLimit = (mode, data) => context.setRadarOverlayZoomLimit(map, mode, data);

setLimit("earthquake");
assert.equal(writes.at(-1), 14, "earthquake allows closer manual inspection");
assert.equal(moves.length, 0, "raising the limit never zooms in automatically");
setLimit("earthquake");
assert.equal(writes.length, 1, "repeated rendering does not reset the camera limit");
zoom = 13;
setLimit("amedas");
assert.equal(writes.at(-1), DEFAULT_VIEW.maxZoom);
assert.equal(zoom, DEFAULT_VIEW.maxZoom, "leaving earthquake restores the other tab's zoom limit");
assert.equal(moves.length, 1);
setLimit("warnings");
assert.equal(moves.length, 1, "switching tabs at the same limit leaves the camera alone");
setLimit("earthquake");
assert.equal(writes.at(-1), 14, "returning to earthquake restores the higher limit");
setLimit("radar", { lightningEnabled: true, lightningTileUrl: "lightning" });
assert.equal(writes.at(-1), 8.9);
setLimit("radar", { weatherChartEnabled: true, weatherChart: { featureCount: 1 } });
assert.equal(writes.at(-1), 6.4);
setLimit("radar", { weatherChartSatellite: { enabled: true, frame: { tileUrl: "satellite" } } });
assert.equal(writes.at(-1), 6.4);
setLimit("radar", { weatherDistributionMode: "temperature", weatherDistributionTileUrl: "distribution" });
assert.equal(writes.at(-1), 10);
setLimit("radar");
assert.equal(writes.at(-1), DEFAULT_VIEW.maxZoom);
context.setRadarOverlayZoomLimit(null, "earthquake");
console.log("Map zoom limit tests passed");
