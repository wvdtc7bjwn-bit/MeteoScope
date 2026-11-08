// Japanese land is supplied by the more detailed municipality dataset.
export function isNonJapaneseLand(feature) {
  return String(feature?.properties?.ISO_A3 ?? "").toUpperCase() !== "JPN";
}

export function removeNorthernTerritoryCountryParts(feature) {
  if (String(feature?.properties?.ISO_A3 ?? "").toUpperCase() !== "RUS") return feature;
  const geometry = feature.geometry;
  if (!geometry) return feature;
  if (geometry.type === "MultiPolygon") {
    const coordinates = geometry.coordinates.filter((polygon) => !isNorthernTerritoryCountryPart(polygon));
    return coordinates.length ? { ...feature, geometry: { ...geometry, coordinates } } : null;
  }
  return geometry.type === "Polygon" && isNorthernTerritoryCountryPart(geometry.coordinates) ? null : feature;
}

function isNorthernTerritoryCountryPart(polygon) {
  const bounds = { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity };
  for (const ring of polygon) for (const [lng, lat] of ring) {
    bounds.minLng = Math.min(bounds.minLng, lng);
    bounds.maxLng = Math.max(bounds.maxLng, lng);
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
  }
  const centerLng = (bounds.minLng + bounds.maxLng) / 2;
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  return centerLng >= 145.4 && centerLng <= 149.1 && centerLat >= 43.2 && centerLat <= 46.2 &&
    bounds.maxLng - bounds.minLng <= 2.2 && bounds.maxLat - bounds.minLat <= 1.4;
}

export function prepareWorldMapData(data) {
  return {
    ...data,
    features: data.features.filter(isNonJapaneseLand).map(removeNorthernTerritoryCountryParts).filter(Boolean)
  };
}
