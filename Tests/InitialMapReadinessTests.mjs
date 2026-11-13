import assert from "node:assert/strict";
import { waitForInitialMapGeometry } from "../src/map/initialMapReadiness.js";

function fixture({ sources = { municipalities: false, fixes: true }, layers = { fill: "visible" } } = {}) {
  const handlers = new Map();
  const timers = new Map();
  const states = [];
  let timerId = 0;
  let outcome;
  const map = {
    getSource: id => Object.hasOwn(sources, id) ? {} : undefined,
    isSourceLoaded: id => sources[id],
    getLayer: id => Object.hasOwn(layers, id) ? {id} : undefined,
    getLayoutProperty: id => layers[id],
    on(event, fn) { const callbacks = handlers.get(event) ?? new Set(); callbacks.add(fn); handlers.set(event, callbacks); },
    off(event, fn) { handlers.get(event)?.delete(fn); },
    triggerRepaint() {},
    emit(event, data = {}) { for (const fn of [...(handlers.get(event) ?? [])]) fn(data); }
  };
  const promise = waitForInitialMapGeometry(map, {
    sourceIds: Object.keys(sources), layerIds: Object.keys(layers),
    setTimer(fn, delay) { assert.equal(delay, 8000); timers.set(++timerId, fn); return timerId; },
    clearTimer(id) { timers.delete(id); }, onState: state => states.push(state)
  }).then(result => { outcome = result; return result; });
  return { map, sources, layers, states, promise, timers, get outcome() { return outcome; },
    assertClean() { assert.equal(timers.size, 0); assert.equal([...handlers.values()].reduce((n, set) => n + set.size, 0), 0); }
  };
}

// A fast correction source must never reveal the five municipalities while the
// normal viewport tiles are delayed, even after load/idle/render events.
const delayed = fixture();
for (const event of ["load", "idle", "render", "sourcedata"]) delayed.map.emit(event);
await Promise.resolve();
assert.equal(delayed.outcome, undefined);
delayed.sources.municipalities = true;
delayed.map.emit("sourcedata", {sourceId: "municipalities"});
await Promise.resolve();
assert.equal(delayed.outcome, undefined, "Source arrival alone is not a completed paint");
delayed.map.emit("render");
assert.equal(await delayed.promise, true);
assert.deepEqual(delayed.states, ["waiting", "sources-ready", "paint-ready"]);
delayed.assertClean();

// MapLibre can report errored tiles as loaded. Required-source failures must
// reject startup rather than be accepted by a later render or idle event.
const failed = fixture();
failed.sources.municipalities = true;
failed.map.emit("error", {sourceId: "municipalities", error: new Error("HTTP 503")});
failed.map.emit("render"); failed.map.emit("idle");
assert.equal(await failed.promise, false);
assert.equal(failed.states.at(-1), "source-error"); failed.assertClean();

const optional = fixture({sources: {municipalities: false}});
optional.map.emit("error", {sourceId: "radar", error: new Error("offline")});
optional.sources.municipalities = true;
optional.map.emit("sourcedata"); optional.map.emit("render");
assert.equal(await optional.promise, true, "No global idle is needed for slow optional imagery");
optional.assertClean();

const timedOut = fixture();
[...timedOut.timers.values()][0]();
assert.equal(await timedOut.promise, false);
timedOut.sources.municipalities = true; timedOut.map.emit("render");
assert.equal(timedOut.states.at(-1), "timeout"); timedOut.assertClean();

for (const event of ["remove", "webglcontextlost"]) {
  const stopped = fixture(); stopped.map.emit(event);
  assert.equal(await stopped.promise, false); stopped.assertClean();
}
const geojson = fixture({sources: {municipalities: true, fixes: true, prefectures: false}});
geojson.map.emit("render"); await Promise.resolve();
assert.equal(geojson.outcome, undefined);
geojson.sources.prefectures = true; geojson.map.emit("render");
assert.equal(await geojson.promise, true); geojson.assertClean();

const hidden = fixture({sources: {municipalities: true}, layers: {fill: "none"}});
hidden.map.emit("render"); await Promise.resolve(); assert.equal(hidden.outcome, undefined);
hidden.layers.fill = "visible"; hidden.map.emit("styledata"); hidden.map.emit("render");
assert.equal(await hidden.promise, true); hidden.assertClean();
console.log("Initial basemap readiness: 8 behavioral scenarios passed (fake timers, delayed tiles, paint, errors, timeout, teardown and GeoJSON fallback).");
