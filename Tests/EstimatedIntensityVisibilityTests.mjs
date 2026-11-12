import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const source = readFileSync(new URL("../src/map/weatherMap.js", import.meta.url), "utf8");
const functionText = source.slice(source.indexOf("function updateEstimatedIntensityLayer("), source.indexOf("function ensureEstimatedIntensityProtocol("));
const states = new WeakMap();
let pending = [];
const context = vm.createContext({
  estimatedIntensityLayerStateByMap: states,
  estimatedIntensityImageDataByKey: new Map(),
  ESTIMATED_INTENSITY_SOURCE_PREFIX: "estimate-source",
  ESTIMATED_INTENSITY_LAYER_PREFIX: "estimate-layer",
  ESTIMATED_INTENSITY_PROTOCOL: "estimate",
  getEarthquakeMapView: d => d.earthquakeMapView ?? d.earthquakeView ?? "recent",
  ensureEstimatedIntensityProtocol() {},
  getRecoloredEstimatedIntensityImageData: () => new Promise(resolve => pending.push(resolve)),
  removeEstimatedIntensityLayers: (map, entries) => entries.forEach(e => map.layers.delete(e.layerId)),
  removeMapLayerAndSource: (map, id) => map.layers.delete(id)
});
vm.runInContext(functionText, context);
const map = { layers: new Map(), getLayer(id) { return this.layers.get(id); }, addSource() {},
  addLayer(layer) { this.layers.set(layer.id, layer); },
  setLayoutProperty(id, key, value) { this.layers.get(id).layout[key] = value; } };
const earthquake = { estimatedIntensity: { id: "test", images: [{url:"test.png",meshCode:"1",coordinates:[]}] } };
const render = (view, extra = {}) => context.updateEstimatedIntensityLayer(map, "earthquake", {earthquakeMapView:view, selectedEarthquake:earthquake,...extra});
const settle = async () => { pending.splice(0).forEach(resolve => resolve(new Uint8Array([1]))); await new Promise(resolve => setImmediate(resolve)); };
render("recent"); await settle();
assert.equal(map.layers.get("estimate-layer-0").layout.visibility, "visible");
for (const view of ["history", "distribution"]) {
  render(view);
  assert.equal(map.layers.get("estimate-layer-0").layout.visibility, "none", view);
  render("recent");
  assert.equal(map.layers.get("estimate-layer-0").layout.visibility, "visible");
}
render("recent", {estimatedIntensityVisible:false});
assert.equal(map.layers.get("estimate-layer-0").layout.visibility, "none");
map.layers.clear(); states.delete(map);
render("recent"); render("history"); await settle();
assert.equal(map.layers.size, 0, "画像取得中に過去へ切り替えても遅延描画しない");
render("recent"); await settle();
assert.equal(map.layers.get("estimate-layer-0").layout.visibility, "visible");
console.log("Estimated intensity visibility: 7 scenarios passed.");
