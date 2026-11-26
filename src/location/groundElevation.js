import { getTerrainTileLoader } from "../map/terrainTiles.js";
import { getDistanceKm } from "./distance.js";
import { TEMPERATURE_ESTIMATION } from "./temperatureEstimationPolicy.js";
import { readPngPixel as readPixelBytes } from "../utils/pngPixel.js";

export function decodeElevationPixel(r, g, b, alpha = 255) {
  if (!alpha || (r === 128 && g === 0 && b === 0)) return null;
  const value = r * 65536 + g * 256 + b;
  return (value < 8388608 ? value : value - 16777216) * .01;
}

export function elevationTilePosition([longitude, latitude], zoom = 14) {
  if (![longitude, latitude].every(Number.isFinite) || longitude < 122 || longitude > 154 || latitude < 20 || latitude > 46) return null;
  const scale = 2 ** zoom, radians = latitude * Math.PI / 180;
  const x = (longitude + 180) / 360 * scale;
  const y = (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * scale;
  return { url: `meteoscope-terrain://dem/${zoom}/${Math.floor(x)}/${Math.floor(y)}.png`,
    x: Math.min(255, Math.floor((x % 1) * 256)), y: Math.min(255, Math.floor((y % 1) * 256)) };
}

async function readPngPixel(data, x, y) {
  return decodeElevationPixel(...await readPixelBytes(data, x, y, 256));
}

// Keep only a few location anchors in memory; disk holds shared tile bytes, never GPS coordinates.
export function createGroundElevationReader({ loader, readPixel = readPngPixel, now = Date.now } = {}) {
  const anchors = [], flights = new Map();
  return async function read(coordinates, { signal } = {}) {
    if (signal?.aborted) throw new DOMException("Elevation request aborted", "AbortError");
    const tile = elevationTilePosition(coordinates ?? []);
    if (!tile) return null;
    const cached = anchors.find(entry => entry.expires > now() && getDistanceKm(entry.coordinates, coordinates) < TEMPERATURE_ESTIMATION.elevationMoveKm);
    if (cached) return cached.value;
    const key = `${tile.url}/${tile.x}/${tile.y}`;
    const active = flights.get(key);
    if (active && !active.signal?.aborted) return active.request;
    const request = (async () => {
      let value = null;
      try {
        const tiles = loader ?? getTerrainTileLoader();
        // One parent fallback covers a missing high-resolution tile. No service retries.
        for (const zoom of [14, 12]) {
          if (signal?.aborted) throw new DOMException("Elevation request aborted", "AbortError");
          const position = elevationTilePosition(coordinates, zoom);
          const controller = new AbortController();
          const abort = () => controller.abort();
          signal?.addEventListener("abort", abort, { once: true });
          const timeout = setTimeout(() => controller.abort(), 8000);
          try {
            const result = await tiles({ url: position.url }, controller);
            const height = await readPixel(result.data, position.x, position.y);
            if (typeof height === "number" && Number.isFinite(height)) { value = { elevation: height, source: "gsi-dem", zoom }; break; }
          } catch { /* Optional elevation must never interrupt the summary. */ }
          finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
        }
      } finally {
        if (!signal?.aborted) {
          anchors.unshift({ coordinates: [...coordinates], value, expires: now() + (value ? 24 * 60 * 60 * 1000 : TEMPERATURE_ESTIMATION.failureTtlMs) });
          anchors.splice(8);
        }
      }
      return value;
    })().finally(() => { if (flights.get(key)?.request === request) flights.delete(key); });
    flights.set(key, { request, signal });
    return request;
  };
}
