// Coordinate rounding cell, not a measured hypocenter confidence interval.
// Reference: EQMonitor's decimal-precision rectangle (see DATA_SOURCES.md).
export function createEarthquakeCoordinateRange(earthquake) {
  const coordinates = earthquake?.coordinates;
  const places = earthquake?.coordinateDecimalPlaces;
  if (!Array.isArray(coordinates) || coordinates.length !== 2
    || !Array.isArray(places) || places.length !== 2) return null;
  const [longitude, latitude] = coordinates;
  if (!coordinates.every(Number.isFinite) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90
    || !places.every(value => Number.isInteger(value) && value >= 0 && value <= 6)) return null;
  // A source with finer coordinates must not inherit an older report's precision.
  if (!coordinates.every((value, index) => Math.abs(value * 10 ** places[index] - Math.round(value * 10 ** places[index])) < 1e-5)) return null;
  const [dx, dy] = places.map(value => 0.5 * 10 ** -value);
  // Do not draw a rectangle across the antimeridian or beyond a pole.
  if (Math.abs(longitude) + dx > 180 || Math.abs(latitude) + dy > 90) return null;
  const point = (x, y) => [Number(x.toFixed(7)), Number(y.toFixed(7))];
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: [
      point(longitude - dx, latitude - dy), point(longitude + dx, latitude - dy),
      point(longitude + dx, latitude + dy), point(longitude - dx, latitude + dy),
      point(longitude - dx, latitude - dy)
    ] },
    properties: { markerType: "earthquake-coordinate-range", lineStyle: "coordinate-range" }
  };
}
