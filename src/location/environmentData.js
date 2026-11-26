import { APP_BASE_URL } from "../config.js";
import { ENVIRONMENT_MESHES } from "./environmentCoverage.generated.js";
import { decodeEnvironmentTile, environmentMeshPosition, sampleEnvironmentTile } from "./environmentMesh.js";

// One region is 64 KB uncompressed. No national data download on the device.
export function createEnvironmentReader({ fetcher = globalThis.fetch?.bind(globalThis), now = Date.now,
  maxTiles = 12, coverage = ENVIRONMENT_MESHES } = {}) {
  const cache = new Map(), flights = new Map(), queue = [];
  let active = 0;
  async function slot() { if (active < 2) { active++; return; } await new Promise(resolve => queue.push(resolve)); }
  function release() { const next = queue.shift(); if (next) next(); else active--; }
  function put(primary, value) {
    cache.delete(primary); cache.set(primary, { value, expires: now() + (value ? 24*3600000 : 15*60000) });
    while (cache.size > maxTiles) cache.delete(cache.keys().next().value);
  }
  async function tile(primary, signal) {
    if (!coverage.has(primary) || signal?.aborted) return null;
    const saved = cache.get(primary);
    if (saved?.expires > now()) { cache.delete(primary); cache.set(primary,saved); return saved.value; }
    const current = flights.get(primary);
    if (current && !current.signal?.aborted) return current.promise;
    const promise = (async () => {
      await slot();
      let value = null;
      const controller = new AbortController(), abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(abort,8000);
      try {
        if (signal?.aborted) return null;
        const url = `${APP_BASE_URL}data/temperature-environment/v1/${primary}.bin`;
        const response = await fetcher(url, { signal:controller.signal, cache:"force-cache", credentials:"omit" });
        if (!response.ok) throw Error(`Environment HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        if (!signal?.aborted) value = decodeEnvironmentTile(bytes,primary);
      } catch { /* Optional context has no retry loop; baseline estimation remains available. */ }
      finally { clearTimeout(timeout); signal?.removeEventListener("abort",abort); release(); }
      if (!signal?.aborted) put(primary,value);
      return value;
    })().finally(() => { if (flights.get(primary)?.promise === promise) flights.delete(primary); });
    flights.set(primary,{promise,signal});
    return promise;
  }
  return async (coordinates, { signal } = {}) => {
    const batch = new AbortController(), abort = () => batch.abort();
    signal?.addEventListener("abort",abort,{once:true});
    if (signal?.aborted) batch.abort();
    const timeout = setTimeout(abort,8000);
    try {
      const positions = coordinates.map(environmentMeshPosition);
      const primaries = [...new Set(positions.filter(Boolean).map(p=>p.primary))];
      const values = await Promise.all(primaries.map(async primary => [primary,await tile(primary,batch.signal)]));
      if (signal?.aborted) return coordinates.map(()=>null);
      // Timeout failures also back off; a user cancellation must not poison the cache.
      if (batch.signal.aborted) for (const [primary,value] of values) if (!value) put(primary,null);
      const tiles = new Map(values);
      return positions.map(position=>position?sampleEnvironmentTile(tiles.get(position.primary),position):null);
    } finally { clearTimeout(timeout);signal?.removeEventListener("abort",abort); }
  };
}
