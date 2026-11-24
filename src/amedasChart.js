// Snow depth observations are hourly; other AMeDAS series are ten-minute data.
export function splitAmedasChartSegments(points, valueKey, metricId) {
  const maxGapMinutes = metricId === "snow" ? 60 : 20;
  const segments = [];
  let segment = [];
  let previousMinute = null;
  for (const point of points) {
    if (!Number.isFinite(point[valueKey])) continue;
    if (previousMinute !== null && point.minute - previousMinute > maxGapMinutes && segment.length) {
      segments.push(segment);
      segment = [];
    }
    segment.push(point);
    previousMinute = point.minute;
  }
  if (segment.length) segments.push(segment);
  return segments;
}

export function getSnowDepthAxisMaximum(value) {
  const nonnegative = Number.isFinite(value) ? Math.max(0, value) : 0;
  // Even integer bounds keep the middle tick distinct and in whole centimetres.
  return Math.max(2, Math.ceil((nonnegative + 1) / 2) * 2);
}

// Keep all-negative temperatures and tightly grouped pressure observations in
// their actual range, while giving rainfall, wind and snow a zero baseline.
export function getAmedasChartAxis(minimum, maximum, metricId) {
  const values = [minimum, maximum].filter(Number.isFinite);
  if (!values.length) return { min: 0, max: 1, ticks: [0, 0.5, 1] };
  const low = Math.min(...values), high = Math.max(...values);
  const startsAtZero = ["precipitation", "wind", "snow"].includes(metricId);
  const pad = Math.max(0.5, (high - low) * 0.08);
  const lower = startsAtZero ? 0 : low - pad;
  const upper = metricId === "snow" ? getSnowDepthAxisMaximum(high)
    : metricId === "precipitation" ? Math.max(1, high + pad) : high + pad;
  const target = Math.max(0.1, (upper - lower) / 4);
  const power = 10 ** Math.floor(Math.log10(target));
  const step = Math.max(metricId === "snow" ? 1 : metricId === "precipitation" ? 0.5 : 0,
    [1, 2, 5, 10].find(n => n * power >= target) * power);
  const min = metricId === "humidity" ? Math.max(0, Math.floor(lower / step) * step) : Math.floor(lower / step) * step;
  const max = Math.max(min + step, metricId === "humidity" ? Math.min(100, Math.ceil(upper / step) * step) : Math.ceil(upper / step) * step);
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => Number((min + i * step).toFixed(8)));
  return { min, max, ticks };
}

export const AMEDAS_CHART_LAYOUT = Object.freeze({
  width: 320, height: 184,
  inset: Object.freeze({ top: 14, right: 16, bottom: 28, left: 42 })
});

export function findNearestAmedasObservation(points, minute) {
  if (!Number.isFinite(minute)) return null;
  return points.reduce((nearest, point) => {
    if (!Number.isFinite(point.minute) || !Number.isFinite(point.value)) return nearest;
    return !nearest || Math.abs(point.minute - minute) < Math.abs(nearest.minute - minute)
      ? point : nearest;
  }, null);
}

export const AMEDAS_SUMMARY_CHART_LAYOUT = Object.freeze({
  ...AMEDAS_CHART_LAYOUT, height: 68,
  inset: Object.freeze({ ...AMEDAS_CHART_LAYOUT.inset, top: 5, bottom: 14, left: 34, right: 12 })
});
