import { AMEDAS_PRECIPITATION_LEVELS } from "../config.js";

const RADAR_SAMPLE_ZOOM = 8;
const TILE_SIZE = 256;
const IMAGE_TIMEOUT_MS = 4500;
const RADAR_SAMPLE_CONCURRENCY = 6;
const imageCache = new Map();

export async function buildLocationRadarTimeline(coordinates, radarData = {}) {
  if (!Array.isArray(coordinates) || !radarData?.frames?.length) {
    return { status: "unavailable", points: [], message: "雨雲時系列を表示できません。" };
  }

  const [lng, lat] = coordinates;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return { status: "unavailable", points: [], message: "現在地の座標を確認できません。" };
  }

  const samples = await mapWithConcurrency(
    radarData.frames,
    RADAR_SAMPLE_CONCURRENCY,
    (frame) => sampleRadarFrame(frame, lng, lat).catch(() => ({
      frame,
      available: false,
      intensity: 0,
      levelLabel: "",
      color: ""
    }))
  );
  const availableCount = samples.filter((point) => point.available).length;
  const rainyCount = samples.filter((point) => point.intensity > 0).length;
  return {
    status: availableCount > 0 ? "ready" : "unavailable",
    points: samples,
    availableCount,
    rainyCount,
    message: availableCount > 0
      ? (rainyCount > 0 ? "" : "現在地直下に降水は検出されていません。")
      : "雨雲タイルから現在地の降水強度を読み取れませんでした。"
  };
}

export async function sampleRadarAtLocation(coordinates, radarData = {}) {
  const [lng, lat] = Array.isArray(coordinates) ? coordinates.map(Number) : [];
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return { status: "unavailable", intensity: null, value: "", time: "" };
  }

  const frame = selectLatestObservationFrame(radarData);
  if (!frame) {
    return { status: "unavailable", intensity: null, value: "", time: "" };
  }

  const sample = await sampleRadarFrame(frame, lng, lat);
  if (!sample.available) {
    return { status: "unavailable", intensity: null, value: "", time: frame.label ?? "" };
  }

  return {
    status: "ready",
    intensity: sample.intensity,
    time: sample.label || frame.label || ""
  };
}

export function formatRadarIntensityBand(intensity, language = "ja") {
  const numeric = Number(intensity);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0mm/h";

  const levels = AMEDAS_PRECIPITATION_LEVELS;
  const index = levels.findIndex((level) => numeric >= level.min);
  if (index < 0) return "0mm/h";
  const minimum = levels[index].min;
  if (index === 0) return language === "en"
    ? `${minimum}mm/h or more`
    : `${minimum}mm/h以上`;
  const maximum = levels[index - 1].min;
  return language === "en"
    ? `${minimum}–${maximum}mm/h`
    : `${minimum}〜${maximum}mm/h`;
}

export function selectLatestObservationFrame(data) {
  if (data?.activeFrame && !data.activeFrame.isForecast) return data.activeFrame;
  const frames = Array.isArray(data?.frames) ? data.frames : [];
  const activeIndex = Number(data?.activeFrameIndex);
  if (Number.isInteger(activeIndex) && frames[activeIndex] && !frames[activeIndex].isForecast) {
    return frames[activeIndex];
  }
  return [...frames].reverse().find((frame) => !frame?.isForecast) ?? null;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function sampleRadarFrame(frame, lng, lat) {
  const tileUrl = frame?.radarTileUrl;
  if (!tileUrl) {
    return { frame, available: false, intensity: 0, levelLabel: "", color: "" };
  }

  const tile = lngLatToTilePixel(lng, lat, RADAR_SAMPLE_ZOOM);
  const url = tileUrl
    .replace("{z}", String(RADAR_SAMPLE_ZOOM))
    .replace("{x}", String(tile.x))
    .replace("{y}", String(tile.y));
  const imageData = await loadTileImageData(url);
  const level = samplePrecipitationLevel(imageData, tile.pixelX, tile.pixelY);
  return {
    frame,
    available: true,
    intensity: level?.min ?? 0,
    levelLabel: level?.label ?? "",
    color: level?.color ?? "",
    isForecast: Boolean(frame?.isForecast),
    label: frame?.label ?? ""
  };
}

export function lngLatToTilePixel(lng, lat, z) {
  const n = 2 ** z;
  const xFloat = ((lng + 180) / 360) * n;
  const latRad = lat * Math.PI / 180;
  const yFloat = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const x = clampTile(Math.floor(xFloat), n);
  const y = clampTile(Math.floor(yFloat), n);
  return {
    x,
    y,
    pixelX: Math.max(0, Math.min(TILE_SIZE - 1, Math.floor((xFloat - x) * TILE_SIZE))),
    pixelY: Math.max(0, Math.min(TILE_SIZE - 1, Math.floor((yFloat - y) * TILE_SIZE)))
  };
}

function clampTile(value, n) {
  return Math.max(0, Math.min(n - 1, value));
}

export async function loadTileImageData(url) {
  if (imageCache.has(url)) return imageCache.get(url);

  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => {
      image.src = "";
      reject(new Error("Radar tile timeout"));
    }, IMAGE_TIMEOUT_MS);

    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      window.clearTimeout(timer);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = TILE_SIZE;
        canvas.height = TILE_SIZE;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas context unavailable");
        context.drawImage(image, 0, 0, TILE_SIZE, TILE_SIZE);
        resolve(context.getImageData(0, 0, TILE_SIZE, TILE_SIZE));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("Radar tile load failed"));
    };
    image.src = url;
  });

  imageCache.set(url, promise);
  return promise;
}

function samplePrecipitationLevel(imageData, pixelX, pixelY) {
  const index = (pixelY * TILE_SIZE + pixelX) * 4;
  const alpha = imageData.data[index + 3];
  if (alpha < 24) return null;

  return matchPrecipitationColor({
    r: imageData.data[index],
    g: imageData.data[index + 1],
    b: imageData.data[index + 2]
  });
}

function matchPrecipitationColor(color) {
  let best = null;
  AMEDAS_PRECIPITATION_LEVELS.forEach((level) => {
    const levelColor = hexToRgb(level.color);
    const distance = rgbColorDistance(color, levelColor);
    if (!best || distance < best.distance) best = { ...level, distance };
  });
  return best && best.distance <= 150 ? best : null;
}

export function rgbColorDistance(a, b) {
  return Math.sqrt(
    (a.r - b.r) ** 2 +
    (a.g - b.g) ** 2 +
    (a.b - b.b) ** 2
  );
}

function hexToRgb(hex) {
  const value = String(hex).replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}
