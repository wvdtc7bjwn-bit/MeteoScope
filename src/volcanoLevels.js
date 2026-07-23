export const VOLCANO_LEVEL_COLORS = Object.freeze({
  1: "#f0f0f8",
  2: "#faf700",
  3: "#ffad00",
  4: "#ff2900",
  5: "#ca01f9"
});

export const VOLCANO_UNKNOWN_LEVEL_COLOR = "#6f879b";

export function getVolcanoLevelColor(level) {
  return VOLCANO_LEVEL_COLORS[Number(level)] ?? VOLCANO_UNKNOWN_LEVEL_COLOR;
}

export function getVolcanoLevelTextColor(level) {
  return Number(level) >= 4 ? "#ffffff" : "#13233a";
}
