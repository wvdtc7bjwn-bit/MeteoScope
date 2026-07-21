import { fetchJson } from "./jmaClient.js";

const ENDPOINT = "/api/earthquakes/distribution";
export const HYPOCENTER_DISTRIBUTION_DAY_COUNT = 365;
export const HYPOCENTER_DISTRIBUTION_MAX_DAY_OFFSET = HYPOCENTER_DISTRIBUTION_DAY_COUNT - 1;

export async function fetchHypocenterDistribution(filters = {}) {
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
    maxDepth
  });
  const payload = await fetchJson(`${ENDPOINT}?${parameters}`, {
    ttlMs: 5 * 60 * 1000,
    cache: "default"
  });
  if (payload?.ok !== true || !Array.isArray(payload?.items)) {
    throw new Error("気象庁の震央分布を取得できませんでした");
  }
  return payload;
}
