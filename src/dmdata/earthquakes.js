import {
  DMDATA_ENDPOINTS,
  getEarthquakeIntensityLabel,
  getEarthquakeIntensityRank
} from "../config.js";
import { PREFECTURE_NAMES } from "../jma/warningCore.js";
import { fetchJson, parseJmaTime } from "../jma/jmaClient.js";
import {
  attachTsunamiMapData,
  attachEarthquakeMapDataList,
  loadTsunamiAreaLookup
} from "../jma/earthquakeXml.js";
import { getTsunamiLevelRank } from "../tsunami.js";

const HISTORY_LIMIT = 11;
const REQUEST_TTL_MS = 60 * 1000;

export async function fetchDmdataEarthquakeList() {
  const [historyPayload, latestPayload] = await Promise.all([
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
    })
  ]);

  const history = Array.isArray(historyPayload?.items) ? historyPayload.items : [];
  if (!historyPayload?.enabled || !history.length) {
    throw new Error("DM-D.S.S earthquake history is unavailable");
  }
  const latest = latestPayload?.latest?.earthquake ?? null;
  const latestStationItems = Array.isArray(latest?.data?.points) && latest.data.points.length > 0
    ? latest.data.points
    : null;
  const mapped = history.map((item) => mapDmdataHistoryItem(
    item,
    latest?.data?.eventId === item?.event_id ? latestStationItems : null
  ));
  const earthquakes = await attachEarthquakeMapDataList(mapped);
  const tsunami = await mapDmdataTsunami(latestPayload?.latest?.tsunami ?? null);
  const tsunamiStatus = latestPayload === null ? "unavailable" : tsunami ? "available" : "none";
  const updatedAt = earthquakes[0]?.reportTime ?? tsunami?.reportTime ?? "未取得";
  return {
    source: "dmdata",
    sourceLabel: "気象庁発表（DM-D.S.S経由）",
    earthquakes,
    tsunami,
    tsunamiStatus,
    hasEarthquakes: earthquakes.length > 0,
    latestTime: updatedAt,
    updatedAt,
    summary: earthquakes.length > 0 ? `地震情報 ${earthquakes.length} 件` : "地震情報はありません"
  };
}

export function mergeDmdataEarthquakeStationDetails(currentSnapshot, nextSnapshot) {
  if (!currentSnapshot || !nextSnapshot) return nextSnapshot;
  const currentById = new Map(
    (currentSnapshot.earthquakes ?? []).map((earthquake) => [String(earthquake.id), earthquake])
  );
  let changed = false;
  const earthquakes = (nextSnapshot.earthquakes ?? []).map((earthquake) => {
    if ((earthquake.intensityStations ?? []).length > 0) return earthquake;
    const current = currentById.get(String(earthquake.id));
    if (!current || (current.intensityStations ?? []).length === 0) return earthquake;
    changed = true;
    return {
      ...earthquake,
      intensityStations: current.intensityStations,
      stationsLoaded: current.stationsLoaded
    };
  });
  return changed ? { ...nextSnapshot, earthquakes } : nextSnapshot;
}

export async function mapDmdataTsunami(envelope, areaLookup = null) {
  const data = envelope?.data;
  if (!data || data.isCanceled === true) return null;
  const areas = (Array.isArray(data.areas) ? data.areas : [])
    .map(mapDmdataTsunamiArea)
    .filter(Boolean)
    .sort((left, right) => getTsunamiLevelRank(right.level) - getTsunamiLevelRank(left.level));
  const flattenedObservations = (Array.isArray(data.observations) ? data.observations : [])
    .flatMap((group) => (Array.isArray(group?.stations) ? group.stations : []).map((station, index) => ({
      id: String(station?.code ?? `${group?.code ?? "dmdata"}-${index}`),
      areaCode: String(group?.code ?? ""),
      areaName: String(group?.name ?? ""),
      stationCode: String(station?.code ?? ""),
      stationName: String(station?.name ?? station?.code ?? "観測点"),
      offshore: station?.offshore === true,
      arrivalTime: formatDmdataTsunamiTime(station?.firstArrivalTime),
      arrivalCondition: String(station?.firstCondition ?? ""),
      maxHeightTime: formatDmdataTsunamiTime(station?.maxDateTime),
      maxHeight: formatDmdataTsunamiHeight(station?.maxHeight, station?.maxHeightUnit, station?.maxHeightOver),
      maxHeightCondition: String(station?.maxHeightCondition ?? station?.maxCondition ?? "")
    })));
  const observations = flattenedObservations.filter((item) => !item.offshore);
  const offshoreObservations = flattenedObservations.filter((item) => item.offshore);
  const highestLevel = areas
    .map((area) => area.level)
    .sort((left, right) => getTsunamiLevelRank(right) - getTsunamiLevelRank(left))[0] ?? "none";
  const eventId = String(data.eventId ?? data.earthquake?.eventId ?? "");
  const reportTimeRaw = String(data.reportTime ?? envelope?.receivedAt ?? "");
  const tsunami = {
    id: eventId || `dmdata-tsunami:${reportTimeRaw}`,
    eventId,
    title: String(data.title ?? "津波情報"),
    headline: String(data.headline ?? data.text ?? ""),
    reportTime: parseJmaTime(reportTimeRaw) ?? reportTimeRaw ?? "--",
    reportTimeRaw,
    targetDateTime: "",
    validDateTime: parseJmaTime(data.validTime) ?? String(data.validTime ?? ""),
    areas,
    observations,
    offshoreObservations,
    highestLevel,
    isActive: ["major-warning", "warning", "advisory"].includes(highestLevel),
    sourceUrls: [DMDATA_ENDPOINTS.earthquakeLatest],
    mapFeatures: []
  };
  return attachTsunamiMapData(tsunami, areaLookup ?? await loadTsunamiAreaLookup());
}

function mapDmdataTsunamiArea(area) {
  const code = String(area?.code ?? "").trim();
  const name = String(area?.name ?? code ?? "津波予報区");
  const grade = String(area?.kind ?? "発表内容不明");
  const gradeCode = String(area?.kindCode ?? "");
  if (!code && !name && !grade) return null;
  return {
    code,
    name,
    grade,
    gradeCode,
    level: getDmdataTsunamiLevel(grade, gradeCode),
    lastGrade: String(area?.lastKind ?? ""),
    arrivalTime: formatDmdataTsunamiTime(area?.arrivalTime),
    arrivalCondition: String(area?.condition ?? ""),
    height: formatDmdataTsunamiHeight(area?.height, area?.heightUnit, area?.heightOver),
    heightCondition: String(area?.heightCondition ?? area?.maxHeightCondition ?? "")
  };
}

function getDmdataTsunamiLevel(name, code) {
  const value = `${name ?? ""} ${code ?? ""}`;
  if (/大津波警報/u.test(value)) return "major-warning";
  if (/津波警報/u.test(value) && !/解除/u.test(value)) return "warning";
  if (/津波注意報/u.test(value) && !/解除/u.test(value)) return "advisory";
  if (/津波予報|若干の海面変動/u.test(value)) return "forecast";
  return "none";
}

function formatDmdataTsunamiTime(value) {
  const text = String(value ?? "").trim();
  return text ? (parseJmaTime(text) ?? text) : "";
}

function formatDmdataTsunamiHeight(value, unit = "m", over = false) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const suffix = unit ? String(unit) : "m";
  return `${text}${suffix}${over === true ? "超" : ""}`;
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
  const tsunamiStatus = String(item?.tsunami_status ?? "").trim();
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
    tsunamiComment: formatDmdataTsunamiComment(tsunamiStatus),
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
