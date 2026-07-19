export const HYPOCENTER_UNKNOWN_DEPTH_COLOR = "#687487";

export const HYPOCENTER_DEPTH_STOPS = Object.freeze([
  Object.freeze({ depthKm: 0, color: "#ef362b" }),
  Object.freeze({ depthKm: 30, color: "#ffda47" }),
  Object.freeze({ depthKm: 100, color: "#4be05b" }),
  Object.freeze({ depthKm: 300, color: "#45d3ee" }),
  Object.freeze({ depthKm: 700, color: "#1c44d2" })
]);

export function getHypocenterDepthColor(depthKm) {
  if (depthKm == null || depthKm === "") return HYPOCENTER_UNKNOWN_DEPTH_COLOR;
  const numericDepth = Number(depthKm);
  if (!Number.isFinite(numericDepth)) return HYPOCENTER_UNKNOWN_DEPTH_COLOR;
  const depth = Math.max(0, Math.min(700, numericDepth));
  const upperIndex = HYPOCENTER_DEPTH_STOPS.findIndex((stop) => depth <= stop.depthKm);
  if (upperIndex <= 0) return HYPOCENTER_DEPTH_STOPS[0].color;
  const lower = HYPOCENTER_DEPTH_STOPS[upperIndex - 1];
  const upper = HYPOCENTER_DEPTH_STOPS[upperIndex];
  const progress = (depth - lower.depthKm) / (upper.depthKm - lower.depthKm);
  const lowerColor = parseHexColor(lower.color);
  const upperColor = parseHexColor(upper.color);
  return rgbToHex(lowerColor.map((channel, index) => (
    Math.round(channel + (upperColor[index] - channel) * progress)
  )));
}

function parseHexColor(value) {
  return [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
}

function rgbToHex(channels) {
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
