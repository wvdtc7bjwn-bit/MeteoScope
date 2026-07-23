import { JMA_ENDPOINTS } from "../config.js";
import { fetchJson, parseJmaTime } from "./jmaClient.js";

const RADAR_TILE_ELEMENT = "hrpns";
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const OBSERVATION_LOOKBACK_HOURS = 3;
const OBSERVATION_FRAME_COUNT = OBSERVATION_LOOKBACK_HOURS * 60 / 5 + 1;
const FORECAST_FRAME_COUNT = 12;

export async function fetchRadarTimes() {
  const times = await fetchJson(JMA_ENDPOINTS.radarTimeList);
  const frames = Array.isArray(times) ? buildRadarFrames(times) : [];
  const latestObservationIndex = findLatestRadarObservationIndex(frames);
  const activeFrameIndex = latestObservationIndex >= 0 ? latestObservationIndex : Math.max(0, frames.length - 1);
  const activeFrame = frames[activeFrameIndex] ?? null;

  return {
    raw: times,
    frames,
    activeFrameIndex,
    latestTime: activeFrame?.label ?? parseJmaTime(activeFrame?.validtime) ?? "取得済み",
    latestRawTime: activeFrame?.validtime ?? null,
    radarTileUrl: activeFrame?.radarTileUrl ?? null
  };
}

function buildRadarFrames(times) {
  const observations = times
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

  return [...observations, ...forecastFrames];
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

export function findLatestRadarObservationIndex(frames = []) {
  return frames.reduce(
    (latestIndex, frame, index) => frame?.isForecast ? latestIndex : index,
    -1
  );
}

function supportsRadarTile(item) {
  return !Array.isArray(item.elements) || item.elements.includes(RADAR_TILE_ELEMENT);
}

function buildRadarTileUrl(item) {
  const basetime = item.basetime;
  const validtime = item.validtime ?? item.basetime;
  const member = item.member ?? "none";
  return `${JMA_ENDPOINTS.radarTileBase}/${basetime}/${member}/${validtime}/surf/${RADAR_TILE_ELEMENT}/{z}/{x}/{y}.png`;
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
