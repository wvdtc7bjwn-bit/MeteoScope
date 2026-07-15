import {
  DMDATA_ENDPOINTS,
  getEarthquakeIntensityLabel,
  getEarthquakeIntensityRank
} from "../config.js";
import { PREFECTURE_NAMES } from "../jma/warningCore.js";
import { fetchJson, parseJmaTime } from "../jma/jmaClient.js";
import {
  attachEarthquakeMapDataList,
  fetchTsunamiXmlState
} from "../jma/earthquakeXml.js";

const HISTORY_LIMIT = 11;
const REQUEST_TTL_MS = 60 * 1000;

export async function fetchDmdataEarthquakeList() {
  const [historyPayload, latestPayload, tsunamiState] = await Promise.all([
    fetchJson(`${DMDATA_ENDPOINTS.earthquakeHistory}?limit=${HISTORY_LIMIT}`, {
      ttlMs: REQUEST_TTL_MS,
      cache: "no-store"
    }),
    fetchJson(DMDATA_ENDPOINTS.earthquakeLatest, {
      ttlMs: REQUEST_TTL_MS,
      cache: "no-store"
    }).catch((error) => {
      console.warn("[DM-D.S.S] latest earthquake request failed", error);
      return null;
    }),
    fetchTsunamiXmlState().catch((error) => {
      console.warn("[DM-D.S.S] JMA tsunami request failed", error);
      return { tsunami: null, tsunamiStatus: "unavailable", updatedAt: "未取得" };
    })
  ]);

  const history = Array.isArray(historyPayload?.items) ? historyPayload.items : [];
  if (!historyPayload?.enabled || !history.length) {
    throw new Error("DM-D.S.S earthquake history is unavailable");
  }

  const latest = latestPayload?.latest?.earthquake ?? null;
  const mapped = history.map((item) => mapDmdataHistoryItem(
    item,
    latest?.data?.eventId === item?.event_id ? (latest.data.points ?? []) : null
  ));
  const earthquakes = await attachEarthquakeMapDataList(mapped);
  const updatedAt = earthquakes[0]?.reportTime ?? tsunamiState.updatedAt ?? "未取得";
  return {
    source: "dmdata",
    sourceLabel: "気象庁発表（DM-D.S.S経由）",
    earthquakes,
    tsunami: tsunamiState.tsunami,
    tsunamiStatus: tsunamiState.tsunamiStatus,
    hasEarthquakes: earthquakes.length > 0,
    latestTime: updatedAt,
    updatedAt,
    summary: earthquakes.length > 0 ? `地震情報 ${earthquakes.length} 件` : "地震情報はありません"
  };
}

export async function hydrateDmdataEarthquakeStations(snapshot, earthquakeId) {
  if (snapshot?.source !== "dmdata") return snapshot;
  const id = String(earthquakeId ?? "");
  const target = snapshot.earthquakes?.find((earthquake) => String(earthquake.id) === id);
  if (!target || target.stationsLoaded) return snapshot;

  const payload = await fetchJson(DMDATA_ENDPOINTS.earthquakeStations(target.eventId), {
    ttlMs: 24 * 60 * 60 * 1000,
    cache: "default"
  });
  const stations = Array.isArray(payload?.items) ? payload.items : [];
  const [hydrated] = await attachEarthquakeMapDataList([{ ...target, ...mapDmdataStations(stations) }]);
  return {
    ...snapshot,
    earthquakes: snapshot.earthquakes.map((earthquake) => (
      String(earthquake.id) === id ? hydrated : earthquake
    ))
  };
}

export function mapDmdataHistoryItem(item, stationItems = null) {
  const eventId = String(item?.event_id ?? "").trim();
  const maximumIntensity = normalizeDmdataIntensity(item?.max_intensity);
  const reportTimeRaw = item?.updated_at ?? item?.origin_time ?? "";
  const eventTimeRaw = item?.origin_time ?? reportTimeRaw;
  const latitude = toFiniteNumber(item?.latitude);
  const longitude = toFiniteNumber(item?.longitude);
  const intensityAreas = (Array.isArray(item?.regions) ? item.regions : [])
    .map(mapDmdataArea)
    .filter(Boolean)
    .sort((left, right) => right.rank - left.rank || left.code.localeCompare(right.code, "ja"));

  return {
    id: eventId || `dmdata:${eventTimeRaw}`,
    rawId: eventId || `dmdata:${eventTimeRaw}`,
    eventId,
    eventKey: eventId ? `event-id:${eventId}` : `event:${eventTimeRaw}`,
    reportPriority: 30,
    xmlCode: String(item?.telegram_type ?? "VXSE53"),
    title: "震源・震度情報",
    reportTitle: "震源・震度情報",
    reportTime: parseJmaTime(reportTimeRaw) ?? reportTimeRaw ?? "--",
    reportTimeRaw,
    eventTime: parseJmaTime(eventTimeRaw) ?? eventTimeRaw ?? "--",
    eventTimeRaw,
    hypocenterName: String(item?.place ?? "震源調査中"),
    coordinates: latitude !== null && longitude !== null ? [longitude, latitude] : null,
    depth: parseDmdataDepth(item?.depth),
    magnitude: formatDmdataMagnitude(item?.magnitude),
    maxIntensity: maximumIntensity,
    maxIntensityLabel: formatIntensityLabel(maximumIntensity),
    maxIntensityShort: formatIntensityShort(maximumIntensity),
    intensityAreas,
    intensityCities: [],
    ...mapDmdataStations(stationItems),
    headline: "気象庁発表をDM-D.S.S経由で取得",
    tsunamiComment: formatDmdataTsunamiComment(item?.tsunami_status),
    url: DMDATA_ENDPOINTS.earthquakeHistory
  };
}

export function normalizeDmdataIntensity(value) {
  const text = String(value ?? "")
    .normalize("NFKC")
    .replace(/^震度/u, "")
    .trim();
  if (text === "5弱") return "5-";
  if (text === "5強") return "5+";
  if (text === "6弱") return "6-";
  if (text === "6強") return "6+";
  return /^(?:[1-4]|7|5[+-]|6[+-])$/u.test(text) ? text : null;
}

function mapDmdataArea(area) {
  const code = String(area?.code ?? "").replace(/\D/g, "");
  const intensity = normalizeDmdataIntensity(area?.maxInt ?? area?.max_intensity ?? area?.intensity);
  if (!code || !intensity) return null;
  return {
    code: String(Number(code)),
    areaName: String(area?.name ?? code),
    prefecture: "",
    intensity,
    intensityLabel: formatIntensityLabel(intensity),
    intensityShort: formatIntensityShort(intensity),
    rank: getEarthquakeIntensityRank(intensity)
  };
}

function mapDmdataStations(stationItems) {
  const stationsLoaded = Array.isArray(stationItems);
  const intensityStations = (stationsLoaded ? stationItems : [])
    .map((station, index) => {
      const code = String(station?.station_code ?? station?.code ?? `dmdata-${index}`);
      const intensity = normalizeDmdataIntensity(station?.intensity);
      if (!intensity) return null;
      const latitude = toFiniteNumber(station?.latitude);
      const longitude = toFiniteNumber(station?.longitude);
      return {
        code,
        stationName: String(station?.station_name ?? station?.name ?? code),
        cityCode: "",
        cityName: "",
        areaCode: "",
        areaName: "",
        prefecture: PREFECTURE_NAMES[code.slice(0, 2)] ?? "",
        intensity,
        intensityLabel: formatIntensityLabel(intensity),
        intensityShort: formatIntensityShort(intensity),
        rank: getEarthquakeIntensityRank(intensity),
        coordinates: latitude !== null && longitude !== null ? [longitude, latitude] : null
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.rank - left.rank || left.code.localeCompare(right.code, "ja"));
  return {
    intensityStations,
    stationsLoaded
  };
}

function parseDmdataDepth(value) {
  const text = String(value ?? "").normalize("NFKC").trim();
  if (/ごく浅い/u.test(text)) return 0;
  const numeric = Number(text.replace(/km/giu, ""));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function formatDmdataMagnitude(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return `M${numeric.toFixed(1)}`;
  const text = String(value ?? "").trim();
  return text ? (text.startsWith("M") ? text : `M${text}`) : "--";
}

function formatIntensityLabel(value) {
  if (!value) return "震度不明";
  return getEarthquakeIntensityLabel(value) ?? `震度${formatIntensityShort(value)}`;
}

function formatIntensityShort(value) {
  return value ? String(value).replace("-", "弱").replace("+", "強") : "--";
}

function formatDmdataTsunamiComment(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/心配なし|津波なし/u.test(text)) return "この地震による津波の心配はありません。";
  if (/若干|海面変動/u.test(text)) return "若干の海面変動が予想されます。";
  return text;
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
