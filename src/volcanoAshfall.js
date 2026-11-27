import { isVolcanicAshDisplayEnabled, VOLCANIC_ASH_DEPTH_LEVELS } from "./volcanicAsh.js";

const VOLCANO_IMPACT_ASH_FORECAST_CODES = new Set(["VFVO54", "VFVO55"]);

export const VOLCANO_ASHFALL_LEVELS = Object.freeze([
  Object.freeze({ amount: "heavy", label: "降灰 多量", color: "#747b84", opacity: 0.4 }),
  Object.freeze({ amount: "moderate", label: "降灰 やや多量", color: "#969da6", opacity: 0.3 }),
  Object.freeze({ amount: "light", label: "降灰 少量", color: "#b8bec5", opacity: 0.2 })
]);

export const VOLCANO_ASHFALL_UNKNOWN_STYLE = Object.freeze({
  color: "#a7adb5",
  opacity: 0.24
});

export const VOLCANO_SMALL_CINDERS_STYLE = Object.freeze({
  label: "小さな噴石の落下予測範囲",
  color: "#65329a",
  opacity: 0.3,
  lineWidth: 2
});

export function getVolcanoAshfallLevel(amount, options = {}) {
  if (isVolcanicAshDisplayEnabled("forecast", options.now ?? Date.now(), options.rollout)) {
    const level = VOLCANIC_ASH_DEPTH_LEVELS.find(item => item.amount === amount);
    if (level) return level;
  }
  return VOLCANO_ASHFALL_LEVELS.find((level) => level.amount === amount) ?? VOLCANO_ASHFALL_UNKNOWN_STYLE;
}

export function isVolcanoImpactAshForecast(bulletinCode) {
  return VOLCANO_IMPACT_ASH_FORECAST_CODES.has(String(bulletinCode ?? "").trim());
}

export function getVolcanoAshForecastLabel(forecast, options = {}) {
  const modern = forecast === undefined || forecast?.format === "volcanic-ash";
  return modern && isVolcanicAshDisplayEnabled("forecast", options.now ?? Date.now(), options.rollout)
    ? "火山灰予報" : "降灰予報";
}

export function getVolcanoAshfallLegendItems(forecast, options = {}) {
  const modern = forecast?.format === "volcanic-ash";
  if (modern && !isVolcanicAshDisplayEnabled("forecast", options.now ?? Date.now(), options.rollout)) return [];
  const hasAshfall = forecast?.areas?.some((area) => area.category === "ashfall");
  if (!hasAshfall) return [];

  if (isVolcanoImpactAshForecast(forecast.bulletinCode)) {
    if (modern) return [...VOLCANIC_ASH_DEPTH_LEVELS].reverse().map(({ label, color }) => [`火山灰 ${label}`, "", color]);
    return VOLCANO_ASHFALL_LEVELS.map(({ label, color }) => [label, "", color]);
  }

  const genericColor = getVolcanoAshfallLevel("moderate").color;
  return [[modern ? "火山灰予報範囲" : "降灰予報範囲", "", genericColor]];
}

export function getVolcanoAshfallAreasForDisplay(forecast, options = {}) {
  if (forecast?.format !== "volcanic-ash") return forecast?.areas ?? [];
  if (!isVolcanicAshDisplayEnabled("forecast", options.now ?? Date.now(), options.rollout)) return [];
  const rank = area => area.category === "small-cinders" ? Infinity
    : VOLCANIC_ASH_DEPTH_LEVELS.findIndex(level => level.amount === area.amount);
  // Greater-or-equal polygons overlap. Paint higher thresholds last.
  return [...(forecast.areas ?? [])].sort((left, right) => rank(left) - rank(right));
}
