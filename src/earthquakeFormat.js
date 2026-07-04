export function formatEarthquakeDepthParts(value) {
  if (value === 0) return { value: "ごく浅い", unit: "" };
  return Number.isFinite(value) ? { value: String(value), unit: "km" } : { value: "--", unit: "" };
}

export function formatEarthquakeDepthText(value, options = {}) {
  const depth = formatEarthquakeDepthParts(value);
  if (!depth.unit) return depth.value;
  return options.compact ? `${depth.value}${depth.unit}` : `${depth.value} ${depth.unit}`;
}
