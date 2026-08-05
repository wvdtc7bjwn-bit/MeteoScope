export const DEFAULT_AMEDAS_PRECIPITATION_PERIOD = "1h";

export const AMEDAS_PRECIPITATION_PERIODS = [
  { id: "10m", field: "precipitation10m", label: "10分", primary: "10 min" },
  { id: "1h", field: "precipitation1h", label: "1時間", primary: "1 hour" },
  { id: "3h", field: "precipitation3h", label: "3時間", primary: "3 hours" },
  { id: "24h", field: "precipitation24h", label: "24時間", primary: "24 hours" }
];

const PERIOD_BY_ID = new Map(AMEDAS_PRECIPITATION_PERIODS.map((period) => [period.id, period]));

export function normalizeAmedasPrecipitationPeriod(periodId) {
  const normalized = String(periodId ?? "").trim();
  return PERIOD_BY_ID.has(normalized) ? normalized : DEFAULT_AMEDAS_PRECIPITATION_PERIOD;
}

export function getAmedasPrecipitationPeriod(periodId) {
  return PERIOD_BY_ID.get(normalizeAmedasPrecipitationPeriod(periodId));
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
