

function buildTyphoonFocusCoordinates(typhoon) {
  if (!typhoon) return [];
  const focusCircles = [
    ...(typhoon.forecastCircles ?? []),
    {
      center: typhoon.strongWindCenter ?? typhoon.center,
      radius: typhoon.strongWindRadius
    },
    {
      center: typhoon.stormCenter ?? typhoon.center,
      radius: typhoon.stormRadius
    },
    ...(Array.isArray(typhoon.stormWarningGroups) ? typhoon.stormWarningGroups.flat() : []),
    ...(Array.isArray(typhoon.stormWarningArea) ? typhoon.stormWarningArea : [])
  ];
  const coordinates = [
    typhoon.center,
    ...(typhoon.forecastTrack ?? []),
    ...collectTyphoonFocusCircleCoordinates(focusCircles),
    ...collectTyphoonStormWarningShapeCoordinates(typhoon.stormWarningAreaShape)
  ];

  return coordinates.filter((point) =>
    Array.isArray(point)
    && point.length === 2
    && point.every((value) => Number.isFinite(value))
  );
}

function collectTyphoonFocusCircleCoordinates(circles = []) {
  return circles.flatMap((circle) => [
    circle?.center,
    ...expandCircleBounds(circle?.center, Number(circle?.radius))
  ]);
}

function collectTyphoonStormWarningShapeCoordinates(shape) {
  if (!shape || typeof shape !== "object") return [];
  return [
    ...collectTyphoonFocusCircleCoordinates(Array.isArray(shape.arc) ? shape.arc : []),
    ...(Array.isArray(shape.line) ? shape.line.flat() : [])
  ];
}

function buildWorldTyphoonFocusCoordinates(displayData = {}) {
  const hasSelectedTargets = (displayData.selectedWorldForecastTargetKeys ?? []).length > 0;
  return (displayData.worldForecastLayers ?? []).flatMap((layer) => {
    const primarySystemId = String(layer.system?.id ?? "");
    const positions = hasSelectedTargets || !primarySystemId
      ? (layer.forecastPositions ?? [])
      : (layer.forecastPositions ?? []).filter(({ system }) => (
        String(system?.id ?? "") === primarySystemId
      ));
    return positions
      .map(({ position }) => position?.coordinates)
      .filter((point) => (
        Array.isArray(point)
        && point.length === 2
        && point.every((value) => Number.isFinite(value))
      ));
  });
}

function buildEarthquakeFocusCoordinates(earthquake) {
  if (!earthquake) return [];
  const estimatedIntensityBounds = earthquake.estimatedIntensity?.bounds;
  const coordinates = [
    earthquake.coordinates,
    ...(earthquake.intensityStations ?? []).map((station) => station.coordinates),
    ...(earthquake.estimatedIntensity
      ? []
      : (earthquake.intensityAreaFeatures ?? []).flatMap(getFeatureBoundsCoordinates)),
    ...(Array.isArray(estimatedIntensityBounds) ? estimatedIntensityBounds : [])
  ];

  return coordinates.filter((point) =>
    Array.isArray(point)
    && point.length === 2
    && point.every((value) => Number.isFinite(value))
  );
}

function getFeatureBoundsCoordinates(feature) {
  const bounds = getGeometryBounds(feature?.geometry);
  if (!bounds) return [];
  return [
    [bounds.minLng, bounds.minLat],
    [bounds.maxLng, bounds.maxLat]
  ];
}

function getGeometryBounds(geometry) {
  if (!geometry?.coordinates) return null;
  const bounds = {
    minLng: Infinity,
    minLat: Infinity,
    maxLng: -Infinity,
    maxLat: -Infinity
  };

  collectGeometryCoordinates(geometry.coordinates, (coordinate) => {
    const [lng, lat] = coordinate;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    bounds.minLng = Math.min(bounds.minLng, lng);
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLng = Math.max(bounds.maxLng, lng);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
  });

  return Number.isFinite(bounds.minLng) ? bounds : null;
}

function collectGeometryCoordinates(value, callback) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
    callback(value);
    return;
  }
  value.forEach((item) => collectGeometryCoordinates(item, callback));
}

function expandCircleBounds(center, radiusKm) {
  if (!Array.isArray(center) || !Number.isFinite(radiusKm) || radiusKm <= 0) return [];
  const [lng, lat] = center;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [];
  const latRadius = radiusKm / 111.32;
  const lngRadius = radiusKm / Math.max(12, 111.32 * Math.cos(lat * Math.PI / 180));
  return [
    [lng - lngRadius, lat],
    [lng + lngRadius, lat],
    [lng, lat - latRadius],
    [lng, lat + latRadius]
  ];
}

export {
  buildTyphoonFocusCoordinates,
  buildWorldTyphoonFocusCoordinates,
  buildEarthquakeFocusCoordinates
};
