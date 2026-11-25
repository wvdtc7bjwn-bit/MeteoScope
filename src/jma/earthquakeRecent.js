import { fetchJson } from "./jmaClient.js";
import { JMA_ENDPOINTS, STATIC_DATA_CACHE_TTL_MS } from "../config.js";
import { getEarthquakeHistoryApiUrl } from "./earthquakeHistoryApi.js";
import { attachIntensityStationCoordinates, buildStationCoordinateLookup } from "./earthquakeStationLookup.js";
import { buildHistoricalIntensityAreaFeatures } from "./earthquakeHistoryDetail.js";

export async function fetchRecentEarthquakeHistory(startDate, { signal } = {}) {
  const payload = await fetchJson(`${getEarthquakeHistoryApiUrl("earthquake-recent")}?start=${startDate}`, {
    ttlMs: 30_000, timeoutMs: 50_000, retryCount: 0, signal, cancelUnderlying: true, staleIfError: false
  });
  if (!payload?.ok || !Array.isArray(payload.items)) throw new Error("最新の地震を取得できませんでした");
  return payload;
}

export async function fetchRecentEarthquakeDetail(item, { signal } = {}) {
  const event = item?.recentEarthquake;
  if (item?.dataSource !== "p2p" || !event) throw new Error("最新の地震の詳細がありません");
  const [catalog, areas] = await Promise.all([
    fetchJson(JMA_ENDPOINTS.earthquakeStations, { ttlMs: STATIC_DATA_CACHE_TTL_MS, signal }),
    fetchJson(JMA_ENDPOINTS.earthquakeAreas, { ttlMs: STATIC_DATA_CACHE_TTL_MS, signal }).catch(() => null)
  ]);
  signal?.throwIfAborted();
  const observations = attachIntensityStationCoordinates(event.intensityStations ?? [], buildStationCoordinateLookup(catalog));
  const stations = observations.filter(station => station.coordinates).map(station => ({
    id: station.code || station.stationName, code: station.code, name: station.stationName,
    coordinates: station.coordinates, longitude: station.coordinates[0], latitude: station.coordinates[1],
    intensity: station.intensity, intensityLabel: station.intensityLabel
  }));
  return { id: item.id, dataSource: "p2p", hypocenter: { id: item.id, originTime: item.originTime, place: item.place,
    coordinates: item.coordinates, latitude: item.latitude, longitude: item.longitude,
    depthKm: item.depthKm, magnitude: item.magnitude, maxIntensity: item.maxIntensity },
    stations, intensityAreaFeatures: buildHistoricalIntensityAreaFeatures(stations, areas),
    longPeriod: event.longPeriod ?? null, longPeriodStatus: event.longPeriod ? "ok" : "unavailable" };
}
