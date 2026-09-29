import { JMA_ENDPOINTS } from "../config.js";
import { fetchJson, parseJmaTime } from "./jmaClient.js";

const RADAR_TILE_ELEMENT = "hrpns";
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const OBSERVATION_LOOKBACK_HOURS = 3;
const OBSERVATION_FRAME_COUNT = OBSERVATION_LOOKBACK_HOURS * 60 / 5 + 1;
const FORECAST_FRAME_COUNT = 12;
const SHORT_TERM_RAINFALL_ELEMENT = "rasrf";

export async function fetchRadarTimes() {
  const [radarResult, rainfallResult] = await Promise.allSettled([
    fetchJson(JMA_ENDPOINTS.radarTimeList),
    fetchJson(JMA_ENDPOINTS.shortTermRainfallTimeList)
  ]);
  if (radarResult.status !== "fulfilled") throw radarResult.reason;

  const times = radarResult.value;
  const rainfallTimes = rainfallResult.status === "fulfilled" ? rainfallResult.value : [];
  const frames = buildRadarFrames(
    Array.isArray(times) ? times : [],
    Array.isArray(rainfallTimes) ? rainfallTimes : []
  );
  const latestObservationIndex = findLatestRadarObservationIndex(frames);
  const activeFrameIndex = latestObservationIndex >= 0 ? latestObservationIndex : Math.max(0, frames.length - 1);
  const activeFrame = frames[activeFrameIndex] ?? null;

  return {
    raw: times,
    frames,
    activeFrameIndex,
    latestTime: activeFrame?.label ?? parseJmaTime(activeFrame?.validtime) ?? "取得済み",
    latestRawTime: activeFrame?.validtime ?? null,
    radarTileUrl: activeFrame?.radarTileUrl ?? null,
    shortTermRainfallAvailable: rainfallResult.status === "fulfilled" && Array.isArray(rainfallTimes)
  };
}

export function buildRadarFrames(times, rainfallTimes = []) {
  const observations = (Array.isArray(times) ? times : [])
    .filter((item) => item?.basetime && item?.validtime && supportsRadarTile(item))
    .sort((a, b) => String(a.validtime).localeCompare(String(b.validtime)))
    .slice(-OBSERVATION_FRAME_COUNT)
    .map((item) => buildRadarFrame(item, false));

  const latestObservation = observations.at(-1);
  if (!latestObservation) return [];

  const latestMs = jmaTimeToMs(latestObservation.validtime);
  const forecastBaseTime = latestObservation.basetime;
  const forecastFrames = [];
  for (let step = 1; step <= FORECAST_FRAME_COUNT; step += 1) {
    forecastFrames.push(buildRadarFrame({
      basetime: forecastBaseTime,
      validtime: msToJmaTime(latestMs + step * FIVE_MINUTES_MS),
      member: latestObservation.member
    }, true));
  }

  return [
    ...observations,
    ...forecastFrames,
    ...buildShortTermRainfallFrames(rainfallTimes, latestMs + FORECAST_FRAME_COUNT * FIVE_MINUTES_MS)
  ];
}

function buildShortTermRainfallFrames(times, nowcastForecastEndMs) {
  if (!Array.isArray(times)) return [];

  return times
    .filter((item) => item?.basetime && item?.validtime && supportsShortTermRainfallTile(item))
    .map((item) => ({ item, validtimeMs: jmaTimeToMs(item.validtime) }))
    .filter(({ validtimeMs }) => Number.isFinite(validtimeMs) && validtimeMs > nowcastForecastEndMs)
    .sort((left, right) => left.validtimeMs - right.validtimeMs)
    .map(({ item }) => buildShortTermRainfallFrame(item));
}

function buildRadarFrame(item, isForecast) {
  return {
    basetime: item.basetime,
    validtime: item.validtime ?? item.basetime,
    member: item.member ?? "none",
    isForecast,
    label: formatJmaTime(item.validtime ?? item.basetime),
    radarTileUrl: buildRadarTileUrl(item)
  };
}

function buildShortTermRainfallFrame(item) {
  return {
    basetime: item.basetime,
    validtime: item.validtime,
    member: item.member ?? "none",
    isForecast: true,
    isShortTermRainfallForecast: true,
    label: formatJmaTime(item.validtime),
    radarTileUrl: buildShortTermRainfallTileUrl(item)
  };
}

export function findLatestRadarObservationIndex(frames = []) {
  return frames.reduce(
    (latestIndex, frame, index) => frame?.isForecast ? latestIndex : index,
    -1
  );
}

export function findRadarObservationFrameIndexAtTime(frames = [], validtime) {
  const target = String(validtime ?? "");
  if (!/^\d{14}$/.test(target)) return -1;
  return frames.findIndex((frame) => !frame?.isForecast && frame?.validtime === target);
}

function supportsRadarTile(item) {
  return !Array.isArray(item.elements) || item.elements.includes(RADAR_TILE_ELEMENT);
}

function supportsShortTermRainfallTile(item) {
  return !Array.isArray(item.elements) || item.elements.includes(SHORT_TERM_RAINFALL_ELEMENT);
}

function buildRadarTileUrl(item) {
  return buildPrecipitationTileUrl(JMA_ENDPOINTS.radarTileBase, RADAR_TILE_ELEMENT, item);
}

function buildShortTermRainfallTileUrl(item) {
  return buildPrecipitationTileUrl(JMA_ENDPOINTS.shortTermRainfallTileBase, SHORT_TERM_RAINFALL_ELEMENT, item);
}

function buildPrecipitationTileUrl(tileBase, element, item) {
  const basetime = item.basetime;
  const validtime = item.validtime ?? item.basetime;
  const member = item.member ?? "none";
  return `${tileBase}/${basetime}/${member}/${validtime}/surf/${element}/{z}/{x}/{y}.png`;
}

function jmaTimeToMs(value) {
  return Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1,
    Number(value.slice(6, 8)),
    Number(value.slice(8, 10)),
    Number(value.slice(10, 12)),
    Number(value.slice(12, 14))
  );
}

function msToJmaTime(ms) {
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00`;
}

function formatJmaTime(value) {
  if (!value) return "取得済み";
  const date = new Date(jmaTimeToMs(value) + 9 * 60 * 60 * 1000);
  const pad = (item) => String(item).padStart(2, "0");
  return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}
