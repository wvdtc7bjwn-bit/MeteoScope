import { JMA_ENDPOINTS } from "../config.js";
import { getPrefectureNameByCode } from "../jma/warnings.js";
import { findEarlyWarningAreaForMunicipality } from "../warningLocationInsights.js";
import { getDistanceKm } from "./distance.js";

import { createRetryableResource } from "../utils/retryableResource.js";
import { normalizeLocationFix } from "./locationFix.js";

export function createMunicipalityLookup({fetcher=(...args)=>globalThis.fetch(...args),now=Date.now,retryMs=30000,timeoutMs=10000}={}) {
  return createRetryableResource(async signal=>{
    const response=await fetcher(JMA_ENDPOINTS.warningMunicipalities,{signal});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const geoJson=await response.json();
    if(!Array.isArray(geoJson.features)||!geoJson.features.length)throw new Error("Invalid municipality geometry");
    return (geoJson.features??[]).map(feature=>{
      const code=String(feature?.properties?.code??""),bounds=computeBounds(feature.geometry);
      return {code,name:feature?.properties?.name??feature?.properties?.regionName??"",
        prefecture:getPrefectureNameByCode(code),geometry:feature.geometry,bounds,
        center:computeRepresentativeCenter(feature.geometry,bounds)};
    }).filter(item=>item.code&&item.geometry);
  },{now,retryMs,timeoutMs});
}
const readMunicipalities=createMunicipalityLookup();

export async function resolveCurrentLocationInfo(coordinates, warningData = {}, fix = {}, {lookup=loadMunicipalityLookup}={}) {
  const [lng, lat] = coordinates ?? [];
  let municipality,geographyStatus="ready";
  try {
    municipality=await findMunicipalityForPoint(lng,lat,{lookup});
  } catch { geographyStatus="unavailable"; }
  const metadata=normalizeLocationFix(fix);
  if (!municipality) {
    return {
      status: "found",
      coordinates,
      ...metadata,
      geographyStatus,
      areaCode: "",
      areaName: "",
      prefecture: "",
      center: null,
      warnings: [],
      message: geographyStatus==="unavailable"?"現在地の座標は取得済みです。地域情報を取得できませんでした。":"現在地の市区町村を特定できませんでした。"
    };
  }

  const activeArea = (warningData.activeAreas ?? [])
    .find((area) => String(area.areaCode) === String(municipality.code));
  const earlyArea = findEarlyWarningAreaForMunicipality(municipality.code, warningData);

  return {
    status: "found",
    coordinates,
    ...metadata,
    geographyStatus,
    areaCode: municipality.code,
    areaName: municipality.name,
    prefecture: activeArea?.prefecture ?? earlyArea?.prefecture ?? getPrefectureNameByCode(municipality.code),
    center: municipality.center,
    warnings: activeArea?.warnings ?? [],
    earlyWarnings: buildCurrentLocationEarlyWarnings(earlyArea),
    earlyWarningArea: earlyArea ? {
      areaCode: earlyArea.areaCode,
      areaName: earlyArea.areaName,
      displayAreaCode: earlyArea.displayAreaCode,
      displayAreaName: earlyArea.displayAreaName,
      updatedAt: earlyArea.updatedAt
    } : null,
    updatedAt: activeArea?.updatedAt ?? warningData.updatedAt ?? warningData.latestTime ?? "",
    earlyUpdatedAt: earlyArea?.updatedAt ?? warningData.earlyWarnings?.updatedAt ?? warningData.earlyWarnings?.latestTime ?? "",
    message: !Array.isArray(warningData.activeAreas)
      ? "現在地の地域は特定できました。警報情報を取得できませんでした。"
      : activeArea?.warnings?.length
      ? "現在地に発表中の警報・注意報があります。"
      : "現在地に発表中の警報・注意報はありません。"
  };
}

function buildCurrentLocationEarlyWarnings(area) {
  return (area?.probabilities ?? [])
    .filter((probability) => probability?.level && probability.level !== "none")
    .map((probability) => ({
      type: probability.type ?? "",
      level: probability.level,
      label: [probability.type, probability.label].filter(Boolean).join(" ").trim(),
      updatedAt: area.updatedAt,
      displayAreaName: area.displayAreaName ?? area.areaName
    }));
}
export async function findMunicipalityForPoint(lng, lat, {lookup=loadMunicipalityLookup}={}) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const municipalities = await lookup();
  return municipalities.find((item) =>
    isPointInBounds(lng, lat, item.bounds) &&
    isPointInGeometry([lng, lat], item.geometry)
  ) ?? null;
}

export async function searchMunicipalities(query, limit = 12) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  const municipalities = await loadMunicipalityLookup();
  return municipalities
    .filter((item) => {
      const haystack = normalizeSearchText(`${item.prefecture} ${item.name} ${item.code}`);
      return haystack.includes(normalizedQuery);
    })
    .slice(0, limit)
    .map((item) => ({
      areaCode: item.code,
      areaName: item.name,
      prefecture: item.prefecture,
      coordinates: item.center
    }));
}

export function loadMunicipalityLookup() {
  return readMunicipalities();
}

// A conservative water-crossing screen using the municipality geometry already loaded for GPS.
// This does not model mountains, climate regions, or narrow channels below the sampling interval.
export function buildLandConnectionChecker(municipalities) {
  const cache = new Map();
  function onLand(point) {
    const key = point.map(v => v.toFixed(4)).join(",");
    if (cache.has(key)) return cache.get(key);
    const found = municipalities.some(item => isPointInBounds(...point, item.bounds) && isPointInGeometry(point, item.geometry));
    if (cache.size >= 2048) cache.clear();
    cache.set(key, found);
    return found;
  }
  return (from, to) => {
    if (!onLand(from) || !onLand(to)) return null;
    const steps = Math.max(2, Math.ceil(getDistanceKm(from, to) / 3));
    for (let i = 1; i < steps; i++) {
      const point = from.map((v, j) => v + (to[j] - v) * i / steps);
      if (!onLand(point)) return false;
    }
    return true;
  };
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function isPointInBounds(lng, lat, bounds) {
  return bounds &&
    lng >= bounds.minLng &&
    lng <= bounds.maxLng &&
    lat >= bounds.minLat &&
    lat <= bounds.maxLat;
}

function isPointInGeometry(point, geometry) {
  if (geometry?.type === "Polygon") return isPointInPolygon(point, geometry.coordinates);
  if (geometry?.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => isPointInPolygon(point, polygon));
  }
  return false;
}

function isPointInPolygon(point, rings = []) {
  if (!rings.length || !isPointInRing(point, rings[0])) return false;
  return !rings.slice(1).some((hole) => isPointInRing(point, hole));
}

function isPointInRing([lng, lat], ring = []) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (isPointOnSegment(lng, lat, xi, yi, xj, yj)) return true;
    const intersects = ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function isPointOnSegment(px, py, x1, y1, x2, y2) {
  const cross = (py - y1) * (x2 - x1) - (px - x1) * (y2 - y1);
  if (Math.abs(cross) > 1e-10) return false;
  const dot = (px - x1) * (px - x2) + (py - y1) * (py - y2);
  return dot <= 1e-10;
}

function computeBounds(geometry) {
  const bounds = {
    minLng: Infinity,
    maxLng: -Infinity,
    minLat: Infinity,
    maxLat: -Infinity
  };

  walkCoordinates(geometry?.coordinates, (coord) => {
    const lng = Number(coord[0]);
    const lat = Number(coord[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    bounds.minLng = Math.min(bounds.minLng, lng);
    bounds.maxLng = Math.max(bounds.maxLng, lng);
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
  });

  return Number.isFinite(bounds.minLng) ? bounds : null;
}

function computeRepresentativeCenter(geometry, bounds) {
  const points = [];
  walkCoordinates(geometry?.coordinates, (coord) => {
    const lng = Number(coord[0]);
    const lat = Number(coord[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) points.push([lng, lat]);
  });

  if (points.length) {
    const sums = points.reduce((acc, [lng, lat]) => {
      acc.lng += lng;
      acc.lat += lat;
      return acc;
    }, { lng: 0, lat: 0 });
    return [sums.lng / points.length, sums.lat / points.length];
  }

  if (bounds) {
    return [
      (bounds.minLng + bounds.maxLng) / 2,
      (bounds.minLat + bounds.maxLat) / 2
    ];
  }
  return null;
}

function walkCoordinates(coords, visitor) {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    visitor(coords);
    return;
  }
  coords.forEach((child) => walkCoordinates(child, visitor));
}
