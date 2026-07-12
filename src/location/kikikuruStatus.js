import { KIKIKURU_LEVELS } from "../config.js";
import { lngLatToTilePixel, loadTileImageData } from "./radarTimeline.js";

const KIKIKURU_SAMPLE_ZOOM = 10;
const TILE_SIZE = 256;
const COLOR_MATCH_LIMIT = 110;

export async function sampleCurrentKikikuruStatus(coordinates, kikikuru = {}, elementId = "land") {
  const [lng, lat] = coordinates ?? [];
  const tileUrl = kikikuru?.tileUrls?.[elementId];
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || !tileUrl) {
    return { status: "unavailable", elementId, label: "取得できません" };
  }

  const tile = lngLatToTilePixel(lng, lat, KIKIKURU_SAMPLE_ZOOM);
  const url = tileUrl
    .replace("{z}", String(KIKIKURU_SAMPLE_ZOOM))
    .replace("{x}", String(tile.x))
    .replace("{y}", String(tile.y));
  const imageData = await loadTileImageData(url);
  const level = sampleHighestKikikuruLevel(imageData, tile.pixelX, tile.pixelY);
  return {
    status: "ready",
    elementId,
    label: level?.label ?? "危険度なし",
    color: level?.color ?? "#7f91a8",
    rank: level?.rank ?? 0,
    latestTime: kikikuru.latestTime ?? ""
  };
}

function sampleHighestKikikuruLevel(imageData, pixelX, pixelY) {
  let highest = null;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const x = Math.max(0, Math.min(TILE_SIZE - 1, pixelX + offsetX));
      const y = Math.max(0, Math.min(TILE_SIZE - 1, pixelY + offsetY));
      const level = matchKikikuruPixel(imageData, x, y);
      if (level && (!highest || level.rank > highest.rank)) highest = level;
    }
  }
  return highest;
}

function matchKikikuruPixel(imageData, pixelX, pixelY) {
  const index = (pixelY * TILE_SIZE + pixelX) * 4;
  if (imageData.data[index + 3] < 24) return null;
  const color = {
    r: imageData.data[index],
    g: imageData.data[index + 1],
    b: imageData.data[index + 2]
  };
  const best = KIKIKURU_LEVELS.reduce((result, level, levelIndex) => {
    const target = hexToRgb(level.color);
    const distance = Math.hypot(color.r - target.r, color.g - target.g, color.b - target.b);
    if (result && result.distance <= distance) return result;
    return { ...level, rank: KIKIKURU_LEVELS.length - levelIndex, distance };
  }, null);
  return best && best.distance <= COLOR_MATCH_LIMIT ? best : null;
}

function hexToRgb(value) {
  const hex = String(value ?? "").replace("#", "");
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}
