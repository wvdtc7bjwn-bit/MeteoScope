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
  if (!depth.unit) return depth.value;
  return options.compact ? `${depth.value}${depth.unit}` : `${depth.value} ${depth.unit}`;
}

export function formatEarthquakeMagnitude(value, options = {}) {
  const text = String(value ?? "").trim();
  if (!text || text === "--" || text === "-") return "--";
  const magnitude = text.replace(/^M\s*/i, "");
  if (!options.prefix) return magnitude;
  return options.compact ? `M${magnitude}` : `M ${magnitude}`;
}
