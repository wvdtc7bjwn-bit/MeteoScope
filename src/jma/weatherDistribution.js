import { JMA_ENDPOINTS } from "../config.js";
import { fetchJson } from "./jmaClient.js";

const DISTRIBUTION_MODES = {
  weather: {
    element: "wm",
    label: "天気分布",
    usesForecastPeriod: true
  },
  temperature: {
    element: "temp",
    label: "気温分布"
  },
  snowfall: {
    element: "s3",
    label: "降雪量",
    usesForecastPeriod: true
  }
};
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function isWeatherDistributionMode(mode) {
  return Object.hasOwn(DISTRIBUTION_MODES, mode);
}

export function getWeatherDistributionLabel(mode) {
  return DISTRIBUTION_MODES[mode]?.label ?? "";
}

export async function fetchWeatherDistribution(mode) {
  const config = DISTRIBUTION_MODES[mode];
  if (!config) throw new Error(`Unsupported weather distribution mode: ${mode}`);

  const times = await fetchJson(JMA_ENDPOINTS.weatherDistributionTimeList, {
    ttlMs: 5 * 60 * 1000,
    cache: "no-store"
  });
  const frames = (Array.isArray(times) ? times : [])
    .filter((item) => supportsElement(item, config.element))
    .map((item) => buildFrame(item, config))
    .sort((left, right) => String(left.validtime).localeCompare(String(right.validtime)));
  const activeFrameIndex = config.usesForecastPeriod
    ? findCurrentForecastPeriodIndex(frames)
    : findNearestFrameIndex(frames);

  return {
    mode,
    label: config.label,
    frames,
    activeFrameIndex,
    activeFrame: frames[activeFrameIndex] ?? null,
    latestTime: frames[activeFrameIndex]?.label ?? "情報なし",
    latestRawTime: frames[activeFrameIndex]?.validtime ?? null
  };
}

export function activateWeatherDistributionFrame(data, index) {
  const frames = data?.frames ?? [];
  const activeFrameIndex = clampFrameIndex(index, frames);
  const activeFrame = frames[activeFrameIndex] ?? null;
  return {
    ...data,
    activeFrameIndex,
    activeFrame,
    latestTime: activeFrame?.label ?? data?.latestTime ?? "情報なし",
    latestRawTime: activeFrame?.validtime ?? data?.latestRawTime ?? null
  };
}

export function activateNearestWeatherDistributionFrame(data, now = Date.now()) {
  const frames = data?.frames ?? [];
  const index = usesForecastPeriod(data?.mode)
    ? findCurrentForecastPeriodIndex(frames, now)
    : findNearestFrameIndex(frames, now);
  return activateWeatherDistributionFrame(data, index);
}

function usesForecastPeriod(mode) {
  return Boolean(DISTRIBUTION_MODES[mode]?.usesForecastPeriod);
}

function supportsElement(item, element) {
  return Boolean(item?.basetime && item?.validtime)
    && (!Array.isArray(item.elements) || item.elements.includes(element));
}

function buildFrame(item, config) {
  const basetime = String(item.basetime);
  const validtime = String(item.validtime ?? item.basetime);
  return {
    basetime,
    validtime,
    member: item.member ?? "none",
    label: config.usesForecastPeriod
      ? formatForecastPeriodStart(validtime)
      : formatJmaTime(validtime),
    distributionTileUrl: `${JMA_ENDPOINTS.weatherDistributionTileBase}/${basetime}/${item.member ?? "none"}/${validtime}/surf/${config.element}/{z}/{x}/{y}.png`
  };
}

function clampFrameIndex(index, frames) {
  if (!frames.length) return 0;
  return Math.max(0, Math.min(frames.length - 1, Number(index) || 0));
}

function findCurrentForecastPeriodIndex(frames, now = Date.now()) {
  if (!frames.length) return 0;

  const activePeriodIndex = frames.findIndex((frame) => {
    const endTime = parseJmaTimestamp(frame?.validtime);
    return Number.isFinite(endTime)
      && now >= endTime - THREE_HOURS_MS
      && now < endTime;
  });
  if (activePeriodIndex >= 0) return activePeriodIndex;

  let nearestIndex = 0;
  let nearestDistance = Infinity;
  let nearestPeriodStart = Infinity;

  frames.forEach((frame, index) => {
    const endTime = parseJmaTimestamp(frame?.validtime);
    if (!Number.isFinite(endTime)) return;
    const startTime = endTime - THREE_HOURS_MS;
    const distance = now < startTime ? startTime - now : now - endTime;
    if (distance < nearestDistance || (distance === nearestDistance && startTime < nearestPeriodStart)) {
      nearestIndex = index;
      nearestDistance = distance;
      nearestPeriodStart = startTime;
    }
  });

  return nearestIndex;
}

function findNearestFrameIndex(frames, now = Date.now()) {
  if (!frames.length) return 0;

  let nearestIndex = 0;
  let nearestDistance = Infinity;
  let nearestTime = Infinity;

  frames.forEach((frame, index) => {
    const time = parseJmaTimestamp(frame?.validtime);
    if (!Number.isFinite(time)) return;
    const distance = Math.abs(time - now);
    if (distance < nearestDistance || (distance === nearestDistance && time < nearestTime)) {
      nearestIndex = index;
      nearestDistance = distance;
      nearestTime = time;
    }
  });

  return nearestIndex;
}

function parseJmaTimestamp(value) {
  if (!value || String(value).length < 12) return Number.NaN;
  const text = String(value);
  return Date.UTC(
    Number(text.slice(0, 4)),
    Number(text.slice(4, 6)) - 1,
    Number(text.slice(6, 8)),
    Number(text.slice(8, 10)),
    Number(text.slice(10, 12)),
    Number(text.slice(12, 14)) || 0
  );
}

function formatForecastPeriodStart(value) {
  return formatJmaTime(value, JST_OFFSET_MS - THREE_HOURS_MS);
}

function formatJmaTime(value, offsetMs = JST_OFFSET_MS) {
  if (!value || value.length < 12) return "情報なし";
  const jst = new Date(parseJmaTimestamp(value) + offsetMs);
  const month = jst.getUTCMonth() + 1;
  const day = jst.getUTCDate();
  const hour = String(jst.getUTCHours()).padStart(2, "0");
  const minute = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${month}/${day} ${hour}:${minute}`;
}
