import { pointInPolygon, getPolygonBounds } from "../jma/hypocenterDistribution.js";

export function createSimulationRegionLookup(regions) {
  const entries = (regions?.features ?? []).map(feature => {
    const geometry = feature.geometry;
    const polygons = geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
    return { name: String(feature.properties?.name ?? ""), code: String(feature.properties?.code ?? feature.properties?.__areaCode ?? ""), polygons: polygons.map(polygon => ({ rings: polygon, bounds: getPolygonBounds(polygon[0]) })) };
  });
  return coordinates => {
    const [longitude, latitude] = coordinates ?? [];
    if (![longitude, latitude].every(Number.isFinite)) return null;
    return entries.find(entry => entry.polygons.some(({ rings, bounds }) => bounds
      && longitude >= bounds[0] - .0001 && longitude <= bounds[2] + .0001 && latitude >= bounds[1] - .0001 && latitude <= bounds[3] + .0001
      && pointInPolygon(coordinates, rings[0]) && !rings.slice(1).some(hole => pointInPolygon(coordinates, hole)))) ?? null;
  };
}

export function findSimulationEpicenterName(regions, coordinates) {
  return createSimulationRegionLookup(regions)(coordinates)?.name ?? "";
}
