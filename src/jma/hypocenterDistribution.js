import { fetchJson } from "./jmaClient.js";

const ENDPOINT = "/api/earthquakes/distribution";
export const HYPOCENTER_DISTRIBUTION_DAY_COUNT = 731;
export const HYPOCENTER_DISTRIBUTION_MAX_DAY_OFFSET = HYPOCENTER_DISTRIBUTION_DAY_COUNT - 1;

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
  let payload = await fetchJson(`${ENDPOINT}?${parameters}`, {
    ttlMs: options.force ? 0 : 60 * 1000,
    cache: options.force ? "no-store" : "default"
  });
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
  return payload;
}

function getRecentJstDates(timestamp = Date.now()) {
  const jstTimestamp = timestamp + 9 * 60 * 60 * 1000;
  return [0, 1].map((dayOffset) =>
    new Date(jstTimestamp - dayOffset * 86_400_000).toISOString().slice(0, 10)
  );
}
