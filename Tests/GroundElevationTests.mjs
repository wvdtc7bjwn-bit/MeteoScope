import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeElevationPixel, elevationTilePosition, createGroundElevationReader } from "../src/location/groundElevation.js";
import { buildLandConnectionChecker } from "../src/location/currentLocation.js";
import { planTerrainTilePrefetch, createTerrainTileLoader } from "../src/map/terrainTiles.js";

test("official signed RGB formula, missing sentinel, zero and negative heights", () => {
  assert.equal(decodeElevationPixel(0, 0, 0), 0); assert.equal(decodeElevationPixel(0, 9, 216), 25.2);
  assert.equal(decodeElevationPixel(255, 255, 156), -1); assert.equal(decodeElevationPixel(128, 0, 0), null);
  assert.equal(decodeElevationPixel(0, 1, 0, 0), null);
  assert.equal(elevationTilePosition([140.08531, 36.103543]).url, "meteoscope-terrain://dem/14/14567/6427.png");
  assert.equal(elevationTilePosition([0, 0]), null);
});
test("one flight, 100m anchor reuse, bounded fallback and failure cooldown", async () => {
  let calls = 0, time = 0;
  const read = createGroundElevationReader({ loader: async () => { calls++; await Promise.resolve(); return { data: new ArrayBuffer(1) }; }, readPixel: async () => 25.2, now: () => time });
  const coordinates = [140.08531, 36.103543];
  const [a, b] = await Promise.all([read(coordinates), read(coordinates)]); assert.equal(calls, 1); assert.deepEqual(a, b);
  await read([coordinates[0] + .0001, coordinates[1]]); assert.equal(calls, 1);
  await read([coordinates[0] + .002, coordinates[1]]); assert.equal(calls, 2);
  let fails = 0;
  const failed = createGroundElevationReader({ loader: async () => { fails++; throw Error("offline"); }, now: () => time });
  assert.equal(await failed(coordinates), null); assert.equal(fails, 2); await failed(coordinates); assert.equal(fails, 2);
  time += 16 * 60000; await failed(coordinates); assert.equal(fails, 4);
});
test("shared terrain transport resolves only public tile coordinates; map prefetch excludes DEM", async () => {
  const requests = [];
  const loader = createTerrainTileLoader({ cacheStorage: null, fetcher: async url => { requests.push(url); return new Response(new Uint8Array([137,80,78,71,13,10,26,10,1])); } });
  await loader({ url: elevationTilePosition([140.08531, 36.103543]).url }, new AbortController());
  assert.match(requests[0], /^https:\/\/cyberjapandata.gsi.go.jp\/xyz\/dem_png\/14\/\d+\/\d+.png$/);
  const bounds = { getWest: () => 135, getEast: () => 136, getSouth: () => 35, getNorth: () => 36 };
  assert.ok(planTerrainTilePrefetch(bounds, 7).every(url => !url.includes("//dem/")));
});
test("turning the feature off aborts elevation I/O without a parent retry or failure-cache entry", async () => {
  let calls = 0;
  const loader = async (request, controller) => {
    calls++;
    if (calls > 1) return { data: new ArrayBuffer(1) };
    return new Promise((resolve, reject) => controller.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
  };
  const read = createGroundElevationReader({ loader, readPixel: async () => 12 });
  const signal = new AbortController(); const first = read([140,36], { signal: signal.signal });
  signal.abort(); await assert.rejects(first, { name: "AbortError" }); assert.equal(calls, 1);
  assert.equal((await read([140,36])).elevation, 12); assert.equal(calls, 2);
});
test("land screen rejects a water crossing and returns unknown for an unmapped coast", () => {
  const polygon = (w, e) => ({ bounds: { minLng: w, maxLng: e, minLat: 34, maxLat: 36 }, geometry: { type: "Polygon", coordinates: [[[w,34],[e,34],[e,36],[w,36],[w,34]]] } });
  const check = buildLandConnectionChecker([polygon(134, 135), polygon(135.1, 136)]);
  assert.equal(check([134.8,35],[134.9,35]), true);
  assert.equal(check([134.9,35],[135.2,35]), false);
  assert.equal(check([135.05,35],[135.2,35]), null);
});
