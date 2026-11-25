import { pointInPolygon } from "./hypocenterDistribution.js";
import { fetchJson } from "./jmaClient.js";
import { normalizeHistoricalEpicenterName } from "./historicalEpicenterNames.js";
import { APP_BASE_URL } from "../config.js";
import { fetchRecentEarthquakeHistory } from "./earthquakeRecent.js";
import {
  normalizeJmaEarthquakeIntensity,
  normalizeJmaEarthquakeOriginTime,
  isJmaHistoryDate,
  validateJmaHistoryConditions,
  splitJmaEarthquakeDateRange,
  isCoordinateWithinRadius, getJmaHistoryLatestDate, parseHistoryNumber,
  normalizeHistoryCoordinates, parseHistoryDepth, canonicalHistoryEventId, getEarthquakeHistoryApiUrl,
  getJstHistoryDate
} from "./earthquakeHistoryApi.js";

const DATA_BASE = `${APP_BASE_URL}data/earthquake-history`;
const LIVE_SEARCH_ENDPOINT = getEarthquakeHistoryApiUrl("earthquake-history");
export const EARTHQUAKE_HISTORY_EARLIEST_DATE = "1919-01-01";
export const EARTHQUAKE_HISTORY_RESULT_LIMIT = 1_000;
export const EARTHQUAKE_HISTORY_LIST_VISIBLE_LIMIT = 200;
export const EARTHQUAKE_HISTORY_DEFAULT_RANGE_DAYS = 7;
export const EARTHQUAKE_HISTORY_QUERY_CONCURRENCY = 3;
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
export const EARTHQUAKE_HISTORY_PERIOD_PRESETS = Object.freeze([
  Object.freeze(["month", "1か月"]), Object.freeze(["year", "1年"]),
  Object.freeze(["decade", "10年"]), Object.freeze(["all", "全期間"])
]);
export const EARTHQUAKE_HISTORY_SORT_OPTIONS = Object.freeze([
  Object.freeze(["newest", "新しい順"]),
  Object.freeze(["oldest", "古い順"]),
  Object.freeze(["intensity", "震度順"]),
  Object.freeze(["magnitude", "規模順"])
]);

const HISTORY_ACQUISITION_LIMIT = 10_000;
const HISTORY_QUERY_LIMIT = 64;

export async function fetchEarthquakeHistoryManifest({ signal } = {}) {
  const manifest = await fetchJson(`${DATA_BASE}/manifest.json`, {
    ttlMs: 6 * 60 * 60 * 1000, signal, cancelUnderlying: true, staleIfError: false
  });
  if (!manifest || !Array.isArray(manifest.years) || !manifest.startDate || !manifest.endDate) {
    throw new Error("過去地震データの目録を取得できませんでした");
  }
  return manifest;
}

export async function searchEarthquakeHistory(filters = {}, options = {}) {
  if (!options.includeRecent) return searchJmaEarthquakeHistory(filters, options);
  const { signal, onProgress } = options;
  signal?.throwIfAborted();
  const normalized = normalizeEarthquakeHistoryFilters(filters, { includeRecent: true });
  const upperJmaDate = getJmaLatestAvailableDate();
  const probeEnd = minDate(normalized.endDate, upperJmaDate);
  const jmaFilters = { ...normalized, startDate: minDate(normalized.startDate, probeEnd), endDate: probeEnd };
  let supplement = null;
  let supplementRange = null;
  let supplementError = false;
  const clipRange = range => {
    const startDate = maxDate(range.startDate, normalized.startDate);
    const endDate = minDate(range.endDate, normalized.endDate);
    return startDate <= endDate ? [{ ...range, startDate, endDate }] : [];
  };
  function combine(jma, finished) {
    const boundary = jma.availableThrough ?? upperJmaDate;
    const records = [...(jma.items ?? []).filter(item => item.originTime.slice(0, 10) <= boundary),
      ...(supplement?.items ?? []).filter(item => item.originTime.slice(0, 10) > boundary)];
    const items = records.filter(item => recordMatchesHistorySearch(item, normalized, normalized))
      .sort(getHistoryComparator(normalized.sort));
    const missing = (jma.unavailableRanges ?? []).flatMap(clipRange)
      .filter(range => range.reason !== "jma_not_yet_available");
    const unsearched = (jma.unsearchedRanges ?? []).flatMap(clipRange);
    if (supplementRange && finished && (supplementError || !supplement?.complete)) {
      missing.push({ ...supplementRange, reason: supplement?.limited ? "p2p_limited" : "p2p_unavailable" });
    }
    const invalidRecordCount = jma.invalidRecordCount ?? 0;
    const complete = finished && !missing.length && !unsearched.length && !invalidRecordCount;
    return { ...jma, filters: normalized, rangeAdjusted: false, complete, searchFinished: finished,
      totalMatched: complete ? items.length : null, matchedCount: items.length,
      truncated: jma.truncated || items.length > EARTHQUAKE_HISTORY_RESULT_LIMIT || Boolean(supplement?.limited),
      unavailableRanges: missing, unsearchedRanges: unsearched,
      items: items.slice(0, EARTHQUAKE_HISTORY_RESULT_LIMIT),
      supplementation: supplementRange ? { ...supplementRange,
        status: !finished ? "loading" : supplementError ? "error" : supplement?.complete ? "ok" : "partial",
        matchedCount: items.filter(item => item.dataSource === "p2p").length,
        fetchedAt: supplement?.fetchedAt ?? null, limited: Boolean(supplement?.limited) } : null };
  }
  const jma = await searchJmaEarthquakeHistory(jmaFilters, { signal,
    onProgress: onProgress ? partial => onProgress(combine(partial, false)) : undefined });
  const boundary = jma.availableThrough ?? upperJmaDate;
  if (normalized.endDate > boundary) {
    supplementRange = { startDate: maxDate(normalized.startDate, shiftDate(boundary, 1)), endDate: normalized.endDate };
    onProgress?.(combine(jma, false));
    try {
      // The proxy deliberately bounds acquisition. Missing older days remain
      // explicit rather than being silently presented as a complete search.
      const earliest = shiftDate(getJstHistoryDate(), -14);
      supplement = await fetchRecentEarthquakeHistory(maxDate(supplementRange.startDate, earliest), { signal });
      if (supplementRange.startDate < earliest) supplement = { ...supplement, complete: false };
    } catch (error) {
      signal?.throwIfAborted();
      supplementError = true;
    }
  }
  signal?.throwIfAborted();
  const result = combine(jma, true);
  onProgress?.(result);
  return result;
}

async function searchJmaEarthquakeHistory(filters = {}, { onProgress, signal } = {}) {
  signal?.throwIfAborted();
  const normalized = normalizeEarthquakeHistoryFilters(filters);
  const latestWeek = !filters.startDate && !filters.endDate;
  const pending = [{ startDate: normalized.startDate, endDate: normalized.endDate, startTime: "00:00", endTime: "23:59" }];
  const matches = new Map();
  const fallbackRanges = [];
  const unavailableRanges = [];
  const unresolvedRanges = [];
  let manifest = null;
  let queryCount = 0;
  let scannedRecordCount = 0;
  let completedRangeCount = 0;
  let limitExceeded = false;
  let availableThrough = null;
  let rangeAdjusted = false;
  let invalidRecordCount = 0;
  let progressTimer = null;
  let lastPublish = -Infinity;

  function snapshot(searchFinished = false) {
    const complete = searchFinished && !pending.length && !unresolvedRanges.length && !unavailableRanges.length && !invalidRecordCount;
    const sorted = [...matches.values()].sort(getHistoryComparator(normalized.sort));
    return {
      ok: true, filters: normalized, manifest, complete, searchFinished,
      totalMatched: complete ? matches.size : null, matchedCount: matches.size,
      truncated: sorted.length > EARTHQUAKE_HISTORY_RESULT_LIMIT || unresolvedRanges.length > 0 || pending.length > 0 && searchFinished,
      limitExceeded, queryCount, scannedRecordCount, availableThrough, rangeAdjusted, invalidRecordCount,
      displayLimit: EARTHQUAKE_HISTORY_RESULT_LIMIT, acquisitionLimit: HISTORY_ACQUISITION_LIMIT, queryLimit: HISTORY_QUERY_LIMIT,
      completedRangeCount,
      fallbackYears: [...new Set(fallbackRanges.flatMap((range) => {
        const first = Number(range.startDate.slice(0, 4));
        const last = Number(range.endDate.slice(0, 4));
        return Array.from({ length: last - first + 1 }, (_, index) => first + index);
      }))].sort((a, b) => b - a),
      fallbackRanges: [...fallbackRanges], unavailableRanges: [...unavailableRanges],
      unsearchedRanges: [...pending, ...unresolvedRanges],
      items: sorted.slice(0, EARTHQUAKE_HISTORY_RESULT_LIMIT)
    };
  }

  function publish(force = false) {
    signal?.throwIfAborted();
    if (!onProgress) return;
    clearTimeout(progressTimer);
    const delay = 200 - (performance.now() - lastPublish);
    if (force || delay <= 0) {
      lastPublish = performance.now();
      onProgress(snapshot(force));
    } else {
      progressTimer = setTimeout(() => {
        if (!signal?.aborted) {
          lastPublish = performance.now();
          onProgress(snapshot());
        }
      }, delay);
    }
  }

  async function fallback(range, error) {
    signal?.throwIfAborted();
    if (!isHistoryCommunicationError(error)) throw error;
    try {
      manifest ??= await fetchEarthquakeHistoryManifest({ signal });
      const startDate = maxDate(range.startDate, manifest.startDate);
      const endDate = minDate(range.endDate, manifest.endDate);
      if (startDate > endDate) {
        unavailableRanges.push(range);
        return [];
      }
      const records = [];
      const years = manifest.years.filter(({ year }) => year >= Number(startDate.slice(0, 4)) && year <= Number(endDate.slice(0, 4)));
      for (const entry of years) {
        signal?.throwIfAborted();
        const covered = { startDate: maxDate(startDate, `${entry.year}-01-01`), endDate: minDate(endDate, `${entry.year}-12-31`), updatedAt: manifest.generatedAt };
        covered.startTime = covered.startDate === range.startDate ? range.startTime : "00:00";
        covered.endTime = covered.endDate === range.endDate ? range.endTime : "23:59";
        try {
          records.push(...await loadHistoryYear(entry.year, entry.file, signal));
          fallbackRanges.push(covered);
        } catch (archiveError) {
          signal?.throwIfAborted();
          unavailableRanges.push(covered);
        }
      }
      // Account for absent shards, not just the manifest's outer dates.
      for (let year = Number(startDate.slice(0, 4)); year <= Number(endDate.slice(0, 4)); year += 1) {
        if (!years.some((entry) => Number(entry.year) === year)) unavailableRanges.push({ startDate: maxDate(startDate, `${year}-01-01`), endDate: minDate(endDate, `${year}-12-31`) });
      }
      if (range.startDate < startDate) unavailableRanges.push({ ...range, endDate: shiftDate(startDate, -1), endTime: "23:59" });
      if (range.endDate > endDate) unavailableRanges.push({ ...range, startDate: shiftDate(endDate, 1), startTime: "00:00" });
      return records.filter((record) => record.originTime.slice(0, 10) >= startDate && record.originTime.slice(0, 10) <= endDate);
    } catch (archiveError) {
      signal?.throwIfAborted();
      unavailableRanges.push(range);
      return [];
    }
  }

  async function loadRange(range) {
    signal?.throwIfAborted();
    queryCount += 1;
    let records;
    try {
      const payload = await loadLiveHistoryRange(range, normalized, signal, latestWeek && queryCount === 1);
      if (latestWeek && queryCount === 1 && payload.rangeAdjusted
        && isJmaHistoryDate(payload.startDate) && isJmaHistoryDate(payload.endDate)
        && payload.startDate <= payload.endDate && payload.endDate <= range.endDate) {
        // A default week follows the publication date, not an assumed two-day
        // lag. Move both ends so it still covers seven days, rather than six.
        normalized.startDate = range.startDate = payload.startDate;
        normalized.endDate = range.endDate = payload.endDate;
        rangeAdjusted = true;
      }
      records = payload.records.flatMap(normalizeLiveHistoryRecord);
      invalidRecordCount += payload.records.length - records.length;
      const candidateCount = Number(payload.candidateCount);
      scannedRecordCount += Number.isFinite(candidateCount) && candidateCount >= payload.records.length ? candidateCount : payload.records.length;
      if (isJmaHistoryDate(payload.availableThrough)) availableThrough = availableThrough ? minDate(availableThrough, payload.availableThrough) : payload.availableThrough;
      if (isJmaHistoryDate(payload.availableThrough) && payload.availableThrough < range.endDate) {
        unavailableRanges.push({
          startDate: maxDate(range.startDate, shiftDate(payload.availableThrough, 1)),
          endDate: range.endDate,
          reason: "jma_not_yet_available",
          availableThrough: payload.availableThrough
        });
      }
      if (payload.limited) {
        limitExceeded ||= payload.limitExceeded === true;
        // Without a substring filter, the sorted upstream response already holds
        // the globally selected first 1000. More date queries cannot improve it.
        const children = normalized.keyword || normalized.nearby || normalized.areaPolygon.length ? splitHistoryRange(range) : [];
        if (children.length && normalized.nearby && normalized.sort === "newest") pending.unshift(...children.reverse());
        else if (children.length) pending.push(...children);
        else unresolvedRanges.push(range);
      }
    } catch (error) {
      signal?.throwIfAborted();
      records = await fallback(range, error);
    }
    signal?.throwIfAborted();
    for (const record of records) {
      const key = canonicalHistoryEventId(record.id);
      if (recordMatchesHistorySearch(record, normalized, range)
        && !(record.dataSource === "archive" && matches.get(key)?.dataSource === "live")) matches.set(key, record);
    }
    completedRangeCount += 1;
    publish();
  }

  try {
    while (pending.length) {
      signal?.throwIfAborted();
      const maxConcurrency = normalized.nearby && normalized.sort === "newest" ? 1 : EARTHQUAKE_HISTORY_QUERY_CONCURRENCY;
      const slots = Math.min(maxConcurrency, pending.length,
        HISTORY_QUERY_LIMIT - queryCount, Math.floor((HISTORY_ACQUISITION_LIMIT - scannedRecordCount) / 1_000));
      if (slots <= 0) break;
      const batch = pending.splice(0, slots);
      const outcomes = await Promise.allSettled(batch.map(loadRange));
      const rejected = outcomes.find((outcome) => outcome.status === "rejected");
      if (rejected) throw rejected.reason;
      if (normalized.nearby && normalized.sort === "newest" && matches.size >= EARTHQUAKE_HISTORY_RESULT_LIMIT && pending.length) {
        limitExceeded = true;
        unresolvedRanges.push(...pending.splice(0));
        break;
      }
    }
    signal?.throwIfAborted();
    publish(true);
    return snapshot(true);
  } finally {
    clearTimeout(progressTimer);
  }
}

function isHistoryCommunicationError(error) {
  const status = Number(error?.status);
  if (status) return status === 408 || status === 429 || status >= 500;
  return error?.name === "TimeoutError" || error instanceof TypeError || error?.cause instanceof SyntaxError;
}

function splitHistoryRange(range) {
  if (range.startDate !== range.endDate) {
    const [leftEnd, rightStart] = splitJmaEarthquakeDateRange(range.startDate, range.endDate);
    const parts = [{ ...range, endDate: leftEnd, endTime: "23:59" }, { ...range, startDate: rightStart, startTime: "00:00" }];
    return parts;
  }
  const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const start = minutes(range.startTime);
  const end = minutes(range.endTime);
  if (start === end) return [];
  const format = (minute) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const middle = start + Math.floor((end - start) / 2);
  return [{ ...range, endTime: format(middle) }, { ...range, startTime: format(middle + 1) }];
}

function recordMatchesHistorySearch(record, filters, range) {
  const time = record.originTime.slice(0, 16);
  if (time < `${range.startDate}T${range.startTime ?? "00:00"}` || time > `${range.endDate}T${range.endTime ?? "23:59"}`) return false;
  if (getHistoricalIntensityRank(record.maxIntensity) < getHistoricalIntensityRank(filters.minIntensity)) return false;
  if (Number(filters.minMagnitude) > 0 && (!Number.isFinite(record.magnitude) || record.magnitude < Number(filters.minMagnitude))) return false;
  if (filters.maxDepth !== "all" && (!Number.isFinite(record.depthKm) || record.depthKm > Number(filters.maxDepth))) return false;
  if (filters.nearby && !isCoordinateWithinRadius(record.coordinates, [filters.nearby.longitude, filters.nearby.latitude], filters.nearby.radiusKm)) return false;
  if (filters.areaPolygon.length && (!Array.isArray(record.coordinates) || !pointInPolygon(record.coordinates, filters.areaPolygon))) return false;
  return !filters.keyword || record.place.toLocaleLowerCase("ja-JP").includes(filters.keyword.toLocaleLowerCase("ja-JP"));
}

export function normalizeEarthquakeHistoryFilters(filters, { includeRecent = false } = {}) {
  for (const field of ["startDate", "endDate"]) {
    if (filters[field] && !isJmaHistoryDate(filters[field])) throw new TypeError("検索日付が不正です");
  }
  const conditions = validateJmaHistoryConditions(filters);
  const latestDate = getEarthquakeHistoryLatestDate(includeRecent);
  const requestedStartDate = isJmaHistoryDate(filters.startDate)
    ? filters.startDate
    : shiftDate(latestDate, -(EARTHQUAKE_HISTORY_DEFAULT_RANGE_DAYS - 1));
  const requestedEndDate = isJmaHistoryDate(filters.endDate) ? filters.endDate : latestDate;
  const startDate = requestedStartDate <= requestedEndDate ? requestedStartDate : requestedEndDate;
  const endDate = requestedStartDate <= requestedEndDate ? requestedEndDate : requestedStartDate;
  return {
    startDate: minDate(maxDate(startDate, EARTHQUAKE_HISTORY_EARLIEST_DATE), latestDate),
    endDate: minDate(maxDate(endDate, EARTHQUAKE_HISTORY_EARLIEST_DATE), latestDate),
    ...conditions,
    nearby: conditions.nearby
  };
}

export function getJmaLatestAvailableDate(now = Date.now()) {
  return getJmaHistoryLatestDate(now);
}

export function getEarthquakeHistoryLatestDate(includeRecent = false) {
  return includeRecent ? getJstHistoryDate() : getJmaLatestAvailableDate();
}

// Calendar periods include both dates and end at the selected end date.
export function getEarthquakeHistoryPresetRange(preset, selectedEndDate = getJmaLatestAvailableDate(), { includeRecent = false } = {}) {
  const latest = getEarthquakeHistoryLatestDate(includeRecent);
  const endDate = minDate(maxDate(isJmaHistoryDate(selectedEndDate) ? selectedEndDate : latest,
    EARTHQUAKE_HISTORY_EARLIEST_DATE), latest);
  if (preset === "all") return { startDate: EARTHQUAKE_HISTORY_EARLIEST_DATE, endDate };
  const months = { month: 1, year: 12, decade: 120 }[preset];
  if (!Number.isInteger(months)) throw new TypeError("検索期間が不正です");
  const [year, month, day] = endDate.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  const startDate = maxDate(EARTHQUAKE_HISTORY_EARLIEST_DATE, shiftDate(target.toISOString().slice(0, 10), 1));
  return { startDate, endDate };
}

export function getHistoricalIntensityRank(value) {
  return ({ felt: 1, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "5-": 5, "5+": 6, "6": 7, "6-": 7, "6+": 8, "7": 9 })[String(value)] ?? 0;
}

export function formatHistoricalIntensity(value) {
  if (value === "felt") return "有感";
  return String(value ?? "不明").replace("-", "弱").replace("+", "強");
}

async function loadHistoryYear(year, file, signal) {
  if (!/^\d{4}\.json$/u.test(file)) throw new Error("保存データのファイル名が不正です");
  const payload = await fetchJson(`${DATA_BASE}/${file}`, {
    ttlMs: 24 * 60 * 60 * 1000, signal, cancelUnderlying: true, staleIfError: false
  });
  if (!Array.isArray(payload)) throw new Error(`${year}年の過去地震データを取得できませんでした`);
  return payload.flatMap(normalizeHistoryRecord);
}

async function loadLiveHistoryRange(range, conditions, signal, latestWeek = false) {
  const query = new URLSearchParams({ start: range.startDate, end: range.endDate, startTime: range.startTime, endTime: range.endTime,
    minIntensity: conditions.minIntensity, minMagnitude: conditions.minMagnitude, maxDepth: conditions.maxDepth, sort: conditions.sort, keyword: conditions.keyword, v: "5" });
  if (latestWeek) query.set("latestWeek", "1");
  if (conditions.nearby) {
    query.set("nearbyLat", String(conditions.nearby.latitude));
    query.set("nearbyLon", String(conditions.nearby.longitude));
    query.set("nearbyRadiusKm", String(conditions.nearby.radiusKm));
  }
  if (conditions.areaPolygon.length) query.set("areaPolygon", JSON.stringify(conditions.areaPolygon));
  const payload = await fetchJson(`${LIVE_SEARCH_ENDPOINT}?${query}`, {
      ttlMs: 0,
      timeoutMs: 55_000,
      retryCount: 0, signal, cancelUnderlying: true, staleIfError: false
    });
  if (!payload?.ok || !Array.isArray(payload.records)) {
    throw new TypeError("気象庁の震度データベースを取得できませんでした");
  }
  return payload;
}

function normalizeLiveHistoryRecord(record) {
  const coordinates = normalizeHistoryCoordinates(record?.lon, record?.lat);
  const originTime = normalizeJmaEarthquakeOriginTime(record?.ot);
  if (!record?.id || !originTime || !coordinates) return [];
  const [longitude, latitude] = coordinates;
  const magnitude = parseHistoryNumber(record.mag);
  const id = String(record.id);
  return [{
    id,
    dataSource: "live",
    originTime,
    place: normalizeHistoricalEpicenterName(id, record.name),
    latitude,
    longitude,
    coordinates,
    depthKm: parseHistoryDepth(record.dep),
    magnitude: Number.isFinite(magnitude) ? magnitude : null,
    maxIntensity: normalizeJmaEarthquakeIntensity(record.maxI),
    sourceUrl: `https://www.data.jma.go.jp/eqdb/data/shindo/#${encodeURIComponent(id)}`
  }];
}

function normalizeHistoryRecord(record) {
  const coordinates = normalizeHistoryCoordinates(record?.lo, record?.la);
  if (!record?.id || !record?.t || !isJmaHistoryDate(String(record.t).slice(0,10)) || !coordinates) return [];
  const [longitude, latitude] = coordinates;
  const magnitude = parseHistoryNumber(record.m);
  const depthKm = parseHistoryNumber(record.d);
  return [{
    id: String(record.id),
    dataSource: "archive",
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
