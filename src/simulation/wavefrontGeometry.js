import { getDistanceKm } from "../location/distance.js";
import { destinationPoint } from "../typhoonGeometry.js";
import { unwrapLineAtAntimeridian } from "../map/geoLine.js";

// Match the sphere used by destinationPoint when creating the rendered rings.
const EARTH_RADIUS_KM = 6371.0088;
const FULL_CIRCLE = 2 * Math.PI;
const JOIN_TOLERANCE_KM = .001;
const clamp = value => Math.max(-1, Math.min(1, value));

// Compute spherical-circle intersections before sampling the visible arcs.
// Testing chord midpoints independently can omit pieces on both circles and
// leave gaps; intersection bearings give both arcs the same boundary endpoint.
export function exposedWavefrontArcs(input) {
  const circles = input.filter((circle, index) => circle.radius > 0 && Number.isFinite(circle.radius)
    && !input.slice(0, index).some(other => Math.abs(circle.radius - other.radius) < JOIN_TOLERANCE_KM
      && getDistanceKm(circle.center, other.center) < JOIN_TOLERANCE_KM));
  const arcs = [];
  circles.forEach((circle, index) => {
    const covered = [];
    for (let j = 0; j < circles.length; j++) {
      if (j === index) continue;
      const other = circles[j];
      const { angularDistance, bearing } = relativePosition(circle.center, other.center);
      const distance = angularDistance * EARTH_RADIUS_KM;
      if (distance + circle.radius <= other.radius + 1e-8) return;
      if (distance >= circle.radius + other.radius || distance + other.radius <= circle.radius) continue;
      const r = circle.radius / EARTH_RADIUS_KM;
      const d = angularDistance;
      const denominator = Math.sin(r) * Math.sin(d);
      if (Math.abs(denominator) < 1e-15) continue;
      const halfWidth = Math.acos(clamp((Math.cos(other.radius / EARTH_RADIUS_KM) - Math.cos(r) * Math.cos(d)) / denominator));
      const start = bearing - halfWidth;
      const end = bearing + halfWidth;
      if (start < 0) covered.push([start + FULL_CIRCLE, FULL_CIRCLE], [0, end]);
      else if (end > FULL_CIRCLE) covered.push([start, FULL_CIRCLE], [0, end - FULL_CIRCLE]);
      else covered.push([start, end]);
    }
    const merged = [];
    for (const interval of covered.sort((a, b) => a[0] - b[0])) {
      const last = merged.at(-1);
      if (last && interval[0] <= last[1] + 1e-12) last[1] = Math.max(last[1], interval[1]);
      else merged.push([...interval]);
    }
    const visible = [];
    let cursor = 0;
    for (const [start, end] of merged) {
      if (start > cursor + 1e-12) visible.push([cursor, start]);
      cursor = Math.max(cursor, end);
    }
    if (cursor < FULL_CIRCLE - 1e-12) visible.push([cursor, FULL_CIRCLE]);
    if (visible.length > 1 && visible[0][0] === 0 && visible.at(-1)[1] === FULL_CIRCLE) {
      const first = visible.shift();
      visible.at(-1)[1] = first[1] + FULL_CIRCLE;
    }
    const resolution = Math.max(32, (circle.ring?.length ?? 97) - 1);
    for (const [start, end] of visible) {
      const steps = Math.max(1, Math.ceil((end - start) / FULL_CIRCLE * resolution));
      arcs.push(Array.from({ length: steps + 1 }, (_, i) => destinationPoint(circle.center, circle.radius,
        (start + (end - start) * i / steps) * 180 / Math.PI)));
    }
  });
  return joinArcs(arcs);
}

function relativePosition([longitude, latitude], [otherLongitude, otherLatitude]) {
  const lat = latitude * Math.PI / 180;
  const otherLat = otherLatitude * Math.PI / 180;
  const delta = (otherLongitude - longitude) * Math.PI / 180;
  const east = Math.sin(delta) * Math.cos(otherLat);
  const north = Math.cos(lat) * Math.sin(otherLat) - Math.sin(lat) * Math.cos(otherLat) * Math.cos(delta);
  const dot = Math.sin(lat) * Math.sin(otherLat) + Math.cos(lat) * Math.cos(otherLat) * Math.cos(delta);
  return { angularDistance: Math.atan2(Math.hypot(east, north), dot), bearing: (Math.atan2(east, north) + FULL_CIRCLE) % FULL_CIRCLE };
}

function joinArcs(input) {
  const pending = input.slice();
  const joined = [];
  while (pending.length) {
    const line = pending.shift();
    while (getDistanceKm(line[0], line.at(-1)) > JOIN_TOLERANCE_KM) {
      const next = pending.findIndex(arc => getDistanceKm(line.at(-1), arc[0]) <= JOIN_TOLERANCE_KM);
      if (next < 0) break;
      line.push(...pending.splice(next, 1)[0].slice(1));
    }
    if (getDistanceKm(line[0], line.at(-1)) <= JOIN_TOLERANCE_KM) line[line.length - 1] = [...line[0]];
    joined.push(unwrapLineAtAntimeridian(line));
  }
  return joined;
}
