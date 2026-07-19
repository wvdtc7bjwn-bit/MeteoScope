import { parseHexColor } from "./hypocenter3DGeometry.js";

export const PLATE_DEPTH_3D_VERTICAL_EXAGGERATION = 3;

export function normalizePlateDepthContours(collection, colorForDepth) {
  if (!collection || collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) return [];
  return collection.features.flatMap((feature) => {
    const depthKm = Number(feature?.properties?.depthKm);
    if (!Number.isFinite(depthKm)) return [];
    const lines = normalizeLines(feature?.geometry);
    if (!lines.length) return [];
    const color = colorForDepth?.(depthKm) ?? "#63d7ed";
    return [{
      depthKm: Math.min(700, Math.max(0, depthKm)),
      color,
      colorComponents: parseHexColor(color),
      lines
    }];
  });
}

export function countPlateDepthSegments(contours) {
  return contours.reduce((total, contour) => (
    total + contour.lines.reduce((lineTotal, line) => lineTotal + Math.max(0, line.length - 1), 0)
  ), 0);
}

function normalizeLines(geometry) {
  const sourceLines = geometry?.type === "LineString"
    ? [geometry.coordinates]
    : (geometry?.type === "MultiLineString" ? geometry.coordinates : []);
  return sourceLines
    .flatMap(splitValidLine)
    .filter((line) => line.length >= 2);
}

function splitValidLine(line) {
  if (!Array.isArray(line)) return [];
  const segments = [];
  let current = [];
  for (const rawCoordinate of line) {
    const coordinate = normalizeCoordinate(rawCoordinate);
    if (coordinate) {
      current.push(coordinate);
      continue;
    }
    if (current.length >= 2) segments.push(current);
    current = [];
  }
  if (current.length >= 2) segments.push(current);
  return segments;
}

function normalizeCoordinate(coordinate) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
  if (coordinate[0] == null || coordinate[1] == null || coordinate[0] === "" || coordinate[1] === "") return null;
  const longitude = Number(coordinate[0]);
  const latitude = Number(coordinate[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  return [longitude, latitude];
}
