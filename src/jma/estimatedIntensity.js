import { getEarthquakeIntensityColor, JMA_ENDPOINTS } from "../config.js";
import { fetchJson } from "./jmaClient.js";

const MATCH_TIME_TOLERANCE_MS = 2 * 60 * 1000;
const MATCH_COORDINATE_TOLERANCE_DEGREES = 0.35;
const RECOLORED_IMAGE_URL_CACHE = new Map();
const JMA_ESTIMATED_INTENSITY_PALETTE = [
  { source: [250, 231, 151], target: getEarthquakeIntensityColor("4") },
  { source: [255, 231, 0], target: getEarthquakeIntensityColor("5-") },
  { source: [255, 154, 0], target: getEarthquakeIntensityColor("5+") },
  { source: [255, 35, 0], target: getEarthquakeIntensityColor("6-") },
  { source: [166, 0, 27], target: getEarthquakeIntensityColor("6+") },
  { source: [181, 0, 104], target: getEarthquakeIntensityColor("7") }
].map((entry) => ({
  ...entry,
  targetRgb: hexToRgb(entry.target)
}));

export async function fetchEstimatedIntensityCatalog() {
  return fetchJson(JMA_ENDPOINTS.estimatedIntensityList, {
    ttlMs: 60 * 1000,
    cache: "no-store",
    validate: Array.isArray
  });
}

export function attachEstimatedIntensityData(earthquakes, catalog) {
  const normalizedCatalog = (catalog ?? [])
    .map(normalizeEstimatedIntensityRecord)
    .filter(Boolean);
  return (earthquakes ?? []).map((earthquake) => {
    const estimatedIntensity = matchEstimatedIntensityRecord(earthquake, normalizedCatalog);
    return estimatedIntensity ? { ...earthquake, estimatedIntensity } : earthquake;
  });
}

export function normalizeEstimatedIntensityRecord(record) {
  if (record?.sourceType === "jma-public-json-png"
    && Array.isArray(record.images)
    && record.images.length > 0) {
    return record;
  }
  const eventDirectory = String(record?.url ?? "").trim();
  const meshes = Array.isArray(record?.mesh_num) ? record.mesh_num : [];
  const bounds = normalizeBounds(record?.bounds);
  if (!eventDirectory || !bounds || meshes.length === 0) return null;

  const datum = Number(record?.datum) || 2;
  const images = meshes
    .map((meshCode) => buildEstimatedIntensityImage(meshCode, eventDirectory, datum))
    .filter(Boolean);
  if (images.length === 0) return null;

  const eventTimeRaw = normalizeJmaPublicTime(record?.hypo?.at);
  const reportTimeRaw = normalizeJmaPublicTime(record?.hypo?.it);
  const latitude = Number(record?.hypo?.lat);
  const longitude = Number(record?.hypo?.lon);

  return {
    id: eventDirectory,
    eventDirectory,
    eventTimeRaw,
    reportTimeRaw,
    eventTimeMs: getDateMs(eventTimeRaw),
    coordinates: Number.isFinite(longitude) && Number.isFinite(latitude)
      ? [longitude, latitude]
      : null,
    hypocenterName: String(record?.hypo?.epi ?? "").trim(),
    magnitude: Number(record?.hypo?.mag),
    maximumIntensity: Number(record?.hypo?.maxi),
    comment: String(record?.comment ?? "").trim(),
    bounds,
    images,
    sourceLabel: "気象庁 推計震度分布図",
    sourceUrl: `https://www.jma.go.jp/bosai/map.html#contents=estimated_intensity_map&id=${encodeURIComponent(eventDirectory.slice(0, 12))}`,
    sourceType: "jma-public-json-png"
  };
}

export function matchEstimatedIntensityRecord(earthquake, normalizedCatalog) {
  const eventTimeMs = getDateMs(earthquake?.eventTimeRaw);
  const coordinates = Array.isArray(earthquake?.coordinates) ? earthquake.coordinates : null;
  if (!Number.isFinite(eventTimeMs)) return null;

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of normalizedCatalog ?? []) {
    if (!Number.isFinite(candidate?.eventTimeMs)) continue;
    const timeDifference = Math.abs(candidate.eventTimeMs - eventTimeMs);
    if (timeDifference > MATCH_TIME_TOLERANCE_MS) continue;

    const coordinateDifference = getCoordinateDifference(coordinates, candidate.coordinates);
    if (Number.isFinite(coordinateDifference)
      && coordinateDifference > MATCH_COORDINATE_TOLERANCE_DEGREES) {
      continue;
    }
    const score = timeDifference + (Number.isFinite(coordinateDifference)
      ? coordinateDifference * 60 * 1000
      : 0);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function buildEstimatedIntensityImage(meshCode, eventDirectory, datum = 2) {
  const mesh = String(meshCode ?? "").trim();
  if (!/^\d{4}$/.test(mesh) || !eventDirectory) return null;

  const latitudeIndex = Number(mesh.slice(0, 2));
  const longitudeIndex = Number(mesh.slice(2, 4));
  if (!Number.isFinite(latitudeIndex) || !Number.isFinite(longitudeIndex)) return null;

  let south = latitudeIndex / 1.5;
  let west = longitudeIndex + 100;
  let north = south + 40 / 60;
  let east = west + 1;

  // The currently published catalog uses JGD2000/JGD2011 (datum=2).
  // Older Tokyo Datum products are not shifted heuristically: showing a
  // misplaced intensity mesh is more harmful than omitting that old image.
  if (Number(datum) !== 2) return null;

  south = roundCoordinate(south);
  west = roundCoordinate(west);
  north = roundCoordinate(north);
  east = roundCoordinate(east);
  return {
    id: `${eventDirectory}-${mesh}`,
    meshCode: mesh,
    url: `${JMA_ENDPOINTS.estimatedIntensityDataBase}/${encodeURIComponent(eventDirectory)}/${mesh}.png`,
    coordinates: [
      [west, north],
      [east, north],
      [east, south],
      [west, south]
    ]
  };
}

export function getRecoloredEstimatedIntensityImageUrl(sourceUrl) {
  const url = String(sourceUrl ?? "").trim();
  if (!url) return Promise.resolve("");
  if (!RECOLORED_IMAGE_URL_CACHE.has(url)) {
    RECOLORED_IMAGE_URL_CACHE.set(url, recolorEstimatedIntensityImage(url)
      .catch(() => url));
  }
  return RECOLORED_IMAGE_URL_CACHE.get(url);
}

export function recolorEstimatedIntensityPixels(pixelData) {
  if (!pixelData || typeof pixelData.length !== "number") return pixelData;
  for (let index = 0; index + 3 < pixelData.length; index += 4) {
    if (pixelData[index + 3] === 0) continue;
    const paletteEntry = findNearestPaletteEntry(
      pixelData[index],
      pixelData[index + 1],
      pixelData[index + 2]
    );
    if (!paletteEntry?.targetRgb) continue;
    pixelData[index] = paletteEntry.targetRgb[0];
    pixelData[index + 1] = paletteEntry.targetRgb[1];
    pixelData[index + 2] = paletteEntry.targetRgb[2];
  }
  return pixelData;
}

async function recolorEstimatedIntensityImage(sourceUrl) {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return sourceUrl;
  }
  const response = await fetch(sourceUrl, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Estimated intensity image request failed: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return sourceUrl;

  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  recolorEstimatedIntensityPixels(imageData.data);
  context.putImageData(imageData, 0, 0);
  // MapLibre loads image sources from its worker. A document-scoped blob URL
  // cannot be fetched reliably from that worker on the deployed site, while a
  // data URL is self-contained and works in both the main thread and worker.
  return canvas.toDataURL("image/png");
}

function findNearestPaletteEntry(red, green, blue) {
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const entry of JMA_ESTIMATED_INTENSITY_PALETTE) {
    const distance = ((red - entry.source[0]) ** 2)
      + ((green - entry.source[1]) ** 2)
      + ((blue - entry.source[2]) ** 2);
    if (distance < nearestDistance) {
      nearest = entry;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function hexToRgb(value) {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu.exec(String(value ?? ""));
  if (!match) return null;
  return match.slice(1).map((part) => Number.parseInt(part, 16));
}

function normalizeBounds(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const south = Number(value[0]?.[0]);
  const west = Number(value[0]?.[1]);
  const north = Number(value[1]?.[0]);
  const east = Number(value[1]?.[1]);
  if (![south, west, north, east].every(Number.isFinite)) return null;
  return [[west, south], [east, north]];
}

function normalizeJmaPublicTime(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return /(?:Z|[+-]\d{2}:?\d{2})$/u.test(text) ? text : `${text}+09:00`;
}

function getDateMs(value) {
  const time = new Date(value ?? "").getTime();
  return Number.isFinite(time) ? time : Number.NaN;
}

function getCoordinateDifference(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return Number.NaN;
  const longitudeDifference = Number(left[0]) - Number(right[0]);
  const latitudeDifference = Number(left[1]) - Number(right[1]);
  if (!Number.isFinite(longitudeDifference) || !Number.isFinite(latitudeDifference)) return Number.NaN;
  return Math.hypot(longitudeDifference, latitudeDifference);
}

function roundCoordinate(value) {
  return Math.round(value * 1e8) / 1e8;
}
