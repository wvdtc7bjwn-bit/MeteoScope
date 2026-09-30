import { fetchJson } from "./jmaClient.js";
import { normalizeHistoricalEpicenterName } from "./historicalEpicenterNames.js";
import { normalizeJmaEarthquakeIntensity, normalizeJmaEarthquakeOriginTime } from "./earthquakeHistoryApi.js";

const DATA_BASE = "/data/earthquake-history";
const LIVE_SEARCH_ENDPOINT = "/api/earthquake-history";
export const EARTHQUAKE_HISTORY_EARLIEST_DATE = "1919-01-01";
export const EARTHQUAKE_HISTORY_RESULT_LIMIT = 3_000;
export const EARTHQUAKE_HISTORY_LIST_VISIBLE_LIMIT = 200;
export const EARTHQUAKE_HISTORY_DEFAULT_RANGE_DAYS = 7;
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

export async function searchEarthquakeHistory(filters = {}, { onProgress } = {}) {
  const manifest = await fetchEarthquakeHistoryManifest();
  const normalized = normalizeEarthquakeHistoryFilters(filters, manifest);
  const archivedYears = new Map(manifest.years.map((entry) => [Number(entry.year), entry]));
  const firstYear = Number(normalized.startDate.slice(0, 4));
  const lastYear = Number(normalized.endDate.slice(0, 4));
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => lastYear - index);
  const records = [];
  const fallbackYears = [];
  let result = createHistorySearchResult([], normalized, manifest, {
    complete: years.length === 0,
    loadedYearCount: 0,
    totalYearCount: years.length,
    loadedFromDate: years.length === 0 ? normalized.startDate : ""
  });
  for (let index = 0; index < years.length; index += 1) {
    const year = years[index];
    const rangeStart = maxDate(normalized.startDate, `${year}-01-01`);
    const rangeEnd = minDate(normalized.endDate, `${year}-12-31`);
    try {
      records.push(...await loadLiveHistoryRange(rangeStart, rangeEnd));
    } catch (error) {
      const archiveEntry = archivedYears.get(year);
      if (!archiveEntry) throw error;
      console.warn(`[MeteoScope] JMA live history unavailable for ${year}; using saved archive`, error);
      records.push(...await loadHistoryYear(year, archiveEntry.file));
      fallbackYears.push(year);
    }
    const loadedFromDate = index === years.length - 1
      ? normalized.startDate
      : maxDate(normalized.startDate, `${year}-01-01`);
    result = createHistorySearchResult(records, normalized, manifest, {
      complete: index === years.length - 1,
      loadedYearCount: index + 1,
      totalYearCount: years.length,
      loadedFromDate,
      fallbackYears: [...fallbackYears]
    });
    onProgress?.(result);
  }
  return result;
}

function createHistorySearchResult(records, normalized, manifest, progress) {
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
    ...progress,
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
  const latestDate = getJmaLatestAvailableDate();
  const requestedStartDate = isDate(filters.startDate)
    ? filters.startDate
    : shiftDate(latestDate, -(EARTHQUAKE_HISTORY_DEFAULT_RANGE_DAYS - 1));
  const requestedEndDate = isDate(filters.endDate) ? filters.endDate : latestDate;
  const startDate = requestedStartDate <= requestedEndDate ? requestedStartDate : requestedEndDate;
  const endDate = requestedStartDate <= requestedEndDate ? requestedEndDate : requestedStartDate;
  return {
    startDate: minDate(maxDate(startDate, EARTHQUAKE_HISTORY_EARLIEST_DATE), latestDate),
    endDate: minDate(endDate, latestDate),
    // The archive contains all felt earthquakes.  Starting at 震度1 keeps newly
    // published low-intensity events discoverable instead of silently filtering
    // them out on first open.
    minIntensity: allowedIntensities.has(String(filters.minIntensity)) ? String(filters.minIntensity) : "1",
    minMagnitude: allowedMagnitudes.has(String(filters.minMagnitude)) ? String(filters.minMagnitude) : "0",
    maxDepth: allowedDepths.has(String(filters.maxDepth)) ? String(filters.maxDepth) : "all",
    sort: allowedSorts.has(String(filters.sort)) ? String(filters.sort) : "newest",
    keyword: String(filters.keyword ?? "").trim().slice(0, 40)
  };
}

export function getJmaLatestAvailableDate(now = Date.now()) {
  const todayInJapan = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(now));
  return shiftDate(todayInJapan, -2);
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

async function loadLiveHistoryRange(startDate, endDate) {
  const query = new URLSearchParams({ start: startDate, end: endDate });
  const payload = await fetchJson(`${LIVE_SEARCH_ENDPOINT}?${query}`, {
    ttlMs: 6 * 60 * 60 * 1000,
    timeoutMs: 30_000,
    retryCount: 0
  });
  if (!payload?.ok || !Array.isArray(payload.records)) {
    throw new Error("気象庁の震度データベースを取得できませんでした");
  }
  return payload.records.flatMap(normalizeLiveHistoryRecord);
}

function normalizeLiveHistoryRecord(record) {
  const latitude = Number(record?.lat);
  const longitude = Number(record?.lon);
  const originTime = normalizeJmaEarthquakeOriginTime(record?.ot);
  if (!record?.id || !originTime || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
  const magnitude = record.mag == null || String(record.mag).trim() === "" ? NaN : Number(record.mag);
  const depthMatch = String(record.dep ?? "").match(/(\d+(?:\.\d+)?)\s*km/iu);
  const id = String(record.id);
  return [{
    id,
    originTime,
    place: normalizeHistoricalEpicenterName(id, record.name),
    latitude,
    longitude,
    coordinates: [longitude, latitude],
    depthKm: depthMatch ? Number(depthMatch[1]) : null,
    magnitude: Number.isFinite(magnitude) ? magnitude : null,
    maxIntensity: normalizeJmaEarthquakeIntensity(record.maxI),
    sourceUrl: `https://www.data.jma.go.jp/eqdb/data/shindo/#${encodeURIComponent(id)}`
  }];
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

function shiftDate(date, offset) {
  const [year, month, day] = String(date).split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, day) + offset * 86_400_000;
  return new Date(timestamp).toISOString().slice(0, 10);
}
