export function splitLineAtAntimeridian(coordinates = []) {
  if (coordinates.length < 2) return [];
  const continuous = unwrapLineAtAntimeridian(coordinates);
  if (continuous.length < 2) return [];
  const firstZone = Math.floor((continuous[0][0] + 180) / 360);
  const segments = [[[
    continuous[0][0] - firstZone * 360,
    continuous[0][1]
  ]]];
  for (let index = 1; index < continuous.length; index += 1) {
    const previous = continuous[index - 1];
    const current = continuous[index];
    const previousZone = Math.floor((previous[0] + 180) / 360);
    const currentZone = Math.floor((current[0] + 180) / 360);
    if (previousZone === currentZone) {
      segments.at(-1).push([current[0] - currentZone * 360, current[1]]);
      continue;
    }

    const movingEast = currentZone > previousZone;
    const boundary = movingEast ? 180 + previousZone * 360 : -180 + previousZone * 360;
    const ratio = (boundary - previous[0]) / (current[0] - previous[0]);
    const latitude = previous[1] + (current[1] - previous[1]) * ratio;
    segments.at(-1).push([movingEast ? 180 : -180, latitude]);
    segments.push([[movingEast ? -180 : 180, latitude], [current[0] - currentZone * 360, current[1]]]);
  }
  return segments.filter((segment) => segment.length >= 2);
}

export function unwrapLineAtAntimeridian(coordinates = []) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return [];
  const first = coordinates[0];
  if (!Array.isArray(first) || first.length < 2 || !first.slice(0, 2).every(Number.isFinite)) return [];
  let previousLongitude = normalizeLongitude(first[0]);
  const unwrapped = [[previousLongitude, first[1]]];

  for (const coordinate of coordinates.slice(1)) {
    if (!Array.isArray(coordinate) || coordinate.length < 2 || !coordinate.slice(0, 2).every(Number.isFinite)) continue;
    let longitude = normalizeLongitude(coordinate[0]);
    while (longitude - previousLongitude > 180) longitude -= 360;
    while (longitude - previousLongitude < -180) longitude += 360;
    unwrapped.push([longitude, coordinate[1]]);
    previousLongitude = longitude;
  }
  return unwrapped;
}

export function unwrapLongitudeNear(longitude, referenceLongitude) {
  if (!Number.isFinite(longitude) || !Number.isFinite(referenceLongitude)) return Number.NaN;
  let unwrappedLongitude = normalizeLongitude(longitude);
  while (unwrappedLongitude - referenceLongitude > 180) unwrappedLongitude -= 360;
  while (unwrappedLongitude - referenceLongitude < -180) unwrappedLongitude += 360;
  return unwrappedLongitude;
}

export function splitPolygonRingAtAntimeridian(ring = []) {
  if (!Array.isArray(ring) || ring.length < 4) return [];
  const continuousRing = unwrapLineAtAntimeridian(ring);
  if (continuousRing.length < 4) return [];
  const openRing = continuousRing.slice(0, -1);
  if (openRing.length < 3) return [];
  const longitudes = openRing.map(([longitude]) => longitude);
  const firstZone = Math.floor((Math.min(...longitudes) + 180) / 360);
  const lastZone = Math.floor((Math.max(...longitudes) + 180) / 360);
  const polygons = [];

  for (let zone = firstZone; zone <= lastZone; zone += 1) {
    const west = -180 + zone * 360;
    const east = 180 + zone * 360;
    let clipped = clipRingAtLongitude(openRing, west, true);
    clipped = clipRingAtLongitude(clipped, east, false);
    clipped = removeDuplicateRingPoints(clipped);
    if (clipped.length < 3 || Math.abs(getRingArea(clipped)) < 1e-12) continue;
    const shifted = clipped.map(([longitude, latitude]) => [longitude - zone * 360, latitude]);
    shifted.push(shifted[0]);
    polygons.push(shifted);
  }
  return polygons;
}

function clipRingAtLongitude(ring, boundary, keepGreater) {
  if (ring.length === 0) return [];
  const clipped = [];
  let previous = ring.at(-1);
  let previousInside = keepGreater ? previous[0] >= boundary : previous[0] <= boundary;
  for (const current of ring) {
    const currentInside = keepGreater ? current[0] >= boundary : current[0] <= boundary;
    if (currentInside !== previousInside) {
      const ratio = (boundary - previous[0]) / (current[0] - previous[0]);
      clipped.push([boundary, previous[1] + (current[1] - previous[1]) * ratio]);
    }
    if (currentInside) clipped.push(current);
    previous = current;
    previousInside = currentInside;
  }
  return clipped;
}

function removeDuplicateRingPoints(ring) {
  return ring.filter((point, index) => {
    const previous = ring[index - 1];
    return !previous || Math.abs(point[0] - previous[0]) > 1e-10 || Math.abs(point[1] - previous[1]) > 1e-10;
  });
}

function getRingArea(ring) {
  return ring.reduce((area, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function normalizeLongitude(longitude) {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}
