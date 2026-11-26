import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRadarFrameRenderer } from "../src/map/radarFrameRenderer.js";
import { RAIN_RADAR_ZOOM_LEVELS as levels } from "../src/map/radarRasterLevels.js";

function fixture({ prefetch = true, reduced = false } = {}) {
  const sources = new Map(), layers = new Map(), handlers = new Map(), timers = new Map(), loaded = new Set();
  let now = 0, id = 0, adds = 0;
  const map = {
    getSource: id => sources.get(id), getLayer: id => layers.get(id), getZoom: () => 4,
    addSource(id, source) { sources.set(id, source); adds++; },
    addLayer(layer) { layers.set(layer.id, layer); },
    removeSource: id => { sources.delete(id); loaded.delete(id); }, removeLayer: id => layers.delete(id),
    moveLayer() {}, isSourceLoaded: id => loaded.has(id),
    setPaintProperty(id, name, value) { layers.get(id).paint[name] = value; },
    setLayoutProperty(id, name, value) { (layers.get(id).layout ??= {})[name] = value; },
    on(name, callback) { handlers.set(name, callback); }, off(name) { handlers.delete(name); }
  };
  const renderer = createRadarFrameRenderer(map, { levels, sourcePrefix: "source-", layerPrefix: "layer-",
    allowPrefetch: () => prefetch, reducedMotion: () => reduced,
    now: () => now,
    schedule(callback, delay) { timers.set(++id, { callback, at: now + delay }); return id; },
    cancel: id => timers.delete(id) });
  const url = name => `https://jma.example/${name}/{z}/{x}/{y}.png`;
  function update(name, next) { renderer.update({ visible: true, tileUrl: url(name), nextTileUrl: next ? url(next) : null }); }
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const item = [...timers].sort((a, b) => a[1].at - b[1].at).find(([, timer]) => timer.at <= end);
      if (!item) break;
      now = item[1].at; timers.delete(item[0]); item[1].callback();
    }
    now = end;
  }
  function finish(name) {
    for (const [id, source] of sources) if (source.tiles[0].includes(`/${name}/`)) loaded.add(id);
    handlers.get("render")?.();
  }
  function visibleNames() {
    return [...new Set([...layers.values()].filter(layer => layer.layout?.visibility !== "none" && layer.paint["raster-opacity"] > 0)
      .map(layer => sources.get(layer.source).tiles[0].split("/")[3]))];
  }
  return { renderer, sources, layers, handlers, timers, loaded, map, update, advance, finish, visibleNames,
    get adds() { return adds; }, url };
}

const f = fixture();
f.update("A", "B");
assert.equal(f.sources.size, 4);
assert.deepEqual(f.visibleNames(), [], "Initial tiles do not promote before loading.");
f.advance(200);
f.finish("A");
assert.deepEqual(f.visibleNames(), ["A"]);
assert.equal(f.sources.size, 8, "One following frame is prefetched.");
f.finish("B");
const additions = f.adds;
f.update("B", "C");
assert.equal(f.adds, additions + 4, "Cached B is reused; only the next lookahead C is created.");
assert.deepEqual(f.visibleNames(), ["B"]);
f.advance(160);
assert.ok([...f.layers.values()].filter(layer => f.sources.get(layer.source).tiles[0].includes("/A/"))
  .every(layer => layer.layout.visibility === "none"));
assert.equal(f.sources.size, 12, "At most three four-tier frames are retained.");
f.update("D");
f.advance(10); f.update("E"); f.advance(10); f.update("F");
assert.equal(f.adds, additions + 4, "Rapid scrubbing does not create intermediate frames.");
f.advance(50);
assert.deepEqual(f.visibleNames(), ["B"], "Displayed rain remains while a new time loads.");
assert.equal(f.sources.size, 12);
assert.ok(![...f.sources.values()].some(source => /\/(D|E)\//.test(source.tiles[0])));
f.advance(8000);
assert.deepEqual(f.visibleNames(), ["B"], "A slow request leaves the last complete frame intact.");
f.finish("F");
assert.deepEqual(f.visibleNames(), ["F"]);
f.update("G"); f.advance(50); f.update("F"); f.finish("G");
assert.deepEqual(f.visibleNames(), ["F"], "An obsolete frame cannot replace the latest selection.");
f.update("G");
assert.deepEqual(f.visibleNames(), ["F"], "A hidden cached frame waits for a fresh viewport render.");
f.finish("G");
assert.deepEqual(f.visibleNames(), ["G"]);
f.renderer.hide();
assert.deepEqual(f.visibleNames(), []);
assert.equal(f.timers.size, 0, "Leaving radar cancels pending work and fades.");
f.renderer.destroy();
assert.equal(f.handlers.size, 0);
assert.equal(f.sources.size, 0, "Explicit teardown releases cached raster sources.");

const constrained = fixture({ prefetch: false, reduced: true });
constrained.update("A", "B"); constrained.finish("A");
assert.equal(constrained.sources.size, 4, "Constrained connections do not prefetch.");
constrained.update("B"); constrained.advance(50); constrained.finish("B");
assert.ok([...constrained.layers.values()].every(layer => layer.paint["raster-opacity-transition"].duration === 0));
constrained.renderer.update({ visible: true, tileUrl: constrained.url("B"), opacity: .78 });
assert.ok([...constrained.layers.values()].filter(layer => constrained.sources.get(layer.source).tiles[0].includes("/B/"))
  .every(layer => layer.paint["raster-opacity"] === .78), "Typhoon overlay opacity updates without reloading tiles.");
constrained.renderer.destroy();
const removed = fixture();
removed.update("A");
removed.map.getLayer = () => { throw new Error("The map style is already destroyed"); };
assert.doesNotThrow(() => removed.handlers.get("remove")({ type: "remove" }));
assert.equal(removed.timers.size, 0);
assert.equal(removed.handlers.size, 0);

const continuous = fixture();
continuous.update("A"); continuous.finish("A");
const initialAdds = continuous.adds;
for (let step = 0; step < 10; step++) {
  continuous.update(`T${step}`);
  continuous.advance(10);
  if (step === 3) assert.ok(continuous.adds > initialAdds,
    "Continuous input starts loading within 32ms without waiting for a pause.");
  assert.ok(continuous.sources.size <= 12, "Rapid scrubbing retains at most three frames.");
}
continuous.advance(32); continuous.finish("T9");
assert.deepEqual(continuous.visibleNames(), ["T9"], "The final selected frame has priority.");
continuous.renderer.destroy();

const rapid = fixture();
rapid.update("A", "B"); rapid.finish("A"); rapid.finish("B");
rapid.update("B", "A");
assert.deepEqual(rapid.visibleNames(), ["B"]);
assert.ok([...rapid.layers.values()].every(layer => layer.paint["raster-opacity-transition"].duration === 0),
  "Cached images switch immediately during rapid input.");
rapid.advance(400); rapid.update("A"); rapid.finish("A");
assert.ok([...rapid.layers.values()].some(layer => layer.paint["raster-opacity-transition"].duration === 160),
  "Separated selections keep the gentle transition.");
rapid.renderer.destroy();

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const frames = Array.from({ length: 12 }, () => ({})), callbacks = [], updates = [];
const controller = vm.createContext({
  activeTab: "radar", latestDataByTab: { radar: { frames, activeFrameIndex: 5 } }, radarSelectionFrame: null,
  TABS: [{ id: "radar" }], clampRadarIndex: index => Math.max(0, Math.min(11, Number(index))),
  window: { requestAnimationFrame: callback => { callbacks.push(callback); return callbacks.length; } },
  updateCurrentView: (tab, data) => updates.push(data.activeFrameIndex)
});
vm.runInContext(app.slice(app.indexOf("  function selectRadarFrame("), app.indexOf("  function getActiveWeatherDistribution(")), controller);
controller.selectRadarFrame(6); controller.selectRadarFrame(7); controller.selectRadarFrame(8);
assert.equal(callbacks.length, 1, "Map and panel rendering coalesce into one animation frame.");
callbacks.shift()(); assert.deepEqual(updates, [8]);
controller.selectRadarFrame(8); assert.equal(callbacks.length, 0, "An unchanged index does not rebuild the view.");
controller.selectRadarFrame(7); controller.selectRadarFrame(6);
assert.equal(controller.latestDataByTab.radar.prefetchDirection, -1, "Lookahead follows backward scrubbing.");
controller.activeTab = "warnings"; callbacks.shift()();
assert.deepEqual(updates, [8], "A queued selection cannot repaint a tab the user has left.");
controller.activeTab = "radar"; controller.selectRadarFrame(5);
controller.latestDataByTab.radar = { frames, activeFrameIndex: 3 }; callbacks.shift()();
assert.deepEqual(updates, [8], "A queued selection cannot overwrite refreshed radar data.");
controller.selectRadarFrame(4); callbacks.shift()(); assert.deepEqual(updates, [8, 4]);
console.log("Radar frames: bounded cache, continuous input, immediate cached swaps, rendering coalescing, directional prefetch and lifecycle passed.");
