import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { WARNING_GEOMETRY_FIX_CODES } from "../src/map/warningGeometryFixCodes.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "public/data/jma-weather-warning-municipalities.geojson");
const outputPath = resolve(root, "public/data/jma-weather-warning-municipality-fixes.geojson");
const indexPath = resolve(root, "public/data/jma-weather-warning-municipality-index.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const fixCodes = new Set(WARNING_GEOMETRY_FIX_CODES);
const features = (source.features ?? [])
  .filter((feature) => fixCodes.has(String(feature?.properties?.code ?? "")))
  .map((feature) => ({ ...feature, geometry: normalizeGeometry(feature.geometry) }));

if (features.length !== fixCodes.size) {
  throw new Error(`Expected ${fixCodes.size} geometry fixes, found ${features.length}`);
}

const areas = (source.features ?? []).map((feature) => ({
  code: String(feature?.properties?.code ?? ""),
  name: feature?.properties?.name ?? feature?.properties?.regionName ?? ""
})).filter((area) => area.code);

await Promise.all([
  writeFile(outputPath, `${JSON.stringify({ type: "FeatureCollection", features })}\n`, "utf8"),
  writeFile(indexPath, `${JSON.stringify({ areas })}\n`, "utf8")
]);
console.log(`Wrote ${features.length} warning geometry fixes and ${areas.length} index entries`);

function normalizeGeometry(geometry) {
  if (!geometry?.coordinates) return geometry;
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.type === "MultiPolygon"
      ? geometry.coordinates
      : null;
  if (!polygons) return geometry;

  const normalizedPolygons = polygons.flatMap((polygon) => normalizePolygonParts(polygon));
  if (geometry.type === "Polygon") {
    if (normalizedPolygons.length <= 1) return { ...geometry, coordinates: normalizedPolygons[0] ?? [] };
    return { type: "MultiPolygon", coordinates: normalizedPolygons };
  }
  return { ...geometry, coordinates: normalizedPolygons };
}

function normalizePolygonParts(polygon) {
  if (!Array.isArray(polygon)) return [];
  const rings = polygon
    .map((ring) => normalizeRing(ring))
    .filter((ring) => ring.length >= 4 && Math.abs(getRingArea(ring)) > 1e-12);
  if (rings.length <= 1) return rings.length === 1 ? [[rings[0]]] : [];

  const ringInfos = rings
    .map((ring) => ({ ring, area: Math.abs(getRingArea(ring)), point: ring[0] ?? [0, 0] }))
    .sort((left, right) => right.area - left.area);
  const outerInfos = [];
  ringInfos.forEach((info) => {
    const containingOuter = outerInfos
      .filter((outer) => pointInRing(info.point, outer.ring))
      .sort((left, right) => left.area - right.area)[0];
    if (containingOuter) containingOuter.holes.push(info.ring);
    else outerInfos.push({ ...info, holes: [] });
  });
  return outerInfos.map((outer) => [outer.ring, ...outer.holes]);
}

function normalizeRing(ring) {
  let normalized = closeRing(ring);
  if (normalized.length < 4) return normalized;
  for (let attempts = 0; attempts < 32; attempts += 1) {
    const intersection = findLocalIntersection(normalized);
    if (!intersection) break;
    const next = [...normalized.slice(0, intersection.start), ...normalized.slice(intersection.end)];
    if (next.length < 4) break;
    normalized = closeRing(next);
  }
  if (hasStrictSelfIntersection(normalized) && Math.abs(getRingArea(normalized)) < 1e-5) {
    const hull = createConvexHullRing(normalized);
    if (hull.length >= 4 && Math.abs(getRingArea(hull)) > 1e-12) return hull;
  }
  return normalized;
}

function closeRing(ring) {
  const normalized = [];
  (Array.isArray(ring) ? ring : []).forEach((point) => {
    const lng = Number(point?.[0]);
    const lat = Number(point?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    const last = normalized.at(-1);
    if (!last || last[0] !== lng || last[1] !== lat) normalized.push([lng, lat]);
  });
  if (normalized.length) {
    const first = normalized[0];
    const last = normalized.at(-1);
    if (first[0] !== last[0] || first[1] !== last[1]) normalized.push([...first]);
  }
  return normalized;
}

function findLocalIntersection(ring) {
  for (let index = 0; index < ring.length - 1; index += 1) {
    const limit = Math.min(ring.length - 2, index + 6);
    for (let compared = index + 2; compared <= limit; compared += 1) {
      if (index === 0 && compared === ring.length - 2) continue;
      if (segmentsCrossStrictly(ring[index], ring[index + 1], ring[compared], ring[compared + 1])) {
        return { start: index + 1, end: compared + 1 };
      }
    }
  }
  return null;
}

function hasStrictSelfIntersection(ring) {
  for (let index = 0; index < ring.length - 1; index += 1) {
    for (let compared = index + 2; compared < ring.length - 1; compared += 1) {
      if (index === 0 && compared === ring.length - 2) continue;
      if (segmentsCrossStrictly(ring[index], ring[index + 1], ring[compared], ring[compared + 1])) return true;
    }
  }
  return false;
}

function createConvexHullRing(ring) {
  const points = [...new Map(ring.slice(0, -1).map((point) => [`${point[0]},${point[1]}`, point])).values()]
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  if (points.length < 3) return [];
  const lower = [];
  points.forEach((point) => {
    while (lower.length >= 2 && orient(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  });
  const upper = [];
  [...points].reverse().forEach((point) => {
    while (upper.length >= 2 && orient(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  });
  return closeRing([...lower.slice(0, -1), ...upper.slice(0, -1)]);
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    const intersects = (y > point[1]) !== (previousY > point[1])
      && point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function segmentsCrossStrictly(a, b, c, d) {
  if (samePoint(a, c) || samePoint(a, d) || samePoint(b, c) || samePoint(b, d)) return false;
  return orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;
}

function orient(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function samePoint(a, b) {
  return a?.[0] === b?.[0] && a?.[1] === b?.[1];
}

function getRingArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return area / 2;
}
