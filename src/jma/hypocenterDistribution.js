import { fetchJson } from "./jmaClient.js";

const ENDPOINT = "/api/earthquakes/distribution";
const RANGE_COMPATIBILITY_CONCURRENCY = 12;
const ARCHIVE_DAY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RECENT_DAY_CACHE_TTL_MS = 60 * 1000;
export const HYPOCENTER_DISTRIBUTION_DAY_COUNT = 731;
export const HYPOCENTER_DISTRIBUTION_MAX_DAY_OFFSET = HYPOCENTER_DISTRIBUTION_DAY_COUNT - 1;
export const HYPOCENTER_DISTRIBUTION_MAX_RANGE_DAYS = 30;

export async function fetchHypocenterDistribution(filters = {}, options = {}) {
  const dayOffset = Number.isInteger(Number(filters.dayOffset))
    ? Math.min(HYPOCENTER_DISTRIBUTION_MAX_DAY_OFFSET, Math.max(0, Number(filters.dayOffset)))
    : 0;
  const minMagnitude = ["all", "0", "1", "2", "3", "4", "5"].includes(String(filters.minMagnitude))
    ? String(filters.minMagnitude)
    : "0";
  const maxDepth = ["all", "30", "100", "300", "700"].includes(String(filters.maxDepth))
    ? String(filters.maxDepth)
    : "all";
  const parameters = new URLSearchParams({
    dayOffset: String(dayOffset),
    minMagnitude,
    maxDepth,
    includeRecentXml: filters.includeRecentXml === false ? "0" : "1"
  });
  const range = normalizeHypocenterDistributionRange(filters.startDate, filters.endDate);
  if (filters.rangeEnabled && range) {
    parameters.set("startDate", range.startDate);
    parameters.set("endDate", range.endDate);
  }
  const bounds = getPolygonBounds(filters.areaPolygon);
  if (bounds) parameters.set("bounds", bounds.join(","));
  let payload = await fetchJson(`${ENDPOINT}?${parameters}`, {
    ttlMs: options.force ? 0 : 60 * 1000,
    cache: options.force ? "no-store" : "default"
  });
  if (
    filters.rangeEnabled
    && range
    && payload?.rangeMode !== true
  ) {
    payload = await fetchRangeWithSingleDayCompatibility(
      payload,
      parameters,
      range.startDate,
      range.endDate,
      options
    );
  }
  if (filters.includeRecentXml === false && payload?.includeRecentXml !== false) {
    const availableDates = Array.isArray(payload?.availableDates)
      ? payload.availableDates
      : [];
    const recentDates = new Set(getRecentJstDates());
    const filteredDates = availableDates.filter((date) => !recentDates.has(date));
    const skippedDateCount = availableDates.length - filteredDates.length;
    if (skippedDateCount > 0) {
      parameters.set("dayOffset", String(dayOffset + skippedDateCount));
      payload = await fetchJson(`${ENDPOINT}?${parameters}`, {
        ttlMs: options.force ? 0 : 60 * 1000,
        cache: options.force ? "no-store" : "default"
      });
    }
    payload = {
      ...payload,
      includeRecentXml: false,
      availableDates: filteredDates,
      availableDayCount: filteredDates.length,
      dayOffset
    };
  }
  if (payload?.ok !== true || !Array.isArray(payload?.items)) {
    throw new Error("気象庁の震央分布を取得できませんでした");
  }
  return {
    ...payload,
    items: filterHypocentersByPolygon(payload.items, filters.areaPolygon)
  };
}

async function fetchRangeWithSingleDayCompatibility(
  initialPayload,
  baseParameters,
  startDate,
  endDate,
  options
) {
  const oldest = startDate <= endDate ? startDate : endDate;
  const newest = startDate <= endDate ? endDate : startDate;
  const availableDates = Array.isArray(initialPayload?.availableDates)
    ? initialPayload.availableDates
    : [];
  const includeRecentXml = baseParameters.get("includeRecentXml") !== "0";
  const recentDates = new Set(getRecentJstDates());
  const compatibleDates = includeRecentXml
    ? availableDates
    : availableDates.filter((date) => !recentDates.has(date));
  const rangeDates = compatibleDates
    .filter((date) => date >= oldest && date <= newest)
    .slice(0, HYPOCENTER_DISTRIBUTION_MAX_RANGE_DAYS);
  const payloads = [];
  for (let index = 0; index < rangeDates.length; index += RANGE_COMPATIBILITY_CONCURRENCY) {
    const batch = rangeDates.slice(index, index + RANGE_COMPATIBILITY_CONCURRENCY);
    payloads.push(...await Promise.all(batch.map(async (date) => {
      const dayOffset = availableDates.indexOf(date);
      const parameters = new URLSearchParams(baseParameters);
      parameters.delete("startDate");
      parameters.delete("endDate");
      parameters.delete("bounds");
      parameters.set("dayOffset", String(dayOffset));
      return await fetchJson(`${ENDPOINT}?${parameters}`, {
        ttlMs: options.force
          ? 0
          : recentDates.has(date) ? RECENT_DAY_CACHE_TTL_MS : ARCHIVE_DAY_CACHE_TTL_MS,
        cache: options.force ? "no-store" : "default"
      });
    })));
  }
  const allItems = payloads.flatMap((payload) =>
    Array.isArray(payload?.items) ? payload.items : []
  );
  const items = allItems.slice(0, 75000);
  return {
    ...initialPayload,
    selectedSourceDate: null,
    selectedSource: "jma-combined",
    selectedSourceLabel: "気象庁 防災情報XML（有感地震）／日々の震源リスト",
    rangeMode: true,
    rangeStartDate: rangeDates.at(-1) ?? oldest,
    rangeEndDate: rangeDates[0] ?? newest,
    rangeDayCount: rangeDates.length,
    includeRecentXml,
    availableDates: compatibleDates,
    availableDayCount: compatibleDates.length,
    truncated: allItems.length > items.length || payloads.some((payload) => payload?.truncated === true),
    items
  };
}

export function normalizeHypocenterDistributionRange(startDate, endDate) {
  if (!isSourceDate(startDate) || !isSourceDate(endDate)) return null;
  const oldest = startDate <= endDate ? startDate : endDate;
  const newest = startDate <= endDate ? endDate : startDate;
  const newestTime = Date.parse(`${newest}T00:00:00Z`);
  const oldestAllowedTime = newestTime - ((HYPOCENTER_DISTRIBUTION_MAX_RANGE_DAYS - 1) * 24 * 60 * 60 * 1000);
  const requestedOldestTime = Date.parse(`${oldest}T00:00:00Z`);
  return {
    startDate: requestedOldestTime < oldestAllowedTime
      ? new Date(oldestAllowedTime).toISOString().slice(0, 10)
      : oldest,
    endDate: newest
  };
}

export function filterHypocentersByPolygon(items, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return [...items];
  return items.filter((item) => pointInPolygon(
    [Number(item.longitude), Number(item.latitude)],
    polygon
  ));
}

export function pointInPolygon(point, polygon) {
  const [x, y] = point;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [xi, yi] = polygon[index] ?? [];
    const [xj, yj] = polygon[previous] ?? [];
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    const intersects = yi > y !== yj > y
      && x < (xj - xi) * (y - yi) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function getPolygonBounds(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return null;
  const coordinates = polygon.filter((coordinate) =>
    Array.isArray(coordinate)
    && Number.isFinite(Number(coordinate[0]))
    && Number.isFinite(Number(coordinate[1]))
  );
  if (coordinates.length < 3) return null;
  const longitudes = coordinates.map((coordinate) => Number(coordinate[0]));
  const latitudes = coordinates.map((coordinate) => Number(coordinate[1]));
  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes)
  ].map((value) => Number(value.toFixed(4)));
}

function isSourceDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(String(value ?? ""));
}

function getRecentJstDates(timestamp = Date.now()) {
  const jstTimestamp = timestamp + 9 * 60 * 60 * 1000;
  return [0, 1].map((dayOffset) =>
    new Date(jstTimestamp - dayOffset * 86_400_000).toISOString().slice(0, 10)
  );
}
