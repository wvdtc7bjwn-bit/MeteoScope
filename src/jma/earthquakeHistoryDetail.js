import { fetchJson } from "./jmaClient.js";
import { JMA_ENDPOINTS, STATIC_DATA_CACHE_TTL_MS } from "../config.js";
import { getEarthquakeIntensityColor, getEarthquakeIntensityRank } from "../earthquakeIntensity.js";

const EVENT_ENDPOINT = "/api/earthquake-history-event";

export async function fetchEarthquakeHistoryEvent(eventId, { signal } = {}) {
  const id = normalizeEarthquakeHistoryEventId(eventId);
  if (!id) throw new TypeError("地震IDが不正です");
  const [payload, areaGeoJson] = await Promise.all([
    fetchJson(`${EVENT_ENDPOINT}?id=${encodeURIComponent(id)}`, {
    ttlMs: 24 * 60 * 60 * 1000,
    timeoutMs: 20_000,
    retryCount: 0,
    signal,
    cancelUnderlying: true,
    staleIfError: false
    }),
    fetchJson(JMA_ENDPOINTS.earthquakeAreas, {
      ttlMs: STATIC_DATA_CACHE_TTL_MS,
      cache: "force-cache",
      signal,
      cancelUnderlying: true
    }).catch(() => null)
  ]);
  if (!payload?.ok || !payload.event) throw new Error("地震の詳細を取得できませんでした");
  const event = normalizeEarthquakeHistoryEvent(payload.event, id);
  return {
    ...event,
    intensityAreaFeatures: buildHistoricalIntensityAreaFeatures(event.stations, areaGeoJson)
  };
}

export function buildHistoricalIntensityAreaFeatures(stations = [], geoJson = null) {
  const areaGroups = new Map();
  const areaFeatures = (geoJson?.features ?? []).flatMap((feature) => {
    const areaCode = String(feature?.properties?.code ?? feature?.properties?.areaCode ?? "").trim();
    const bounds = getGeometryBounds(feature?.geometry);
    return areaCode && bounds ? [{ feature, areaCode, bounds }] : [];
  });
  for (const station of stations) {
    const coordinate = station?.coordinates;
    if (!Array.isArray(coordinate) || !station.intensity) continue;
    const [longitude, latitude] = coordinate;
    for (const { feature, areaCode, bounds } of areaFeatures) {
      if (longitude < bounds[0] || longitude > bounds[2] || latitude < bounds[1] || latitude > bounds[3]) continue;
      if (!geometryContainsCoordinate(feature.geometry, coordinate)) continue;
      const previous = areaGroups.get(areaCode);
      if (!previous || getEarthquakeIntensityRank(station.intensity) > getEarthquakeIntensityRank(previous.intensity)) {
        areaGroups.set(areaCode, { feature, intensity: station.intensity });
      }
    }
  }
  return [...areaGroups.entries()].map(([areaCode, group]) => {
    const properties = group.feature.properties ?? {};
    const intensity = group.intensity;
    return {
      type: "Feature",
      geometry: group.feature.geometry,
      properties: {
        ...properties,
        code: areaCode,
        areaCode,
        areaName: properties.name ?? areaCode,
        intensity,
        intensityLabel: `震度${intensity.replace("-", "弱").replace("+", "強")}`,
        color: getEarthquakeIntensityColor(intensity),
        fillOpacity: 0.48,
        lineWidth: 1.3,
        sortKey: getEarthquakeIntensityRank(intensity)
      }
    };
  });
}

function getGeometryBounds(geometry) {
  if (!["Polygon", "MultiPolygon"].includes(geometry?.type)) return null;
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (coordinates) => {
    if (!Array.isArray(coordinates)) return;
    if (coordinates.length >= 2 && coordinates.slice(0, 2).every(Number.isFinite)) {
      bounds[0] = Math.min(bounds[0], coordinates[0]);
      bounds[1] = Math.min(bounds[1], coordinates[1]);
      bounds[2] = Math.max(bounds[2], coordinates[0]);
      bounds[3] = Math.max(bounds[3], coordinates[1]);
      return;
    }
    coordinates.forEach(visit);
  };
  visit(geometry.coordinates);
  return bounds.every(Number.isFinite) ? bounds : null;
}

function geometryContainsCoordinate(geometry, coordinate) {
  const [longitude, latitude] = coordinate;
  const polygons = geometry?.type === "Polygon"
    ? [geometry.coordinates]
    : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
  return polygons.some((rings) => (
    Array.isArray(rings?.[0])
    && isCoordinateInRing([longitude, latitude], rings[0])
    && !rings.slice(1).some((hole) => isCoordinateInRing([longitude, latitude], hole))
  ));
}

function isCoordinateInRing([longitude, latitude], ring) {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x1, y1] = ring[index] ?? [];
    const [x2, y2] = ring[previous] ?? [];
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
    const cross = (longitude - x1) * (y2 - y1) - (latitude - y1) * (x2 - x1);
    if (Math.abs(cross) < 1e-10
      && longitude >= Math.min(x1, x2) - 1e-10 && longitude <= Math.max(x1, x2) + 1e-10
      && latitude >= Math.min(y1, y2) - 1e-10 && latitude <= Math.max(y1, y2) + 1e-10) return true;
    const intersects = ((y1 > latitude) !== (y2 > latitude))
      && longitude < ((x2 - x1) * (latitude - y1)) / (y2 - y1) + x1;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function normalizeEarthquakeHistoryEventId(value) {
  const id = String(value ?? "").trim();
  return /^\d{12,17}$/u.test(id) ? id : "";
}

export function normalizeEarthquakeHistoryEvent(event = {}, expectedId = "") {
  const hypocenter = event.hypocenter ?? {};
  const id = normalizeEarthquakeHistoryEventId(hypocenter.id ?? expectedId);
  const latitude = Number(hypocenter.lat);
  const longitude = Number(hypocenter.lon);
  if (!id || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("地震の詳細データが不正です");
  }
  const stations = (Array.isArray(event.stations) ? event.stations : []).flatMap((station) => {
    const stationLatitude = Number(station?.latitude);
    const stationLongitude = Number(station?.longitude);
    const intensity = normalizeIntensity(station?.intensity ?? station?.character);
    const name = String(station?.name ?? "").trim();
    if (!name || !intensity || !Number.isFinite(stationLatitude) || stationLatitude < -90 || stationLatitude > 90
      || !Number.isFinite(stationLongitude) || stationLongitude < -180 || stationLongitude > 180) return [];
    return [{
      id: String(station.code ?? `${name}:${stationLatitude}:${stationLongitude}`),
      name,
      code: String(station.code ?? ""),
      latitude: stationLatitude,
      longitude: stationLongitude,
      coordinates: [stationLongitude, stationLatitude],
      intensity,
      intensityLabel: `震度${intensity.replace("-", "弱").replace("+", "強")}`
    }];
  }).sort((a, b) => (
    getEarthquakeIntensityRank(b.intensity) - getEarthquakeIntensityRank(a.intensity)
    || a.name.localeCompare(b.name, "ja")
  ));
  return {
    id,
    hypocenter: {
      id,
      originTime: String(hypocenter.originTime ?? ""),
      place: String(hypocenter.place ?? "震央地名不明"),
      latitude,
      longitude,
      coordinates: [longitude, latitude],
      depthKm: parseDepth(hypocenter.depth),
      magnitude: parseMagnitude(hypocenter.magnitude),
      maxIntensity: normalizeIntensity(hypocenter.maxIntensity)
    },
    stations
  };
}

function normalizeIntensity(value) {
  const intensity = String(value ?? "")
    .replace(/^震度/u, "")
    .replace(/[０-９]/gu, (digit) => String("０１２３４５６７８９".indexOf(digit)))
    .replace("弱", "-")
    .replace("強", "+")
    .trim();
  return /^(?:1|2|3|4|5-|5\+|6-|6\+|7)$/u.test(intensity) ? intensity : "";
}

function parseDepth(value) {
  const match = String(value ?? "").match(/(\d+(?:\.\d+)?)\s*km/iu);
  return match ? Number(match[1]) : null;
}

function parseMagnitude(value) {
  const magnitude = Number(value);
  return Number.isFinite(magnitude) ? magnitude : null;
}
