export const WARNING_MAP_COLORS = Object.freeze({
  // Reference-map hues, brightened and saturated after visual review.
  // Existing transparency preserves the underlying terrain.
  advisory: "#dbc750",
  warning: "#962720",
  danger: "#69558d",
  emergency: "#69558d"
});

export const WARNING_EMERGENCY_HATCH_COLOR = "#000000";

export function getWarningLegendBackground(level) {
  const color = getWarningColor(level);
  return level === "emergency"
    ? `repeating-linear-gradient(135deg, ${WARNING_EMERGENCY_HATCH_COLOR} 0 4px, transparent 4px 10px), ${color}`
    : color;
}

export const EARLY_WARNING_MAP_COLORS = Object.freeze({
  middle: "#ffc8b8",
  high: "#ff6b73"
});

// UI badges, outlook cells and list markers use the map's shared palette.
export function applyWarningPalette(root) {
  if (!root?.style) return;
  for (const [level, color] of Object.entries(WARNING_MAP_COLORS)) {
    root.style.setProperty(`--warning-map-${level}`, color);
  }
  root.style.setProperty("--warning-map-emergency-background", getWarningLegendBackground("emergency"));
}

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
