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

export function getVolcanoAshfallLevel(amount) {
  return VOLCANO_ASHFALL_LEVELS.find((level) => level.amount === amount) ?? VOLCANO_ASHFALL_UNKNOWN_STYLE;
}

export function isVolcanoImpactAshForecast(bulletinCode) {
  return VOLCANO_IMPACT_ASH_FORECAST_CODES.has(String(bulletinCode ?? "").trim());
}

export function getVolcanoAshfallLegendItems(forecast) {
  const hasAshfall = forecast?.areas?.some((area) => area.category === "ashfall");
  if (!hasAshfall) return [];

  if (isVolcanoImpactAshForecast(forecast.bulletinCode)) {
    return VOLCANO_ASHFALL_LEVELS.map(({ label, color }) => [label, "", color]);
  }

  const genericColor = getVolcanoAshfallLevel("moderate").color;
  return [["降灰予報範囲", "", genericColor]];
}
