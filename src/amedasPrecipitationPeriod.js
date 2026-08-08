export const DEFAULT_AMEDAS_PRECIPITATION_PERIOD = "1h";

export const AMEDAS_PRECIPITATION_PERIODS = [
  { id: "10m", field: "precipitation10m", label: "10分", primary: "10 min" },
  { id: "1h", field: "precipitation1h", label: "1時間", primary: "1 hour" },
  { id: "3h", field: "precipitation3h", label: "3時間", primary: "3 hours" },
  { id: "24h", field: "precipitation24h", label: "24時間", primary: "24 hours" }
];

const PRECIPITATION_COLORS = Object.freeze({
  extreme: "#c90064",
  veryHeavy: "#ff2800",
  heavy: "#ff9900",
  moderate: "#fff000",
  blue: "#064de8",
  cyan: "#2494ea",
  lightBlue: "#8ecbf0",
  trace: "#eef2f8"
});

const PRECIPITATION_THRESHOLDS_BY_PERIOD = Object.freeze({
  "10m": [30, 20, 15, 10, 5, 3, 1, 0.1],
  "1h": [80, 50, 30, 20, 10, 5, 1, 0.1],
  "3h": [150, 120, 100, 80, 60, 40, 20, 0.1],
  "24h": [300, 250, 200, 150, 100, 80, 50, 0.1]
});

const PRECIPITATION_COLOR_SEQUENCE = Object.freeze([
  PRECIPITATION_COLORS.extreme,
  PRECIPITATION_COLORS.veryHeavy,
  PRECIPITATION_COLORS.heavy,
  PRECIPITATION_COLORS.moderate,
  PRECIPITATION_COLORS.blue,
  PRECIPITATION_COLORS.cyan,
  PRECIPITATION_COLORS.lightBlue,
  PRECIPITATION_COLORS.trace
]);

const PRECIPITATION_LEVELS_BY_PERIOD = new Map(
  AMEDAS_PRECIPITATION_PERIODS.map((period) => {
    const thresholds = PRECIPITATION_THRESHOLDS_BY_PERIOD[period.id];
    const levels = thresholds.map((min, index) => {
      const upper = thresholds[index - 1];
      const label = index === 0
        ? `${min}mm以上`
        : `${min}〜${upper}mm`;
      const color = PRECIPITATION_COLOR_SEQUENCE[index];
      return Object.freeze({
        min,
        label,
        color
      });
    });
    return [period.id, Object.freeze(levels)];
  })
);

const PERIOD_BY_ID = new Map(AMEDAS_PRECIPITATION_PERIODS.map((period) => [period.id, period]));

export function normalizeAmedasPrecipitationPeriod(periodId) {
  const normalized = String(periodId ?? "").trim();
  return PERIOD_BY_ID.has(normalized) ? normalized : DEFAULT_AMEDAS_PRECIPITATION_PERIOD;
}

export function getAmedasPrecipitationPeriod(periodId) {
  return PERIOD_BY_ID.get(normalizeAmedasPrecipitationPeriod(periodId));
}

export function getAmedasPrecipitationLevels(periodId) {
  return PRECIPITATION_LEVELS_BY_PERIOD.get(normalizeAmedasPrecipitationPeriod(periodId));
}

export function getAmedasPrecipitationLegendTicks(periodId) {
  return getAmedasPrecipitationLevels(periodId)
    .filter((level) => level.min >= 1)
    .map((level) => level.min)
    .reverse();
}

export function getAmedasObservationField(metricId, precipitationPeriodId) {
  if (metricId === "precipitation") {
    return getAmedasPrecipitationPeriod(precipitationPeriodId).field;
  }
  return {
    temperature: "temp",
    wind: "wind",
    humidity: "humidity",
    pressure: "normalPressure",
    snow: "snow"
  }[metricId] ?? "";
}

export function applyAmedasPrecipitationPeriod(data = {}, periodId) {
  const period = getAmedasPrecipitationPeriod(periodId);
  return {
    ...data,
    precipitationPeriod: period.id,
    precipitationPeriodLabel: period.label,
    precipitationPeriodPrimary: period.primary,
    points: (data.points ?? []).map((point) => ({
      ...point,
      values: {
        ...point.values,
        precipitation: point.values?.[period.field] ?? null
      }
    }))
  };
}
