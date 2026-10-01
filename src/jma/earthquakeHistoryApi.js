export const JMA_EARTHQUAKE_INTENSITY_API_URL = "https://www.data.jma.go.jp/eqdb/data/shindo/api/";
export const JMA_EARTHQUAKE_HISTORY_SOURCE_URL = "https://www.data.jma.go.jp/eqdb/data/shindo/";

export const JMA_HISTORY_INTENSITIES = Object.freeze({ "1": "1", "2": "2", "3": "3", "4": "4", "5-": "A", "5+": "B", "6-": "C", "6+": "D", "7": "7" });
export const JMA_HISTORY_SORTS = Object.freeze({ newest: "S0", oldest: "S1", intensity: "S2", magnitude: "S3" });

export function validateJmaHistoryConditions(value = {}) {
  const minIntensity = String(value.minIntensity ?? "1");
  const minMagnitude = String(value.minMagnitude ?? "0");
  const maxDepth = String(value.maxDepth ?? "all");
  const sort = String(value.sort ?? "newest");
  const keyword = String(value.keyword ?? "").trim();
  if (!Object.hasOwn(JMA_HISTORY_INTENSITIES, minIntensity)
    || !/^\d(?:\.\d)?$/u.test(minMagnitude) || Number(minMagnitude) > 9.9
    || (maxDepth !== "all" && (!/^\d{1,3}$/u.test(maxDepth) || Number(maxDepth) > 999))
    || !Object.hasOwn(JMA_HISTORY_SORTS, sort) || keyword.length > 40 || /[\u0000-\u001f]/u.test(keyword)) {
    throw new TypeError("検索条件が不正です");
  }
  return { minIntensity, minMagnitude: String(Number(minMagnitude)), maxDepth: maxDepth === "all" ? "all" : String(Number(maxDepth)), sort, keyword };
}

export function isJmaHistoryDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(value ?? ""))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function buildJmaIntensitySearchForm(startDate, endDate, startTime = "00:00", endTime = "23:59", conditions = {}) {
  const filters = validateJmaHistoryConditions(conditions);
  const form = new FormData();
  [
    ["mode", "search"],
    ["dateTimeF[]", startDate], ["dateTimeF[]", startTime],
    ["dateTimeT[]", endDate], ["dateTimeT[]", endTime],
    ["mag[]", Number(filters.minMagnitude).toFixed(1)], ["mag[]", "9.9"], ["dep[]", "000"], ["dep[]", filters.maxDepth === "all" ? "999" : filters.maxDepth.padStart(3, "0")],
    ["epi[]", "99"], ["pref[]", "99"], ["city[]", "99"], ["station[]", "99"],
    ["obsInt", "1"], ["maxInt", JMA_HISTORY_INTENSITIES[filters.minIntensity]], ["additionalC", filters.minIntensity !== "1" || Number(filters.minMagnitude) > 0 || filters.maxDepth !== "all" ? "true" : "false"],
    ["Sort", JMA_HISTORY_SORTS[filters.sort]], ["Comp", "C0"], ["seisCount", "false"], ["observed", "false"]
  ].forEach(([key, value]) => form.append(key, value));
  return form;
}

export function normalizeJmaEarthquakeOriginTime(value) {
  const match = String(value ?? "").match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/u);
  if (!match) return "";
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] ?? "00"}+09:00`;
}

export function normalizeJmaEarthquakeIntensity(value) {
  return String(value ?? "")
    .replace(/^震度/u, "")
    .replace(/[０-９]/gu, (digit) => String("０１２３４５６７８９".indexOf(digit)))
    .replace("弱", "-")
    .replace("強", "+")
    .trim() || "felt";
}

export function splitJmaEarthquakeDateRange(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const middle = start + Math.floor((end - start) / (2 * 86_400_000)) * 86_400_000;
  return [formatUtcDate(middle), formatUtcDate(middle + 86_400_000)];
}

function formatUtcDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}
