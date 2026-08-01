import {
  lngLatToTilePixel,
  loadTileImageData,
  rgbColorDistance,
  selectLatestObservationFrame
} from "./radarTimeline.js";

const LIGHTNING_SAMPLE_ZOOM = 8;
const TILE_SIZE = 256;
const COLOR_DISTANCE_LIMIT = 90;

// Official JMA Lightning Nowcast legend colors, activity 4 to 1.
export const LIGHTNING_ACTIVITY_COLORS = [
  { level: 4, color: { r: 200, g: 0, b: 255 } },
  { level: 3, color: { r: 255, g: 40, b: 0 } },
  { level: 2, color: { r: 255, g: 170, b: 0 } },
  { level: 1, color: { r: 255, g: 245, b: 0 } }
];

export async function sampleLightningAtLocation(coordinates, lightningData = {}) {
  const [lng, lat] = Array.isArray(coordinates) ? coordinates.map(Number) : [];
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return { status: "unavailable", level: null, time: "" };
  }

  const frame = selectLatestObservationFrame(lightningData);
  const tileUrl = frame?.lightningTileUrl;
  if (!tileUrl) {
    return { status: "unavailable", level: null, time: frame?.label ?? "" };
  }

  const tile = lngLatToTilePixel(lng, lat, LIGHTNING_SAMPLE_ZOOM);
  const url = tileUrl
    .replace("{z}", String(LIGHTNING_SAMPLE_ZOOM))
    .replace("{x}", String(tile.x))
    .replace("{y}", String(tile.y));
  const imageData = await loadTileImageData(url);
  const index = (tile.pixelY * TILE_SIZE + tile.pixelX) * 4;
  const level = classifyLightningActivityColor({
    r: imageData.data[index],
    g: imageData.data[index + 1],
    b: imageData.data[index + 2],
    a: imageData.data[index + 3]
  });

  return {
    status: "ready",
    level,
    time: frame.label ?? ""
  };
}

export function classifyLightningActivityColor(color = {}) {
  if (Number(color.a) < 24) return 0;
  const best = LIGHTNING_ACTIVITY_COLORS.reduce((nearest, candidate) => {
    const distance = rgbColorDistance(color, candidate.color);
    return !nearest || distance < nearest.distance ? { ...candidate, distance } : nearest;
  }, null);
  return best && best.distance <= COLOR_DISTANCE_LIMIT ? best.level : 0;
}
