import { fetchJson, parseJmaTime } from "../jma/jmaClient.js";
import { formatJapaneseWorldEarthquakePlace } from "./worldEarthquakePlace.js";

export const WORLD_EARTHQUAKE_FEED_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson";
export const WORLD_EARTHQUAKE_SOURCE_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php";
export const WORLD_EARTHQUAKE_MIN_MAGNITUDE = 4.5;
export const WORLD_EARTHQUAKE_REFRESH_MS = 60_000;
export const WORLD_EARTHQUAKE_MARKER_COLOR = "#eaa850";
export const WORLD_EARTHQUAKE_SELECTED_COLOR = "#54c7fa";

function isEarthquakeFeed(value) {
  return value?.type === "FeatureCollection" && Array.isArray(value.features);
}

export function normalizeWorldEarthquakes(feed, japanesePlaces) {
  if (!isEarthquakeFeed(feed)) throw new Error("Invalid USGS earthquake feed");
  const byId = new Map();
  for (const feature of feed.features) {
    const properties = feature?.properties;
    const id = typeof feature?.id === "string" && /^[a-z0-9]+$/iu.test(feature.id) ? feature.id : "";
    if (!id || properties?.type !== "earthquake" || properties.status === "deleted"
      || !Number.isFinite(properties.mag) || properties.mag < WORLD_EARTHQUAKE_MIN_MAGNITUDE
      || !Number.isFinite(properties.time) || properties.time <= 0) continue;
    if (feature.geometry?.type !== "Point" || !Array.isArray(feature.geometry.coordinates)) continue;
    const [lon, lat, depth] = feature.geometry.coordinates;
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) continue;
    const date = new Date(properties.time);
    if (!Number.isFinite(date.getTime())) continue;
    const updated = Number.isFinite(properties.updated) ? properties.updated : properties.time;
    if (byId.get(id)?.updated >= updated) continue;
    const place = typeof properties.place === "string" ? properties.place.trim() : "";
    byId.set(id, {
      id,
      coordinates: [lon, lat],
      place,
      placeJa: formatJapaneseWorldEarthquakePlace(place, japanesePlaces),
      magnitude: properties.mag,
      depthKm: Number.isFinite(depth) ? depth : null,
      mmi: Number.isFinite(properties.mmi) && properties.mmi >= 1 && properties.mmi <= 12 ? properties.mmi : null,
      time: properties.time,
      eventTime: parseJmaTime(date),
      datetime: date.toISOString(),
      updated,
      url: `https://earthquake.usgs.gov/earthquakes/eventpage/${id}/executive`
    });
  }
  return [...byId.values()].sort((a, b) => b.time - a.time || a.id.localeCompare(b.id));
}

export function getWorldEarthquakePlace(event, en) {
  return en ? event.place || "Unknown epicenter" : event.placeJa || event.place || "震央地名不明";
}

export function formatWorldEarthquakeDepth(depthKm, en, { compact = false } = {}) {
  if (depthKm === null) return compact ? "" : en ? "Unknown depth" : "深さ不明";
  const rounded = Number(depthKm.toFixed(1));
  return compact ? `${rounded}km` : `${en ? "Depth" : "深さ"} ${rounded} km`;
}

export async function fetchWorldEarthquakes() {
  const [feed, places] = await Promise.all([
    fetchJson(WORLD_EARTHQUAKE_FEED_URL, {
      ttlMs: WORLD_EARTHQUAKE_REFRESH_MS,
      validate: isEarthquakeFeed,
      staleIfError: false
    }),
    import("./worldEarthquakePlacesJa.generated.js").catch(() => null)
  ]);
  return normalizeWorldEarthquakes(feed, places?.default);
}
