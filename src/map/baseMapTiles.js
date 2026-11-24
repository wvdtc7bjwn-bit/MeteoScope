import { APP_BASE_URL, JMA_ENDPOINTS } from "../config.js";
import { baseMapTileManifest as manifest } from "./data/baseMapTileManifest.js";

export const VECTOR_BASE_MAP_ENABLED = import.meta.env?.VITE_MAP_GEOMETRY === "vector";
export const BASE_MAP_PROTOCOL = "meteoscope-basemap";
const availableTiles = new Set(manifest.tiles);
const registered = new WeakMap();
const MEMORY_BYTES = 4 * 1024 * 1024;
const MAX_PREFETCH_TILES = 6;

export function createBaseMapTileLoader(fetcher = globalThis.fetch, origin = globalThis.location?.origin, { memoryBytes = MEMORY_BYTES } = {}) {
  let firstRequest = true;
  let storedBytes = 0, prefetchController = null;
  const memory = new Map(), inFlight = new Map();
  const abortError = () => new DOMException("Base-map tile request aborted", "AbortError");
  function checkAbort(signal) { if (signal?.aborted) throw abortError(); }
  function remember(key, entry) {
    if (entry.data.byteLength > memoryBytes || /\b(?:no-store|no-cache)\b/iu.test(entry.cacheControl || "")) return;
    const old = memory.get(key);
    if (old) storedBytes -= old.data.byteLength;
    memory.delete(key); memory.set(key, entry); storedBytes += entry.data.byteLength;
    while (storedBytes > memoryBytes) {
      const oldest = memory.keys().next().value;
      storedBytes -= memory.get(oldest).data.byteLength; memory.delete(oldest);
    }
  }
  function obtain(key, signal) {
    checkAbort(signal);
    const cached = memory.get(key);
    if (cached) { memory.delete(key); memory.set(key, cached); return Promise.resolve(cached); }
    let flight = inFlight.get(key);
    if (!flight) {
      const controller = new AbortController();
      flight = { controller, users: new Set() };
      const current = flight;
      flight.promise = Promise.resolve().then(async () => {
        checkAbort(controller.signal);
        const target = new URL(`${APP_BASE_URL}data/base-map-tiles/${manifest.version}/${key}.pbf`, origin);
        const response = await fetcher(target.href, { signal: controller.signal, credentials: "same-origin" });
        if (!response.ok) {
          const error = new Error(`Base-map tile request failed: ${response.status}`);
          error.status = response.status; throw error;
        }
        const data = await response.arrayBuffer(); checkAbort(controller.signal);
        const entry = { data, cacheControl: response.headers?.get("cache-control") ?? undefined };
        remember(key, entry); return entry;
      }).finally(() => { if (inFlight.get(key) === current) inFlight.delete(key); });
      inFlight.set(key, flight);
    }
    const current = flight;
    return new Promise((resolve, reject) => {
      const user = {}; current.users.add(user);
      const cleanup = () => { current.users.delete(user); signal?.removeEventListener("abort", cancel); };
      const cancel = () => {
        cleanup(); reject(abortError());
        // A rendering request can join a prefetch. Cancelling background work
        // must not abort the tile that has just become visible.
        if (!current.users.size) {
          current.controller.abort();
          if (inFlight.get(key) === current) inFlight.delete(key);
        }
      };
      signal?.addEventListener("abort", cancel, { once: true });
      current.promise.then(entry => {
        if (!current.users.has(user)) return;
        cleanup(); resolve(entry);
      }, error => { if (current.users.has(user)) { cleanup(); reject(error); } });
    });
  }
  async function load({ url }, abortController) {
    const match = /^meteoscope-basemap:\/\/tiles\/(\d+)\/(\d+)\/(\d+)\.pbf$/.exec(url);
    if (!match) throw new Error("Invalid base-map tile URL");
    const [, z, x, y] = match;
    const zoom = Number(z);
    if (zoom > manifest.maxZoom || Number(x) >= 2 ** zoom || Number(y) >= 2 ** zoom) throw new Error("Invalid base-map tile coordinates");
    const key = `${z}/${x}/${y}`;
    // Empty ocean tiles require no HTTP requests and must not produce 404s.
    if (!availableTiles.has(key)) return { data: new ArrayBuffer(0) };
    if (firstRequest) { globalThis.performance?.mark("meteoscope:map:first-tile-request"); firstRequest = false; }
    const entry = await obtain(key, abortController?.signal);
    // MapLibre transfers the returned buffer. Retain an undetached cache copy.
    return { data: entry.data.slice(0), ...(entry.cacheControl ? { cacheControl: entry.cacheControl } : {}) };
  }
  load.cancelPrefetch = () => { prefetchController?.abort(); prefetchController = null; };
  load.prefetch = async (bounds, zoom) => {
    load.cancelPrefetch();
    const keys = planBaseMapPrefetch(bounds, zoom).filter(key => !memory.has(key) && !inFlight.has(key)).slice(0, MAX_PREFETCH_TILES);
    if (!keys.length) return;
    const controller = new AbortController(); prefetchController = controller;
    // Only two background requests; visible tiles never wait for this queue.
    await Promise.all([0, 1].map(async () => {
      while (keys.length && !controller.signal.aborted) {
        try { await obtain(keys.shift(), controller.signal); } catch { /* Optional prefetch must not surface an app error. */ }
      }
    }));
    if (prefetchController === controller) prefetchController = null;
  };
  return load;
}
export function registerBaseMapProtocol(maplibre) {
  if (!VECTOR_BASE_MAP_ENABLED) return null;
  if (registered.has(maplibre)) return registered.get(maplibre);
  const loader = createBaseMapTileLoader();
  maplibre.addProtocol(BASE_MAP_PROTOCOL, loader);
  registered.set(maplibre, loader);
  return loader;
}

export function planBaseMapPrefetch(bounds, zoom) {
  if (!bounds || !Number.isFinite(zoom)) return [];
  const [west, south, east, north] = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
  if (![west, south, east, north].every(Number.isFinite) || east <= west || east - west >= 360 || north < south) return [];
  const z = Math.max(0, Math.min(manifest.maxZoom, Math.floor(zoom))), n = 2 ** z;
  const tileX = lng => Math.floor((lng + 180) / 360 * n);
  const tileY = lat => Math.max(0, Math.min(n - 1, Math.floor((1 - Math.asinh(Math.tan(Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180)) / Math.PI) / 2 * n)));
  const left = tileX(west), right = tileX(east), top = tileY(north), bottom = tileY(south);
  if (right - left > 32 || bottom - top > 32) return [];
  const keys = new Map(), centerX = (left + right) / 2, centerY = (top + bottom) / 2;
  for (let x = left - 1; x <= right + 1; x++) for (let y = Math.max(0, top - 1); y <= Math.min(n - 1, bottom + 1); y++) {
    if (x >= left && x <= right && y >= top && y <= bottom) continue;
    const key = `${z}/${((x % n) + n) % n}/${y}`;
    if (availableTiles.has(key)) keys.set(key, (x - centerX) ** 2 + (y - centerY) ** 2);
  }
  return [...keys].sort((a, b) => a[1] - b[1]).map(([key]) => key);
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
    source: corrected && !vector ? "jma-weather-warning-municipality-fixes" : "jma-weather-warning-municipalities",
    ...(vector ? { sourceLayer: "municipalities" } : {}), id: areaCode
  };
}
