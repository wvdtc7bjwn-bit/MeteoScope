import { fetchJson } from "./jmaClient.js";

const HIMAWARI_TARGET_TIMES_URL = "https://www.jma.go.jp/bosai/himawari/data/satimg/targetTimes_fd.json";
const HIMAWARI_TARGET_TIMES_TTL_MS = 10 * 60 * 1000;
const HIMAWARI_TIMESTAMP_PATTERN = /^\d{14}$/;

export async function fetchHimawariSatelliteFrames() {
  const payload = await fetchJson(HIMAWARI_TARGET_TIMES_URL, {
    ttlMs: HIMAWARI_TARGET_TIMES_TTL_MS,
    timeoutMs: 12 * 1000,
    retryCount: 1,
    validate: (value) => Array.isArray(value) || Array.isArray(value?.targetTimes)
  });
  return normalizeHimawariSatelliteFrames(payload);
}

export function normalizeHimawariSatelliteFrames(payload) {
  const source = Array.isArray(payload) ? payload : payload?.targetTimes;
  if (!Array.isArray(source)) return [];

  const frames = source
    .map((entry) => String(entry?.basetime ?? entry?.validtime ?? entry ?? ""))
    .filter((timestamp) => HIMAWARI_TIMESTAMP_PATTERN.test(timestamp))
    .map((timestamp) => ({
      id: timestamp,
      observedAt: formatHimawariTimestamp(timestamp),
      timestamp,
      tileUrl: buildHimawariInfraredTileUrl(timestamp)
    }))
    .sort((a, b) => parseHimawariTimestamp(a.timestamp) - parseHimawariTimestamp(b.timestamp));

  return frames.filter((frame, index) => index === 0 || frame.timestamp !== frames[index - 1].timestamp);
}

export function buildHimawariInfraredTileUrl(timestamp) {
  const normalized = String(timestamp ?? "");
  if (!HIMAWARI_TIMESTAMP_PATTERN.test(normalized)) return "";
  return `https://www.jma.go.jp/bosai/himawari/data/satimg/${normalized}/fd/${normalized}/B13/TBB/{z}/{x}/{y}.jpg`;
}

export function isHimawariTimestampEqualToJstTime(timestamp, jstTime) {
  const satelliteTime = parseHimawariTimestamp(timestamp);
  if (!Number.isFinite(satelliteTime) || !jstTime) return false;

  const text = String(jstTime).trim();
  const match = text.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  const chartTime = match
    ? Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] ?? "00"}+09:00`)
    : Date.parse(text);
  return Number.isFinite(chartTime) && satelliteTime === chartTime;
}

function parseHimawariTimestamp(timestamp) {
  if (!HIMAWARI_TIMESTAMP_PATTERN.test(String(timestamp ?? ""))) return Number.NaN;
  const value = String(timestamp);
  return Date.parse(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}Z`);
}

function formatHimawariTimestamp(timestamp) {
  const value = String(timestamp ?? "");
  const time = parseHimawariTimestamp(value);
  if (!Number.isFinite(time)) return "--";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Tokyo"
  }).format(new Date(time));
}
