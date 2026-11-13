import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { createHash } from "node:crypto";
import { createBaseMapIndexes } from "../scripts/build-base-map-tiles.mjs";
import { baseMapTileManifest as manifest } from "../src/map/data/baseMapTileManifest.js";
import { createMunicipalitySource, baseMapSourceLayer, municipalityStateTarget, createBaseMapTileLoader } from "../src/map/baseMapTiles.js";

assert.equal(createMunicipalitySource(false).type, "geojson");
const vector = createMunicipalitySource(true);
assert.equal(vector.type, "vector");
assert.equal(vector.maxzoom, 10);
assert.equal(vector.promoteId.municipalities, "code");
assert.deepEqual(baseMapSourceLayer("municipalities", true), { "source-layer": "municipalities" });
assert.deepEqual(baseMapSourceLayer("municipalities", false), {});
assert.deepEqual(municipalityStateTarget("0510000", false, true), { source: "jma-weather-warning-municipalities", sourceLayer: "municipalities", id: "0510000" });
assert.deepEqual(municipalityStateTarget("2736600", true, true), municipalityStateTarget("2736600", true, false));
let calls = [];
const loader = createBaseMapTileLoader(async (url, options) => { calls.push({ url, options }); return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2]).buffer }; }, "http://localhost");
await loader({ url: "meteoscope-basemap://tiles/0/0/0.pbf" }, new AbortController());
assert.match(calls[0].url, new RegExp(`/data/base-map-tiles/${manifest.version}/0/0/0.pbf$`));
assert.ok(calls[0].options.signal instanceof AbortSignal);
const empty = await loader({ url: "meteoscope-basemap://tiles/10/0/0.pbf" });
assert.equal(empty.data.byteLength, 0);
assert.equal(calls.length, 1, "Ocean tiles must not cause requests or 404s");
await assert.rejects(loader({ url: "https://other.test/0/0/0.pbf" }));
await assert.rejects(loader({ url: "meteoscope-basemap://tiles/11/0/0.pbf" }));
await assert.rejects(createBaseMapTileLoader(async () => ({ ok: false, status: 503 }), "http://localhost")({ url: "meteoscope-basemap://tiles/0/0/0.pbf" }), /503/);

const collections = {};
for (const [name, path] of Object.entries({ municipalities: "jma-weather-warning-municipalities-map.geojson", prefectures: "japan-prefectures-map.geojson" })) {
  const text = await readFile(new URL(`../public/data/${path}`, import.meta.url), "utf8");
  assert.equal(createHash("sha256").update(text).digest("hex"), manifest.inputHashes[name], "Regenerate tiles after a source geometry update");
  collections[name] = JSON.parse(text);
}
const sizes = await Promise.all(manifest.tiles.map(key => stat(new URL(`../public/data/base-map-tiles/${manifest.version}/${key}.pbf`, import.meta.url))));
assert.equal(sizes.reduce((total, file) => total + file.size, 0), manifest.totalBytes);
const indexes = createBaseMapIndexes(collections);
const keys = [...manifest.tiles.filter(key => key.startsWith("5/")).slice(0, 8), ...manifest.tiles.filter(key => key.startsWith("10/")).slice(-8)];
let checked = 0;
for (const key of keys) {
  const [z, x, y] = key.split("/").map(Number);
  const bytes = await readFile(new URL(`../public/data/base-map-tiles/${manifest.version}/${key}.pbf`, import.meta.url));
  const decoded = new VectorTile(new Pbf(bytes));
  for (const [name, index] of Object.entries(indexes)) {
    const original = index.getTile(z, x, y);
    if (!original?.features.length) { assert.equal(decoded.layers[name], undefined); continue; }
    const layer = decoded.layers[name];
    assert.equal(layer.extent, 8192);
    assert.equal(layer.length, original.features.length);
    for (let n = 0; n < layer.length; n++) {
      const feature = layer.feature(n);
      assert.deepEqual({ ...feature.properties }, original.features[n].tags);
      assert.equal(typeof feature.properties.code, "string", "Preserve leading-zero municipality IDs");
      const geometry = feature.loadGeometry().map(ring => ring.map(({ x, y }) => [x, y]));
      assert.deepEqual(geometry, JSON.parse(JSON.stringify(original.features[n].geometry)), `${key}/${name} geometry must match the existing tiler`);
      checked++;
    }
  }
}
assert.ok(checked > 0);
assert.equal(new Set(manifest.tiles).size, manifest.tiles.length);
console.log(`Base-map tile compatibility: ${checked} features checked`);

// Pages concatenates matching headers. Detach the generic data policy first.
const headers = await readFile(new URL("../public/_headers", import.meta.url), "utf8");
assert.ok(headers.indexOf("/data/*") < headers.indexOf("/data/base-map-tiles/*"));
assert.match(headers, /\/data\/base-map-tiles\/\*\s*\n  ! Cache-Control\s*\n  Cache-Control: public, max-age=31536000, immutable/);
