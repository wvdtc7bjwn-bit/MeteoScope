import { APP_BASE_URL, JMA_ENDPOINTS } from "../config.js";
import { baseMapTileManifest as manifest } from "./data/baseMapTileManifest.js";

export const VECTOR_BASE_MAP_ENABLED = import.meta.env?.VITE_MAP_GEOMETRY === "vector";
export const BASE_MAP_PROTOCOL = "meteoscope-basemap";
const availableTiles = new Set(manifest.tiles);
const registered = new WeakSet();

export function createBaseMapTileLoader(fetcher = globalThis.fetch, origin = globalThis.location?.origin) {
  return async ({ url }, abortController) => {
    const match = /^meteoscope-basemap:\/\/tiles\/(\d+)\/(\d+)\/(\d+)\.pbf$/.exec(url);
    if (!match) throw new Error("Invalid base-map tile URL");
    const [, z, x, y] = match;
    const zoom = Number(z);
    if (zoom > manifest.maxZoom || Number(x) >= 2 ** zoom || Number(y) >= 2 ** zoom) throw new Error("Invalid base-map tile coordinates");
    const key = `${z}/${x}/${y}`;
    // Empty ocean tiles require no HTTP requests and must not produce 404s.
    if (!availableTiles.has(key)) return { data: new ArrayBuffer(0) };
    const target = new URL(`${APP_BASE_URL}data/base-map-tiles/${manifest.version}/${key}.pbf`, origin);
    const response = await fetcher(target.href, { signal: abortController?.signal, credentials: "same-origin" });
    if (!response.ok) throw new Error(`Base-map tile request failed: ${response.status}`);
    return { data: await response.arrayBuffer() };
  };
}
export function registerBaseMapProtocol(maplibre) {
  if (!VECTOR_BASE_MAP_ENABLED || registered.has(maplibre)) return;
  maplibre.addProtocol(BASE_MAP_PROTOCOL, createBaseMapTileLoader());
  registered.add(maplibre);
}
export function createMunicipalitySource(vector = VECTOR_BASE_MAP_ENABLED) {
  return vector ? {
    type: "vector", tiles: [`${BASE_MAP_PROTOCOL}://tiles/{z}/{x}/{y}.pbf`], minzoom: 0,
    maxzoom: manifest.maxZoom, promoteId: { municipalities: "code", prefectures: "code" }
  } : { type: "geojson", data: JMA_ENDPOINTS.warningMunicipalitiesMap, promoteId: "code" };
}
export function baseMapSourceLayer(name, vector = VECTOR_BASE_MAP_ENABLED) {
  return vector ? { "source-layer": name } : {};
}
export function municipalityStateTarget(areaCode, corrected, vector = VECTOR_BASE_MAP_ENABLED) {
  return {
    source: corrected ? "jma-weather-warning-municipality-fixes" : "jma-weather-warning-municipalities",
    ...(vector && !corrected ? { sourceLayer: "municipalities" } : {}), id: areaCode
  };
}
