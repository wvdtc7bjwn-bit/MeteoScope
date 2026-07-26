import { JMA_ENDPOINTS } from "../config.js";
import { fetchJson, parseJmaTime } from "./jmaClient.js";

const LIGHTNING_TILE_ELEMENT = "thns";
const OBSERVATION_FRAME_COUNT = 19;
const MAX_LIDEN_TIME_DIFFERENCE_MS = 5 * 60 * 1000;

export async function fetchLightningTimes() {
  const times = await fetchJson(JMA_ENDPOINTS.lightningTimeList);
  const frames = Array.isArray(times) ? buildLightningFrames(times) : [];
  const latestObservationIndex = findLatestLightningObservationIndex(frames);
  const activeFrameIndex = latestObservationIndex >= 0
    ? latestObservationIndex
    : Math.max(0, frames.length - 1);
  const activeFrame = frames[activeFrameIndex] ?? null;

  return {
    raw: times,
    frames,
    activeFrameIndex,
    activeFrame,
    latestTime: activeFrame?.label ?? parseJmaTime(activeFrame?.validtime) ?? "取得済み",
    latestRawTime: activeFrame?.validtime ?? null,
    lightningTileUrl: activeFrame?.lightningTileUrl ?? null
  };
}

export function buildLightningFrames(times = []) {
  const supported = times
    .filter((item) => item?.basetime && item?.validtime && item.elements?.includes(LIGHTNING_TILE_ELEMENT))
    .sort((a, b) => String(a.validtime).localeCompare(String(b.validtime)));
  const observations = supported.filter((item) => item.basetime === item.validtime);
  const lidenObservations = times
    .filter((item) => item?.basetime && item?.validtime && item.elements?.includes("liden"))
    .sort((a, b) => String(a.validtime).localeCompare(String(b.validtime)));
  const latestObservation = observations.at(-1);
  if (!latestObservation) return [];

  const recentObservations = observations
    .slice(-OBSERVATION_FRAME_COUNT)
    .map((item) => buildLightningFrame(item, false, findLidenObservation(item.validtime, lidenObservations)));
  const forecasts = supported
    .filter((item) => item.basetime === latestObservation.basetime && item.validtime > item.basetime)
    .map((item) => buildLightningFrame(item, true));

  return [...recentObservations, ...forecasts];
}

export function findLatestLightningObservationIndex(frames = []) {
  return frames.reduce(
    (latestIndex, frame, index) => frame?.isForecast ? latestIndex : index,
    -1
  );
}

export function buildLightningTileUrl(item) {
  const basetime = item.basetime;
  const validtime = item.validtime ?? item.basetime;
  return `${JMA_ENDPOINTS.radarTileBase}/${basetime}/none/${validtime}/surf/${LIGHTNING_TILE_ELEMENT}/{z}/{x}/{y}.png`;
}

export function buildLightningObservationUrl(item) {
  if (!item?.basetime || !item?.validtime) return null;
  return `${JMA_ENDPOINTS.radarTileBase}/${item.basetime}/none/${item.validtime}/surf/liden/data.geojson`;
}

function buildLightningFrame(item, isForecast, lidenObservation = null) {
  return {
    basetime: item.basetime,
    validtime: item.validtime,
    isForecast,
    label: formatJmaTime(item.validtime),
    lightningTileUrl: buildLightningTileUrl(item),
    lightningObservationUrl: isForecast ? null : buildLightningObservationUrl(lidenObservation)
  };
}

function findLidenObservation(validtime, observations) {
  const candidate = observations.reduce((latest, item) => {
    if (item.validtime > validtime) return latest;
    return item;
  }, null);
  if (!candidate) return null;

  const difference = parseTimestamp(validtime) - parseTimestamp(candidate.validtime);
  return difference >= 0 && difference <= MAX_LIDEN_TIME_DIFFERENCE_MS
    ? candidate
    : null;
}

function parseTimestamp(value) {
  return Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1,
    Number(value.slice(6, 8)),
    Number(value.slice(8, 10)),
    Number(value.slice(10, 12)),
    Number(value.slice(12, 14))
  );
}

function formatJmaTime(value) {
  if (!value) return "取得済み";
  const date = new Date(Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1,
    Number(value.slice(6, 8)),
    Number(value.slice(8, 10)),
    Number(value.slice(10, 12)),
    Number(value.slice(12, 14))
  ) + 9 * 60 * 60 * 1000);
  const pad = (item) => String(item).padStart(2, "0");
  return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}
