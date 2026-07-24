import { JMA_ENDPOINTS, STATIC_DATA_CACHE_TTL_MS } from "../config.js";
import { fetchJson } from "./jmaClient.js";

const TIDE_DATA_TTL_MS = 5 * 60 * 1000;
const TIDE_GRAPH_HISTORY_HOURS = 24;
const TIDE_GRAPH_MAX_POINTS = 720;

export async function fetchTideStationCatalog() {
  const payload = await fetchJson(JMA_ENDPOINTS.tideStationCatalog, {
    ttlMs: STATIC_DATA_CACHE_TTL_MS,
    cache: "force-cache"
  });
  return {
    stations: parseTideStationCatalog(payload),
    sourceUrl: "https://www.jma.go.jp/bosai/tidelevel/"
  };
}

export async function fetchTideObservationSeries(station, options = {}) {
  const stationCode = normalizeStationCode(station?.code);
  if (!stationCode) throw new Error("Invalid tide station code");

  const latestPayload = await fetchJson(JMA_ENDPOINTS.tideObservationTime, {
    ttlMs: TIDE_DATA_TTL_MS,
    cache: options.force ? "no-store" : "default"
  });
  const updatedAt = parseValidDate(latestPayload?.time) ?? new Date();
  const dayStarts = getRequiredDayStarts(updatedAt, TIDE_GRAPH_HISTORY_HOURS);
  const years = [...new Set([
    ...dayStarts.map((date) => getJstParts(date).year),
    getJstParts(new Date(updatedAt.getTime() + 60 * 60 * 1000)).year
  ])];
  const [observationResults, astronomicalResults] = await Promise.all([
    Promise.allSettled(dayStarts.map((date) => fetchJson(
      `${JMA_ENDPOINTS.tideObservationBase}/tide_obs_${formatJstDateCompact(date)}_${stationCode}.json`,
      { ttlMs: TIDE_DATA_TTL_MS, cache: options.force ? "no-store" : "default" }
    ))),
    Promise.allSettled(years.map((year) => fetchJson(
      `${JMA_ENDPOINTS.tideAstronomicalBase}/tide_astro_${year}_${stationCode}.json`,
      { ttlMs: STATIC_DATA_CACHE_TTL_MS, cache: "force-cache" }
    ).then((payload) => [year, payload])))
  ]);

  const observations = observationResults
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  if (!observations.length) throw new Error("Tide observation data is unavailable");

  const astronomicalByYear = new Map(
    astronomicalResults
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value)
  );
  const points = buildTideObservationPoints(observations, astronomicalByYear, {
    updatedAt,
    historyHours: TIDE_GRAPH_HISTORY_HOURS,
    maxPoints: TIDE_GRAPH_MAX_POINTS
  });
  if (!points.length) throw new Error("Tide observation series is empty");

  return {
    station: { ...station, code: stationCode },
    updatedAt: updatedAt.toISOString(),
    points,
    latest: points.at(-1) ?? null,
    unit: "cm",
    sourceUrl: `https://www.jma.go.jp/bosai/tidelevel/#point_code=${stationCode}`
  };
}

export function parseTideStationCatalog(payload) {
  const stationsByCode = new Map();
  Object.values(payload ?? {}).forEach((municipality) => {
    (municipality?.class30s ?? []).forEach((area) => {
      (area?.stations ?? []).forEach((station) => {
        const code = normalizeStationCode(station?.code);
        const longitude = Number(station?.lon);
        const latitude = Number(station?.lat);
        if (!code || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return;
        const normalized = {
          code,
          name: String(station?.name ?? code),
          coordinates: [longitude, latitude],
          agency: String(station?.typeName ?? ""),
          address: String(station?.addr ?? ""),
          observationMethod: String(station?.detail?.type ?? ""),
          reference: String(station?.reference ?? ""),
          level4: toFiniteNumber(area?.standard?.level4),
          level5: toFiniteNumber(area?.standard?.level5),
          historicalMaximum: toFiniteNumber(station?.max?.level),
          historicalMaximumTime: String(station?.max?.datetime ?? ""),
          historicalMaximumDescription: String(station?.max?.description ?? "")
        };
        if (!stationsByCode.has(code)) stationsByCode.set(code, normalized);
      });
    });
  });
  return [...stationsByCode.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "ja")
  );
}

export function buildTideObservationPoints(
  observationPayloads,
  astronomicalByYear,
  options = {}
) {
  const updatedAt = parseValidDate(options.updatedAt) ?? new Date();
  const historyHours = Number(options.historyHours) || TIDE_GRAPH_HISTORY_HOURS;
  const startMs = updatedAt.getTime() - historyHours * 60 * 60 * 1000;
  const rawPoints = observationPayloads.flatMap((payload) => {
    const start = parseValidDate(payload?.time);
    const intervalSeconds = Number(payload?.interval);
    if (!start || !Number.isFinite(intervalSeconds) || intervalSeconds <= 0) return [];
    return (payload?.tide ?? []).flatMap((value, index) => {
      const observed = toFiniteNumber(value);
      if (observed === null) return [];
      const time = new Date(start.getTime() + index * intervalSeconds * 1000);
      const timeMs = time.getTime();
      if (timeMs < startMs || timeMs > updatedAt.getTime()) return [];
      const astronomical = interpolateAstronomicalTide(time, astronomicalByYear);
      return [{
        time: time.toISOString(),
        observed,
        astronomical,
        deviation: astronomical === null ? null : observed - astronomical
      }];
    });
  }).sort((left, right) => Date.parse(left.time) - Date.parse(right.time));

  const deduplicated = [];
  let previousTime = "";
  rawPoints.forEach((point) => {
    if (point.time === previousTime) {
      deduplicated[deduplicated.length - 1] = point;
      return;
    }
    deduplicated.push(point);
    previousTime = point.time;
  });
  return downsampleTidePoints(deduplicated, Number(options.maxPoints) || TIDE_GRAPH_MAX_POINTS);
}

function interpolateAstronomicalTide(date, astronomicalByYear) {
  const parts = getJstParts(date);
  const values = astronomicalByYear.get(parts.year)?.tide?.[parts.monthDay];
  if (!Array.isArray(values) || values.length < 24) return null;
  const current = toFiniteNumber(values[parts.hour]);
  if (current === null) return null;
  const nextDate = new Date(date.getTime() + 60 * 60 * 1000);
  const nextParts = getJstParts(nextDate);
  const nextValues = astronomicalByYear.get(nextParts.year)?.tide?.[nextParts.monthDay];
  const next = toFiniteNumber(nextValues?.[nextParts.hour]);
  if (next === null) return current;
  const hourFraction = (parts.minute * 60 + parts.second) / 3600;
  return current + (next - current) * hourFraction;
}

function downsampleTidePoints(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const step = Math.max(1, Math.ceil(points.length / maxPoints));
  const sampled = points.filter((_, index) => index % step === 0);
  const last = points.at(-1);
  if (last && sampled.at(-1)?.time !== last.time) sampled.push(last);
  return sampled;
}

function getRequiredDayStarts(updatedAt, historyHours) {
  const result = [];
  const cursor = startOfJstDay(new Date(updatedAt.getTime() - historyHours * 60 * 60 * 1000));
  const end = startOfJstDay(updatedAt);
  while (cursor.getTime() <= end.getTime()) {
    result.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function startOfJstDay(date) {
  const parts = getJstParts(date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, -9));
}

function formatJstDateCompact(date) {
  const parts = getJstParts(date);
  return `${parts.year}${String(parts.month).padStart(2, "0")}${String(parts.day).padStart(2, "0")}`;
}

function getJstParts(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    monthDay: `${parts.month}${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function parseValidDate(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizeStationCode(value) {
  const code = String(value ?? "").trim();
  return /^\d{6}$/u.test(code) ? code : "";
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "" || value === "///") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
