import stationCoordinatesByCode from "../../../public/data/jma-intensity-stations.json";
import {
  isAllowedDmdataTelegramDataUrl,
  mergeDmdataTsunamiSnapshots
} from "./dmdataTsunami.js";
import { getEarthquakeTsunamiStatus } from "./earthquakeTsunamiStatus.js";
import {
  buildJmaIntensityStationCoordinateLookup,
  findJmaIntensityStationCoordinate,
  isJmaIntensityStationCode,
  normalizeJmaIntensityStationCode,
  preserveJmaEarthquakeDetails,
  sanitizeJmaIntensityStationPoints
} from "./earthquakeStationPolicy.js";
import { getJstDateString } from "./scheduledBackfillPolicy.js";
import { collectDmdataIntensityRegions } from "./earthquakeRegionPolicy.js";

const STATE_KEY = "latest-state-v2";
const HISTORY_KEY = "earthquake-history-v1";
const RETENTION_CLEANUP_KEY = "retention-cleanup-v1";
// Parser changes require one bounded replay so recent station rows are rebuilt safely.
const DMDATA_TELEGRAM_CURSOR_KEY = "dmdata-telegram-cursor-v4";
const REPLAY_TYPES = ["earthquake", "eew", "tsunami"];
const HISTORY_MAX_ITEMS = 100;
const FINALIZED_EEW_EVENT_IDS_MAX_SIZE = 200;
const EEW_LATEST_MAX_AGE_MS = 30 * 60 * 1000;
const MAX_CLIENT_CONNECTIONS = 25;
const UNKNOWN_HYPOCENTER = "震源調査中";
const TSUNAMI_FALLBACK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RETENTION_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const EARTHQUAKE_HISTORY_RETENTION_DAYS = 30;
const STATION_INTENSITY_RETENTION_DAYS = 30;
const TSUNAMI_HISTORY_RETENTION_DAYS = 90;
const GD_EARTHQUAKE_POLL_INTERVAL_MS = 5 * 60 * 1000;
const GD_EARTHQUAKE_BACKFILL_DAYS = 2;
const DMDATA_TELEGRAM_POLL_INTERVAL_MS = 5 * 60 * 1000;
const DMDATA_TELEGRAM_LIST_LIMIT = 40;
const DMDATA_EARTHQUAKE_STATION_PARAMETER_URL =
  "https://api.dmdata.jp/v2/parameter/earthquake/station";
const DMDATA_EARTHQUAKE_STATION_MIN_COUNT = 4000;
const DMDATA_EARTHQUAKE_STATION_REFRESH_MS = 24 * 60 * 60 * 1000;
const DMDATA_EARTHQUAKE_STATION_RETRY_MS = 5 * 60 * 1000;

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(250, timeoutMs));

  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal
    });
  }
  finally {
    clearTimeout(timeoutId);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function toTimeMs(value) {
  const ms = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function getEewOriginTimeMs(data) {
  return toTimeMs(
    data?.originTime ??
    data?.origin_time ??
    data?.earthquake?.originTime ??
    data?.earthquake?.origin_time ??
    data?.time ??
    data?.reportTime ??
    data?.pressDateTime ??
    null
  );
}

function isStaleEewStored(stored, now = Date.now()) {
  if (!stored?.data) {
    return true;
  }

  const basisMs = getEewOriginTimeMs(stored.data) ?? toTimeMs(stored.timestamp);
  if (!basisMs) {
    return true;
  }

  return now - basisMs > EEW_LATEST_MAX_AGE_MS;
}

function getTsunamiValidTimeMs(data) {
  return toTimeMs(
    data?.validTime ??
    data?.validDateTime ??
    data?.validDate ??
    data?.head?.validDateTime ??
    data?.head?.validTime ??
    null
  );
}

function getTsunamiIssueTimeMs(data) {
  return toTimeMs(
    data?.reportTime ??
    data?.time ??
    data?.targetDateTime ??
    data?.head?.time ??
    data?.head?.reportDateTime ??
    data?.head?.targetDateTime ??
    data?.earthquake?.time ??
    data?.earthquake?.originTime ??
    null
  );
}

function isTsunamiForecastOnly(data) {
  const areas = Array.isArray(data?.areas) ? data.areas : [];
  if (areas.length === 0) {
    return false;
  }

  let hasForecast = false;
  for (const area of areas) {
    const kind = String(area?.kind ?? "");
    if (
      kind.includes("大津波警報") ||
      kind.includes("津波警報") ||
      kind.includes("津波注意報")
    ) {
      return false;
    }
    if (kind.includes("津波予報") || kind.includes("若干")) {
      hasForecast = true;
    }
  }

  return hasForecast;
}

function getTsunamiExpiryTimeMs(data, fallbackReceivedAt = null) {
  const validMs = getTsunamiValidTimeMs(data);
  if (validMs) {
    return validMs;
  }

  if (!isTsunamiForecastOnly(data)) {
    return null;
  }

  const issueMs = getTsunamiIssueTimeMs(data) ?? toTimeMs(fallbackReceivedAt);
  return issueMs ? issueMs + TSUNAMI_FALLBACK_MAX_AGE_MS : null;
}

function isTsunamiCanceled(data) {
  return (
    data?.isCanceled === true ||
    data?.revoked === true ||
    data?.isRevoked === true ||
    String(data?.status ?? "").includes("取消") ||
    String(data?.infoType ?? "").includes("取消")
  );
}

function isStaleTsunamiStored(stored, now = Date.now()) {
  if (!stored?.data) {
    return true;
  }

  if (isTsunamiCanceled(stored.data)) {
    return true;
  }

  const expiresAtMs = getTsunamiExpiryTimeMs(
    stored.data,
    stored.timestamp ?? stored.receivedAt
  );
  return Boolean(expiresAtMs && now >= expiresAtMs);
}

function createInitialLatest() {
  return {
    earthquake: null,
    eew: null,
    tsunami: null,
    finalizedEewEventIds: []
  };
}

function makeEnvelope(type, source, data, timestamp = nowIso()) {
  return {
    type,
    source,
    timestamp,
    data: data ?? {}
  };
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  }
  catch (_) {
    return JSON.stringify(makeEnvelope("status", "system", {
      ok: false,
      message: "failed_to_serialize_payload"
    }));
  }
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function convertIntensityToScale(value) {
  const v = String(getIntensityValue(value) ?? "").trim();
  const map = {
    "0": 0,
    "1": 10,
    "2": 20,
    "3": 30,
    "4": 40,
    "5-": 45,
    "5+": 50,
    "6-": 55,
    "6+": 60,
    "7": 70
  };
  return map[v] ?? 0;
}

function convertIntensityText(value) {
  const v = String(getIntensityValue(value) ?? "").trim();
  const map = {
    "0": "0",
    "1": "1",
    "2": "2",
    "3": "3",
    "4": "4",
    "5-": "5弱",
    "5+": "5強",
    "6-": "6弱",
    "6+": "6強",
    "7": "7"
  };
  return map[v] ?? "-";
}

function getIntensityOrder(value) {
  const v = String(getIntensityValue(value) ?? "").trim();
  const order = {
    "0": 0,
    "1": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5-": 5,
    "5+": 6,
    "6-": 7,
    "6+": 8,
    "7": 9
  };
  return order[v] ?? -1;
}

function getIntensityValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "object") {
    const to = value.to;
    if (to !== null && to !== undefined && to !== "" && to !== "over" && to !== "不明") {
      return to;
    }
    return (
      value.value ??
      value.max ??
      value.maxInt ??
      value.intensity ??
      value.from ??
      null
    );
  }
  const text = String(value).trim();
  const aliases = {
    "5弱": "5-",
    "5強": "5+",
    "6弱": "6-",
    "6強": "6+"
  };
  return aliases[text] ?? value;
}

const LONG_PERIOD_INTENSITY_KEYS = Object.freeze([
  "maxLgInt",
  "forecastMaxLgInt",
  "maxLongPeriodIntensity",
  "maxLgIntensity",
  "lgCategory",
  "longPeriodIntensity",
  "maxLongPeriodInt",
  "forecastMaxLongPeriodIntensity",
  "forecastMaxLongPeriodInt"
]);

const LONG_PERIOD_FORECAST_KEYS = Object.freeze([
  "forecastMaxLgInt",
  "forecastMaxLongPeriodIntensity",
  "forecastMaxLongPeriodInt",
  "maxLgInt",
  "maxLongPeriodIntensity",
  "maxLgIntensity",
  "lgCategory",
  "longPeriodIntensity",
  "maxLongPeriodInt"
]);

function formatLongPeriodIntensity(value) {
  const raw = value && typeof value === "object"
    ? getIntensityValue(value) ??
      value.longPeriodIntensity ??
      value.lgCategory ??
      value.name ??
      value.text ??
      value.code ??
      value.level ??
      value.rank
    : getIntensityValue(value);

  if (raw === null || raw === undefined || raw === "") {
    return null;
  }

  const text = String(raw).trim();
  if (!text || text === "0" || text === "不明") {
    return null;
  }

  const classMatch = text.match(/\u968e\u7d1a\s*([1-4])/);
  if (classMatch) {
    return `階級${classMatch[1]}`;
  }

  const numberMatch = text.match(/^([1-4])(?:\.0+)?$/);
  if (numberMatch) {
    return `階級${numberMatch[1]}`;
  }

  return null;
}

function collectLongPeriodIntensityCandidates(root, candidates = [], seen = new Set(), depth = 0) {
  if (!root || typeof root !== "object" || depth > 5 || seen.has(root) || candidates.length >= 80) {
    return candidates;
  }
  seen.add(root);

  if (Array.isArray(root)) {
    root.forEach(item => collectLongPeriodIntensityCandidates(item, candidates, seen, depth + 1));
    return candidates;
  }

  Object.entries(root).forEach(([key, value]) => {
    const normalizedKey = String(key || "").toLowerCase();
    if (
      LONG_PERIOD_INTENSITY_KEYS.some(item => item.toLowerCase() === normalizedKey) ||
      normalizedKey.includes("longperiod") ||
      normalizedKey.includes("long_period") ||
      normalizedKey.includes("lgint") ||
      normalizedKey.includes("lgcategory")
    ) {
      candidates.push(value);
    }

    if (value && typeof value === "object") {
      collectLongPeriodIntensityCandidates(value, candidates, seen, depth + 1);
    }
  });

  return candidates;
}

function getLongPeriodIntensity(intensity, body, options = {}) {
  const directKeys = options.preferForecast
    ? LONG_PERIOD_FORECAST_KEYS
    : LONG_PERIOD_INTENSITY_KEYS;
  const roots = [intensity, body].filter(root => root && typeof root === "object");

  for (const root of roots) {
    for (const key of directKeys) {
      const formatted = formatLongPeriodIntensity(root?.[key]);
      if (formatted) {
        return formatted;
      }
    }
  }

  for (const root of roots) {
    for (const candidate of collectLongPeriodIntensityCandidates(root)) {
      const formatted = formatLongPeriodIntensity(candidate);
      if (formatted) {
        return formatted;
      }
    }
  }

  return null;
}

function getNumberValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "object") {
    return getNumberValue(
      value.value ??
      value.latitude ??
      value.longitude ??
      value.lat ??
      value.lng ??
      value.lon
    );
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getScalarValue(value, fallback = "-") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  if (typeof value === "object") {
    return getScalarValue(
      value.value ??
      value.jmaMagnitude ??
      value.name ??
      value.text ??
      value.condition ??
      value.status,
      fallback
    );
  }
  return String(value);
}

function getMagnitudeValue(earthquake, hypocenter) {
  return getScalarValue(
    earthquake?.magnitude?.value ??
    earthquake?.magnitude?.jmaMagnitude ??
    hypocenter?.magnitude?.value ??
    earthquake?.magnitude ??
    hypocenter?.magnitude,
    "-"
  );
}

function getDepthValue(hypocenter) {
  return getScalarValue(
    hypocenter?.depth?.value ??
    hypocenter?.depth,
    "-"
  );
}

function getCoordinate(hypocenter) {
  return hypocenter?.coordinate ?? hypocenter?.coordinates ?? {};
}

function isCoordinateOutsideJapanArea(latitude, longitude) {
  const lat = getNumberValue(latitude);
  const lng = getNumberValue(longitude);
  if (lat === null || lng === null) {
    return false;
  }

  return lat < 20 || lat > 50 || lng < 118 || lng > 156;
}

function isDistantEarthquakeData({ report, body, earthquake, hypocenter, coordinate, maxInt }) {
  const text = [
    report?.title,
    report?.headline,
    body?.text,
    body?.comments?.free,
    earthquake?.condition,
    hypocenter?.name
  ].filter(Boolean).join(" ");

  if (text.includes("遠地")) {
    return true;
  }

  const hasNoDomesticIntensity =
    maxInt === null ||
    maxInt === undefined ||
    maxInt === "" ||
    String(maxInt).includes("不明");

  return hasNoDomesticIntensity && isCoordinateOutsideJapanArea(
    coordinate?.latitude,
    coordinate?.longitude
  );
}

function normalizeRegionCode(code) {
  if (code === null || code === undefined) {
    return "";
  }
  const raw = String(code).trim();
  if (!raw) {
    return "";
  }
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) {
    return raw;
  }
  const normalized = String(Number(digits));
  return normalized === "NaN" ? raw : normalized;
}

function normalizeRegionMaxInt(maxInt) {
  const value = getIntensityValue(maxInt);
  if (value === null || value === undefined) {
    return "-";
  }
  const text = String(value).trim();
  const alias = {
    "5弱": "5-",
    "5強": "5+",
    "6弱": "6-",
    "6強": "6+"
  };
  return alias[text] ?? text;
}

function getRegionMaxIntValue(region = {}) {
  return (
    region?.maxInt ??
    region?.forecastMaxInt ??
    region?.maxIntensity ??
    region?.forecastMaxIntensity ??
    region?.max_int ??
    region?.max_intensity ??
    region?.intensity ??
    region?.int ??
    region?.scale ??
    region?.kind?.code ??
    region?.kind?.name ??
    null
  );
}

function normalizeRegions(rawRegions) {
  if (!Array.isArray(rawRegions)) {
    return [];
  }
  const unique = new Map();
  for (const region of rawRegions) {
    const code = normalizeRegionCode(
      region?.code ??
      region?.areaCode ??
      region?.regionCode
    );
    if (!code) {
      continue;
    }
    unique.set(code, {
      ...region,
      code,
      maxInt: normalizeRegionMaxInt(getRegionMaxIntValue(region))
    });
  }
  return [...unique.values()];
}

function hasForecastIntensityData(intensity = {}, body = {}) {
  const source = intensity && typeof intensity === "object"
    ? intensity
    : body?.intensity ?? {};

  if (hasUsableIntensityValue(source?.forecastMaxInt ?? source?.maxInt ?? body?.forecastMaxInt ?? body?.maxInt)) {
    return true;
  }

  const regions = Array.isArray(source?.regions)
    ? source.regions
    : Array.isArray(body?.regions)
      ? body.regions
      : [];

  return regions.some(region => hasUsableIntensityValue(getRegionMaxIntValue(region)));
}

function getScaleList() {
  return {
    0: "0",
    10: "1",
    20: "2",
    30: "3",
    40: "4",
    45: "5弱",
    50: "5強",
    55: "6弱",
    60: "6強",
    70: "7"
  };
}

const fallbackStationCoordinateLookup = buildJmaIntensityStationCoordinateLookup(
  stationCoordinatesByCode
);

function getPointCoordinate(source) {
  const coordinate =
    source?.coordinate ??
    source?.coordinates ??
    source?.point?.coordinate ??
    source?.location?.coordinate ??
    source?.position ??
    source ??
    {};
  return {
    latitude: getNumberValue(coordinate?.latitude ?? coordinate?.lat),
    longitude: getNumberValue(coordinate?.longitude ?? coordinate?.lng ?? coordinate?.lon)
  };
}

function isLikelyTestData(data) {
  if (!data || typeof data !== "object") {
    return false;
  }
  const eventId = String(data.eventId ?? data.event_id ?? "");
  const place = String(data.place ?? data.name ?? "");
  const title = String(data.title ?? "");
  const text = String(data.text ?? data.comment ?? "");
  const areaText = Array.isArray(data.areas)
    ? data.areas
      .map(area => [
        area?.name,
        area?.kind,
        area?.condition,
        area?.firstHeight?.condition,
        area?.maxHeight?.condition
      ].filter(Boolean).join(" "))
      .join(" ")
    : "";
  const combinedText = `${eventId} ${place} ${title} ${text} ${areaText}`;
  return (
    eventId.startsWith("TEST") ||
    place.includes("テスト") ||
    title.includes("テスト") ||
    /\?{4,}/.test(combinedText)
  );
}

function normalizeStationPoint(
  station,
  parent = {},
  coordinateLookup = fallbackStationCoordinateLookup
) {
  if (!station || typeof station !== "object") {
    return null;
  }

  const code =
    station.code ??
    station.stationCode ??
    station.station_code ??
    station.intensityStationCode ??
    null;
  const normalizedCode = normalizeJmaIntensityStationCode(code);
  if (!isJmaIntensityStationCode(normalizedCode)) {
    return null;
  }
  const name =
    station.name ??
    station.addr ??
    station.address ??
    station.stationName ??
    station.station_name ??
    station.areaName ??
    parent.name ??
    "観測点";
  const intensityValue =
    station.int ??
    station.intensity ??
    station.maxInt ??
    station.maxIntensity ??
    station.scale ??
    station.kind?.code ??
    station.k ??
    station.value ??
    parent.intensity ??
    parent.maxInt ??
    null;

  const intensity = convertIntensityText(intensityValue);
  const scale = convertIntensityToScale(intensityValue);
  if (scale <= 0 && intensity === "-") {
    return null;
  }

  const direct = getPointCoordinate(station);
  const fallback = findJmaIntensityStationCoordinate(coordinateLookup, {
    code: normalizedCode,
    name
  });
  const latitude = direct.latitude ?? fallback?.latitude ?? null;
  const longitude = direct.longitude ?? fallback?.longitude ?? null;

  if (latitude === null || longitude === null) {
    return null;
  }

  return {
    code: normalizedCode,
    name: String(name),
    intensity,
    scale,
    latitude,
    longitude
  };
}

function extractNestedStations(
  node,
  parent = {},
  result = [],
  coordinateLookup = fallbackStationCoordinateLookup
) {
  if (!node) {
    return result;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      extractNestedStations(item, parent, result, coordinateLookup);
    }
    return result;
  }
  if (typeof node !== "object") {
    return result;
  }

  const nextParent = {
    ...parent,
    name: node.name ?? node.areaName ?? node.prefecture ?? parent.name,
    intensity: node.maxInt ?? node.intensity ?? node.int ?? parent.intensity
  };

  const station = normalizeStationPoint(node, parent, coordinateLookup);
  if (station) {
    result.push(station);
  }

  for (const key of [
    "stations",
    "station",
    "points",
    "items",
    "intensityStations",
    "observationPoints",
    "areas",
    "regions",
    "cities",
    "city",
    "wards",
    "prefectures",
    "prefecture"
  ]) {
    if (node[key]) {
      extractNestedStations(node[key], nextParent, result, coordinateLookup);
    }
  }

  return result;
}

function normalizeStations(
  intensity,
  body = {},
  coordinateLookup = fallbackStationCoordinateLookup
) {
  const raw = [];
  extractNestedStations(intensity?.stations, {}, raw, coordinateLookup);
  extractNestedStations(intensity?.station, {}, raw, coordinateLookup);
  extractNestedStations(intensity?.regions, {}, raw, coordinateLookup);
  extractNestedStations(intensity?.prefectures, {}, raw, coordinateLookup);
  extractNestedStations(intensity?.areas, {}, raw, coordinateLookup);
  extractNestedStations(intensity?.observation, {}, raw, coordinateLookup);
  extractNestedStations(intensity?.observations, {}, raw, coordinateLookup);
  extractNestedStations(body?.stations, {}, raw, coordinateLookup);
  extractNestedStations(body?.station, {}, raw, coordinateLookup);
  extractNestedStations(body?.regions, {}, raw, coordinateLookup);
  extractNestedStations(body?.areas, {}, raw, coordinateLookup);
  extractNestedStations(body?.observation, {}, raw, coordinateLookup);
  extractNestedStations(body?.observations, {}, raw, coordinateLookup);
  extractNestedStations(body?.intensityForecast, {}, raw, coordinateLookup);
  extractNestedStations(body?.forecast, {}, raw, coordinateLookup);
  extractNestedStations(body?.forecastAreas, {}, raw, coordinateLookup);

  const seen = new Set();
  return raw.filter(point => {
    const key = [point.code, point.latitude, point.longitude].join(":");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function hasUsableIntensityValue(value) {
  const normalized = getIntensityValue(value);
  if (normalized === null || normalized === undefined) {
    return false;
  }
  const text = String(normalized).trim();
  return text !== "" && text !== "-" && text !== "不明" && text !== "unknown";
}

function accuracyIncludes(value, expected) {
  if (Array.isArray(value)) {
    return value.some(item => accuracyIncludes(item, expected));
  }
  return String(value ?? "") === String(expected);
}
function readAccuracyValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(readAccuracyValue).filter(item => item !== null);
  }

  if (typeof value === "object") {
    return readAccuracyValue(
      value.value ??
      value.code ??
      value.rank ??
      value.condition ??
      value.text
    );
  }

  return String(value);
}

function buildEewQuality(body, earthquake, hypocenter, intensity, options = {}) {
  const accuracy = hypocenter?.accuracy ?? earthquake?.accuracy ?? body?.accuracy ?? {};
  const magnitudeCalculation = readAccuracyValue(accuracy?.magnitudeCalculation);
  const magnitudePointCount = readAccuracyValue(accuracy?.numberOfMagnitudeCalculation);
  const depthAccuracy = readAccuracyValue(accuracy?.depth);
  const epicenters = readAccuracyValue(accuracy?.epicenters);
  const epicenterValues = Array.isArray(epicenters)
    ? epicenters.map(value => String(value))
    : [epicenters].filter(Boolean).map(value => String(value));

  const magnitude = getMagnitudeValue(earthquake, hypocenter);
  const depth = getDepthValue(hypocenter);
  const isVirtualSource =
    String(depth) === "10" &&
    (String(magnitude) === "1" || String(magnitude) === "1.0");
  const conditionText = [
    earthquake?.condition,
    body?.condition
  ].filter(Boolean).join(" ");
  const freeText = [
    body?.text,
    body?.comments?.free
  ].filter(Boolean).join(" ");
  const levelDetectionText = `${conditionText} ${freeText}`;
  const reason = readAccuracyValue(
    intensity?.appendix?.maxIntChangeReason ??
    body?.appendix?.maxIntChangeReason ??
    body?.intensity?.appendix?.maxIntChangeReason
  );
  const hasForecastIntensity = hasForecastIntensityData(intensity, body);
  const hasAssumedHypocenterCondition =
    String(conditionText).includes("仮定震源要素") ||
    String(conditionText).toUpperCase().includes("PLUM") ||
    String(conditionText).toUpperCase().includes("ASSUMED");
  const hasPlumOnlyChangeReason =
    isVirtualSource &&
    accuracyIncludes(reason, "9");
  const isRealtimeIntensityTelegram = String(options?.telegramType ?? "").toUpperCase() === "VXSE47";
  const isPlumLike =
    !hasForecastIntensity && (
      hasAssumedHypocenterCondition ||
      hasPlumOnlyChangeReason
    );
  const levelDetectionTextValue = String(levelDetectionText);
  const isLevelTextHint =
    /\d+\s*gal/i.test(levelDetectionTextValue) ||
    levelDetectionTextValue.includes("\uFF11\uFF10\uFF10\u30AC\u30EB") ||
    levelDetectionTextValue.includes("P\u6CE2/S\u6CE2\u30EC\u30D9\u30EB") ||
    levelDetectionTextValue.includes("\uFF30\u6CE2\uFF0F\uFF33\u6CE2\u30EC\u30D9\u30EB");
  const isLevelLike =
    accuracyIncludes(magnitudeCalculation, "8") ||
    isLevelTextHint;
  const hasSinglePointEvidence =
    accuracyIncludes(magnitudePointCount, "1") ||
    (!hasForecastIntensity && (
      epicenterValues.some(value => value === "1") ||
      accuracyIncludes(depthAccuracy, "1")
    ));
  const isIpfSinglePoint = !hasForecastIntensity && hasSinglePointEvidence;

  let mode = null;

  if (isPlumLike) {
    mode = "plumOnlyAssumedHypocenter";
  }
  else if (isLevelLike) {
    mode = "levelMethodLikely";
  }
  else if (isIpfSinglePoint) {
    mode = "ipfSinglePoint";
  }
  else if (isRealtimeIntensityTelegram) {
    mode = "realtimeIntensity";
  }

  if (!mode) {
    return null;
  }

  return {
    mode,
    lowConfidence: true,
    suppressWaves: true,
    hideHypocenter: true,
    markerVariant: "virtual",
    telegramType: options.telegramType ?? null,
    isVirtualSource
  };
}

async function decodeDmdataBody(body, telegram = {}) {
  if (!body) {
    return null;
  }
  if (typeof body !== "string") {
    return body;
  }

  try {
    if (telegram.encoding === "base64" && telegram.compression === "gzip") {
      const binary = atob(body);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      const text = await new Response(stream).text();
      return JSON.parse(text);
    }

    return JSON.parse(body);
  }
  catch (error) {
    throw new Error(`dmdata_body_decode_failed:${error?.message || error}`);
  }
}

function toHttpUpgradeUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) {
    return raw;
  }
  if (raw.startsWith("wss://")) {
    return `https://${raw.slice("wss://".length)}`;
  }
  if (raw.startsWith("ws://")) {
    return `http://${raw.slice("ws://".length)}`;
  }
  return raw;
}

async function getReportAndBody(telegram) {
  const decodedBody = await decodeDmdataBody(telegram?.body, telegram);
  const report = decodedBody ?? telegram?.body ?? telegram ?? {};
  return {
    report,
    body: report?.body ?? report ?? {}
  };
}

async function normalizeEarthquake(
  telegram,
  coordinateLookup = fallbackStationCoordinateLookup
) {
  const { report, body } = await getReportAndBody(telegram);
  const earthquake = body?.earthquake ?? {};
  const hypocenter = earthquake?.hypocenter ?? {};
  const coordinate = getCoordinate(hypocenter);
  const intensity = body?.intensity ?? {};
  const maxInt = intensity?.maxInt;
  const telegramType = telegram?.head?.type ?? report?.type ?? "VXSE53";
  const points = normalizeStations(intensity, body, coordinateLookup);
  const isDistantEarthquake = isDistantEarthquakeData({
    report,
    body,
    earthquake,
    hypocenter,
    coordinate,
    maxInt
  });

  return {
    eventId:
      earthquake?.eventId ??
      report?.eventId ??
      telegram?.head?.eventId ??
      telegram?.head?.time ??
      nowIso(),
    reportNumber:
      report?.serialNo ?? telegram?.xmlReport?.head?.serial ?? telegram?.head?.serial ?? null,
    place: hypocenter?.name ?? UNKNOWN_HYPOCENTER,
    scale: isDistantEarthquake ? 0 : convertIntensityToScale(maxInt),
    intensity: isDistantEarthquake ? "-" : convertIntensityText(maxInt),
    longPeriodIntensity: getLongPeriodIntensity(intensity, body),
    tsunamiStatus: getEarthquakeTsunamiStatus(body, report, telegram),
    magnitude: getMagnitudeValue(earthquake, hypocenter),
    depth: isDistantEarthquake ? "-" : getDepthValue(hypocenter),
    latitude: getNumberValue(coordinate?.latitude),
    longitude: getNumberValue(coordinate?.longitude),
    time:
      earthquake?.originTime ??
      earthquake?.arrivalTime ??
      report?.pressDateTime ??
      report?.targetDateTime ??
      report?.reportDateTime ??
      telegram?.head?.time ??
      nowIso(),
    points: isDistantEarthquake ? [] : points,
    scaleList: getScaleList(),
    regions: isDistantEarthquake
      ? []
      : normalizeRegions(collectDmdataIntensityRegions(intensity, body)),
    telegramType,
    isDistantEarthquake
  };
}

function getEarthquakeDataTimeMs(data) {
  return toTimeMs(
    data?.time ??
    data?.originTime ??
    data?.origin_time ??
    data?.arrivalTime ??
    data?.updated_at ??
    data?.updatedAt ??
    null
  );
}

export function normalizeGdEarthquakeItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const hypocenter = item.hypocenter ?? item.earthquake?.hypocenter ?? {};
  const coordinate = getCoordinate(hypocenter);
  const maxInt = item.maxInt ?? item.maxIntensity ?? item.intensity ?? null;
  const isDistantEarthquake = String(item.type ?? "").toLowerCase() === "distant" || isDistantEarthquakeData({
    report: item,
    body: item,
    earthquake: item,
    hypocenter,
    coordinate,
    maxInt
  });
  const eventId = String(
    item.eventId ??
    item.eventID ??
    item.id ??
    item.originTime ??
    item.arrivalTime ??
    nowIso()
  );
  const regionCode = normalizeRegionCode(hypocenter.code ?? item.regionCode ?? item.areaCode);
  const regionName = getScalarValue(hypocenter.name ?? item.place ?? item.name, "");
  const hasMaxInt = hasUsableIntensityValue(maxInt);
  const regions = !isDistantEarthquake && regionCode && hasMaxInt
    ? [{ code: regionCode, name: regionName || UNKNOWN_HYPOCENTER, maxInt: normalizeRegionMaxInt(maxInt) }]
    : [];
  const originTime = item.originTime ?? item.arrivalTime ?? item.reportTime ?? nowIso();

  return {
    eventId,
    reportNumber: item.reportNumber ?? item.serialNo ?? null,
    place: regionName || UNKNOWN_HYPOCENTER,
    scale: isDistantEarthquake ? 0 : convertIntensityToScale(maxInt),
    intensity: isDistantEarthquake ? "-" : convertIntensityText(maxInt),
    longPeriodIntensity: getLongPeriodIntensity(item, item),
    tsunamiStatus: getEarthquakeTsunamiStatus(item, item, item),
    magnitude: getMagnitudeValue(item, hypocenter),
    depth: isDistantEarthquake ? "-" : getDepthValue(hypocenter),
    latitude: getNumberValue(coordinate?.latitude),
    longitude: getNumberValue(coordinate?.longitude),
    time: originTime,
    originTime,
    origin_time: originTime,
    arrivalTime: item.arrivalTime ?? null,
    points: [],
    scaleList: getScaleList(),
    regions,
    telegramType: "VXSE53",
    sourceType: "gd-earthquake",
    isDistantEarthquake
  };
}

function collectIntensityValues(node, result = []) {
  if (!node) {
    return result;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectIntensityValues(item, result);
    }
    return result;
  }

  if (typeof node !== "object") {
    if (hasUsableIntensityValue(node)) {
      result.push(node);
    }
    return result;
  }

  for (const key of [
    "int",
    "intensity",
    "maxInt",
    "maxIntensity",
    "forecastMaxInt",
    "forecastMaxIntensity",
    "from",
    "to",
    "value"
  ]) {
    if (hasUsableIntensityValue(node[key])) {
      result.push(node[key]);
    }
  }

  for (const key of [
    "stations",
    "station",
    "points",
    "items",
    "intensityStations",
    "observationPoints",
    "observation",
    "observations"
  ]) {
    if (node[key]) {
      collectIntensityValues(node[key], result);
    }
  }

  return result;
}

function getMaxRealtimeStationIntensity(intensity = {}, body = {}) {
  const values = [];
  collectIntensityValues(intensity?.stations, values);
  collectIntensityValues(intensity?.station, values);
  collectIntensityValues(body?.stations, values);
  collectIntensityValues(body?.station, values);

  let maxValue = null;
  let maxOrder = -1;
  for (const value of values) {
    const order = getIntensityOrder(value);
    if (order > maxOrder) {
      maxOrder = order;
      maxValue = getIntensityValue(value);
    }
  }

  if (maxOrder < 0) {
    return {
      value: null,
      intensity: "震度推定なし",
      scale: 0,
      hasEstimate: false
    };
  }

  return {
    value: maxValue,
    intensity: convertIntensityText(maxValue),
    scale: convertIntensityToScale(maxValue),
    hasEstimate: true
  };
}

function getMaxScalePoint(points = []) {
  if (!Array.isArray(points) || points.length === 0) {
    return null;
  }

  return points.reduce((best, point) => {
    const scale = Number(point?.scale ?? 0);
    const bestScale = Number(best?.scale ?? -Infinity);
    return scale > bestScale ? point : best;
  }, null);
}

async function normalizeEew(telegram) {
  const { report, body } = await getReportAndBody(telegram);
  const earthquake = body?.earthquake ?? {};
  const hypocenter = earthquake?.hypocenter ?? {};
  const coordinate = getCoordinate(hypocenter);
  const intensity = body?.intensity ?? {};
  const maxInt = intensity?.forecastMaxInt ?? intensity?.maxInt ?? body?.forecastMaxInt ?? body?.maxInt;
  const telegramType = telegram?.head?.type ?? report?.type ?? "VXSE45";
  const quality = buildEewQuality(body, earthquake, hypocenter, intensity, { telegramType });
  const stationMax = getMaxRealtimeStationIntensity(intensity, body);
  const realtimeStationPoints = normalizeStations(intensity, body);
  const maxStationPoint = getMaxScalePoint(realtimeStationPoints);
  const stationMarkerCoordinate =
    Number.isFinite(Number(maxStationPoint?.latitude)) &&
    Number.isFinite(Number(maxStationPoint?.longitude))
      ? {
        latitude: Number(maxStationPoint.latitude),
        longitude: Number(maxStationPoint.longitude),
        source: "station",
        name: maxStationPoint.name ?? null
      }
      : null;
  const shouldUseStationMax =
    telegramType === "VXSE47" ||
    (quality?.suppressWaves === true && !hasUsableIntensityValue(maxInt));
  const displayMaxInt = shouldUseStationMax && stationMax.hasEstimate
    ? stationMax.value
    : maxInt;
  const hasDisplayIntensity = hasUsableIntensityValue(displayMaxInt);
  const originTime = earthquake?.originTime ?? earthquake?.arrivalTime ?? null;
  return {
    eventId:
      earthquake?.eventId ??
      report?.eventId ??
      telegram?.head?.eventId ??
      telegram?.head?.time ??
      nowIso(),
    type: telegramType,
    telegramType,
    isWarning: body?.isWarning === true,
    isLastInfo: body?.isLastInfo === true,
    isCanceled: body?.isCanceled === true,
    reportNumber:
      report?.serialNo ?? telegram?.xmlReport?.head?.serial ?? telegram?.head?.serial ?? null,
    place: hypocenter?.name ?? "震源調査中",
    scale: hasDisplayIntensity ? convertIntensityToScale(displayMaxInt) : 0,
    intensity: hasDisplayIntensity ? convertIntensityText(displayMaxInt) : "震度推定なし",
    realtimeStationMaxIntensity: stationMax,
    longPeriodIntensity: getLongPeriodIntensity(intensity, body, { preferForecast: true }),
    magnitude: quality?.suppressWaves === true ? "-" : getMagnitudeValue(earthquake, hypocenter),
    depth: quality?.suppressWaves === true ? "-" : getDepthValue(hypocenter),
    latitude: getNumberValue(coordinate?.latitude),
    longitude: getNumberValue(coordinate?.longitude),
    specialMarkerCoordinate: quality?.suppressWaves === true ? stationMarkerCoordinate : null,
    originTime,
    origin_time: originTime,
    time:
      earthquake?.originTime ??
      earthquake?.arrivalTime ??
      report?.pressDateTime ??
      report?.targetDateTime ??
      report?.reportDateTime ??
      telegram?.head?.time ??
      nowIso(),
    regions: normalizeRegions(intensity?.regions ?? body?.regions ?? []),
    quality: quality ?? undefined
  };
}

function normalizeTsunamiHeight(height) {
  if (!height || typeof height !== "object") {
    const scalar = getScalarValue(height, "");
    const number = Number(scalar);
    return {
      value: scalar !== "" && Number.isFinite(number) ? scalar : null,
      unit: "m",
      over: false,
      condition: scalar !== "" && !Number.isFinite(number) ? scalar : ""
    };
  }

  return {
    value: height.value === null || height.value === undefined
      ? null
      : String(height.value),
    unit: height.unit ?? "m",
    over: height.over === true,
    condition: getScalarValue(height.condition, "")
  };
}

function normalizeTsunamiForecasts(forecasts) {
  return (Array.isArray(forecasts) ? forecasts : []).map(forecast => {
    const height = normalizeTsunamiHeight(forecast?.maxHeight?.height ?? null);
    return {
      code: String(forecast?.code ?? ""),
      name: getScalarValue(forecast?.name, ""),
      kindCode: String(forecast?.kind?.code ?? ""),
      kind: getScalarValue(forecast?.kind?.name ?? forecast?.kind, ""),
      lastKindCode: String(forecast?.kind?.lastKind?.code ?? ""),
      lastKind: getScalarValue(forecast?.kind?.lastKind?.name ?? forecast?.kind?.lastKind, ""),
      arrivalTime: forecast?.firstHeight?.arrivalTime ?? null,
      condition: getScalarValue(forecast?.firstHeight?.condition ?? forecast?.condition, ""),
      arrivalRevise: getScalarValue(forecast?.firstHeight?.revise, ""),
      height: height.value,
      heightUnit: height.unit,
      heightOver: height.over,
      heightCondition: height.condition,
      maxHeightCondition: getScalarValue(forecast?.maxHeight?.condition, ""),
      heightRevise: getScalarValue(forecast?.maxHeight?.revise, ""),
      stations: normalizeTsunamiForecastStations(forecast?.stations)
    };
  });
}

function normalizeTsunamiForecastStations(stations) {
  return (Array.isArray(stations) ? stations : []).map(station => ({
    code: String(station?.code ?? ""),
    name: getScalarValue(station?.name, ""),
    highTideDateTime: station?.highTideDateTime ?? null,
    arrivalTime: station?.firstHeight?.arrivalTime ?? null,
    condition: getScalarValue(station?.firstHeight?.condition, ""),
    revise: getScalarValue(station?.firstHeight?.revise, "")
  }));
}

function normalizeTsunamiObservations(observations, options = {}) {
  return (Array.isArray(observations) ? observations : []).map(observation => ({
    code: observation?.code === null || observation?.code === undefined
      ? null
      : String(observation.code),
    name: getScalarValue(observation?.name, ""),
    stations: (Array.isArray(observation?.stations) ? observation.stations : []).map(station => {
      const maxHeight = normalizeTsunamiHeight(station?.maxHeight?.height ?? null);
      return {
        code: String(station?.code ?? ""),
        name: getScalarValue(station?.name, ""),
        sensor: getScalarValue(station?.sensor, ""),
        firstArrivalTime: station?.firstHeight?.arrivalTime ?? null,
        firstInitial: getScalarValue(station?.firstHeight?.initial, ""),
        firstCondition: getScalarValue(station?.firstHeight?.condition, ""),
        firstRevise: getScalarValue(station?.firstHeight?.revise, ""),
        firstStatus: getScalarValue(station?.firstHeight?.status, ""),
        maxDateTime: station?.maxHeight?.dateTime ?? null,
        maxHeight: maxHeight.value,
        maxHeightUnit: maxHeight.unit,
        maxHeightOver: maxHeight.over,
        maxHeightCondition: maxHeight.condition,
        maxCondition: getScalarValue(station?.maxHeight?.condition, ""),
        maxRevise: getScalarValue(station?.maxHeight?.revise, ""),
        maxStatus: getScalarValue(station?.maxHeight?.status, ""),
        offshore: options.offshore === true
      };
    })
  }));
}

function normalizeTsunamiEstimations(estimations) {
  return (Array.isArray(estimations) ? estimations : []).map(estimation => {
    const height = normalizeTsunamiHeight(estimation?.maxHeight?.height ?? null);
    return {
      code: String(estimation?.code ?? ""),
      name: getScalarValue(estimation?.name, ""),
      arrivalTime: estimation?.firstHeight?.arrivalTime ?? null,
      condition: getScalarValue(estimation?.firstHeight?.condition ?? estimation?.condition, ""),
      arrivalRevise: getScalarValue(estimation?.firstHeight?.revise, ""),
      estimatedDateTime: estimation?.maxHeight?.dateTime ?? null,
      height: height.value,
      heightUnit: height.unit,
      heightOver: height.over,
      heightCondition: height.condition,
      maxCondition: getScalarValue(estimation?.maxHeight?.condition, ""),
      maxHeightCondition: getScalarValue(estimation?.maxHeight?.condition, ""),
      heightRevise: getScalarValue(estimation?.maxHeight?.revise, "")
    };
  });
}

async function normalizeTsunami(telegram) {
  const { report, body } = await getReportAndBody(telegram);
  const telegramType = telegram?.head?.type ?? report?.type ?? "VTSE41";
  const tsunami = body?.tsunami ?? {};
  const rawEarthquakes = Array.isArray(body?.earthquakes) ? body.earthquakes : [];
  const earthquake = body?.earthquake ?? rawEarthquakes[0] ?? {};
  const hypocenter = earthquake?.hypocenter ?? {};
  const coordinate = getCoordinate(hypocenter);
  const forecasts = Array.isArray(tsunami?.forecasts) ? tsunami.forecasts : [];
  const observations = Array.isArray(tsunami?.observations) ? tsunami.observations : [];
  const estimations = Array.isArray(tsunami?.estimations) ? tsunami.estimations : [];
  const normalizedForecasts = normalizeTsunamiForecasts(forecasts);
  const normalizedObservations = normalizeTsunamiObservations(observations, {
    offshore: String(telegramType).toUpperCase() === "VTSE52"
  });
  const normalizedEstimations = normalizeTsunamiEstimations(estimations);
  const isDistantEarthquake = isDistantEarthquakeData({
    report,
    body,
    earthquake,
    hypocenter,
    coordinate,
    maxInt: null
  });
  const eventId =
    earthquake?.eventId ??
    report?.eventId ??
    telegram?.xmlReport?.head?.eventId ??
    telegram?.head?.eventId ??
    null;
  const infoType = report?.infoType ?? telegram?.xmlReport?.head?.infoType ?? telegram?.head?.infoType ?? null;
  const status = report?.status ?? telegram?.xmlReport?.control?.status ?? telegram?.head?.status ?? null;
  const explicitlyCanceled =
    body?.isCanceled === true ||
    String(infoType ?? "").includes("取消") ||
    String(status ?? "").includes("取消");
  return {
    eventId,
    type: telegramType,
    telegramType,
    reportTime: report?.reportDateTime ?? report?.pressDateTime ?? telegram?.head?.time ?? nowIso(),
    validTime:
      report?.validDateTime ??
      report?.head?.validDateTime ??
      telegram?.head?.validDateTime ??
      telegram?.validDateTime ??
      null,
    title: report?.title ?? telegram?.head?.title ?? telegram?.head?.type ?? "津波情報",
    headline:
      report?.headline ??
      telegram?.xmlReport?.head?.headline ??
      body?.text ??
      "",
    status,
    infoType,
    text: body?.text ?? "",
    isCanceled: explicitlyCanceled,
    areas: normalizedForecasts,
    observations: normalizedObservations,
    estimations: normalizedEstimations,
    earthquake: {
      eventId,
      name: hypocenter?.name ?? UNKNOWN_HYPOCENTER,
      time:
        earthquake?.originTime ??
        earthquake?.arrivalTime ??
        report?.targetDateTime ??
        report?.reportDateTime ??
        report?.pressDateTime ??
        telegram?.head?.time ??
        nowIso(),
      magnitude: getMagnitudeValue(earthquake, hypocenter),
      depth: isDistantEarthquake ? "-" : getDepthValue(hypocenter),
      latitude: getNumberValue(coordinate?.latitude),
      longitude: getNumberValue(coordinate?.longitude),
      isDistantEarthquake
    },
    earthquakes: rawEarthquakes.map(item => {
      const itemHypocenter = item?.hypocenter ?? {};
      const itemCoordinate = getCoordinate(itemHypocenter);
      const itemIsDistantEarthquake = isDistantEarthquakeData({
        report,
        body,
        earthquake: item,
        hypocenter: itemHypocenter,
        coordinate: itemCoordinate,
        maxInt: null
      });
      return {
        eventId:
          item?.eventId ??
          report?.eventId ??
          telegram?.head?.eventId ??
          telegram?.head?.time ??
          null,
        name: itemHypocenter?.name ?? UNKNOWN_HYPOCENTER,
        time:
          item?.originTime ??
          item?.arrivalTime ??
          report?.targetDateTime ??
          report?.reportDateTime ??
          report?.pressDateTime ??
          telegram?.head?.time ??
          nowIso(),
        magnitude: getMagnitudeValue(item, itemHypocenter),
        depth: itemIsDistantEarthquake ? "-" : getDepthValue(itemHypocenter),
        latitude: getNumberValue(itemCoordinate?.latitude),
        longitude: getNumberValue(itemCoordinate?.longitude),
        isDistantEarthquake: itemIsDistantEarthquake
      };
    })
  };
}

function toHistoryItem(earthquake, timestamp = nowIso()) {
  return {
    event_id: earthquake?.eventId ?? `event-${timestamp}`,
    telegram_type: earthquake?.telegramType ?? null,
    report_number: earthquake?.reportNumber ?? null,
    place: earthquake?.place ?? "震源調査中",
    origin_time: earthquake?.time ?? timestamp,
    magnitude: earthquake?.magnitude ?? "-",
    depth: earthquake?.depth ?? "-",
    max_intensity: earthquake?.intensity ?? "-",
    max_scale: Number(earthquake?.scale ?? 0),
    long_period_intensity: earthquake?.longPeriodIntensity ?? null,
    tsunami_status: earthquake?.tsunamiStatus ?? null,
    latitude: earthquake?.latitude ?? null,
    longitude: earthquake?.longitude ?? null,
    regions: Array.isArray(earthquake?.regions) ? earthquake.regions : [],
    updated_at: timestamp,
    created_at: timestamp
  };
}

function getRegionIntensityScale(region = {}) {
  return convertIntensityToScale(
    region?.maxInt ??
    region?.max_int ??
    region?.maxIntensity ??
    region?.max_intensity ??
    region?.intensity ??
    region?.int ??
    region?.scale ??
    region?.kind?.code ??
    region?.kind?.name
  );
}

function mergeHistoryRegions(existingRegions = [], incomingRegions = []) {
  const merged = new Map();

  const put = region => {
    const code = normalizeRegionCode(
      region?.code ??
      region?.areaCode ??
      region?.regionCode
    );
    if (!code) return;

    const normalized = {
      ...region,
      code,
      maxInt: normalizeRegionMaxInt(
        region?.maxInt ??
        region?.max_int ??
        region?.maxIntensity ??
        region?.max_intensity ??
        region?.intensity ??
        region?.int ??
        region?.scale ??
        region?.kind?.code ??
        region?.kind?.name
      )
    };
    const current = merged.get(code);
    if (!current || getRegionIntensityScale(normalized) >= getRegionIntensityScale(current)) {
      merged.set(code, { ...current, ...normalized });
    }
  };

  (Array.isArray(existingRegions) ? existingRegions : []).forEach(put);
  (Array.isArray(incomingRegions) ? incomingRegions : []).forEach(put);
  return [...merged.values()];
}

function mergeHistoryItems(existingItem, incomingItem) {
  if (!existingItem) return incomingItem;
  if (!incomingItem) return existingItem;

  return {
    ...existingItem,
    ...incomingItem,
    tsunami_status: incomingItem.tsunami_status ?? existingItem.tsunami_status ?? null,
    regions: mergeHistoryRegions(existingItem.regions, incomingItem.regions),
    created_at: existingItem.created_at ?? incomingItem.created_at
  };
}

function toTsunamiHistoryItem(tsunami, timestamp = nowIso()) {
  const causeEarthquake = tsunami?.earthquake ??
    (Array.isArray(tsunami?.earthquakes) ? tsunami.earthquakes[0] : null) ??
    {};
  const eventId = tsunami?.eventId ??
    causeEarthquake?.eventId ??
    tsunami?.reportTime ??
    tsunami?.time ??
    timestamp;

  return {
    event_id: String(eventId),
    telegram_type: tsunami?.telegramType ?? tsunami?.type ?? null,
    issue_time: tsunami?.time ?? tsunami?.reportTime ?? timestamp,
    revoked: tsunami?.revoked === true || tsunami?.isCanceled === true ? 1 : 0,
    areas: Array.isArray(tsunami?.areas) ? tsunami.areas : [],
    observations: Array.isArray(tsunami?.observations) ? tsunami.observations : [],
    estimations: Array.isArray(tsunami?.estimations) ? tsunami.estimations : [],
    comments: tsunami?.comments ?? tsunami?.text ?? null,
    updated_at: timestamp,
    created_at: timestamp
  };
}

function getHistoryItemEventId(item) {
  return String(item?.event_id ?? item?.eventId ?? "");
}

function getEventIdFromData(data) {
  return String(
    data?.eventId ??
    data?.event_id ??
    data?.time ??
    ""
  );
}

function shouldCloseLatestEewByEarthquake(earthquakeData, latestEewData) {
  if (!earthquakeData || !latestEewData) {
    return false;
  }
  const telegramType = String(earthquakeData.telegramType || "").toUpperCase();
  if (telegramType !== "VXSE53") {
    return false;
  }
  const earthquakeEventId = String(earthquakeData.eventId || "");
  const latestEewEventId = String(latestEewData.eventId || "");
  if (!latestEewEventId) {
    return true;
  }
  if (!earthquakeEventId) {
    return true;
  }
  return earthquakeEventId === latestEewEventId;
}

function normalizeEewEventId(value) {
  return String(value ?? "").trim();
}

function normalizeFinalizedEewEventIds(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const uniq = new Set();
  for (const item of raw) {
    const normalized = normalizeEewEventId(item);
    if (normalized) {
      uniq.add(normalized);
    }
  }
  return [...uniq];
}

function limitStringArray(values, maxLength) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.slice(0, Math.max(0, Number(maxLength) || 0));
}

function isUnresolvedEarthquakeData(data) {
  if (!data || typeof data !== "object") {
    return true;
  }

  const isBlank = (value) =>
    value === null ||
    value === undefined ||
    value === "" ||
    value === "-";

  const hasLocation =
    data.latitude !== null &&
    data.latitude !== undefined &&
    data.longitude !== null &&
    data.longitude !== undefined;
  const hasDetails =
    !isBlank(data.magnitude) ||
    !isBlank(data.depth) ||
    !isBlank(data.intensity ?? data.max_intensity) ||
    !isBlank(data.longPeriodIntensity ?? data.long_period_intensity) ||
    Number(data.scale ?? 0) > 0 ||
    Number(data.max_scale ?? 0) > 0 ||
    (Array.isArray(data.regions) && data.regions.length > 0) ||
    (Array.isArray(data.points) && data.points.length > 0);

  return !hasLocation && !hasDetails;
}

function isUnresolvedHistoryItem(item) {
  return isUnresolvedEarthquakeData({
    magnitude: item?.magnitude,
    depth: item?.depth,
    intensity: item?.max_intensity,
    longPeriodIntensity: item?.long_period_intensity,
    scale: item?.max_scale,
    latitude: item?.latitude,
    longitude: item?.longitude,
    regions: item?.regions
  });
}

async function mapDmdataMessageToEvents(
  payload,
  coordinateLookup = fallbackStationCoordinateLookup
) {
  const type = String(payload?.head?.type ?? "").toUpperCase();
  const classification = String(payload?.classification ?? "").toLowerCase();
  if (!type) {
    // Fallback for dmdata envelopes where head.type is omitted or wrapped.
    if (classification.includes("telegram.earthquake")) {
      return [{ type: "earthquake", data: await normalizeEarthquake(payload, coordinateLookup) }];
    }
    if (classification.includes("eew.forecast")) {
      return [{ type: "eew", data: await normalizeEew(payload) }];
    }
    if (classification.includes("tsunami")) {
      return [{ type: "tsunami", data: await normalizeTsunami(payload) }];
    }
    return [];
  }
  if (type === "VXSE42" || type === "VXSE43" || type === "VXSE44" || type === "VXSE45" || type === "VXSE47") {
    return [{ type: "eew", data: await normalizeEew(payload) }];
  }
  if (type === "VXSE51" || type === "VXSE52" || type === "VXSE53" || type === "VXSE62") {
    return [{ type: "earthquake", data: await normalizeEarthquake(payload, coordinateLookup) }];
  }
  if (type === "VTSE41" || type === "VTSE51" || type === "VTSE52") {
    return [{ type: "tsunami", data: await normalizeTsunami(payload) }];
  }
  return [{ type: "status", data: payload }];
}

function extractDmdataTelegramPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  // The dmdata WebSocket can wrap the actual telegram in body.
  // Always unwrap it first so gzip/base64 body decoding sees the real telegram.
  if (payload.body && typeof payload.body === "object") {
    const nested = extractDmdataTelegramPayload(payload.body);
    if (nested) {
      return nested;
    }
    if (payload.body.head || payload.body.body || payload.body.xmlReport) {
      return payload.body;
    }
  }

  // Most common dmdata v2 telegram event.
  if (String(payload.type || "").toLowerCase() === "telegram") {
    return payload;
  }

  // Defensive fallbacks for wrapped schemas.
  if (payload.telegram && typeof payload.telegram === "object") {
    return payload.telegram;
  }
  if (payload.data && typeof payload.data === "object" && payload.data.head) {
    return payload.data;
  }
  if (payload.head && typeof payload.head === "object") {
    return payload;
  }

  return null;
}

async function openClientWebSocket(url, protocol) {
  const headers = { Upgrade: "websocket" };
  if (protocol) {
    headers["Sec-WebSocket-Protocol"] = protocol;
  }
  const res = await fetch(url, {
    method: "GET",
    headers
  });
  const ws = res.webSocket;
  if (!ws) {
    throw new Error(`upstream_websocket_failed_${res.status}`);
  }
  ws.accept();
  return ws;
}

export class MeteoScopeEarthquakeHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.latest = createInitialLatest();
    this.finalizedEewEventIds = new Set();
    this.earthquakeHistory = [];
    this.clients = new Set();
    this.clientMeta = new Map();
    this.dmdata = {
      connected: false,
      lastMessageAt: null,
      lastError: null,
      reconnectAttempt: 0,
      lastConnectAt: null
    };
    this.retentionCleanup = {
      running: false,
      lastRunAt: null,
      lastError: null,
      lastResult: null
    };
    this.gdEarthquakeBackfill = {
      running: false,
      lastRunAt: null,
      lastError: null,
      lastResult: null
    };
    this.dmdataTelegramBackfill = {
      running: false,
      lastRunAt: null,
      lastError: null,
      lastResult: null,
      cursorToken: null
    };
    this.stationCoordinateLookup = fallbackStationCoordinateLookup;
    this.dmdataStationCatalog = {
      loading: false,
      loadedAt: null,
      lastAttemptAt: null,
      lastError: null,
      stationCount: 0,
      version: null,
      changeTime: null
    };
    this.gdEarthquakeLastPollMs = 0;
    this.dmdataTelegramLastPollMs = 0;
    this.dmdataSocket = null;
    this.dmdataSocketExpiresAt = null;
    this.initialized = this.initialize();
  }

  async initialize() {
    try {
      const savedLatest = await this.state.storage.get(STATE_KEY);
      if (savedLatest && typeof savedLatest === "object") {
        this.latest = { ...createInitialLatest(), ...savedLatest };
        this.latest.finalizedEewEventIds = normalizeFinalizedEewEventIds(
          this.latest.finalizedEewEventIds
        );
      }
      this.finalizedEewEventIds = new Set(this.latest.finalizedEewEventIds ?? []);
      this.finalizedEewEventIds = new Set(limitStringArray(
        [...this.finalizedEewEventIds],
        FINALIZED_EEW_EVENT_IDS_MAX_SIZE
      ));
      this.latest.finalizedEewEventIds = [...this.finalizedEewEventIds];
      await this.ensureHistorySchema();
      if (this.latest.tsunami && isStaleTsunamiStored(this.latest.tsunami)) {
        this.latest.tsunami = null;
      }
      if (this.latest.tsunami?.data && !isLikelyTestData(this.latest.tsunami.data)) {
        await this.saveTsunamiHistoryToD1(
          toTsunamiHistoryItem(this.latest.tsunami.data, this.latest.tsunami.timestamp ?? nowIso())
        );
      }
      const d1History = await this.loadHistoryFromD1(HISTORY_MAX_ITEMS);
      if (Array.isArray(d1History) && d1History.length > 0) {
        this.earthquakeHistory = d1History;
      }
      else {
        const savedHistory = await this.state.storage.get(HISTORY_KEY);
        if (Array.isArray(savedHistory)) {
          this.earthquakeHistory = savedHistory;
        }
      }
      const latestEewEventId = getEventIdFromData(this.latest.eew?.data);
      if (latestEewEventId && this.isEarthquakeEventFinalized(latestEewEventId)) {
        this.latest.eew = null;
        await this.persistLatest();
      }
      else if (this.latest.eew && isStaleEewStored(this.latest.eew)) {
        this.latest.eew = null;
        await this.persistLatest();
      }
      const cleanupMarker = await this.state.storage.get(RETENTION_CLEANUP_KEY);
      if (cleanupMarker && typeof cleanupMarker === "object") {
        this.retentionCleanup.lastRunAt = cleanupMarker.lastRunAt ?? null;
        this.retentionCleanup.lastResult = cleanupMarker.lastResult ?? null;
        this.retentionCleanup.lastError = cleanupMarker.lastError ?? null;
      }
      const telegramMarker = await this.state.storage.get(DMDATA_TELEGRAM_CURSOR_KEY);
      if (telegramMarker && typeof telegramMarker === "object") {
        this.dmdataTelegramBackfill.lastRunAt = telegramMarker.lastRunAt ?? null;
        this.dmdataTelegramBackfill.lastResult = telegramMarker.lastResult ?? null;
        this.dmdataTelegramBackfill.lastError = telegramMarker.lastError ?? null;
        this.dmdataTelegramBackfill.cursorToken = telegramMarker.cursorToken ?? null;
      }
    }
    catch (error) {
      console.error("[DataHubDO] storage load failed", error);
    }

    await this.refreshDmdataStationCatalog();
    await this.scheduleNextTick(1000);
  }

  async refreshDmdataStationCatalog() {
    if (this.dmdataStationCatalog.loading) {
      return;
    }

    const apiKey = String(this.env?.DMDATA_API_KEY || "").trim();
    const attemptedAt = nowIso();
    this.dmdataStationCatalog.lastAttemptAt = attemptedAt;
    if (!apiKey) {
      this.dmdataStationCatalog.lastError = "dmdata_api_key_not_configured";
      return;
    }

    this.dmdataStationCatalog.loading = true;
    try {
      const response = await fetchWithTimeout(fetch, DMDATA_EARTHQUAKE_STATION_PARAMETER_URL, {
        method: "GET",
        headers: {
          Authorization: `Basic ${btoa(`${apiKey}:`)}`,
          Accept: "application/json"
        }
      }, 10_000);
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.status !== "ok") {
        throw new Error(`dmdata_station_parameter_http_${response.status}`);
      }

      const lookup = buildJmaIntensityStationCoordinateLookup(payload.items);
      const stationCount = lookup.byCode.size;
      if (stationCount < DMDATA_EARTHQUAKE_STATION_MIN_COUNT) {
        throw new Error(`dmdata_station_parameter_count_${stationCount}`);
      }

      this.stationCoordinateLookup = lookup;
      this.dmdataStationCatalog.loadedAt = attemptedAt;
      this.dmdataStationCatalog.lastError = null;
      this.dmdataStationCatalog.stationCount = stationCount;
      this.dmdataStationCatalog.version = payload.version ?? null;
      this.dmdataStationCatalog.changeTime = payload.changeTime ?? null;
    }
    catch (error) {
      this.dmdataStationCatalog.lastError = String(
        error?.message || error || "dmdata_station_parameter_failed"
      );
    }
    finally {
      this.dmdataStationCatalog.loading = false;
    }
  }

  async refreshDmdataStationCatalogIfDue() {
    const lastAttemptMs = toTimeMs(this.dmdataStationCatalog.lastAttemptAt) ?? 0;
    const loadedAtMs = toTimeMs(this.dmdataStationCatalog.loadedAt) ?? 0;
    const retryDue = !loadedAtMs && Date.now() - lastAttemptMs >= DMDATA_EARTHQUAKE_STATION_RETRY_MS;
    const refreshDue = loadedAtMs && Date.now() - loadedAtMs >= DMDATA_EARTHQUAKE_STATION_REFRESH_MS;
    if (retryDue || refreshDue) {
      await this.refreshDmdataStationCatalog();
    }
  }

  async scheduleNextTick(delayMs = 1000) {
    try {
      const when = Date.now() + Math.max(1000, Number(delayMs) || 1000);
      await this.state.storage.setAlarm(when);
    }
    catch (error) {
      console.error("[DataHubDO] setAlarm failed", error);
    }
  }

  async alarm() {
    await this.initialized;
    try {
      await this.runBackgroundTick();
    }
    catch (error) {
      console.error("[DataHubDO] background tick failed", error);
    }
    finally {
      const reconnectDelay = Math.min(
        60_000,
        Math.max(5_000, 5_000 * (2 ** Math.min(this.dmdata.reconnectAttempt, 4)))
      );
      await this.scheduleNextTick(this.dmdata.connected ? 30_000 : reconnectDelay);
    }
  }

  async runBackgroundTick() {
    await Promise.allSettled([
      this.ensureDmdataStream(),
      this.pollGdEarthquakesOnce(),
      this.pollDmdataTelegramsOnce(),
      this.refreshDmdataStationCatalogIfDue()
    ]);

    await this.runRetentionCleanupIfDue();
  }

  getRestorableLatestEew() {
    if (
      !this.latest.eew ||
      isStaleEewStored(this.latest.eew) ||
      isUnresolvedEarthquakeData(this.latest.eew.data) ||
      isLikelyTestData(this.latest.eew.data)
    ) {
      return null;
    }

    return this.latest.eew;
  }

  getLatestDataObject(options = {}) {
    const includeEew = options.includeEew !== false;
    const latestEew = this.getRestorableLatestEew();

    return {
      earthquake: this.latest.earthquake &&
        !isUnresolvedEarthquakeData(this.latest.earthquake.data) &&
        !isLikelyTestData(this.latest.earthquake.data)
        ? sanitizeJmaIntensityStationPoints(this.latest.earthquake.data)
        : null,
      eew: includeEew && latestEew ? latestEew.data : null,
      tsunami: this.latest.tsunami?.data &&
        !isLikelyTestData(this.latest.tsunami.data) &&
        !isStaleTsunamiStored(this.latest.tsunami)
        ? this.latest.tsunami.data
        : null,
      finalizedEewEventIds: includeEew ? this.latest.finalizedEewEventIds ?? [] : [],
      receivedAt: {
        earthquake: this.latest.earthquake?.timestamp ?? null,
        eew: includeEew ? latestEew?.timestamp ?? null : null,
        tsunami: this.latest.tsunami?.timestamp ?? null
      },
      earthquakeReceivedAt: this.latest.earthquake?.timestamp ?? null,
      eewReceivedAt: includeEew ? latestEew?.timestamp ?? null : null,
      tsunamiReceivedAt: this.latest.tsunami?.timestamp ?? null
    };
  }

  async persistLatest() {
    this.latest.finalizedEewEventIds = normalizeFinalizedEewEventIds(this.latest.finalizedEewEventIds);
    this.finalizedEewEventIds = new Set(this.latest.finalizedEewEventIds);
    try {
      await this.state.storage.put(STATE_KEY, this.latest);
    }
    catch (error) {
      console.error("[DataHubDO] persist latest failed", error);
    }
  }

  async persistHistory() {
    try {
      await this.state.storage.put(HISTORY_KEY, this.earthquakeHistory);
    }
    catch (error) {
      console.error("[DataHubDO] persist history failed", error);
    }
  }

  async ensureHistorySchema() {
    const db = this.env?.EQ_D1;
    if (!db) {
      return;
    }
    try {
      await db.exec(`
CREATE TABLE IF NOT EXISTS earthquake_history (
  event_id TEXT PRIMARY KEY,
  telegram_type TEXT,
  report_number TEXT,
  place TEXT,
  origin_time TEXT,
  magnitude TEXT,
  depth TEXT,
  max_intensity TEXT,
  max_scale INTEGER,
  long_period_intensity TEXT,
  tsunami_status TEXT,
  latitude REAL,
  longitude REAL,
  regions_json TEXT,
  updated_at TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_earthquake_history_origin_time
  ON earthquake_history(origin_time DESC);
CREATE TABLE IF NOT EXISTS station_intensities (
  event_id TEXT NOT NULL,
  station_code TEXT NOT NULL,
  station_name TEXT,
  intensity TEXT,
  scale INTEGER,
  latitude REAL,
  longitude REAL,
  updated_at TEXT,
  PRIMARY KEY (event_id, station_code)
);
CREATE INDEX IF NOT EXISTS idx_station_intensities_event_id
  ON station_intensities(event_id);
CREATE TABLE IF NOT EXISTS tsunami_history (
  event_id TEXT PRIMARY KEY,
  telegram_type TEXT,
  issue_time TEXT,
  revoked INTEGER,
  areas_json TEXT,
  observations_json TEXT,
  estimations_json TEXT,
  comments_json TEXT,
  updated_at TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tsunami_history_issue_time
  ON tsunami_history(issue_time DESC);
      `);
      try {
        await db.exec("ALTER TABLE earthquake_history ADD COLUMN tsunami_status TEXT;");
      }
      catch (error) {
        if (!String(error?.message || error).includes("duplicate column")) {
          throw error;
        }
      }
      await db.prepare(`
        DELETE FROM station_intensities
        WHERE length(station_code) != 7
           OR station_code GLOB '*[^0-9]*'
      `).run();
    }
    catch (error) {
      console.error("[DataHubDO] ensure D1 schema failed", error);
    }
  }

  async loadHistoryFromD1(limit = 12) {
    const db = this.env?.EQ_D1;
    if (!db) {
      return null;
    }
    try {
      const size = Math.max(1, Math.min(100, Number(limit) || 12));
      const result = await db
        .prepare(`
          SELECT
            event_id, telegram_type, report_number, place, origin_time,
            magnitude, depth, max_intensity, max_scale, long_period_intensity,
            tsunami_status, latitude, longitude, regions_json, updated_at, created_at
          FROM earthquake_history
          WHERE event_id NOT LIKE 'TEST%'
            AND place NOT LIKE '%テスト%'
          ORDER BY datetime(origin_time) DESC, datetime(updated_at) DESC
          LIMIT ?
        `)
        .bind(size)
        .all();

      const rows = Array.isArray(result?.results) ? result.results : [];
      return rows.map(row => ({
        event_id: row.event_id,
        telegram_type: row.telegram_type,
        report_number: row.report_number,
        place: row.place,
        origin_time: row.origin_time,
        magnitude: row.magnitude,
        depth: row.depth,
        max_intensity: row.max_intensity,
        max_scale: Number(row.max_scale ?? 0),
        long_period_intensity: row.long_period_intensity,
        tsunami_status: row.tsunami_status ?? null,
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        regions: (() => {
          try {
            const parsed = JSON.parse(row.regions_json || "[]");
            return Array.isArray(parsed) ? parsed : [];
          }
          catch {
            return [];
          }
        })(),
        updated_at: row.updated_at,
        created_at: row.created_at
      }));
    }
    catch (error) {
      console.error("[DataHubDO] load history from D1 failed", error);
      return null;
    }
  }

  async loadHistoryItemFromD1(eventId) {
    const db = this.env?.EQ_D1;
    const id = String(eventId || "").trim();
    if (!db || !id) {
      return null;
    }
    try {
      const row = await db
        .prepare(`
          SELECT
            event_id, telegram_type, report_number, place, origin_time,
            magnitude, depth, max_intensity, max_scale, long_period_intensity,
            tsunami_status, latitude, longitude, regions_json, updated_at, created_at
          FROM earthquake_history
          WHERE event_id = ?
          LIMIT 1
        `)
        .bind(id)
        .first();

      if (!row) {
        return null;
      }

      let regions = [];
      try {
        const parsed = JSON.parse(row.regions_json || "[]");
        regions = Array.isArray(parsed) ? parsed : [];
      }
      catch {
        regions = [];
      }

      return {
        eventId: row.event_id,
        telegramType: row.telegram_type,
        reportNumber: row.report_number,
        place: row.place,
        time: row.origin_time,
        magnitude: row.magnitude,
        depth: row.depth,
        intensity: row.max_intensity,
        scale: Number(row.max_scale ?? 0),
        longPeriodIntensity: row.long_period_intensity ?? null,
        tsunamiStatus: row.tsunami_status ?? null,
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        regions,
        updatedAt: row.updated_at,
        createdAt: row.created_at
      };
    }
    catch (error) {
      console.error("[DataHubDO] load history item from D1 failed", error);
      return null;
    }
  }

  async saveHistoryItemToD1(item) {
    const db = this.env?.EQ_D1;
    if (!db || !item) {
      return;
    }
    try {
      const existing = await this.loadHistoryItemFromD1(item.event_id);
      const mergedItem = mergeHistoryItems(existing, item);
      const regionsJson = JSON.stringify(Array.isArray(mergedItem.regions) ? mergedItem.regions : []);
      await db
        .prepare(`
          INSERT INTO earthquake_history (
            event_id, telegram_type, report_number, place, origin_time,
            magnitude, depth, max_intensity, max_scale, long_period_intensity,
            tsunami_status, latitude, longitude, regions_json, updated_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(event_id) DO UPDATE SET
            telegram_type=excluded.telegram_type,
            report_number=excluded.report_number,
            place=excluded.place,
            origin_time=excluded.origin_time,
            magnitude=excluded.magnitude,
            depth=excluded.depth,
            max_intensity=excluded.max_intensity,
            max_scale=excluded.max_scale,
            long_period_intensity=excluded.long_period_intensity,
            tsunami_status=COALESCE(excluded.tsunami_status, earthquake_history.tsunami_status),
            latitude=excluded.latitude,
            longitude=excluded.longitude,
            regions_json=excluded.regions_json,
            updated_at=excluded.updated_at
        `)
        .bind(
          mergedItem.event_id,
          mergedItem.telegram_type,
          mergedItem.report_number,
          mergedItem.place,
          mergedItem.origin_time,
          String(mergedItem.magnitude ?? "-"),
          String(mergedItem.depth ?? "-"),
          String(mergedItem.max_intensity ?? "-"),
          Number(mergedItem.max_scale ?? 0),
          mergedItem.long_period_intensity == null ? null : String(mergedItem.long_period_intensity),
          mergedItem.tsunami_status == null ? null : String(mergedItem.tsunami_status),
          mergedItem.latitude == null ? null : Number(mergedItem.latitude),
          mergedItem.longitude == null ? null : Number(mergedItem.longitude),
          regionsJson,
          mergedItem.updated_at,
          mergedItem.created_at
        )
        .run();
    }
    catch (error) {
      console.error("[DataHubDO] save history to D1 failed", error);
    }
  }

  async loadStationIntensitiesFromD1(eventId) {
    const db = this.env?.EQ_D1;
    if (!db || !eventId) {
      return null;
    }
    try {
      const result = await db
        .prepare(`
          SELECT
            event_id, station_code, station_name, intensity,
            scale, latitude, longitude, updated_at
          FROM station_intensities
          WHERE event_id = ?
          ORDER BY scale DESC, station_code ASC
        `)
        .bind(eventId)
        .all();

      const rows = Array.isArray(result?.results) ? result.results : [];
      return rows
        .filter(row => isJmaIntensityStationCode(row.station_code))
        .map(row => ({
          event_id: row.event_id,
          station_code: row.station_code,
          station_name: row.station_name,
          intensity: row.intensity ?? "-",
          scale: Number(row.scale ?? 0),
          latitude: row.latitude ?? null,
          longitude: row.longitude ?? null,
          updated_at: row.updated_at
        }));
    }
    catch (error) {
      console.error("[DataHubDO] load station intensities from D1 failed", error);
      return null;
    }
  }

  async saveStationIntensitiesToD1(eventId, points = [], timestamp = nowIso()) {
    const db = this.env?.EQ_D1;
    const validPoints = Array.isArray(points)
      ? points.filter(point => isJmaIntensityStationCode(point?.code))
      : [];
    if (!db || !eventId || validPoints.length === 0) {
      return;
    }
    try {
      const statements = validPoints.map((point) => {
        const stationCode = normalizeJmaIntensityStationCode(point.code);
        return db
          .prepare(`
            INSERT INTO station_intensities (
              event_id, station_code, station_name, intensity,
              scale, latitude, longitude, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(event_id, station_code) DO UPDATE SET
              station_name=COALESCE(excluded.station_name, station_intensities.station_name),
              intensity=COALESCE(excluded.intensity, station_intensities.intensity),
              scale=COALESCE(excluded.scale, station_intensities.scale),
              latitude=COALESCE(excluded.latitude, station_intensities.latitude),
              longitude=COALESCE(excluded.longitude, station_intensities.longitude),
              updated_at=excluded.updated_at
          `)
          .bind(
            eventId,
            stationCode,
            point?.name ?? null,
            point?.intensity ?? null,
            point?.scale == null ? null : Number(point.scale),
            point?.latitude == null ? null : Number(point.latitude),
            point?.longitude == null ? null : Number(point.longitude),
            timestamp
          );
      });

      for (let i = 0; i < statements.length; i += 50) {
        await db.batch(statements.slice(i, i + 50));
      }
    }
    catch (error) {
      console.error("[DataHubDO] save station intensities to D1 failed", error);
    }
  }

  async saveTsunamiHistoryToD1(item) {
    const db = this.env?.EQ_D1;
    if (!db || !item?.event_id) {
      return;
    }
    try {
      await db
        .prepare(`
          INSERT INTO tsunami_history (
            event_id, telegram_type, issue_time, revoked,
            areas_json, observations_json, estimations_json, comments_json,
            updated_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(event_id) DO UPDATE SET
            telegram_type=excluded.telegram_type,
            issue_time=COALESCE(excluded.issue_time, tsunami_history.issue_time),
            revoked=COALESCE(excluded.revoked, tsunami_history.revoked),
            areas_json=COALESCE(excluded.areas_json, tsunami_history.areas_json),
            observations_json=COALESCE(excluded.observations_json, tsunami_history.observations_json),
            estimations_json=COALESCE(excluded.estimations_json, tsunami_history.estimations_json),
            comments_json=COALESCE(excluded.comments_json, tsunami_history.comments_json),
            updated_at=excluded.updated_at
        `)
        .bind(
          item.event_id,
          item.telegram_type,
          item.issue_time,
          item.revoked,
          JSON.stringify(item.areas ?? []),
          JSON.stringify(item.observations ?? []),
          JSON.stringify(item.estimations ?? []),
          item.comments == null ? null : JSON.stringify(item.comments),
          item.updated_at,
          item.created_at
        )
        .run();

      await db
        .prepare(`
          DELETE FROM tsunami_history
          WHERE event_id NOT IN (
            SELECT event_id
            FROM tsunami_history
            ORDER BY datetime(issue_time) DESC, datetime(updated_at) DESC
            LIMIT ?
          )
        `)
        .bind(HISTORY_MAX_ITEMS)
        .run();
    }
    catch (error) {
      console.error("[DataHubDO] save tsunami history to D1 failed", error);
    }
  }

  async runRetentionCleanupIfDue() {
    if (this.retentionCleanup.running) {
      return;
    }

    const db = this.env?.EQ_D1;
    if (!db) {
      return;
    }

    const now = Date.now();
    const lastRunMs = toTimeMs(this.retentionCleanup.lastRunAt);
    if (lastRunMs && now - lastRunMs < RETENTION_CLEANUP_INTERVAL_MS) {
      return;
    }

    const startedAt = nowIso();
    this.retentionCleanup.running = true;
    this.retentionCleanup.lastRunAt = startedAt;
    this.retentionCleanup.lastError = null;

    // Record the attempt before deleting rows so a transient D1 error does not
    // make the 1-second alarm hammer cleanup queries continuously.
    try {
      await this.state.storage.put(RETENTION_CLEANUP_KEY, {
        lastRunAt: startedAt,
        lastResult: this.retentionCleanup.lastResult,
        lastError: null
      });
    }
    catch (error) {
      console.error("[DataHubDO] write retention cleanup marker failed", error);
    }

    try {
      const result = await this.cleanupD1Retention();
      this.retentionCleanup.lastResult = result;
      await this.state.storage.put(RETENTION_CLEANUP_KEY, {
        lastRunAt: startedAt,
        lastResult: result,
        lastError: null
      });
    }
    catch (error) {
      const message = String(error?.message || error || "retention_cleanup_failed");
      this.retentionCleanup.lastError = message;
      console.error("[DataHubDO] retention cleanup failed", error);
      try {
        await this.state.storage.put(RETENTION_CLEANUP_KEY, {
          lastRunAt: startedAt,
          lastResult: this.retentionCleanup.lastResult,
          lastError: message
        });
      }
      catch (writeError) {
        console.error("[DataHubDO] write retention cleanup error marker failed", writeError);
      }
    }
    finally {
      this.retentionCleanup.running = false;
    }
  }

  async cleanupD1Retention() {
    const db = this.env?.EQ_D1;
    if (!db) {
      return null;
    }

    const runDelete = async (sql, ...params) => {
      const result = await db.prepare(sql).bind(...params).run();
      return Number(result?.meta?.changes ?? 0);
    };

    const oldEarthquakeWhere = `
      datetime(COALESCE(origin_time, updated_at, created_at)) < datetime('now', ?)
    `;

    const deletedStationByEarthquake = await runDelete(`
      DELETE FROM station_intensities
      WHERE event_id IN (
        SELECT event_id
        FROM earthquake_history
        WHERE ${oldEarthquakeWhere}
      )
    `, `-${EARTHQUAKE_HISTORY_RETENTION_DAYS} days`);

    const deletedOldStations = await runDelete(`
      DELETE FROM station_intensities
      WHERE datetime(COALESCE(updated_at, '1970-01-01T00:00:00Z')) < datetime('now', ?)
    `, `-${STATION_INTENSITY_RETENTION_DAYS} days`);

    const deletedEarthquakes = await runDelete(`
      DELETE FROM earthquake_history
      WHERE ${oldEarthquakeWhere}
    `, `-${EARTHQUAKE_HISTORY_RETENTION_DAYS} days`);

    const deletedTsunamis = await runDelete(`
      DELETE FROM tsunami_history
      WHERE datetime(COALESCE(issue_time, updated_at, created_at)) < datetime('now', ?)
    `, `-${TSUNAMI_HISTORY_RETENTION_DAYS} days`);

    return {
      earthquakeHistoryRetentionDays: EARTHQUAKE_HISTORY_RETENTION_DAYS,
      stationIntensityRetentionDays: STATION_INTENSITY_RETENTION_DAYS,
      tsunamiHistoryRetentionDays: TSUNAMI_HISTORY_RETENTION_DAYS,
      deleted: {
        stationByEarthquake: deletedStationByEarthquake,
        stationByUpdatedAt: deletedOldStations,
        earthquakeHistory: deletedEarthquakes,
        tsunamiHistory: deletedTsunamis
      }
    };
  }

  async appendEarthquakeHistory(earthquakeData, timestamp = nowIso()) {
    if (!earthquakeData) {
      return;
    }
    if (isLikelyTestData(earthquakeData)) {
      return;
    }
    if (isUnresolvedEarthquakeData(earthquakeData)) {
      return;
    }
    const rawItem = toHistoryItem(earthquakeData, timestamp);
    const idx = this.earthquakeHistory.findIndex(v => v.event_id === rawItem.event_id);
    const item = mergeHistoryItems(idx >= 0 ? this.earthquakeHistory[idx] : null, rawItem);
    if (idx >= 0) {
      this.earthquakeHistory[idx] = item;
    }
    else {
      this.earthquakeHistory.unshift(item);
      if (this.earthquakeHistory.length > HISTORY_MAX_ITEMS) {
        this.earthquakeHistory = this.earthquakeHistory.slice(0, HISTORY_MAX_ITEMS);
      }
    }
    await this.saveHistoryItemToD1(item);
    await this.saveStationIntensitiesToD1(item.event_id, earthquakeData.points, timestamp);
    await this.persistHistory();
  }

  async appendTsunamiHistory(tsunamiData, timestamp = nowIso()) {
    if (!tsunamiData || isLikelyTestData(tsunamiData)) {
      return;
    }
    await this.saveTsunamiHistoryToD1(toTsunamiHistoryItem(tsunamiData, timestamp));
  }

  async updateLatest(type, source, data, timestamp = nowIso()) {
    if (!REPLAY_TYPES.includes(type) || !data) {
      return;
    }
    if (isLikelyTestData(data)) {
      return;
    }

    if ((type === "earthquake" || type === "eew") && isUnresolvedEarthquakeData(data)) {
      return;
    }

    const nextData = type === "tsunami"
      ? mergeDmdataTsunamiSnapshots(this.latest.tsunami?.data, data)
      : type === "earthquake"
        ? preserveJmaEarthquakeDetails(this.latest.earthquake?.data, data)
        : data;

    if (type === "tsunami" && isStaleTsunamiStored({ data: nextData, timestamp })) {
      await this.appendTsunamiHistory(nextData, timestamp);
      this.latest.tsunami = null;
      await this.persistLatest();
      return;
    }

    this.latest[type] = {
      source,
      timestamp,
      data: nextData
    };
    await this.persistLatest();

    if (type === "earthquake") {
      await this.appendEarthquakeHistory(nextData, timestamp);
    }
    else if (type === "tsunami") {
      await this.appendTsunamiHistory(nextData, timestamp);
    }
  }

  sendJson(ws, payload) {
    try {
      ws.send(safeJsonStringify(payload));
    }
    catch (_) {
      this.clients.delete(ws);
      this.clientMeta.delete(ws);
      try {
        ws.close();
      }
      catch {
        // noop
      }
    }
  }

  broadcast(type, source, data, timestamp = nowIso()) {
    const envelope = makeEnvelope(type, source, data, timestamp);
    for (const ws of this.clients) {
      if (type === "eew" && this.clientMeta.get(ws)?.eewAuthorized !== true) {
        continue;
      }
      this.sendJson(ws, envelope);
    }
  }

  sendSnapshot(ws) {
    const includeEew = this.clientMeta.get(ws)?.eewAuthorized === true;
    this.sendJson(
      ws,
      makeEnvelope(
        "snapshot",
        "system",
        this.getLatestDataObject({ includeEew })
      )
    );
  }

  async handleConnect(request) {
    const userId = String(request?.headers?.get("x-auth-user-id") || "").trim();
    const username = String(request?.headers?.get("x-auth-username") || "").trim();
    const role = String(request?.headers?.get("x-auth-role") || "").trim();
    const requestedEew = request?.headers?.get("x-eew-authenticated") === "1" && Boolean(userId);
    const activeEewClients = [...this.clientMeta.values()]
      .filter(meta => meta?.eewAuthorized === true)
      .length;
    const eewAuthorized = requestedEew && activeEewClients < MAX_CLIENT_CONNECTIONS;

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.state.acceptWebSocket(server);
    this.clients.add(server);
    this.clientMeta.set(server, {
      userId,
      username,
      role,
      eewAuthorized,
      connectedAt: nowIso()
    });
    this.sendSnapshot(server);
    this.sendJson(server, makeEnvelope("status", "system", {
      ok: true,
      message: "connected",
      userId,
      eewAuthenticated: eewAuthorized,
      eewConnectionLimitReached: requestedEew && !eewAuthorized,
      maxEewConnections: MAX_CLIENT_CONNECTIONS
    }));

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  async handleAuthSessionChanged(request) {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId || "").trim();
    if (!userId) {
      return new Response(JSON.stringify({ ok: false, error: "missing_user_id" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    let closed = 0;
    for (const ws of [...this.clients]) {
      if (this.clientMeta.get(ws)?.userId !== userId) {
        continue;
      }
      this.clients.delete(ws);
      this.clientMeta.delete(ws);
      closed += 1;
      try {
        ws.close(4001, "session_changed");
      }
      catch {
        // noop
      }
    }

    return new Response(JSON.stringify({ ok: true, closed }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  async handleLatest(request) {
    const includeEew = request?.headers?.get("x-eew-authenticated") === "1";
    let earthquake = this.latest.earthquake;
    if (earthquake?.data) {
      earthquake = {
        ...earthquake,
        data: sanitizeJmaIntensityStationPoints(earthquake.data)
      };
    }
    if (earthquake && isLikelyTestData(earthquake.data)) {
      earthquake = null;
    }
    if (!earthquake || isUnresolvedEarthquakeData(earthquake.data)) {
      const d1Items = await this.loadHistoryFromD1(20);
      const fallback = Array.isArray(d1Items) ? d1Items.find(item => !isUnresolvedHistoryItem(item)) : null;
      if (fallback) {
        const stationItems = await this.loadStationIntensitiesFromD1(fallback.event_id);
        const points = Array.isArray(stationItems)
          ? stationItems.map(item => ({
            code: item.station_code,
            name: item.station_name,
            intensity: item.intensity ?? "-",
            scale: Number(item.scale ?? 0),
            latitude: item.latitude ?? null,
            longitude: item.longitude ?? null
          }))
          : [];
        earthquake = {
          timestamp: fallback.updated_at || fallback.origin_time || nowIso(),
          data: {
            eventId: fallback.event_id,
            reportNumber: fallback.report_number,
            place: fallback.place,
            scale: Number(fallback.max_scale ?? 0),
            intensity: fallback.max_intensity ?? "-",
            magnitude: fallback.magnitude ?? "-",
            depth: fallback.depth ?? "-",
            latitude: fallback.latitude ?? null,
            longitude: fallback.longitude ?? null,
            time: fallback.origin_time,
            points,
            regions: Array.isArray(fallback.regions) ? fallback.regions : [],
            telegramType: fallback.telegram_type
          }
        };
      }
      else {
        earthquake = null;
      }
    }
    else if (
      earthquake?.data?.eventId &&
      (!Array.isArray(earthquake.data.points) || earthquake.data.points.length === 0)
    ) {
      const stationItems = await this.loadStationIntensitiesFromD1(earthquake.data.eventId);
      if (Array.isArray(stationItems) && stationItems.length > 0) {
        earthquake = {
          ...earthquake,
          data: {
            ...earthquake.data,
            points: stationItems.map(item => ({
              code: item.station_code,
              name: item.station_name,
              intensity: item.intensity ?? "-",
              scale: Number(item.scale ?? 0),
              latitude: item.latitude ?? null,
              longitude: item.longitude ?? null
            }))
          }
        };
      }
    }

    const eew = includeEew ? this.getRestorableLatestEew() : null;
    const tsunami = this.latest.tsunami &&
      !isLikelyTestData(this.latest.tsunami.data) &&
      !isStaleTsunamiStored(this.latest.tsunami)
      ? this.latest.tsunami
      : null;

    return new Response(
      JSON.stringify({
        ok: true,
        latest: {
          earthquake: earthquake
            ? { data: earthquake.data, receivedAt: earthquake.timestamp }
            : null,
          eew: eew
            ? { data: eew.data, receivedAt: eew.timestamp }
            : null,
          tsunami: tsunami
            ? { data: tsunami.data, receivedAt: tsunami.timestamp }
            : null,
          finalizedEewEventIds: includeEew ? this.latest.finalizedEewEventIds ?? [] : []
        }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" }
      }
    );
  }

  async handleHistory(requestUrl) {
    const limit = Math.max(1, Math.min(100, Number(requestUrl.searchParams.get("limit") || "12")));
    const d1Items = await this.loadHistoryFromD1(limit);
    const memoryItems = this.earthquakeHistory.slice(0, limit);

    const merged = [];
    const seen = new Set();
    const push = (item) => {
      if (isUnresolvedHistoryItem(item)) {
        return;
      }
      if (isLikelyTestData(item)) {
        return;
      }
      const id = getHistoryItemEventId(item);
      const key = id || `${item?.place ?? ""}-${item?.origin_time ?? ""}`;
      if (!key || seen.has(key)) {
        return;
      }
      seen.add(key);
      merged.push(item);
    };

    for (const item of d1Items || []) {
      push(item);
    }
    for (const item of memoryItems) {
      push(item);
    }

    merged.sort((a, b) => {
      const ams = new Date(a?.origin_time ?? 0).getTime();
      const bms = new Date(b?.origin_time ?? 0).getTime();
      return (Number.isFinite(bms) ? bms : 0) - (Number.isFinite(ams) ? ams : 0);
    });

    return new Response(
      JSON.stringify({
        enabled: true,
        items: merged.slice(0, limit),
        source: d1Items ? "d1+do-memory" : "do-memory"
      }),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" }
      }
    );
  }

  async handleHistoryStations(eventId) {
    const d1Items = await this.loadStationIntensitiesFromD1(eventId);
    if (Array.isArray(d1Items) && d1Items.length > 0) {
      return new Response(JSON.stringify({ enabled: true, eventId, items: d1Items }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    const latestEventId = this.latest.earthquake?.data?.eventId || null;
    if (!eventId || eventId !== latestEventId) {
      return new Response(JSON.stringify({ enabled: true, items: [] }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    const latestEarthquakeData = sanitizeJmaIntensityStationPoints(
      this.latest.earthquake?.data
    );
    const points = Array.isArray(latestEarthquakeData?.points)
      ? latestEarthquakeData.points
      : [];

    const items = points.map((point, index) => ({
      station_code: point.code ?? `cf-${index}`,
      station_name: point.name ?? point.code ?? `CF-${index}`,
      intensity: point.intensity ?? "-",
      scale: Number(point.scale ?? 0),
      latitude: point.latitude ?? null,
      longitude: point.longitude ?? null
    }));

    return new Response(JSON.stringify({ enabled: true, items }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  async handleHealth() {
    const removedExpiredTsunami =
      this.latest.tsunami && isStaleTsunamiStored(this.latest.tsunami);
    if (removedExpiredTsunami) {
      this.latest.tsunami = null;
      await this.persistLatest();
    }

    return new Response(
      JSON.stringify({
        ok: true,
        service: "meteoscope-earthquake-hub",
        timestamp: nowIso(),
        clients: this.clients.size,
        dmdata: this.dmdata,
        dmdataStationCatalog: this.dmdataStationCatalog,
        gdEarthquakeBackfill: this.gdEarthquakeBackfill,
        dmdataTelegramBackfill: {
          running: this.dmdataTelegramBackfill.running,
          lastRunAt: this.dmdataTelegramBackfill.lastRunAt,
          lastError: this.dmdataTelegramBackfill.lastError,
          lastResult: this.dmdataTelegramBackfill.lastResult,
          cursorConfigured: Boolean(this.dmdataTelegramBackfill.cursorToken)
        },
        historyCount: this.earthquakeHistory.length,
        cleanup: {
          expiredTsunami: Boolean(removedExpiredTsunami),
          retention: {
            running: this.retentionCleanup.running,
            lastRunAt: this.retentionCleanup.lastRunAt,
            lastError: this.retentionCleanup.lastError,
            lastResult: this.retentionCleanup.lastResult
          }
        }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" }
      }
    );
  }

  async handleIngest(request) {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    const type = body.type;
    const source = body.source || "system";
    const timestamp = body.timestamp || nowIso();
    const data = body.data ?? body.payload ?? null;

    if (typeof type !== "string" || !type) {
      return new Response(JSON.stringify({ ok: false, error: "type_required" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    // For test/integration usage, allow ingesting raw dmdata telegram payloads.
    // Example:
    // { "type": "telegram", "data": { "head": { ... }, "body": ... } }
    // This path applies the same normalization pipeline as live dmdata stream.
    const normalizedType = String(type).toLowerCase();
    const dmdataCandidate = extractDmdataTelegramPayload(data);
    if (normalizedType === "telegram" || normalizedType === "dmdata" || dmdataCandidate) {
      const payload = dmdataCandidate ?? extractDmdataTelegramPayload(body);
      if (!payload) {
        return new Response(JSON.stringify({ ok: false, error: "invalid_dmdata_payload" }), {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" }
        });
      }
      await this.handleDmdataPayload(payload);
      return new Response(JSON.stringify({ ok: true, mode: "dmdata" }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    this.broadcast(type, source, data, timestamp);
    await this.updateLatest(type, source, data, timestamp);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  async handleDmdataPayload(payload) {
    const events = await mapDmdataMessageToEvents(payload, this.stationCoordinateLookup);
    for (const event of events) {
      if ((event.type === "earthquake" || event.type === "eew") && isUnresolvedEarthquakeData(event.data)) {
        continue;
      }
      const timestamp = payload?.head?.time ?? nowIso();
      if (
        event.type === "eew" &&
        this.isEarthquakeEventFinalized(getEventIdFromData(event.data))
      ) {
        continue;
      }
      if (
        event.type === "earthquake" &&
        shouldCloseLatestEewByEarthquake(event.data, this.latest.eew?.data)
      ) {
        this.latest.eew = null;
        await this.persistLatest();
        this.broadcast("eew", "system", {
          eventId: event.data?.eventId ?? null,
          isCanceled: true,
          isLastInfo: true,
          endedBy: "vxse53"
        }, timestamp);
      }
      this.broadcast(event.type, "dmdata", event.data, timestamp);
      await this.updateLatest(event.type, "dmdata", event.data, timestamp);

      // VXSE53が来た同一eventIdのEEWはlatestから除去する。
      // クライアント側の再接続時に古いEEWを復元しないための保険。
      if (
        event.type === "earthquake" &&
        String(event?.data?.telegramType ?? event?.data?.type ?? "").toUpperCase() === "VXSE53"
      ) {
        const quakeEventId = String(event?.data?.eventId ?? "");
        const normalizedEventId = normalizeEewEventId(quakeEventId);
        if (normalizedEventId) {
          this.finalizedEewEventIds = new Set(
            limitStringArray(
              [normalizedEventId, ...this.finalizedEewEventIds],
              FINALIZED_EEW_EVENT_IDS_MAX_SIZE
            )
          );
          this.latest.finalizedEewEventIds = [...this.finalizedEewEventIds];
          await this.persistLatest();
        }

        const latestEewEventId = String(this.latest?.eew?.data?.eventId ?? "");
        if (
          normalizedEventId &&
          latestEewEventId &&
          normalizedEventId === normalizeEewEventId(latestEewEventId)
        ) {
          this.latest.eew = null;
          await this.persistLatest();
        }
      }
    }
  }

  async cleanupTestData() {
    let removedHistoryCount = 0;
    const beforeHistoryCount = this.earthquakeHistory.length;
    this.earthquakeHistory = this.earthquakeHistory.filter(item => !isLikelyTestData(item));
    removedHistoryCount += Math.max(0, beforeHistoryCount - this.earthquakeHistory.length);

    const latestBefore = {
      earthquake: Boolean(this.latest.earthquake),
      eew: Boolean(this.latest.eew),
      tsunami: Boolean(this.latest.tsunami)
    };

    if (this.latest.earthquake && isLikelyTestData(this.latest.earthquake.data)) {
      this.latest.earthquake = null;
    }
    if (this.latest.eew && isLikelyTestData(this.latest.eew.data)) {
      this.latest.eew = null;
    }
    if (this.latest.tsunami && isLikelyTestData(this.latest.tsunami.data)) {
      this.latest.tsunami = null;
    }
    if (this.latest.tsunami && isStaleTsunamiStored(this.latest.tsunami)) {
      this.latest.tsunami = null;
    }

    await this.persistLatest();
    await this.persistHistory();

    const db = this.env?.EQ_D1;
    let d1DeletedHistory = 0;
    let d1DeletedStations = 0;
    if (db) {
      try {
        const historyDelete = await db.prepare(`
          DELETE FROM earthquake_history
          WHERE event_id LIKE 'TEST%'
             OR place LIKE '%テスト%'
        `).run();
        d1DeletedHistory = Number(historyDelete?.meta?.changes ?? 0);

        const stationsDelete = await db.prepare(`
          DELETE FROM station_intensities
          WHERE event_id LIKE 'TEST%'
        `).run();
        d1DeletedStations = Number(stationsDelete?.meta?.changes ?? 0);
      }
      catch (error) {
        console.error("[DataHubDO] cleanup test data in D1 failed", error);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        removed: {
          historyMemory: removedHistoryCount,
          historyD1: d1DeletedHistory,
          stationD1: d1DeletedStations
        },
        latest: {
          before: latestBefore,
          after: {
            earthquake: Boolean(this.latest.earthquake),
            eew: Boolean(this.latest.eew),
            tsunami: Boolean(this.latest.tsunami)
          }
        }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" }
      }
    );
  }

  isEarthquakeEventFinalized(eventId) {
    const normalized = normalizeEewEventId(eventId);
    if (!normalized) {
      return false;
    }
    if (this.finalizedEewEventIds.has(normalized)) {
      return true;
    }

    const latestEarthquake = this.latest.earthquake?.data;
    if (
      latestEarthquake &&
      String(latestEarthquake.telegramType || "").toUpperCase() === "VXSE53" &&
      normalizeEewEventId(getEventIdFromData(latestEarthquake)) === normalized
    ) {
      return true;
    }

    for (const item of this.earthquakeHistory) {
      if (!item) {
        continue;
      }
      const historyEventId = String(item.event_id || item.eventId || "");
      const historyType = String(item.telegram_type || item.telegramType || "").toUpperCase();
      if (normalizeEewEventId(historyEventId) === normalized && historyType === "VXSE53") {
        return true;
      }
    }
    return false;
  }

  async startDmdataStream() {
    const apiKey = String(this.env.DMDATA_API_KEY || "").trim();
    if (!apiKey) {
      return;
    }

    const authBasic = btoa(`${apiKey}:`);
    const startResponse = await fetch("https://api.dmdata.jp/v2/socket", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authBasic}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        classifications: ["telegram.earthquake"],
        test: String(this.env.DMDATA_TEST_MODE || "excluding"),
        appName: String(this.env.DMDATA_APP_NAME || "meteoscope-earthquake"),
        formatMode: "json"
      })
    });

    const socketInfo = await startResponse.json().catch(() => null);
    if (!startResponse.ok || socketInfo?.status !== "ok" || !socketInfo?.websocket?.url) {
      throw new Error(`dmdata_socket_start_failed_${startResponse.status}`);
    }

    const protocol = Array.isArray(socketInfo.websocket.protocol)
      ? socketInfo.websocket.protocol[0]
      : null;
    const upstreamWsUrl = toHttpUpgradeUrl(socketInfo.websocket.url);

    this.dmdataSocket = await openClientWebSocket(upstreamWsUrl, protocol || "dmdata.v2");
    this.dmdataSocketExpiresAt = Date.now() + Number(socketInfo.websocket.expiration || 300) * 1000;

    this.dmdata.connected = true;
    this.dmdata.lastError = null;
    this.dmdata.lastConnectAt = nowIso();
    this.dmdata.reconnectAttempt = 0;

    this.dmdataSocket.addEventListener("message", event => {
      try {
        const payload = JSON.parse(event.data);
        const msgType = String(payload?.type || "").toLowerCase();
        if (msgType === "ping" && payload?.pingId) {
          try {
            this.dmdataSocket?.send(JSON.stringify({
              type: "pong",
              pingId: payload.pingId
            }));
          }
          catch (_) {
            // ignore
          }
          return;
        }

        if (msgType === "start") {
          return;
        }

        this.dmdata.lastMessageAt = nowIso();
        const telegramPayload = extractDmdataTelegramPayload(payload);
        if (!telegramPayload) {
          return;
        }
        this.handleDmdataPayload(telegramPayload).catch(error => {
          this.dmdata.lastError = String(error?.message || error || "dmdata_handle_failed");
          this.scheduleNextTick(1000).catch(scheduleError => {
            console.error("[DataHubDO] dmdata recovery alarm failed", scheduleError);
          });
        });
      }
      catch (error) {
        this.dmdata.lastError = String(error?.message || error || "dmdata_parse_failed");
        this.scheduleNextTick(1000).catch(scheduleError => {
          console.error("[DataHubDO] dmdata recovery alarm failed", scheduleError);
        });
      }
    });

    const onCloseOrError = (reason) => {
      this.dmdata.connected = false;
      this.dmdata.reconnectAttempt += 1;
      this.dmdata.lastError = reason;
      this.dmdataSocket = null;
      this.dmdataSocketExpiresAt = null;
    };

    this.dmdataSocket.addEventListener("close", () => onCloseOrError("dmdata_socket_closed"));
    this.dmdataSocket.addEventListener("error", () => onCloseOrError("dmdata_socket_error"));

    // Immediately backfill earthquakes that may have arrived while DMDATA was disconnected.
    await this.pollGdEarthquakesOnce({ force: true });
  }


  async pollGdEarthquakesOnce(options = {}) {
    const force = options.force === true;
    const apiKey = String(this.env.DMDATA_API_KEY || "").trim();
    if (!apiKey) {
      return;
    }

    const now = Date.now();
    if (!force && now - this.gdEarthquakeLastPollMs < GD_EARTHQUAKE_POLL_INTERVAL_MS) {
      return;
    }
    if (this.gdEarthquakeBackfill.running) {
      return;
    }

    this.gdEarthquakeLastPollMs = now;
    this.gdEarthquakeBackfill.running = true;
    const result = {
      dates: [],
      fetched: 0,
      inserted: 0,
      updatedLatest: 0,
      skipped: 0,
      newestEventId: null
    };

    try {
      const authBasic = btoa(`${apiKey}:`);
      const existingEventIds = new Set(
        this.earthquakeHistory
          .map(item => String(item?.event_id || item?.eventId || ""))
          .filter(Boolean)
      );
      let currentLatestMs = getEarthquakeDataTimeMs(this.latest.earthquake?.data) ?? 0;
      let currentLatestEventId = String(this.latest.earthquake?.data?.eventId || "");

      for (let offset = GD_EARTHQUAKE_BACKFILL_DAYS - 1; offset >= 0; offset -= 1) {
        const date = getJstDateString(offset);
        result.dates.push(date);
        const response = await fetchWithTimeout(
          fetch,
          `https://api.dmdata.jp/v2/gd/earthquake?date=${encodeURIComponent(date)}&limit=100`,
          {
            method: "GET",
            headers: {
              Authorization: `Basic ${authBasic}`
            }
          },
          5000
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.status === "error") {
          throw new Error(`gd_earthquake_http_${response.status}`);
        }

        const items = Array.isArray(payload?.items) ? payload.items : [];
        result.fetched += items.length;
        const normalizedItems = items
          .map(item => normalizeGdEarthquakeItem(item))
          .filter(Boolean)
          .sort((a, b) => (getEarthquakeDataTimeMs(a) ?? 0) - (getEarthquakeDataTimeMs(b) ?? 0));

        for (const earthquake of normalizedItems) {
          if (isLikelyTestData(earthquake) || isUnresolvedEarthquakeData(earthquake)) {
            result.skipped += 1;
            continue;
          }

          const eventId = String(earthquake.eventId || "").trim();
          if (!eventId) {
            result.skipped += 1;
            continue;
          }

          const nextMs = getEarthquakeDataTimeMs(earthquake) ?? 0;
          const existsInMemory = existingEventIds.has(eventId);
          const existsInD1 = existsInMemory ? true : Boolean(await this.loadHistoryItemFromD1(eventId));
          const shouldUpdateLatest = nextMs > currentLatestMs || (nextMs === currentLatestMs && eventId !== currentLatestEventId);

          if (shouldUpdateLatest) {
            await this.updateLatest("earthquake", "dmdata-gd", earthquake, earthquake.time ?? nowIso());
            this.broadcast("earthquake", "dmdata-gd", earthquake, earthquake.time ?? nowIso());
            if (!existsInD1) {
              result.inserted += 1;
            }
            existingEventIds.add(eventId);
            currentLatestMs = nextMs;
            currentLatestEventId = eventId;
            result.updatedLatest += 1;
            result.newestEventId = eventId;
          }
          else if (!existsInD1) {
            await this.appendEarthquakeHistory(earthquake, earthquake.time ?? nowIso());
            existingEventIds.add(eventId);
            result.inserted += 1;
          }
        }
      }

      this.gdEarthquakeBackfill.lastRunAt = nowIso();
      this.gdEarthquakeBackfill.lastError = null;
      this.gdEarthquakeBackfill.lastResult = result;
    }
    catch (error) {
      this.gdEarthquakeBackfill.lastError = String(error?.message || error || "gd_earthquake_backfill_failed");
      this.gdEarthquakeBackfill.lastResult = result;
    }
    finally {
      this.gdEarthquakeBackfill.running = false;
    }
  }

  async pollDmdataTelegramsOnce(options = {}) {
    const force = options.force === true;
    const apiKey = String(this.env.DMDATA_API_KEY || "").trim();
    if (!apiKey) return;

    const now = Date.now();
    if (!force && now - this.dmdataTelegramLastPollMs < DMDATA_TELEGRAM_POLL_INTERVAL_MS) return;
    if (this.dmdataTelegramBackfill.running) return;

    this.dmdataTelegramLastPollMs = now;
    this.dmdataTelegramBackfill.running = true;
    const startedAt = nowIso();
    const result = {
      listed: 0,
      fetched: 0,
      earthquakes: 0,
      tsunamis: 0,
      failed: 0,
      cursorAdvanced: false
    };

    try {
      const authBasic = btoa(`${apiKey}:`);
      const url = new URL("https://api.dmdata.jp/v2/telegram");
      url.searchParams.set("type", "VXSE52,VXSE53,VTSE41,VTSE51,VTSE52");
      url.searchParams.set("formatMode", "json");
      url.searchParams.set("test", "no");
      url.searchParams.set("limit", String(DMDATA_TELEGRAM_LIST_LIMIT));
      if (this.dmdataTelegramBackfill.cursorToken) {
        url.searchParams.set("cursorToken", this.dmdataTelegramBackfill.cursorToken);
      }

      const listResponse = await fetchWithTimeout(fetch, url.toString(), {
        method: "GET",
        headers: { Authorization: `Basic ${authBasic}` }
      }, 8000);
      const listPayload = await listResponse.json().catch(() => null);
      if (!listResponse.ok || listPayload?.status !== "ok") {
        throw new Error(`dmdata_telegram_list_http_${listResponse.status}`);
      }

      const items = (Array.isArray(listPayload.items) ? listPayload.items : [])
        .slice(0, DMDATA_TELEGRAM_LIST_LIMIT)
        .sort((left, right) => (
          (toTimeMs(left?.receivedTime ?? left?.head?.time) ?? 0) -
          (toTimeMs(right?.receivedTime ?? right?.head?.time) ?? 0)
        ));
      result.listed = items.length;
      let currentEarthquakeMs = getEarthquakeDataTimeMs(this.latest.earthquake?.data) ?? 0;
      let currentTsunamiMs = getTsunamiIssueTimeMs(this.latest.tsunami?.data) ?? 0;

      for (const item of items) {
        if (String(item?.format ?? "").toLowerCase() !== "json" || !isAllowedDmdataTelegramDataUrl(item?.url)) {
          result.failed += 1;
          continue;
        }

        try {
          const dataResponse = await fetchWithTimeout(fetch, item.url, {
            method: "GET",
            headers: {
              Authorization: `Basic ${authBasic}`,
              Accept: "application/json"
            }
          }, 8000);
          const report = await dataResponse.json().catch(() => null);
          if (!dataResponse.ok || !report || typeof report !== "object") {
            throw new Error(`dmdata_telegram_data_http_${dataResponse.status}`);
          }
          result.fetched += 1;

          const telegram = {
            head: item.head ?? {},
            xmlReport: item.xmlReport ?? null,
            format: "json",
            compression: null,
            encoding: "utf-8",
            body: report
          };
          const events = await mapDmdataMessageToEvents(telegram, this.stationCoordinateLookup);
          const timestamp = item.receivedTime ?? item.head?.time ?? nowIso();

          for (const event of events) {
            if (event.type === "earthquake" && !isUnresolvedEarthquakeData(event.data)) {
              const eventMs = getEarthquakeDataTimeMs(event.data) ?? toTimeMs(timestamp) ?? 0;
              if (eventMs >= currentEarthquakeMs) {
                await this.updateLatest("earthquake", "dmdata-telegram", event.data, timestamp);
                currentEarthquakeMs = eventMs;
              }
              else {
                await this.appendEarthquakeHistory(event.data, timestamp);
              }
              result.earthquakes += 1;
            }
            else if (event.type === "tsunami") {
              const eventMs = getTsunamiIssueTimeMs(event.data) ?? toTimeMs(timestamp) ?? 0;
              if (eventMs >= currentTsunamiMs) {
                await this.updateLatest("tsunami", "dmdata-telegram", event.data, timestamp);
                currentTsunamiMs = eventMs;
              }
              else {
                await this.appendTsunamiHistory(event.data, timestamp);
              }
              result.tsunamis += 1;
            }
          }
        }
        catch {
          result.failed += 1;
        }
      }

      const nextCursor = result.failed === 0
        ? String(listPayload.nextPooling ?? this.dmdataTelegramBackfill.cursorToken ?? "").trim() || null
        : this.dmdataTelegramBackfill.cursorToken;
      result.cursorAdvanced = Boolean(nextCursor && nextCursor !== this.dmdataTelegramBackfill.cursorToken);
      this.dmdataTelegramBackfill.cursorToken = nextCursor;
      this.dmdataTelegramBackfill.lastRunAt = startedAt;
      this.dmdataTelegramBackfill.lastResult = result;
      this.dmdataTelegramBackfill.lastError = result.failed > 0
        ? `dmdata_telegram_data_failed_${result.failed}`
        : null;
      await this.state.storage.put(DMDATA_TELEGRAM_CURSOR_KEY, {
        cursorToken: this.dmdataTelegramBackfill.cursorToken,
        lastRunAt: startedAt,
        lastResult: result,
        lastError: this.dmdataTelegramBackfill.lastError
      });
    }
    catch (error) {
      const message = String(error?.message || error || "dmdata_telegram_backfill_failed");
      this.dmdataTelegramBackfill.lastRunAt = startedAt;
      this.dmdataTelegramBackfill.lastResult = result;
      this.dmdataTelegramBackfill.lastError = message;
      await this.state.storage.put(DMDATA_TELEGRAM_CURSOR_KEY, {
        cursorToken: this.dmdataTelegramBackfill.cursorToken,
        lastRunAt: startedAt,
        lastResult: result,
        lastError: message
      }).catch(() => {});
    }
    finally {
      this.dmdataTelegramBackfill.running = false;
    }
  }

  async ensureDmdataStream() {
    const apiKey = String(this.env.DMDATA_API_KEY || "").trim();
    if (!apiKey) {
      return;
    }

    // Rotate stream before ticket expiration.
    if (this.dmdataSocket && this.dmdataSocketExpiresAt && Date.now() > (this.dmdataSocketExpiresAt - 15000)) {
      try {
        this.dmdataSocket.close();
      }
      catch (_) {
        // noop
      }
      this.dmdataSocket = null;
      this.dmdataSocketExpiresAt = null;
      this.dmdata.connected = false;
    }

    if (this.dmdataSocket || this.dmdata.connected) {
      return;
    }

    try {
      await this.startDmdataStream();
    }
    catch (error) {
      this.dmdata.connected = false;
      this.dmdata.reconnectAttempt += 1;
      this.dmdata.lastError = String(error?.message || error || "dmdata_connect_failed");
      this.dmdataSocket = null;
      this.dmdataSocketExpiresAt = null;
    }
  }

  async fetch(request) {
    await this.initialized;
    const url = new URL(request.url);

    if (url.pathname === "/latest") {
      return this.handleLatest(request);
    }
    if (url.pathname === "/connect") {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return new Response(
          JSON.stringify({ ok: false, error: "websocket_upgrade_required" }),
          {
            status: 426,
            headers: {
              "content-type": "application/json; charset=utf-8",
              upgrade: "websocket"
            }
          }
        );
      }
      return this.handleConnect(request);
    }
    if (url.pathname === "/history") {
      return this.handleHistory(url);
    }
    const historyStationsMatch = url.pathname.match(/^\/history\/([^/]+)\/stations$/);
    if (historyStationsMatch) {
      return this.handleHistoryStations(decodeURIComponent(historyStationsMatch[1] || ""));
    }
    if (url.pathname === "/health") {
      return this.handleHealth();
    }
    return new Response(
      JSON.stringify({ ok: false, error: "not_found" }),
      { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }

  webSocketMessage(ws, message) {
    if (message === "snapshot") {
      this.sendSnapshot(ws);
    }
  }

  webSocketClose(ws) {
    this.clients.delete(ws);
    this.clientMeta.delete(ws);
    try {
      ws.close();
    }
    catch {
      // noop
    }
  }

  webSocketError(ws) {
    this.clients.delete(ws);
    this.clientMeta.delete(ws);
    try {
      ws.close();
    }
    catch {
      // noop
    }
  }
}
