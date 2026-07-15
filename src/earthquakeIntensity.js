export const EARTHQUAKE_INTENSITY_LEVELS = [
  { value: "7", label: "震度7", color: "#420092", rank: 9 },
  { value: "6+", label: "震度6強", color: "#9e07cb", rank: 8 },
  { value: "6-", label: "震度6弱", color: "#c50886", rank: 7 },
  { value: "5+", label: "震度5強", color: "#f50404", rank: 6 },
  { value: "5-", label: "震度5弱", color: "#f93904", rank: 5 },
  { value: "4", label: "震度4", color: "#f8b304", rank: 4 },
  { value: "3", label: "震度3", color: "#f5e904", rank: 3 },
  { value: "2", label: "震度2", color: "#13b605", rank: 2 },
  { value: "1", label: "震度1", color: "#01aff9", rank: 1 }
];

export function getEarthquakeIntensityLevel(value) {
  return EARTHQUAKE_INTENSITY_LEVELS.find((level) => level.value === String(value));
}

export function getEarthquakeIntensityLabel(value) {
  return getEarthquakeIntensityLevel(value)?.label ?? null;
}

export function getEarthquakeIntensityColor(value) {
  return getEarthquakeIntensityLevel(value)?.color ?? "#4b5563";
}

export function getEarthquakeIntensityRank(value) {
  return getEarthquakeIntensityLevel(value)?.rank ?? 0;
}

export function getEarthquakeIntensityTextClass(value) {
  const rank = getEarthquakeIntensityRank(value);
  if (rank === 0) return "is-bright-text";
  return rank >= 5 ? "is-bright-text" : "is-dark-text";
}
