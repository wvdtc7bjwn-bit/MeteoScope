import { parseHexColor } from "./hypocenter3DGeometry.js";

export const PLATE_SURFACE_MAX_DEPTH_GAP_KM = 40;
export const PLATE_SURFACE_MAX_PAIR_DISTANCE_KM = 180;
export const PLATE_SURFACE_ZERO_DEPTH_MAX_PAIR_DISTANCE_KM = 520;
export const PLATE_SURFACE_MAX_BRIDGE_DISTANCE_KM = 220;
export const PLATE_SURFACE_DEEP_MAX_BRIDGE_DISTANCE_KM = 320;
const PLATE_SURFACE_DEEP_BRIDGE_START_KM = 100;
const PLATE_SURFACE_DEEP_BRIDGE_FULL_KM = 500;
const MIN_RESAMPLE_POINTS = 12;
const MAX_ADAPTIVE_RESAMPLE_POINTS = 120;

export function buildPlateDepthSurface(collection, options = {}) {
  const contours = normalizeContourLines(collection);
  const maximumDepthGapKm = options.maximumDepthGapKm ?? PLATE_SURFACE_MAX_DEPTH_GAP_KM;
  const maximumPairDistanceKm = options.maximumPairDistanceKm ?? PLATE_SURFACE_MAX_PAIR_DISTANCE_KM;
  const zeroDepthMaximumPairDistanceKm = options.zeroDepthMaximumPairDistanceKm
    ?? PLATE_SURFACE_ZERO_DEPTH_MAX_PAIR_DISTANCE_KM;
  const maximumBridgeDistanceKm = options.maximumBridgeDistanceKm ?? PLATE_SURFACE_MAX_BRIDGE_DISTANCE_KM;
  const deepMaximumBridgeDistanceKm = options.deepMaximumBridgeDistanceKm
    ?? PLATE_SURFACE_DEEP_MAX_BRIDGE_DISTANCE_KM;
  const groups = groupContours(contours);
  const features = [];

  for (const [region, depthGroups] of groups) {
    const depths = [...depthGroups.keys()].sort((left, right) => left - right);
    for (let depthIndex = 0; depthIndex < depths.length - 1; depthIndex += 1) {
      const shallowDepthKm = depths[depthIndex];
      const deepDepthKm = depths[depthIndex + 1];
      if (deepDepthKm - shallowDepthKm > maximumDepthGapKm) continue;
      const pairs = pairContourLines(
        depthGroups.get(shallowDepthKm),
        depthGroups.get(deepDepthKm),
        shallowDepthKm === 0 ? zeroDepthMaximumPairDistanceKm : maximumPairDistanceKm
      );
      const bandMaximumBridgeDistanceKm = maximumBridgeDistanceForDepth(
        shallowDepthKm,
        deepDepthKm,
        maximumBridgeDistanceKm,
        deepMaximumBridgeDistanceKm
      );
      for (const pair of pairs) {
        const triangles = buildSurfaceTriangles(pair.shallow.line, pair.deep.line, {
          shallowDepthKm,
          deepDepthKm,
          maximumBridgeDistanceKm: bandMaximumBridgeDistanceKm
        });
        if (!triangles.length) continue;
        features.push({
          type: "Feature",
          properties: {
            region,
            plate: pair.shallow.plate || pair.deep.plate || "",
            depthKm: round((shallowDepthKm + deepDepthKm) / 2, 1),
            shallowDepthKm,
            deepDepthKm,
            maximumBridgeDistanceKm: round(bandMaximumBridgeDistanceKm, 1),
            triangleCount: triangles.length,
            approximate: true
          },
          geometry: {
            type: "MultiPolygon",
            coordinates: triangles.map((triangle) => [[...triangle, triangle[0]]])
          }
        });
      }
    }
  }

  return {
    type: "FeatureCollection",
    properties: {
      source: "USGS Slab2 depth contours and USGS Tectonic Plate Boundaries",
      approximate: true,
      note: "The convergent boundary is treated as 0 km; adjacent contours are conservatively connected and unsupported gaps remain open."
    },
    features
  };
}

export function maximumBridgeDistanceForDepth(
  shallowDepthKm,
  deepDepthKm,
  shallowMaximumKm = PLATE_SURFACE_MAX_BRIDGE_DISTANCE_KM,
  deepMaximumKm = PLATE_SURFACE_DEEP_MAX_BRIDGE_DISTANCE_KM
) {
  const averageDepthKm = (Number(shallowDepthKm) + Number(deepDepthKm)) / 2;
  if (!Number.isFinite(averageDepthKm) || averageDepthKm <= PLATE_SURFACE_DEEP_BRIDGE_START_KM) {
    return shallowMaximumKm;
  }
  if (averageDepthKm >= PLATE_SURFACE_DEEP_BRIDGE_FULL_KM) return deepMaximumKm;
  const progress = (averageDepthKm - PLATE_SURFACE_DEEP_BRIDGE_START_KM)
    / (PLATE_SURFACE_DEEP_BRIDGE_FULL_KM - PLATE_SURFACE_DEEP_BRIDGE_START_KM);
  return shallowMaximumKm + ((deepMaximumKm - shallowMaximumKm) * progress);
}

export function normalizePlateDepthSurfaceTriangles(collection, colorForDepth) {
  if (!collection || collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) return [];
  const triangles = [];
  for (const feature of collection.features) {
    const polygons = feature?.geometry?.type === "Polygon"
      ? [feature.geometry.coordinates]
      : (feature?.geometry?.type === "MultiPolygon" ? feature.geometry.coordinates : []);
    for (const polygon of polygons) {
      const ring = Array.isArray(polygon?.[0]) ? polygon[0] : [];
      const vertices = ring.slice(0, 3).map((coordinate) => normalizeSurfaceCoordinate(
        coordinate,
        feature?.properties?.depthKm
      ));
      if (vertices.some((vertex) => !vertex)) continue;
      triangles.push(vertices.map((vertex) => {
        const color = colorForDepth?.(vertex.depthKm) ?? "#63d7ed";
        return { ...vertex, color, colorComponents: parseHexColor(color) };
      }));
    }
  }
  return triangles;
}

export function countPlateDepthSurfaceTriangles(collection) {
  return normalizePlateDepthSurfaceTriangles(collection).length;
}

function normalizeContourLines(collection) {
  if (!collection || collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) return [];
  const contours = collection.features.flatMap((feature) => {
    const region = String(feature?.properties?.region ?? "").trim();
    const plate = String(feature?.properties?.plate ?? "").trim();
    const depthKm = Number(feature?.properties?.depthKm);
    if (!region || !Number.isFinite(depthKm)) return [];
    const lines = feature?.geometry?.type === "LineString"
      ? [feature.geometry.coordinates]
      : (feature?.geometry?.type === "MultiLineString" ? feature.geometry.coordinates : []);
    return lines.flatMap((line) => {
      const normalized = Array.isArray(line) ? line.map(normalizeCoordinate).filter(Boolean) : [];
      return normalized.length >= 2 ? [{ region, plate, depthKm, line: normalized }] : [];
    });
  });
  return mergeConnectedContourLines(contours);
}

function mergeConnectedContourLines(contours, maximumGapKm = 1) {
  const groups = new Map();
  for (const contour of contours) {
    const key = `${contour.region}\u0000${contour.plate}\u0000${contour.depthKm}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(contour);
  }
  const merged = [];
  for (const group of groups.values()) {
    const remaining = group.map((contour) => ({ ...contour, line: contour.line.map((point) => [...point]) }));
    while (remaining.length) {
      const current = remaining.shift();
      let joined = true;
      while (joined) {
        joined = false;
        let best = null;
        remaining.forEach((candidate, index) => {
          const joins = [
            { index, gapKm: coordinateDistanceKm(current.line.at(-1), candidate.line[0]), mode: "append" },
            { index, gapKm: coordinateDistanceKm(current.line.at(-1), candidate.line.at(-1)), mode: "append-reversed" },
            { index, gapKm: coordinateDistanceKm(current.line[0], candidate.line.at(-1)), mode: "prepend" },
            { index, gapKm: coordinateDistanceKm(current.line[0], candidate.line[0]), mode: "prepend-reversed" }
          ];
          for (const join of joins) {
            if (join.gapKm <= maximumGapKm && (!best || join.gapKm < best.gapKm)) best = join;
          }
        });
        if (!best) continue;
        const candidate = remaining.splice(best.index, 1)[0];
        if (best.mode === "append") current.line.push(...candidate.line.slice(1));
        else if (best.mode === "append-reversed") current.line.push(...[...candidate.line].reverse().slice(1));
        else if (best.mode === "prepend") current.line.unshift(...candidate.line.slice(0, -1));
        else current.line.unshift(...[...candidate.line].reverse().slice(0, -1));
        joined = true;
      }
      merged.push(current);
    }
  }
  return merged;
}

function groupContours(contours) {
  const result = new Map();
  for (const contour of contours) {
    if (!result.has(contour.region)) result.set(contour.region, new Map());
    const depthGroups = result.get(contour.region);
    if (!depthGroups.has(contour.depthKm)) depthGroups.set(contour.depthKm, []);
    depthGroups.get(contour.depthKm).push(contour);
  }
  return result;
}

function pairContourLines(shallowLines = [], deepLines = [], maximumPairDistanceKm) {
  const candidates = [];
  shallowLines.forEach((shallow, shallowIndex) => {
    deepLines.forEach((deep, deepIndex) => {
      const alignedDeepLine = alignLineDirection(shallow.line, deep.line);
      const score = linePairDistanceKm(shallow.line, alignedDeepLine);
      if (score <= maximumPairDistanceKm) {
        candidates.push({ shallowIndex, deepIndex, shallow, deep: { ...deep, line: alignedDeepLine }, score });
      }
    });
  });
  candidates.sort((left, right) => left.score - right.score);
  const usedShallow = new Set();
  const usedDeep = new Set();
  const usedPairs = new Set();
  const pairs = [];
  const addPair = (candidate) => {
    const key = `${candidate.shallowIndex}:${candidate.deepIndex}`;
    if (usedPairs.has(key)) return;
    usedPairs.add(key);
    pairs.push(candidate);
  };
  for (const candidate of candidates) {
    if (usedShallow.has(candidate.shallowIndex) || usedDeep.has(candidate.deepIndex)) continue;
    usedShallow.add(candidate.shallowIndex);
    usedDeep.add(candidate.deepIndex);
    addPair(candidate);
  }
  // Slab2 contours can split or merge at the edge of a regional model.
  // Reuse only the nearest already-matched neighbour for an otherwise orphaned
  // branch; the per-vertex bridge limit still leaves unsupported gaps open.
  for (let shallowIndex = 0; shallowIndex < shallowLines.length; shallowIndex += 1) {
    if (usedShallow.has(shallowIndex)) continue;
    const candidate = candidates.find((entry) => entry.shallowIndex === shallowIndex);
    if (candidate) addPair(candidate);
  }
  for (let deepIndex = 0; deepIndex < deepLines.length; deepIndex += 1) {
    if (usedDeep.has(deepIndex)) continue;
    const candidate = candidates.find((entry) => entry.deepIndex === deepIndex);
    if (candidate) addPair(candidate);
  }
  return pairs;
}

function buildSurfaceTriangles(shallowLine, deepLine, configuration) {
  return buildAdaptiveSurfaceTriangles(shallowLine, deepLine, configuration);
}

function buildAdaptiveSurfaceTriangles(shallowLine, deepLine, configuration) {
  const shallow = resampleLineForAdaptiveSurface(shallowLine);
  const deep = resampleLineForAdaptiveSurface(deepLine);
  const completeSurface = buildCompleteSurfaceTriangles(shallow, deep, configuration);
  if (completeSurface.length) return completeSurface;
  let closest = { shallowIndex: 0, deepIndex: 0, distanceKm: Number.POSITIVE_INFINITY };
  shallow.forEach((shallowPoint, shallowIndex) => {
    deep.forEach((deepPoint, deepIndex) => {
      const distanceKm = coordinateDistanceKm(shallowPoint, deepPoint);
      if (distanceKm < closest.distanceKm) closest = { shallowIndex, deepIndex, distanceKm };
    });
  });
  if (closest.distanceKm > configuration.maximumBridgeDistanceKm) return [];
  return [
    ...walkAdaptiveSurface(shallow, deep, closest, -1, configuration),
    ...walkAdaptiveSurface(shallow, deep, closest, 1, configuration)
  ];
}

function buildCompleteSurfaceTriangles(shallow, deep, configuration) {
  const rowLength = deep.length;
  const stateCount = shallow.length * rowLength;
  const costs = new Float64Array(stateCount);
  costs.fill(Number.POSITIVE_INFINITY);
  const previous = new Uint8Array(stateCount);
  const stateIndex = (shallowIndex, deepIndex) => (shallowIndex * rowLength) + deepIndex;
  const startDistanceKm = coordinateDistanceKm(shallow[0], deep[0]);
  if (startDistanceKm > configuration.maximumBridgeDistanceKm) return [];
  costs[0] = startDistanceKm;

  for (let shallowIndex = 0; shallowIndex < shallow.length; shallowIndex += 1) {
    for (let deepIndex = 0; deepIndex < deep.length; deepIndex += 1) {
      if (shallowIndex === 0 && deepIndex === 0) continue;
      const distanceKm = coordinateDistanceKm(shallow[shallowIndex], deep[deepIndex]);
      if (distanceKm > configuration.maximumBridgeDistanceKm) continue;
      const index = stateIndex(shallowIndex, deepIndex);
      if (shallowIndex > 0) {
        const cost = costs[stateIndex(shallowIndex - 1, deepIndex)] + distanceKm;
        if (cost < costs[index]) {
          costs[index] = cost;
          previous[index] = 1;
        }
      }
      if (deepIndex > 0) {
        const cost = costs[stateIndex(shallowIndex, deepIndex - 1)] + distanceKm;
        if (cost < costs[index]) {
          costs[index] = cost;
          previous[index] = 2;
        }
      }
    }
  }

  let shallowIndex = shallow.length - 1;
  let deepIndex = deep.length - 1;
  if (!Number.isFinite(costs[stateIndex(shallowIndex, deepIndex)])) return [];
  const triangles = [];
  while (shallowIndex > 0 || deepIndex > 0) {
    const direction = previous[stateIndex(shallowIndex, deepIndex)];
    if (direction === 1) {
      triangles.push([
        surfaceCoordinate(shallow[shallowIndex - 1], configuration.shallowDepthKm),
        surfaceCoordinate(shallow[shallowIndex], configuration.shallowDepthKm),
        surfaceCoordinate(deep[deepIndex], configuration.deepDepthKm)
      ]);
      shallowIndex -= 1;
    } else if (direction === 2) {
      triangles.push([
        surfaceCoordinate(shallow[shallowIndex], configuration.shallowDepthKm),
        surfaceCoordinate(deep[deepIndex], configuration.deepDepthKm),
        surfaceCoordinate(deep[deepIndex - 1], configuration.deepDepthKm)
      ]);
      deepIndex -= 1;
    } else {
      return [];
    }
  }
  return triangles.reverse();
}

function walkAdaptiveSurface(shallow, deep, start, direction, configuration) {
  let shallowIndex = start.shallowIndex;
  let deepIndex = start.deepIndex;
  const triangles = [];
  while (true) {
    const currentShallow = shallow[shallowIndex];
    const currentDeep = deep[deepIndex];
    const nextShallowIndex = shallowIndex + direction;
    const nextDeepIndex = deepIndex + direction;
    const candidates = [];
    if (nextShallowIndex >= 0 && nextShallowIndex < shallow.length) {
      const nextShallow = shallow[nextShallowIndex];
      const distanceKm = coordinateDistanceKm(nextShallow, currentDeep);
      if (distanceKm <= configuration.maximumBridgeDistanceKm) {
        candidates.push({
          kind: "shallow",
          distanceKm,
          triangle: [
            surfaceCoordinate(currentShallow, configuration.shallowDepthKm),
            surfaceCoordinate(nextShallow, configuration.shallowDepthKm),
            surfaceCoordinate(currentDeep, configuration.deepDepthKm)
          ]
        });
      }
    }
    if (nextDeepIndex >= 0 && nextDeepIndex < deep.length) {
      const nextDeep = deep[nextDeepIndex];
      const distanceKm = coordinateDistanceKm(currentShallow, nextDeep);
      if (distanceKm <= configuration.maximumBridgeDistanceKm) {
        candidates.push({
          kind: "deep",
          distanceKm,
          triangle: [
            surfaceCoordinate(currentShallow, configuration.shallowDepthKm),
            surfaceCoordinate(nextDeep, configuration.deepDepthKm),
            surfaceCoordinate(currentDeep, configuration.deepDepthKm)
          ]
        });
      }
    }
    if (!candidates.length) break;
    candidates.sort((left, right) => left.distanceKm - right.distanceKm);
    const selected = candidates[0];
    triangles.push(selected.triangle);
    if (selected.kind === "shallow") shallowIndex = nextShallowIndex;
    else deepIndex = nextDeepIndex;
  }
  return triangles;
}

function resampleLineForAdaptiveSurface(line) {
  const pointCount = Math.max(
    MIN_RESAMPLE_POINTS,
    Math.min(MAX_ADAPTIVE_RESAMPLE_POINTS, Math.ceil(lineLengthKm(line) / 40) + 1)
  );
  return resampleLine(line, pointCount);
}

function linePairDistanceKm(first, second) {
  const firstSamples = resampleLine(first, 32);
  const secondSamples = resampleLine(second, 32);
  // A contour can split or merge between adjacent depth bands. Comparing
  // equal-ratio points makes a short branch look far away from its longer
  // parent line, even when the branch follows part of that line closely.
  // Use the better directed median so a genuine overlapping branch can pair;
  // the per-vertex bridge limit still rejects unsupported distant sections.
  return Math.min(
    directedLineMedianDistanceKm(firstSamples, secondSamples),
    directedLineMedianDistanceKm(secondSamples, firstSamples)
  );
}

function directedLineMedianDistanceKm(sourceSamples, targetSamples) {
  const distances = sourceSamples.map((source) => targetSamples.reduce(
    (nearest, target) => Math.min(nearest, coordinateDistanceKm(source, target)),
    Number.POSITIVE_INFINITY
  ));
  distances.sort((left, right) => left - right);
  return distances[Math.floor(distances.length / 2)];
}

function alignLineDirection(reference, candidate) {
  const sameDirection = coordinateDistanceKm(reference[0], candidate[0])
    + coordinateDistanceKm(reference.at(-1), candidate.at(-1));
  const reversedDirection = coordinateDistanceKm(reference[0], candidate.at(-1))
    + coordinateDistanceKm(reference.at(-1), candidate[0]);
  return reversedDirection < sameDirection ? [...candidate].reverse() : candidate;
}

function resampleLine(line, pointCount) {
  if (line.length === pointCount) return line.map((coordinate) => [...coordinate]);
  const cumulative = [0];
  for (let index = 1; index < line.length; index += 1) {
    cumulative.push(cumulative.at(-1) + coordinateDistanceKm(line[index - 1], line[index]));
  }
  const total = cumulative.at(-1);
  if (total <= 0) return Array.from({ length: pointCount }, () => [...line[0]]);
  const result = [];
  let segmentIndex = 1;
  for (let index = 0; index < pointCount; index += 1) {
    const target = total * index / (pointCount - 1);
    while (segmentIndex < cumulative.length - 1 && cumulative[segmentIndex] < target) segmentIndex += 1;
    const startDistance = cumulative[segmentIndex - 1];
    const endDistance = cumulative[segmentIndex];
    const ratio = endDistance === startDistance ? 0 : (target - startDistance) / (endDistance - startDistance);
    const start = line[segmentIndex - 1];
    const end = line[segmentIndex];
    result.push([
      start[0] + (end[0] - start[0]) * ratio,
      start[1] + (end[1] - start[1]) * ratio
    ]);
  }
  return result;
}

function lineLengthKm(line) {
  let total = 0;
  for (let index = 1; index < line.length; index += 1) {
    total += coordinateDistanceKm(line[index - 1], line[index]);
  }
  return total;
}

export function coordinateDistanceKm(first, second) {
  const latitudeScale = Math.cos(((first[1] + second[1]) / 2) * Math.PI / 180);
  return Math.hypot((first[0] - second[0]) * latitudeScale, first[1] - second[1]) * 111.2;
}

function normalizeCoordinate(coordinate) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
  const longitude = Number(coordinate[0]);
  const latitude = Number(coordinate[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  return [longitude, latitude];
}

function normalizeSurfaceCoordinate(coordinate, fallbackDepthKm) {
  const horizontal = normalizeCoordinate(coordinate);
  const depthKm = Number(coordinate?.[2] ?? fallbackDepthKm);
  if (!horizontal || !Number.isFinite(depthKm)) return null;
  return { coordinate: horizontal, depthKm: Math.min(700, Math.max(0, depthKm)) };
}

function surfaceCoordinate(coordinate, depthKm) {
  return [round(coordinate[0], 5), round(coordinate[1], 5), round(depthKm, 1)];
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
