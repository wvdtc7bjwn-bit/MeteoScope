import assert from "node:assert/strict";
import { GeoJSONVT } from "@maplibre/geojson-vt";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { worldLandGeoJson } from "../src/map/data/worldLandGeoJson.js";
import { prepareWorldMapData } from "../src/map/worldLandFilter.js";
import { createWorldTileIndex, encodeWorldTile } from "../src/map/worldTileGeometry.js";
import { createWorldTileLoader, createWorldSource } from "../src/map/worldTiles.js";

// Compare decoded tiles with the old GeoJSON source's actual tiling defaults,
// including islands, holes, the date line, and the excluded Japanese polygons.
const reference = new GeoJSONVT(prepareWorldMapData(worldLandGeoJson), {
  extent: 8192, buffer: 128 / 512 * 8192, tolerance: 0.375 / 512 * 8192, maxZoom: 18
});
const index = createWorldTileIndex(worldLandGeoJson);
let checked = 0;
for (const [z, lon, lat] of [[0,0,0],[3,130,35],[5,128,36],[8,147,45],[8,179,-17],[10,0,50],[10,138,36]]) {
  const x = Math.floor((lon + 180) / 360 * 2 ** z);
  const y = Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z);
  const original = reference.getTile(z, x, y);
  const data = encodeWorldTile(index, z, x, y);
  if (!original?.features.length) { assert.equal(data.byteLength, 0); continue; }
  const layer = new VectorTile(new Pbf(new Uint8Array(data))).layers.land;
  assert.equal(layer.extent, 8192);
  assert.equal(layer.length, original.features.length);
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    assert.deepEqual({ ...feature.properties }, original.features[i].tags);
    assert.notEqual(feature.properties.ISO_A3, "JPN");
    assert.deepEqual(feature.loadGeometry().map(ring => ring.map(({x,y}) => [x,y])), original.features[i].geometry);
    checked++;
  }
}
assert.ok(checked > 200);
assert.equal(createWorldSource().type, "vector");
assert.equal(createWorldSource().maxzoom, 18);

const workers = [], timers = new Map(); let timerId = 0;
const loader = createWorldTileLoader({
  createWorker() {
    const worker = { messages: [], terminated: false, postMessage(message) { this.messages.push(message); }, terminate() { this.terminated = true; } };
    workers.push(worker); return worker;
  },
  setTimer(callback) { timers.set(++timerId, callback); return timerId; },
  clearTimer(id) { timers.delete(id); }
});
const url = "meteoscope-world://tiles/3/6/3.pbf";
const a = new AbortController(), b = new AbortController();
const first = loader({url}, a), second = loader({url}, b);
const firstRejected = assert.rejects(first, {name:"AbortError"});
assert.equal(workers.length, 1);
const worker = workers[0];
assert.equal(worker.messages.length, 2);
a.abort(); await firstRejected;
worker.onmessage({data:{id:worker.messages[0].id,data:new ArrayBuffer(1)}});
worker.onmessage({data:{id:worker.messages[1].id,data:new ArrayBuffer(2)}});
assert.equal((await second).data.byteLength, 2);
assert.equal(timers.size, 0);
const count = worker.messages.length;
await assert.rejects(loader({url}, a), {name:"AbortError"});
assert.equal(worker.messages.length, count, "already cancelled tiles do not start work");
for (const invalid of ["https://other.test/3/6/3.pbf","meteoscope-world://tiles/19/0/0.pbf","meteoscope-world://tiles/3/8/3.pbf"]) await assert.rejects(loader({url:invalid}));
const failed = loader({url});
const failureCheck = assert.rejects(failed, /worker failed/);
worker.onerror(); await failureCheck;
assert.equal(worker.terminated, true);
const retried = loader({url});
assert.equal(workers.length, 2);
workers[1].onmessage({data:{id:workers[1].messages[0].id,data:new ArrayBuffer(0)}});
assert.equal((await retried).data.byteLength, 0);
const timedOut = loader({url});
const timeoutCheck = assert.rejects(timedOut, /timed out/);
[...timers.values()][0](); await timeoutCheck;
assert.equal(workers[1].terminated, true);
const disposed = loader({url});
const disposeCheck = assert.rejects(disposed, {name:"AbortError"});
loader.dispose(); await disposeCheck;
assert.equal(timers.size, 0);
assert.equal(workers[2].terminated, true);
console.log(`World tiles preserve ${checked} reference features; worker cancellation, failure, retry and teardown passed.`);
