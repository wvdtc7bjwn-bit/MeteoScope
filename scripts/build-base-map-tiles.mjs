import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { GeoJSONVT } from "@maplibre/geojson-vt";
import { fromGeojsonVt } from "@maplibre/vt-pbf";
import { WARNING_GEOMETRY_FIX_CODES } from "../src/map/warningGeometryFixCodes.js";

// Match MapLibre 5.24's GeoJSON tiler: 512px tile, 8192 extent,
// 128px buffer, 0.375px tolerance, maxZoom 18. No new simplification.
export const BASE_MAP_TILING = Object.freeze({ extent: 8192, buffer: 2048, tolerance: 6, maxZoom: 18, promoteId: "code" });
export function applyMunicipalityGeometryFixes(collection, fixes, expectedCodes = WARNING_GEOMETRY_FIX_CODES) {
  const expected = new Set(expectedCodes);
  const replacements = new Map();
  for (const feature of fixes.features ?? []) {
    const code = feature.properties?.code;
    if (typeof code !== "string" || !expected.has(code) || replacements.has(code)) throw new Error(`Invalid or duplicate municipality fix code: ${code}`);
    if (!["Polygon", "MultiPolygon"].includes(feature.geometry?.type)) throw new Error(`Invalid municipality fix geometry: ${code}`);
    replacements.set(code, feature.geometry);
  }
  if (replacements.size !== expected.size) throw new Error("Missing municipality geometry fixes");
  const applied = new Set();
  const features = collection.features.map(feature => {
    const code = feature.properties?.code;
    if (typeof code !== "string") throw new Error("Municipality codes must remain strings");
    if (!replacements.has(code)) return feature;
    if (applied.has(code)) throw new Error(`Duplicate municipality code: ${code}`);
    applied.add(code);
    // Preserve properties and the exact repaired polygons, including holes and
    // islands. No hulls, re-normalization or additional simplification.
    const { bbox, ...original } = feature;
    return { ...original, geometry: replacements.get(code) };
  });
  if (applied.size !== expected.size) throw new Error("A geometry fix has no matching municipality");
  return { ...collection, features };
}
// Git checkouts use different line endings on Windows and Linux. Newlines do
// not change JSON geometry, and must not change input hashes or tile URLs.
export function getBaseMapInputHash(text) {
  return createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");
}
export function getBaseMapBuildVersion(inputTexts, buildOptions) {
  const hash = createHash("sha256").update(JSON.stringify(buildOptions));
  for (const [name, text] of Object.entries(inputTexts)) hash.update(name).update("\0").update(text.replaceAll("\r\n", "\n")).update("\0");
  return hash.digest("hex").slice(0, 12);
}
export function createBaseMapIndexes(collections) {
  return Object.fromEntries(Object.entries(collections).map(([name, data]) => [name, new GeoJSONVT(data, BASE_MAP_TILING)]));
}
export function encodeBaseMapTile(indexes, z, x, y) {
  const layers = {};
  for (const [name, index] of Object.entries(indexes)) {
    const tile = index.getTile(z, x, y);
    if (tile?.features.length) layers[name] = tile;
  }
  return Object.keys(layers).length ? fromGeojsonVt(layers, { version: 2, extent: 8192 }) : null;
}
export async function buildBaseMapTiles() {
  const files = { municipalities: "jma-weather-warning-municipalities-map.geojson", prefectures: "japan-prefectures-map.geojson", municipalityFixes: "jma-weather-warning-municipality-fixes.geojson" };
  const collections = {};
  const inputTexts = {};
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const buildOptions = { format: 2, geometryFixCodes: WARNING_GEOMETRY_FIX_CODES, maxZoom: 10, tiling: BASE_MAP_TILING, encoders: [packageJson.devDependencies["@maplibre/geojson-vt"], packageJson.devDependencies["@maplibre/vt-pbf"]] };
  const inputHashes = {};
  for (const [name, file] of Object.entries(files)) {
    const text = await readFile(new URL(`../public/data/${file}`, import.meta.url), "utf8");
    inputTexts[name] = text;
    inputHashes[name] = getBaseMapInputHash(text);
    collections[name] = JSON.parse(text);
  }
  collections.municipalities = applyMunicipalityGeometryFixes(collections.municipalities, collections.municipalityFixes);
  delete collections.municipalityFixes;
  const version = getBaseMapBuildVersion(inputTexts, buildOptions);
  const root = new URL(`../public/data/base-map-tiles/${version}/`, import.meta.url);
  const indexes = createBaseMapIndexes(collections);
  const tiles = [];
  let totalBytes = 0;
  async function visit(z, x, y) {
    const bytes = encodeBaseMapTile(indexes, z, x, y);
    if (!bytes) return;
    const key = `${z}/${x}/${y}`;
    await mkdir(new URL(`${z}/${x}/`, root), { recursive: true });
    await writeFile(new URL(`${key}.pbf`, root), bytes);
    tiles.push(key);
    totalBytes += bytes.length;
    if (z < 10) for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) await visit(z + 1, x * 2 + dx, y * 2 + dy);
  }
  await visit(0, 0, 0);
  const manifest = { version, inputHashes, buildOptions, maxZoom: 10, layers: Object.keys(collections), tiles, totalBytes };
  await writeFile(new URL("../src/map/data/baseMapTileManifest.js", import.meta.url), `// Generated by npm run data:build:base-map-tiles.\nexport const baseMapTileManifest = ${JSON.stringify(manifest)};\n`);
  console.log(`Base map: ${tiles.length} tiles, ${(totalBytes / 1e6).toFixed(2)} MB, version ${version}`);
}
if (process.argv[1] && new URL(import.meta.url).pathname.toLowerCase().endsWith(process.argv[1].replaceAll("\\", "/").toLowerCase())) await buildBaseMapTiles();
