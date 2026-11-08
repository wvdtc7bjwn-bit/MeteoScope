import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { worldCountriesGeoJson } from "../src/map/data/worldCountriesGeoJson.js";
import { decodeWorldGeometry } from "../src/map/packedWorldGeometry.js";
import { packWorldGeometry } from "../scripts/lib/pack-world-geometry.mjs";

const original = JSON.stringify(worldCountriesGeoJson);
// Snapshot before packing: every coordinate, ring, country and property must survive.
assert.equal(createHash("sha256").update(original).digest("hex"),
  "92273473b836bf820cf6d6a1fd620a302b07ca83b163ab82726f87976f018fa0");
const packed = packWorldGeometry(worldCountriesGeoJson);
assert.deepEqual(decodeWorldGeometry(packed), worldCountriesGeoJson);
assert.throws(() => decodeWorldGeometry({ ...packed, coordinates: packed.coordinates.slice(0, -4) }));
const before = gzipSync(original).length;
const after = gzipSync(JSON.stringify(packed)).length;
assert.ok(after < before * 0.8, "packing must materially reduce transferred bytes");
console.log(`World geometry verified losslessly; gzip ${before} -> ${after} bytes`);
