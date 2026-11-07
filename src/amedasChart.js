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
