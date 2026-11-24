import { GeoJSONVT } from "@maplibre/geojson-vt";
import { fromGeojsonVt } from "@maplibre/vt-pbf";
import { prepareWorldMapData } from "./worldLandFilter.js";

// Match MapLibre's existing 512px GeoJSON source exactly. Do not simplify or
// round the source coordinates again when moving the work off the UI thread.
export const WORLD_TILE_OPTIONS = Object.freeze({ extent: 8192, buffer: 2048, tolerance: 6, maxZoom: 18 });

export function createWorldTileIndex(collection) {
  return new GeoJSONVT(prepareWorldMapData(collection), WORLD_TILE_OPTIONS);
}

export function encodeWorldTile(index, z, x, y) {
  const tile = index.getTile(z, x, y);
  if (!tile?.features.length) return new ArrayBuffer(0);
  const bytes = fromGeojsonVt({ land: tile }, { version: 2, extent: WORLD_TILE_OPTIONS.extent });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
