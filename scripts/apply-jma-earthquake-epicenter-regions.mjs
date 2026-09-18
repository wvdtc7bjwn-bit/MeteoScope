import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeHistoricalEpicenterName } from "../src/jma/historicalEpicenterNames.js";

const HISTORY_DIR = path.resolve("public/data/earthquake-history");
const REGION_PATH = path.resolve("public/data/jma-earthquake-epicenter-regions.geojson");

async function main() {
  const manifestPath = path.join(HISTORY_DIR, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const geoJson = JSON.parse(await readFile(REGION_PATH, "utf8"));
  const regions = createRegions(geoJson);
  let classifiedCount = 0;
  let changedCount = 0;
  let unmatchedCount = 0;

  for (const { file } of manifest.years) {
    const filePath = path.join(HISTORY_DIR, file);
    const records = JSON.parse(await readFile(filePath, "utf8"));
    let changed = false;
    for (const record of records) {
      const regionName = findEpicenterRegionName(regions, Number(record.la), Number(record.lo));
      if (!regionName) {
        unmatchedCount += 1;
        continue;
      }
      classifiedCount += 1;
      const officialName = normalizeHistoricalEpicenterName(record.id, regionName);
      if (record.p === officialName) continue;
      record.p = officialName;
      changed = true;
      changedCount += 1;
    }
    if (changed) await writeFile(filePath, `${JSON.stringify(records)}\n`, "utf8");
  }

  const enrichment = {
    generatedAt: new Date().toISOString(),
    source: "0Quake/JMA_Region（気象庁の地震情報で用いる震央地名）",
    sourceUrl: "https://github.com/0Quake/JMA_Region",
    regionCount: regions.length,
    classifiedCount,
    changedCount,
    unmatchedCount
  };
  await writeFile(path.join(HISTORY_DIR, "epicenter-name-enrichment.json"), `${JSON.stringify(enrichment)}\n`, "utf8");
  console.log(`Applied ${regions.length} JMA epicenter regions: ${changedCount} names changed, ${unmatchedCount} records outside the coverage.`);
}

function createRegions(geoJson) {
  if (geoJson?.type !== "FeatureCollection" || !Array.isArray(geoJson.features)) {
    throw new Error("JMA epicenter-region GeoJSON is invalid");
  }
  return geoJson.features.flatMap((feature) => {
    const name = String(feature?.properties?.name ?? "").trim();
    const geometry = feature?.geometry;
    if (!name || !geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) return [];
    return [{ name, geometry, bounds: getBounds(geometry.coordinates) }];
  });
}

function findEpicenterRegionName(regions, latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  return regions.find((region) => (
    isInsideBounds(longitude, latitude, region.bounds)
      && isPointInGeometry([longitude, latitude], region.geometry)
  ))?.name ?? "";
}

function getBounds(coordinates) {
  const bounds = { minLongitude: Infinity, maxLongitude: -Infinity, minLatitude: Infinity, maxLatitude: -Infinity };
  visitPositions(coordinates, ([longitude, latitude]) => {
    bounds.minLongitude = Math.min(bounds.minLongitude, longitude);
    bounds.maxLongitude = Math.max(bounds.maxLongitude, longitude);
    bounds.minLatitude = Math.min(bounds.minLatitude, latitude);
    bounds.maxLatitude = Math.max(bounds.maxLatitude, latitude);
  });
  return bounds;
}

function visitPositions(value, visit) {
  if (typeof value?.[0] === "number") {
    visit(value);
    return;
  }
  value?.forEach((child) => visitPositions(child, visit));
}

function isInsideBounds(longitude, latitude, bounds) {
  const epsilon = 1e-8;
  return longitude >= bounds.minLongitude - epsilon && longitude <= bounds.maxLongitude + epsilon
    && latitude >= bounds.minLatitude - epsilon && latitude <= bounds.maxLatitude + epsilon;
}

function isPointInGeometry(point, geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => isPointInPolygon(point, polygon));
}

function isPointInPolygon(point, polygon) {
  return isPointInRing(point, polygon[0]) && !polygon.slice(1).some((ring) => isPointInRing(point, ring));
}

function isPointInRing([longitude, latitude], ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [currentLongitude, currentLatitude] = ring[index];
    const [previousLongitude, previousLatitude] = ring[previous];
    const crossesLatitude = (currentLatitude > latitude) !== (previousLatitude > latitude);
    const intersectionLongitude = ((previousLongitude - currentLongitude) * (latitude - currentLatitude))
      / (previousLatitude - currentLatitude) + currentLongitude;
    if (crossesLatitude && longitude < intersectionLongitude) inside = !inside;
  }
  return inside;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
