import { fetchJson } from "./jmaClient.js";

const DATA_BASE = "/data/earthquake-history";
export const EARTHQUAKE_HISTORY_RESULT_LIMIT = 1_000;
export const EARTHQUAKE_HISTORY_LIST_VISIBLE_LIMIT = 200;
export const EARTHQUAKE_HISTORY_INTENSITY_OPTIONS = Object.freeze([
  Object.freeze(["1", "震度1以上"]),
  Object.freeze(["2", "震度2以上"]),
  Object.freeze(["3", "震度3以上"]),
  Object.freeze(["4", "震度4以上"]),
  Object.freeze(["5-", "震度5弱以上"]),
  Object.freeze(["5+", "震度5強以上"]),
  Object.freeze(["6-", "震度6弱以上"]),
  Object.freeze(["6+", "震度6強以上"]),
  Object.freeze(["7", "震度7"])
]);
export const EARTHQUAKE_HISTORY_MAGNITUDE_OPTIONS = Object.freeze([
  Object.freeze(["0", "指定なし"]),
  ...[3, 4, 5, 6, 7, 8].map((value) => Object.freeze([String(value), `M${value}以上`]))
]);
export const EARTHQUAKE_HISTORY_DEPTH_OPTIONS = Object.freeze([
  Object.freeze(["all", "指定なし"]),
  ...[10, 30, 50, 100, 200, 500].map((value) => Object.freeze([String(value), `${value}km以内`]))
]);
export const EARTHQUAKE_HISTORY_SORT_OPTIONS = Object.freeze([
  Object.freeze(["newest", "新しい順"]),
  Object.freeze(["oldest", "古い順"]),
  Object.freeze(["intensity", "震度順"]),
  Object.freeze(["magnitude", "規模順"])
]);

const yearCache = new Map();
let manifestPromise = null;

export async function fetchEarthquakeHistoryManifest() {
  manifestPromise ??= fetchJson(`${DATA_BASE}/manifest.json`, {
    ttlMs: 6 * 60 * 60 * 1000
  });
  const manifest = await manifestPromise;
  if (!manifest || !Array.isArray(manifest.years) || !manifest.startDate || !manifest.endDate) {
    manifestPromise = null;
    throw new Error("過去地震データの目録を取得できませんでした");
  }
  return manifest;
}

export async function searchEarthquakeHistory(filters = {}) {
  const manifest = await fetchEarthquakeHistoryManifest();
  const normalized = normalizeEarthquakeHistoryFilters(filters, manifest);
  const years = manifest.years.filter(({ year }) => (
    Number(year) >= Number(normalized.startDate.slice(0, 4))
    && Number(year) <= Number(normalized.endDate.slice(0, 4))
  ));
  const records = [];
  for (let index = 0; index < years.length; index += 6) {
    const batch = years.slice(index, index + 6);
    const payloads = await Promise.all(batch.map(({ year, file }) => loadHistoryYear(year, file)));
    records.push(...payloads.flat());
  }
  const keyword = normalized.keyword.toLocaleLowerCase("ja-JP");
  const minimumIntensityRank = getHistoricalIntensityRank(normalized.minIntensity);
  const minimumMagnitude = Number(normalized.minMagnitude);
  const maximumDepth = normalized.maxDepth === "all" ? null : Number(normalized.maxDepth);
  const matches = records.filter((record) => {
    const date = record.originTime.slice(0, 10);
    if (date < normalized.startDate || date > normalized.endDate) return false;
    if (getHistoricalIntensityRank(record.maxIntensity) < minimumIntensityRank) return false;
    if (Number.isFinite(minimumMagnitude) && minimumMagnitude > 0) {
      if (!Number.isFinite(record.magnitude) || record.magnitude < minimumMagnitude) return false;
    }
    if (Number.isFinite(maximumDepth)) {
      if (!Number.isFinite(record.depthKm) || record.depthKm > maximumDepth) return false;
    }
    return !keyword || record.place.toLocaleLowerCase("ja-JP").includes(keyword);
  });
  matches.sort(getHistoryComparator(normalized.sort));
  return {
    ok: true,
    filters: normalized,
    manifest,
    totalMatched: matches.length,
    truncated: matches.length > EARTHQUAKE_HISTORY_RESULT_LIMIT,
    items: matches.slice(0, EARTHQUAKE_HISTORY_RESULT_LIMIT)
  };
}

export function normalizeEarthquakeHistoryFilters(filters, manifest) {
  const allowedIntensities = new Set(EARTHQUAKE_HISTORY_INTENSITY_OPTIONS.map(([value]) => value));
  const allowedMagnitudes = new Set(EARTHQUAKE_HISTORY_MAGNITUDE_OPTIONS.map(([value]) => value));
  const allowedDepths = new Set(EARTHQUAKE_HISTORY_DEPTH_OPTIONS.map(([value]) => value));
  const allowedSorts = new Set(EARTHQUAKE_HISTORY_SORT_OPTIONS.map(([value]) => value));
  const startDate = isDate(filters.startDate) ? filters.startDate : shiftYear(manifest.endDate, -10);
  const endDate = isDate(filters.endDate) ? filters.endDate : manifest.endDate;
  return {
    startDate: startDate <= endDate ? maxDate(startDate, manifest.startDate) : maxDate(endDate, manifest.startDate),
    endDate: startDate <= endDate ? minDate(endDate, manifest.endDate) : minDate(startDate, manifest.endDate),
    minIntensity: allowedIntensities.has(String(filters.minIntensity)) ? String(filters.minIntensity) : "4",
    minMagnitude: allowedMagnitudes.has(String(filters.minMagnitude)) ? String(filters.minMagnitude) : "0",
    maxDepth: allowedDepths.has(String(filters.maxDepth)) ? String(filters.maxDepth) : "all",
    sort: allowedSorts.has(String(filters.sort)) ? String(filters.sort) : "newest",
    keyword: String(filters.keyword ?? "").trim().slice(0, 40)
  };
}

export function getHistoricalIntensityRank(value) {
  return ({ felt: 1, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "5-": 5, "5+": 6, "6": 7, "6-": 7, "6+": 8, "7": 9 })[String(value)] ?? 0;
}

export function formatHistoricalIntensity(value) {
  if (value === "felt") return "有感";
  return String(value ?? "不明").replace("-", "弱").replace("+", "強");
}

async function loadHistoryYear(year, file) {
  const key = `${year}:${file}`;
  if (!yearCache.has(key)) {
    yearCache.set(key, fetchJson(`${DATA_BASE}/${file}`, {
      ttlMs: 24 * 60 * 60 * 1000
    }).then((payload) => {
      if (!Array.isArray(payload)) throw new Error(`${year}年の過去地震データを取得できませんでした`);
      return payload.flatMap(normalizeHistoryRecord);
    }).catch((error) => {
      yearCache.delete(key);
      throw error;
    }));
  }
  return yearCache.get(key);
}

function normalizeHistoryRecord(record) {
  const latitude = Number(record?.la);
  const longitude = Number(record?.lo);
  if (!record?.id || !record?.t || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
  const magnitude = record.m == null ? null : Number(record.m);
  const depthKm = record.d == null ? null : Number(record.d);
  return [{
    id: String(record.id),
    originTime: String(record.t),
    place: String(record.p ?? "詳細不明"),
    latitude,
    longitude,
    coordinates: [longitude, latitude],
    depthKm: Number.isFinite(depthKm) ? depthKm : null,
    magnitude: Number.isFinite(magnitude) ? magnitude : null,
    maxIntensity: String(record.i ?? "felt"),
    sourceUrl: String(record.u ?? "")
  }];
}

function getHistoryComparator(sort) {
  if (sort === "oldest") return (left, right) => left.originTime.localeCompare(right.originTime);
  if (sort === "intensity") return (left, right) => (
    getHistoricalIntensityRank(right.maxIntensity) - getHistoricalIntensityRank(left.maxIntensity)
    || right.originTime.localeCompare(left.originTime)
  );
  if (sort === "magnitude") return (left, right) => (
    (Number.isFinite(right.magnitude) ? right.magnitude : -10)
    - (Number.isFinite(left.magnitude) ? left.magnitude : -10)
    || right.originTime.localeCompare(left.originTime)
  );
  return (left, right) => right.originTime.localeCompare(left.originTime);
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(String(value ?? ""));
}

function minDate(left, right) {
  return left <= right ? left : right;
}

function maxDate(left, right) {
  return left >= right ? left : right;
}

function shiftYear(date, offset) {
  const [year, month, day] = String(date).split("-").map(Number);
  const shiftedYear = year + offset;
  const maximumDay = new Date(Date.UTC(shiftedYear, month, 0)).getUTCDate();
  return `${shiftedYear}-${String(month).padStart(2, "0")}-${String(Math.min(day, maximumDay)).padStart(2, "0")}`;
}
