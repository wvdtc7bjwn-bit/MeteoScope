const EARTHQUAKE_INVESTIGATION_XML_CODES = new Set(["VXSE51", "VXSE52"]);

export function isEarthquakeReportUnderInvestigation(earthquake) {
  return EARTHQUAKE_INVESTIGATION_XML_CODES.has(
    String(earthquake?.xmlCode ?? "").trim().toUpperCase()
  );
}

export function getEarthquakeUnknownText(earthquake, fallback = "不明") {
  return isEarthquakeReportUnderInvestigation(earthquake) ? "調査中" : fallback;
}

export function formatEarthquakeHypocenterText(earthquake, fallback = "震源調査中") {
  const text = String(earthquake?.hypocenterName ?? "").trim();
  if (text && !/^(?:--|-|不明|未確認|震源調査中|震央調査中)$/u.test(text)) return text;
  return getEarthquakeUnknownText(earthquake, fallback);
}

export function formatEarthquakeDepthParts(value) {
  if (value === null || value === undefined || value === "") return { value: "--", unit: "" };
  const text = String(value ?? "").trim();
  if (!text.replace(/\s*km$/i, "")) return { value: "--", unit: "" };
  const numeric = typeof value === "number"
    ? value
    : Number(text.replace(/\s*km$/i, ""));
  if (numeric === 0) return { value: "ごく浅い", unit: "" };
  return Number.isFinite(numeric) ? { value: String(numeric), unit: "km" } : { value: "--", unit: "" };
}

export function formatEarthquakeDepthText(value, options = {}) {
  const depth = formatEarthquakeDepthParts(value);
  if (!depth.unit) return depth.value === "--" ? (options.unknownText ?? depth.value) : depth.value;
  return options.compact ? `${depth.value}${depth.unit}` : `${depth.value} ${depth.unit}`;
}

export function formatEarthquakeMagnitude(value, options = {}) {
  const text = String(value ?? "").trim();
  if (!text || text === "--" || text === "-") return options.unknownText ?? "--";
  const magnitude = text.replace(/^M\s*/i, "");
  if (!options.prefix) return magnitude;
  return options.compact ? `M${magnitude}` : `M ${magnitude}`;
}
