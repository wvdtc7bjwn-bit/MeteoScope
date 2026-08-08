export const WARNING_MAP_COLORS = Object.freeze({
  advisory: "#fff000",
  warning: "#ff2b12",
  danger: "#b400ff",
  emergency: "#b400ff"
});

export const EARLY_WARNING_MAP_COLORS = Object.freeze({
  middle: "#ffc8b8",
  high: "#ff6b73"
});

export function getWarningColor(level) {
  return WARNING_MAP_COLORS[level] ?? WARNING_MAP_COLORS.advisory;
}

export function getEarlyWarningColor(level) {
  return EARLY_WARNING_MAP_COLORS[level] ?? "rgba(0, 0, 0, 0)";
}

export function getWarningRiskRank(level) {
  if (level === "emergency" || level === "danger") return 5;
  if (level === "warning") return 3;
  return level === "advisory" ? 1 : 0;
}

export function getEarlyWarningRiskRank(level) {
  if (level === "high") return 3;
  return level === "middle" ? 2 : 0;
}
