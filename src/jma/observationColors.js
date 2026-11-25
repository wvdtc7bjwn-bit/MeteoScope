// Official JMA website grade definitions, verified 2026-11-25.
// AMeDAS: https://www.jma.go.jp/bosai/amedas/ (Amedas.Common.elemInfo)
// Cross-checked against the map renderer: https://www.jma.go.jp/bosai/map.html#contents=amedas
// Intensity: https://www.jma.go.jp/jma/kishou/info/colorguide/HPColorGuide_202007.pdf
// Long period: https://www.jma.go.jp/bosai/ltpgm/images/ltpgm{1..4}j.svg
// Grade boundaries and colors travel together; JMA uses discrete bins.
const levels = (boundaries, colors, unit) => colors.map((color, index) => ({
  min: boundaries[index] ?? -Infinity,
  color,
  label: index === 0 ? `${boundaries[0]}${unit}以上`
    : index === colors.length - 1 ? `${boundaries.at(-1)}${unit}未満`
    : `${boundaries[index]}〜${boundaries[index - 1]}${unit}`
}));

export const JMA_AMEDAS_LEVELS = {
  temperature: levels([40, 35, 30, 25, 20, 15, 10, 5, 0, -5, -10, -15, -20, -25], ["#50002e", "#b40068", "#ff2800", "#ff9900", "#faf500", "#ffff96", "#fffff0", "#b9ebff", "#0096ff", "#0041ff", "#002080", "#4d4471", "#776fa4", "#a8a3c5", "#d8d6e4"], "℃"),
  humidity: levels([100, 90, 80, 70, 60, 50, 40, 30, 20, 10], ["#011f7d", "#004b96", "#00729a", "#1fc2d3", "#80f8e7", "#fffff0", "#ffc846", "#e78707", "#ab4a01", "#761100", "#540600"], "%"),
  snow: levels([200, 150, 100, 50, 20, 5, 1], ["#b40068", "#ff2800", "#ff9900", "#faf500", "#0041ff", "#218cff", "#a0d2ff", "#f2f2ff"], "cm"),
  wind: levels([25, 20, 15, 10, 5], ["#b40068", "#ff2800", "#ff9900", "#faf500", "#0041ff", "#f2f2ff"], "m/s"),
  // JMA publishes pressure without a classified scale; its map fallback is RGB 255,255,255.
  pressure: [{ min: -Infinity, color: "#ffffff", label: "海面気圧（階級別配色なし）" }]
};

export const JMA_PRECIPITATION_LEVELS = {
  "10m": levels([30, 20, 15, 10, 5, 3, 1], ["#b40068", "#ff2800", "#ff9900", "#faf500", "#0041ff", "#218cff", "#a0d2ff", "#f2f2ff"], "mm"),
  "1h": levels([80, 50, 30, 20, 10, 5, 1], ["#b40068", "#ff2800", "#ff9900", "#faf500", "#0041ff", "#218cff", "#a0d2ff", "#f2f2ff"], "mm"),
  "3h": levels([150, 120, 100, 80, 60, 40, 20], ["#b40068", "#ff2800", "#ff9900", "#faf500", "#0041ff", "#218cff", "#a0d2ff", "#f2f2ff"], "mm"),
  "24h": levels([300, 250, 200, 150, 100, 80, 50], ["#b40068", "#ff2800", "#ff9900", "#faf500", "#0041ff", "#218cff", "#a0d2ff", "#f2f2ff"], "mm"),
};

export const JMA_INTENSITY_COLORS = Object.freeze({
  "1": "#f2f2ff", "2": "#00aaff", "3": "#0041ff", "4": "#fae696",
  "5-": "#ffe600", "5+": "#ff9900", "6-": "#ff2800", "6+": "#a50021", "7": "#b40068",
  "5": "#ffe600", "6": "#ff2800"
});
export const JMA_LONG_PERIOD_COLORS = Object.freeze({
  1: "#0041ff", 2: "#ffe600", 3: "#ff2800", 4: "#a50021"
});
