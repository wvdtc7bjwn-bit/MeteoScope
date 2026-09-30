export const JMA_EARTHQUAKE_INTENSITY_API_URL = "https://www.data.jma.go.jp/eqdb/data/shindo/api/";
export const JMA_EARTHQUAKE_HISTORY_SOURCE_URL = "https://www.data.jma.go.jp/eqdb/data/shindo/";

export function buildJmaIntensitySearchForm(startDate, endDate) {
  const form = new FormData();
  [
    ["mode", "search"],
    ["dateTimeF[]", startDate], ["dateTimeF[]", "00:00"],
    ["dateTimeT[]", endDate], ["dateTimeT[]", "23:59"],
    ["mag[]", "0.0"], ["mag[]", "9.9"], ["dep[]", "000"], ["dep[]", "999"],
    ["epi[]", "99"], ["pref[]", "99"], ["city[]", "99"], ["station[]", "99"],
    ["obsInt", "1"], ["maxInt", "1"], ["additionalC", "false"],
    ["Sort", "S0"], ["Comp", "C0"], ["seisCount", "false"], ["observed", "false"]
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
