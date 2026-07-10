import { JMA_ENDPOINTS, STATIC_DATA_CACHE_TTL_MS } from "../config.js";
import { fetchJson, fetchText, parseJmaTime } from "./jmaClient.js";

const AMEDAS_POINT_DATA_TTL_MS = 5 * 60 * 1000;
const AMEDAS_CHUNK_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];
const DAILY_SERIES_FIELDS = {
  temperature: "temp",
  precipitation: "precipitation1h",
  wind: "wind",
  snow: "snow"
};

export async function fetchAmedasLatestTime() {
  const latestTimeText = await fetchText(JMA_ENDPOINTS.amedasTimeList);
  const latestTime = latestTimeText.trim();
  const mapTime = formatAmedasMapTime(latestTime);
  const [observations, stations] = await Promise.all([
    fetchJson(`${JMA_ENDPOINTS.amedasMapBase}/${mapTime}.json`),
    fetchJson(JMA_ENDPOINTS.amedasStationTable, { ttlMs: STATIC_DATA_CACHE_TTL_MS, cache: "force-cache" })
  ]);

  return {
    latestRawTime: latestTime,
    latestTime: parseJmaTime(latestTime) ?? latestTime,
    mapTime,
    points: buildAmedasPoints(observations, stations)
  };
}

export async function fetchAmedasDailySeries(stationId, referenceTime, metricId) {
  const id = String(stationId ?? "").trim();
  const jst = getJstDateParts(referenceTime);
  const field = DAILY_SERIES_FIELDS[metricId];
  if (!id || !jst || !field) throw new Error("AMeDAS station, time, or metric is unavailable");

  const chunkHours = AMEDAS_CHUNK_HOURS.filter((hour) => hour <= Math.floor(jst.hour / 3) * 3);
  const chunks = await Promise.all(chunkHours.map(async (hour) => {
    const fileTime = `${jst.date}_${String(hour).padStart(2, "0")}`;
    return fetchJson(`${JMA_ENDPOINTS.amedasPointBase}/${id}/${fileTime}.json`, {
      ttlMs: AMEDAS_POINT_DATA_TTL_MS
    });
  }));

  const pointsByTime = new Map();
  chunks.forEach((chunk) => {
    Object.entries(chunk ?? {}).forEach(([time, observation]) => {
      const value = readObservedValue(observation?.[field]);
      if (!Number.isFinite(value) || !isSameJstDate(time, jst.date)) return;
      const gust = metricId === "wind" ? readObservedValue(observation?.gust) : null;
      pointsByTime.set(time, {
        time,
        label: formatAmedasPointTime(time),
        minute: Number(time.slice(8, 10)) * 60 + Number(time.slice(10, 12)),
        value,
        gust,
        gustLabel: metricId === "wind" ? formatAmedasGustTime(observation?.gustTime, time) : null
      });
    });
  });

  const points = [...pointsByTime.values()]
    .filter((point) => Number.isFinite(point.minute))
    .sort((left, right) => left.minute - right.minute);

  const gustPoints = metricId === "wind"
    ? points.filter((point) => Number.isFinite(point.gust))
    : [];
  const maxGustPoint = gustPoints.length
    ? gustPoints.reduce((maximum, point) => point.gust > maximum.gust ? point : maximum)
    : null;

  return {
    stationId: id,
    metricId,
    date: jst.date,
    points,
    min: points.length ? Math.min(...points.map((point) => point.value)) : null,
    max: points.length ? Math.max(...points.map((point) => point.value)) : null,
    latest: points.at(-1) ?? null,
    maxGust: maxGustPoint?.gust ?? null,
    maxGustLabel: maxGustPoint?.gustLabel ?? null
  };
}

function buildAmedasPoints(observations, stations) {
  return Object.entries(observations ?? {}).flatMap(([stationId, observation]) => {
    const station = stations?.[stationId];
    const coordinates = getStationCoordinates(station);
    if (!coordinates) return [];

    return [{
      id: stationId,
      name: station.kjName ?? station.enName ?? stationId,
      coordinates,
      values: {
        temperature: readObservedValue(observation.temp),
        precipitation: readObservedValue(observation.precipitation1h),
        wind: readObservedValue(observation.wind),
        snow: readObservedValue(observation.snow) ?? readObservedValue(observation.snow1h)
      },
      windDirection: readObservedValue(observation.windDirection)
    }];
  });
}

function readObservedValue(value) {
  if (!Array.isArray(value)) return null;
  const quality = value.length > 1 ? Number(value[1]) : 0;
  if (!Number.isFinite(quality) || quality !== 0) return null;
  const observed = Number(value[0]);
  return Number.isFinite(observed) ? observed : null;
}

function getStationCoordinates(station) {
  if (!station?.lat || !station?.lon) return null;
  const lat = convertDegreeMinute(station.lat);
  const lon = convertDegreeMinute(station.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [lon, lat];
}

function convertDegreeMinute(value) {
  if (!Array.isArray(value) || value.length < 2) return NaN;
  return Number(value[0]) + Number(value[1]) / 60;
}

function formatAmedasMapTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).replace(/\D/g, "").slice(0, 12).padEnd(14, "0");
  const parts = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Tokyo"
  }).formatToParts(date);
  const getPart = (type) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${getPart("year")}${getPart("month")}${getPart("day")}${getPart("hour")}${getPart("minute")}00`;
}

function getJstDateParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Tokyo"
  }).formatToParts(date);
  const getPart = (type) => parts.find((part) => part.type === type)?.value ?? "";
  const dateText = `${getPart("year")}${getPart("month")}${getPart("day")}`;
  const hour = Number(getPart("hour"));
  return /^\d{8}$/.test(dateText) && Number.isFinite(hour) ? { date: dateText, hour } : null;
}

function isSameJstDate(time, date) {
  return typeof time === "string" && time.slice(0, 8) === date;
}

function formatAmedasPointTime(time) {
  if (typeof time !== "string" || !/^\d{14}$/.test(time)) return "--:--";
  return `${time.slice(8, 10)}:${time.slice(10, 12)}`;
}

function formatAmedasGustTime(value, fallbackTime) {
  const raw = Array.isArray(value) ? value[0] : value;
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length >= 4) {
    const hourMinute = digits.slice(-4);
    return `${hourMinute.slice(0, 2)}:${hourMinute.slice(2)}`;
  }
  return formatAmedasPointTime(fallbackTime);
}
