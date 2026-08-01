export function destinationPoint([longitude, latitude], distanceKm, bearingDegrees) {
  const earthRadiusKm = 6371.0088;
  const angularDistance = Number(distanceKm) / earthRadiusKm;
  const bearing = Number(bearingDegrees) * Math.PI / 180;
  const latitudeRadians = Number(latitude) * Math.PI / 180;
  const longitudeRadians = Number(longitude) * Math.PI / 180;
  const destinationLatitude = Math.asin(
    Math.sin(latitudeRadians) * Math.cos(angularDistance)
    + Math.cos(latitudeRadians) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const destinationLongitude = longitudeRadians + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitudeRadians),
    Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(destinationLatitude)
  );

  return [
    ((destinationLongitude * 180 / Math.PI + 540) % 360) - 180,
    destinationLatitude * 180 / Math.PI
  ];
}

export function buildStormWarningAreaLineSegments(stormWarningArea) {
  const segments = [];

  (stormWarningArea?.arc ?? []).forEach((arc) => {
    const segment = makeStormWarningArcSegment(arc);
    if (segment.length >= 2) segments.push(segment);
  });

  (stormWarningArea?.line ?? []).forEach((line) => {
    const segment = (line ?? []).filter(isCoordinate);
    if (segment.length >= 2) segments.push(segment);
  });

  return segments;
}

function makeStormWarningArcSegment(arc) {
  const center = arc?.center;
  const radius = Number(arc?.radius);
  if (!isCoordinate(center) || !Number.isFinite(radius) || radius <= 0) return [];
  let start = Number(arc?.start);
  let end = Number(arc?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  if (end < start) end += 360;

  const span = Math.max(1, end - start);
  const steps = Math.max(8, Math.ceil(span / 5));
  return Array.from({ length: steps + 1 }, (_, index) => (
    destinationPoint(center, radius, start + span * index / steps)
  ));
}

function isCoordinate(value) {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]));
}
