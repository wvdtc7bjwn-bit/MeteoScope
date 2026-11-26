import { APP_BASE_URL } from "../config.js";
import { fetchAmedasTemperatureNormalData, getAmedasDailyTemperatureNormals } from "../amedasTemperatureNormal.js";
import { createRetryableResource } from "../utils/retryableResource.js";
import { TEMPERATURE_CLIMATE_DATA_PATH } from "./temperatureClimateData.generated.js";

export function createTemperatureClimateReader({ fetcher = globalThis.fetch?.bind(globalThis),
  loadNormals = fetchAmedasTemperatureNormalData, now = Date.now } = {}) {
  const read = createRetryableResource(async signal => {
    const [response, normals] = await Promise.all([
      fetcher(`${APP_BASE_URL}${TEMPERATURE_CLIMATE_DATA_PATH}`, { signal, cache:"force-cache", credentials:"omit" }), loadNormals()
    ]);
    if (!response.ok) throw Error(`Climate metadata HTTP ${response.status}`);
    const data = await response.json();
    if (data.schema !== 1 || !Array.isArray(data.stations) || normals.schema !== 2 || normals.quality !== "RMK=8"
      || data.period !== normals.period) throw Error("Invalid climate data schema");
    const stations = data.stations.filter(s => Array.isArray(s) && s.length === 6 && /^\d{5}$/.test(s[0])
      && s.slice(1,4).every(Number.isFinite) && Math.abs(s[1]) <= 180 && Math.abs(s[2]) <= 90
      && s.slice(4,6).every(v => v === null || (Number.isFinite(v) && v >= 0 && v <= 1)));
    if (!stations.length) throw Error("Empty climate metadata");
    return { stations, normals };
  }, {now,retryMs:15*60000,timeoutMs:15000});
  const dates = new Map();
  return async (observationTime, { signal } = {}) => {
    const date = String(observationTime ?? "").match(/^(\d{8})\d{6}$/)?.[1];
    if (!date || signal?.aborted) return null;
    if (dates.has(date)) return dates.get(date);
    const data = await read();
    if (signal?.aborted) return null;
    if (dates.has(date)) return dates.get(date);
    const points = data.stations.flatMap(([id,longitude,latitude,elevation,sea,urban]) => {
      const n = getAmedasDailyTemperatureNormals(data.normals,id,date);
      return typeof n?.maximum === "number" && typeof n?.minimum === "number"
        ? [{id,coordinates:[longitude,latitude],elevation,sea,urban,normal:(n.maximum+n.minimum)/2}] : [];
    });
    const value = {period:data.normals.period,date,points};
    dates.set(date,value);while(dates.size>2) dates.delete(dates.keys().next().value);
    return value;
  };
}
