// 配信元ごとの数値優先度を直接比較しない。
export function getEarthquakeReportStage(earthquake) {
  const code = String(earthquake?.xmlCode ?? "").toUpperCase();
  if (code === "VXSE51") return 10;
  if (code === "VXSE52") return 20;
  if (code === "VXSE53") return 30;
  if (earthquake?.issueType === "ScalePrompt") return 10;
  if (earthquake?.issueType === "Destination") return 20;
  if (["ScaleAndDestination", "DetailScale"].includes(earthquake?.issueType)) return 30;
  return 0;
}

export function isEarthquakeReportUnderInvestigation(earthquake) {
  return [10, 20].includes(getEarthquakeReportStage(earthquake));
}

export function getEarthquakeUnknownText(earthquake, fallback = "調査中") {
  return isEarthquakeReportUnderInvestigation(earthquake) ? "調査中" : fallback;
}

export function isKnownEarthquakeHypocenter(value) {
  const text = String(value ?? "").trim();
  return Boolean(text) && !/^(?:--|-|不明|未確認|調査中|震源調査中|震央調査中)$/u.test(text);
}

export function formatEarthquakeHypocenterText(earthquake, fallback = "調査中") {
  const text = String(earthquake?.hypocenterName ?? "").trim();
  if (isKnownEarthquakeHypocenter(text)) return text;
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
