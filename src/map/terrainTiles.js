import { MAP_DATA_ENDPOINTS } from "../config.js";

export const TERRAIN_TILE_PROTOCOL = "meteoscope-terrain";
export const TERRAIN_TILE_CACHE_NAME = "meteoscope-terrain-v1";
export const TERRAIN_TILE_CACHE_LIMITS = Object.freeze({
  memoryBytes: 8 * 1024 * 1024,
  persistentBytes: 32 * 1024 * 1024,
  persistentEntries: 512,
  queuedBytes: 8 * 1024 * 1024,
  tileBytes: 512 * 1024,
  maxAgeMs: 24 * 60 * 60 * 1000
});
const registered = new WeakMap();
export const JAPAN_TERRAIN_BOUNDS = Object.freeze([122, 20, 154, 46]);
export const TERRAIN_PREFETCH_LIMIT = 12;

export function getTerrainBoundaryPaint(visible, theme, defaultColor) {
  return {
    "line-color": visible ? (theme === "light" ? "#4a6173" : "#303c49") : defaultColor,
    "line-width": visible ? ["interpolate", ["linear"], ["zoom"], 4, 0.8, 7, 1.1, 10, 1.4]
      : ["interpolate", ["linear"], ["zoom"], 4, 1.45, 7, 2, 10, 2.8],
    "line-opacity": visible ? 0.95 : ["interpolate", ["linear"], ["zoom"], 4, 0.72, 7, 0.82, 10, 0.9]
  };
}

// Match the combined relief + hillshade coverage in Japan. Global hillshade
// has a much darker tonal range, so normalize it without modifying tile bytes.
export function getGlobalTerrainPaint(opacity) {
  const shadeOpacity = Math.min(0.52, opacity * 0.72);
  return {
    "raster-opacity": 1 - (1 - opacity) * (1 - shadeOpacity),
    "raster-brightness-min": 0.5,
    "raster-brightness-max": 0.7,
    "raster-fade-duration": 0
  };
}
const tileSets = {
  relief: { template: MAP_DATA_ENDPOINTS.gsiReliefTiles, minZoom: 5, maxZoom: 15, bounds: JAPAN_TERRAIN_BOUNDS },
  hillshademap: { template: MAP_DATA_ENDPOINTS.gsiHillshadeTiles, minZoom: 2, maxZoom: 16, bounds: JAPAN_TERRAIN_BOUNDS },
  earthhillshade: { template: MAP_DATA_ENDPOINTS.gsiEarthHillshadeTiles, minZoom: 0, maxZoom: 8 }
};

export function terrainTileTemplate(kind) {
  if (!tileSets[kind]) throw new Error("Unknown terrain tile set");
  return `${TERRAIN_TILE_PROTOCOL}://${kind}/{z}/{x}/{y}.png`;
}

function resolveTile(url) {
  const match = /^meteoscope-terrain:\/\/(relief|hillshademap|earthhillshade)\/(\d+)\/(\d+)\/(\d+)\.png$/u.exec(url);
  if (!match) throw new Error("Invalid terrain tile URL");
  const [, kind, z, x, y] = match, set = tileSets[kind], zoom = Number(z);
  if (zoom < set.minZoom || zoom > set.maxZoom || Number(x) >= 2 ** zoom || Number(y) >= 2 ** zoom) throw new Error("Invalid terrain tile coordinates");
  return set.template.replace("{z}", z).replace("{x}", x).replace("{y}", y);
}

// One ring around the current raster LOD, ordered nearest first. Wrapped X
// coordinates share cache keys at the date line; polar Y coordinates never wrap.
export function planTerrainTilePrefetch(bounds, zoom, coverage = "auto") {
  if (!bounds || !Number.isFinite(zoom)) return [];
  let [west, south, east, north] = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
  if (![west, south, east, north].every(Number.isFinite) || north < south) return [];
  if (east < west) east += 360;
  if (east <= west || east - west > 360) return [];
  const queues = Object.entries(tileSets).filter(([kind]) => coverage === "japan" ? kind !== "earthhillshade"
    : coverage === "global" ? kind === "earthhillshade" : true).map(([kind, set]) => {
    // Raster sources round their 512/256 tile-size-adjusted zoom in MapLibre.
    const z = kind === "relief" && zoom < 3.5 ? 5 : Math.max(set.minZoom, Math.min(set.maxZoom, Math.round(zoom + 1)));
    const n = 2 ** z;
    const xFor = lng => Math.floor((lng + 180) / 360 * n);
    const yFor = lat => Math.max(0, Math.min(n - 1, Math.floor((1 - Math.asinh(Math.tan(Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180)) / Math.PI) / 2 * n)));
    const latFor = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
    const left = xFor(west), right = xFor(east), top = yFor(north), bottom = yFor(south);
    if (right - left > 64 || bottom - top > 64) return [];
    const centerX = (left + right) / 2, centerY = (top + bottom) / 2;
    const candidates = new Map();
    for (let x = left - 1; x <= right + 1; x++) for (let y = Math.max(0, top - 1); y <= Math.min(n - 1, bottom + 1); y++) {
      const wrappedX = ((x % n) + n) % n;
      // The viewport itself is already being loaded by the renderer.
      if (y >= top && y <= bottom && (right - left >= n - 1 || (x >= left && x <= right))) continue;
      if (set.bounds) {
        const [w, s, e, northLimit] = set.bounds;
        if ((wrappedX + 1) / n * 360 - 180 <= w || wrappedX / n * 360 - 180 >= e
          || latFor(y) <= s || latFor(y + 1) >= northLimit) continue;
      }
      const url = `${TERRAIN_TILE_PROTOCOL}://${kind}/${z}/${wrappedX}/${y}.png`;
      const distance = (x - centerX) ** 2 + (y - centerY) ** 2;
      candidates.set(url, Math.min(candidates.get(url) ?? Infinity, distance));
    }
    return [...candidates].sort((a, b) => a[1] - b[1]).map(([url]) => url);
  });
  const result = [];
  while (queues.some(queue => queue.length) && result.length < TERRAIN_PREFETCH_LIMIT) {
    for (const queue of queues) if (queue.length && result.length < TERRAIN_PREFETCH_LIMIT) result.push(queue.shift());
  }
  return result;
}

function abortError() { return new DOMException("Terrain tile request aborted", "AbortError"); }
function checkAbort(signal) { if (signal?.aborted) throw abortError(); }
function isPng(data) {
  return data.byteLength >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => new Uint8Array(data)[i] === value);
}
function expiryTime(headers, now, maximum) {
  const control = headers.get("cache-control") || "";
  if (/\b(?:no-store|no-cache)\b/iu.test(control)) return now;
  const maxAge = /(?:^|,)\s*max-age\s*=\s*"?(\d+)/iu.exec(control);
  const expires = Date.parse(headers.get("expires") || "");
  const age = Math.max(0, Number(headers.get("age")) || 0);
  const lifetime = maxAge ? Math.max(0, Number(maxAge[1]) - age) * 1000
    : Number.isFinite(expires) ? Math.max(0, expires - now) : maximum;
  return now + Math.min(maximum, lifetime);
}

/** Cache original PNG bytes, not resized/re-encoded images or permanent GPU textures. */
export function createTerrainTileLoader({ fetcher = globalThis.fetch?.bind(globalThis), cacheStorage, now = () => Date.now(), limits = {} } = {}) {
  const cap = { ...TERRAIN_TILE_CACHE_LIMITS, ...limits };
  const memory = new Map(), inFlight = new Map(), diskIndex = new Map();
  let memoryBytes = 0, diskBytes = 0, diskPromise, indexPromise, writes = Promise.resolve(), queuedBytes = 0;
  let prefetchController = null;
  if (cacheStorage === undefined) { try { cacheStorage = globalThis.caches; } catch { cacheStorage = null; } }

  function remember(url, entry) {
    if (entry.expires <= now() || entry.data.byteLength > cap.tileBytes || entry.data.byteLength > cap.memoryBytes) return;
    const old = memory.get(url);
    if (old) memoryBytes -= old.data.byteLength;
    memory.delete(url); memory.set(url, entry); memoryBytes += entry.data.byteLength;
    while (memoryBytes > cap.memoryBytes) {
      const key = memory.keys().next().value;
      memoryBytes -= memory.get(key).data.byteLength; memory.delete(key);
    }
  }

  async function openDisk() {
    if (!cacheStorage?.open) return null;
    diskPromise ??= cacheStorage.open(TERRAIN_TILE_CACHE_NAME).catch(() => null);
    const cache = await diskPromise;
    if (cache && !indexPromise) indexPromise = (async () => {
      // Once per page, read only metadata. Rendering does not wait for this scan.
      for (const key of await cache.keys()) {
        const response = await cache.match(key);
        const size = Number(response?.headers.get("x-meteoscope-bytes"));
        const expires = Number(response?.headers.get("x-meteoscope-expires"));
        if (!response || !Number.isFinite(size) || size <= 0 || size > cap.tileBytes || !Number.isFinite(expires) || expires <= now()) { await cache.delete(key); continue; }
        diskIndex.set(key.url, size); diskBytes += size;
      }
      await trimDisk(cache);
    })().catch(() => { diskIndex.clear(); diskBytes = 0; });
    return cache;
  }
  async function trimDisk(cache) {
    while (diskIndex.size > cap.persistentEntries || diskBytes > cap.persistentBytes) {
      const key = diskIndex.keys().next().value;
      diskBytes -= diskIndex.get(key); diskIndex.delete(key); await cache.delete(key);
    }
  }
  function persist(url, entry) {
    // Bound queued bytes as well as stored bytes on slow/denied storage.
    if (entry.expires <= now() || entry.data.byteLength > cap.tileBytes || queuedBytes + entry.data.byteLength > cap.queuedBytes) return;
    queuedBytes += entry.data.byteLength;
    writes = writes.then(async () => {
      const cache = await openDisk(); if (!cache) return;
      await indexPromise;
      await cache.put(url, new Response(entry.data.slice(0), { headers: {
        "content-type": "image/png", "x-meteoscope-bytes": String(entry.data.byteLength), "x-meteoscope-expires": String(entry.expires)
      } }));
      diskBytes -= diskIndex.get(url) || 0; diskIndex.delete(url);
      diskIndex.set(url, entry.data.byteLength); diskBytes += entry.data.byteLength;
      await trimDisk(cache);
    }).catch(() => { /* Quota/privacy failures must not hide a valid tile. */ }).finally(() => { queuedBytes -= entry.data.byteLength; });
  }

  async function obtain(url, signal) {
    checkAbort(signal);
    const cached = memory.get(url);
    if (cached) {
      if (cached.expires > now()) { memory.delete(url); memory.set(url, cached); return cached; }
      memoryBytes -= cached.data.byteLength; memory.delete(url);
    }
    try {
      const cache = await openDisk();
      const response = await cache?.match(url); checkAbort(signal);
      const expires = Number(response?.headers.get("x-meteoscope-expires"));
      if (response && Number.isFinite(expires) && expires > now()) {
        const data = await response.arrayBuffer(); checkAbort(signal);
        if (data.byteLength <= cap.tileBytes && isPng(data)) {
          const entry = { data, expires }; remember(url, entry); return entry;
        }
      }
    } catch (error) { if (signal.aborted) throw abortError(); }
    checkAbort(signal);
    const response = await fetcher(url, { signal, credentials: "omit" });
    if (!response.ok) {
      // MapLibre uses status === 404 to seek a drawable parent tile. Preserve
      // HTTP failures instead of turning missing tiles into generic errors.
      const error = new Error(`Terrain tile request failed: ${response.status}`);
      error.status = response.status;
      error.url = url;
      throw error;
    }
    const data = await response.arrayBuffer(); checkAbort(signal);
    if (!isPng(data)) throw new Error("Invalid terrain PNG response");
    const entry = { data, expires: expiryTime(response.headers, now(), cap.maxAgeMs) };
    remember(url, entry); persist(url, entry); return entry;
  }

  function load({ url }, abortController) {
    const target = resolveTile(url), signal = abortController?.signal;
    checkAbort(signal);
    let flight = inFlight.get(target);
    if (!flight) {
      const controller = new AbortController();
      flight = { controller, users: new Set(), promise: null };
      const current = flight;
      flight.promise = Promise.resolve().then(() => obtain(target, controller.signal)).finally(() => {
        if (inFlight.get(target) === current) inFlight.delete(target);
      });
      inFlight.set(target, flight);
    }
    const current = flight;
    return new Promise((resolve, reject) => {
      const user = {}; current.users.add(user);
      const cleanup = () => { signal?.removeEventListener("abort", cancel); current.users.delete(user); };
      const cancel = () => {
        cleanup(); reject(abortError());
        if (!current.users.size) {
          current.controller.abort();
          if (inFlight.get(target) === current) inFlight.delete(target);
        }
      };
      signal?.addEventListener("abort", cancel, { once: true });
      current.promise.then(entry => {
        if (!current.users.has(user)) return;
        cleanup();
        // The renderer may transfer/detach its buffer. Keep the cached copy intact.
        resolve({ data: entry.data.slice(0), ...(entry.expires > now() ? { expires: new Date(entry.expires).toUTCString() } : {}) });
      }, error => { if (current.users.has(user)) { cleanup(); reject(error); } });
    });
  }
  load.cancelPrefetch = () => { prefetchController?.abort(); prefetchController = null; };
  load.prefetch = async (bounds, zoom, coverage = "auto") => {
    load.cancelPrefetch();
    const urls = planTerrainTilePrefetch(bounds, zoom, coverage).filter(url => {
      const target = resolveTile(url);
      return !inFlight.has(target) && !(memory.get(target)?.expires > now());
    });
    if (!urls.length) return;
    const controller = new AbortController();
    prefetchController = controller;
    await Promise.all([0, 1].map(async () => {
      while (urls.length && !controller.signal.aborted) {
        try {
          const request = {url:urls.shift()};
          const data = await load(request, controller);
        }
        catch { /* Optional background tiles must not interrupt the map. */ }
      }
    }));
    if (prefetchController === controller) prefetchController = null;
  };
  load.flushPendingWrites = () => writes;
  return load;
}

export function registerTerrainTileProtocol(maplibre) {
  if (registered.has(maplibre)) return registered.get(maplibre);
  const loader = createTerrainTileLoader();
  maplibre.addProtocol(TERRAIN_TILE_PROTOCOL, loader);
  registered.set(maplibre, loader);
  return loader;
}
