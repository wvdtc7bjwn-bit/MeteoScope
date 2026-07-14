import {
  getEarthquakeIntensityColor,
  getEarthquakeIntensityLabel,
  getEarthquakeIntensityRank,
  JMA_ENDPOINTS,
  STATIC_DATA_CACHE_TTL_MS
} from "../config.js";
import { fetchJson, fetchText, parseJmaTime } from "./jmaClient.js";
import {
  attachIntensityStationCoordinates,
  buildEmptyStationLookup,
  buildStationCoordinateLookup
} from "./earthquakeStationLookup.js";

const EARTHQUAKE_XML_DETAIL_FETCH_LIMIT = 48;
const EARTHQUAKE_HISTORY_DISPLAY_LIMIT = 11;
const EARTHQUAKE_XML_CODES = /VXSE5[1-3]/;
const EARTHQUAKE_SERIES_WINDOW_MS = 5 * 60 * 1000;
const EARTHQUAKE_SERIES_COORDINATE_DISTANCE_KM = 120;
let earthquakeAreaLookupPromise = null;
let stationCoordinateLookupPromise = null;

export async function fetchEarthquakeXmlList() {
  const feeds = await fetchEarthquakeFeeds();
  const entries = getUniqueEarthquakeEntries(feeds.flatMap(({ feed }) => getElements(feed, "entry")
    .map(parseFeedEntry)
    .filter((entry) => entry.url && EARTHQUAKE_XML_CODES.test(entry.url))))
    .slice(0, EARTHQUAKE_XML_DETAIL_FETCH_LIMIT);

  const results = await Promise.allSettled(entries.map(fetchEarthquakeDetail));
  const baseEarthquakes = dedupeEarthquakes(results
    .filter((result) => result.status === "fulfilled" && result.value)
    .map((result) => result.value))
    .slice(0, EARTHQUAKE_HISTORY_DISPLAY_LIMIT);
  const [areaLookup, stationLookup] = await Promise.all([
    loadEarthquakeAreaLookup().catch((error) => {
      console.warn("[Earthquake XML] earthquake area lookup failed", error);
      return new Map();
    }),
    loadStationCoordinateLookup().catch((error) => {
      console.warn("[Earthquake XML] station coordinate lookup failed", error);
      return buildEmptyStationLookup();
    })
  ]);
  const earthquakes = baseEarthquakes.map((earthquake) => attachEarthquakeMapData(
    earthquake,
    areaLookup,
    stationLookup
  ));

  return {
    source: "xml",
    earthquakes,
    hasEarthquakes: earthquakes.length > 0,
    latestTime: earthquakes[0]?.reportTime ?? getLatestFeedUpdatedTime(feeds) ?? "未取得",
    updatedAt: earthquakes[0]?.reportTime ?? getLatestFeedUpdatedTime(feeds) ?? "未取得",
    summary: earthquakes.length > 0 ? `地震情報 ${earthquakes.length} 件` : "地震情報はありません"
  };
}

async function fetchEarthquakeFeeds() {
  const feedUrls = [
    JMA_ENDPOINTS.earthquakeXmlFeed,
    JMA_ENDPOINTS.earthquakeXmlLongFeed
  ].filter(Boolean);

  const results = await Promise.allSettled(feedUrls.map(async (url) => ({
    url,
    feed: parseXml(await fetchText(url, {
      ttlMs: 60 * 1000,
      cache: "no-store"
    }))
  })));
  const feeds = results
    .filter((result) => result.status === "fulfilled" && result.value?.feed)
    .map((result) => result.value);
  if (feeds.length) return feeds;

  const firstError = results.find((result) => result.status === "rejected")?.reason;
  throw firstError ?? new Error("Earthquake XML feed unavailable");
}

function getUniqueEarthquakeEntries(entries) {
  const byEntry = new Map();
  entries.forEach((entry) => {
    const key = entry.url || entry.id;
    if (!key || byEntry.has(key)) return;
    byEntry.set(key, entry);
  });
  return [...byEntry.values()].sort((a, b) => getDateMs(b.updated) - getDateMs(a.updated));
}

function getLatestFeedUpdatedTime(feeds) {
  const updated = feeds
    .map(({ feed }) => getText(getFirst(feed, "updated")))
    .sort((a, b) => getDateMs(b) - getDateMs(a))[0];
  return parseJmaTime(updated) ?? updated ?? null;
}

async function fetchEarthquakeDetail(entry) {
  const text = await fetchText(entry.url, {
    ttlMs: 60 * 1000,
    cache: "no-store"
  });
  return parseEarthquakeReport(text, entry);
}

function parseFeedEntry(entry) {
  const link = getChildren(entry, "link").find((element) => element.getAttribute("href"));
  const url = link?.getAttribute("href") ?? "";
  return {
    id: getText(getFirstChild(entry, "id")),
    title: getText(getFirstChild(entry, "title")),
    updated: getText(getFirstChild(entry, "updated")),
    url,
    code: getXmlCodeFromUrl(url)
  };
}

function parseEarthquakeReport(text, entry) {
  const xml = parseXml(text);
  const report = getFirst(xml, "Report") ?? xml;
  const control = getFirstChild(report, "Control");
  const head = getFirstChild(report, "Head");
  const body = getFirstChild(report, "Body");
  const earthquake = getFirstChild(body, "Earthquake");
  const hypocenter = getFirst(earthquake, "Hypocenter");
  const hypocenterArea = getFirstChild(hypocenter, "Area");
  const coordinateNode = getFirst(hypocenterArea, "Coordinate");
  const coordinate = parseJmaCoordinate(getText(coordinateNode));
  const magnitudeNode = getFirstChild(earthquake, "Magnitude");
  const observation = getFirst(getFirstChild(body, "Intensity"), "Observation");
  const maxIntensity = normalizeIntensity(getText(getFirstChild(observation, "MaxInt")));
  const { intensityAreas, intensityCities, intensityStations } = parseIntensityObservation(observation);
  const reportDateTime = getText(getFirstChild(head, "ReportDateTime")) || getText(getFirstChild(control, "DateTime"));
  const originTime = getText(getFirstChild(earthquake, "OriginTime"));
  const arrivalTime = getText(getFirstChild(earthquake, "ArrivalTime"));
  const targetDateTime = getText(getFirstChild(head, "TargetDateTime"));
  const eventId = normalizeEarthquakeEventId(
    getText(getFirstChild(head, "EventID")) || getText(getFirstChild(control, "EventID"))
  );
  const title = getText(getFirstChild(head, "Title")) || entry.title || getText(getFirstChild(control, "Title")) || "地震情報";
  const reportTitle = getText(getFirstChild(control, "Title")) || title;
  const headline = getText(getFirst(getFirstChild(head, "Headline"), "Text"));
  const hypocenterName = getText(getFirstChild(hypocenterArea, "Name")) || "震源調査中";
  const eventKey = buildEarthquakeEventKey(entry, eventId, originTime, arrivalTime, targetDateTime);
  const id = eventKey || buildEarthquakeId(entry, originTime, coordinate, title);
  const reportPriority = getEarthquakeReportPriority({
    code: entry.code,
    title,
    reportTitle,
    hypocenterName,
    maxIntensity,
    intensityCities
  });

  return {
    id,
    rawId: buildEarthquakeId(entry, originTime, coordinate, title),
    eventId,
    eventKey: eventKey || id,
    reportPriority,
    xmlCode: entry.code,
    title,
    reportTitle,
    reportTime: parseJmaTime(reportDateTime) ?? reportDateTime ?? "--",
    reportTimeRaw: reportDateTime,
    eventTime: parseJmaTime(originTime || arrivalTime) ?? parseJmaTime(targetDateTime) ?? "--",
    eventTimeRaw: originTime || arrivalTime || targetDateTime,
    hypocenterName,
    coordinates: coordinate?.coordinates ?? null,
    depth: coordinate?.depthKm ?? null,
    magnitude: formatMagnitude(getText(magnitudeNode), magnitudeNode?.getAttribute("description")),
    maxIntensity,
    maxIntensityLabel: formatIntensity(maxIntensity),
    maxIntensityShort: formatIntensityShort(maxIntensity),
    intensityAreas,
    intensityCities,
    intensityStations,
    headline,
    url: entry.url
  };
}

function dedupeEarthquakes(items) {
  const byEvent = [];
  items.forEach((item) => {
    if (!item?.eventKey) return;
    const currentIndex = byEvent.findIndex((event) => isSameEarthquakeSeries(item, event));
    const current = currentIndex >= 0 ? byEvent[currentIndex] : null;
    if (!current) {
      byEvent.push(item);
      return;
    }
    const preferred = compareEarthquakeReports(item, current) >= 0 ? item : current;
    const fallback = preferred === item ? current : item;
    byEvent[currentIndex] = mergeEarthquakeReports(preferred, fallback);
  });
  return byEvent.sort((a, b) => {
    const left = new Date(a.eventTimeRaw || a.reportTimeRaw || 0).getTime();
    const right = new Date(b.eventTimeRaw || b.reportTimeRaw || 0).getTime();
    return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
  });
}

function isSameEarthquakeSeries(a, b) {
  if (!a || !b) return false;
  if (a.eventId || b.eventId) {
    if (a.eventId && b.eventId) return a.eventId === b.eventId;
  }
  if (a.eventKey && b.eventKey && a.eventKey === b.eventKey) return true;

  const leftTime = getEarthquakeEventMs(a);
  const rightTime = getEarthquakeEventMs(b);
  if (!leftTime || !rightTime) return false;
  if (Math.abs(leftTime - rightTime) > EARTHQUAKE_SERIES_WINDOW_MS) return false;

  if (Array.isArray(a.coordinates) && Array.isArray(b.coordinates)) {
    return getCoordinateDistanceKm(a.coordinates, b.coordinates) <= EARTHQUAKE_SERIES_COORDINATE_DISTANCE_KM;
  }

  const leftName = normalizeEarthquakeHypocenterName(a.hypocenterName);
  const rightName = normalizeEarthquakeHypocenterName(b.hypocenterName);
  if (leftName && rightName) {
    return leftName === rightName || leftName.includes(rightName) || rightName.includes(leftName);
  }

  return true;
}

function getEarthquakeEventMs(item) {
  return getDateMs(item?.eventTimeRaw || item?.reportTimeRaw);
}

function normalizeEarthquakeHypocenterName(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "震源調査中") return "";
  return text
    .replace(/[（）()]/g, "")
    .replace(/\s+/g, "");
}

function getCoordinateDistanceKm(left, right) {
  const [leftLon, leftLat] = left.map(Number);
  const [rightLon, rightLat] = right.map(Number);
  if (![leftLon, leftLat, rightLon, rightLat].every(Number.isFinite)) return Number.POSITIVE_INFINITY;

  const toRad = (value) => value * Math.PI / 180;
  const lat1 = toRad(leftLat);
  const lat2 = toRad(rightLat);
  const dLat = toRad(rightLat - leftLat);
  const dLon = toRad(rightLon - leftLon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const a = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function compareEarthquakeReports(a, b) {
  const priorityDelta = (a.reportPriority ?? 0) - (b.reportPriority ?? 0);
  if (priorityDelta !== 0) return priorityDelta;

  const timeDelta = getDateMs(a.reportTimeRaw) - getDateMs(b.reportTimeRaw);
  if (timeDelta !== 0) return timeDelta;

  return getEarthquakeCompleteness(a) - getEarthquakeCompleteness(b);
}

function mergeEarthquakeReports(primary, fallback) {
  return {
    ...primary,
    eventId: primary.eventId || fallback.eventId,
    title: primary.title || fallback.title,
    reportTitle: primary.reportTitle || fallback.reportTitle,
    reportTime: primary.reportTime && primary.reportTime !== "--" ? primary.reportTime : fallback.reportTime,
    reportTimeRaw: primary.reportTimeRaw || fallback.reportTimeRaw,
    eventTime: primary.eventTime && primary.eventTime !== "--" ? primary.eventTime : fallback.eventTime,
    eventTimeRaw: primary.eventTimeRaw || fallback.eventTimeRaw,
    hypocenterName: primary.hypocenterName && primary.hypocenterName !== "震源調査中"
      ? primary.hypocenterName
      : fallback.hypocenterName,
    coordinates: primary.coordinates ?? fallback.coordinates,
    depth: primary.depth ?? fallback.depth,
    magnitude: primary.magnitude && primary.magnitude !== "--" ? primary.magnitude : fallback.magnitude,
    maxIntensity: primary.maxIntensity ?? fallback.maxIntensity,
    maxIntensityLabel: primary.maxIntensityLabel && primary.maxIntensityLabel !== "震度不明"
      ? primary.maxIntensityLabel
      : fallback.maxIntensityLabel,
    maxIntensityShort: primary.maxIntensityShort && primary.maxIntensityShort !== "--"
      ? primary.maxIntensityShort
      : fallback.maxIntensityShort,
    intensityAreas: primary.intensityAreas?.length ? primary.intensityAreas : fallback.intensityAreas,
    intensityCities: primary.intensityCities?.length ? primary.intensityCities : fallback.intensityCities,
    intensityStations: primary.intensityStations?.length ? primary.intensityStations : fallback.intensityStations,
    headline: primary.headline || fallback.headline,
    url: primary.url || fallback.url
  };
}

function getEarthquakeCompleteness(item) {
  return [
    item.coordinates,
    item.hypocenterName && item.hypocenterName !== "震源調査中",
    item.magnitude && item.magnitude !== "--",
    item.maxIntensity,
    item.intensityCities?.length
  ].filter(Boolean).length;
}

function parseIntensityObservation(observation) {
  const intensityAreas = parseIntensityAreas(observation);
  const intensityCities = parseIntensityCities(observation);
  const intensityStations = parseIntensityStations(observation);
  return { intensityAreas, intensityCities, intensityStations };
}

function parseIntensityAreas(observation) {
  return getElements(observation, "Area").flatMap((area) => {
    const code = normalizeAreaCode(getText(getFirstChild(area, "Code")));
    const areaName = getText(getFirstChild(area, "Name"));
    const cityIntensities = getChildren(area, "City")
      .map((city) => normalizeIntensity(getText(getFirstChild(city, "MaxInt"))))
      .filter(Boolean);
    const stationIntensities = getElements(area, "IntensityStation")
      .map((station) => normalizeIntensity(getText(getFirstChild(station, "Int"))))
      .filter(Boolean);
    const intensity = normalizeIntensity(getText(getFirstChild(area, "MaxInt")))
      ?? getMaxIntensity(cityIntensities)
      ?? getMaxIntensity(stationIntensities);
    if (!code || !intensity) return [];

    const pref = getAncestor(area, "Pref");
    return [{
      code,
      areaName: areaName || code,
      prefecture: getText(getFirstChild(pref, "Name")),
      intensity,
      intensityLabel: formatIntensity(intensity),
      intensityShort: formatIntensityShort(intensity),
      rank: getIntensityRank(intensity)
    }];
  }).sort((a, b) => b.rank - a.rank || String(a.code).localeCompare(String(b.code), "ja"));
}

function parseIntensityCities(observation) {
  return getElements(observation, "City").flatMap((city) => {
    const code = getText(getFirstChild(city, "Code"));
    const cityName = getText(getFirstChild(city, "Name"));
    const stationIntensities = getElements(city, "IntensityStation")
      .map((station) => normalizeIntensity(getText(getFirstChild(station, "Int"))))
      .filter(Boolean);
    const intensity = normalizeIntensity(getText(getFirstChild(city, "MaxInt")))
      ?? getMaxIntensity(stationIntensities);
    if (!code || !intensity) return [];

    const area = getAncestor(city, "Area");
    const pref = getAncestor(city, "Pref");
    return [{
      code,
      cityName: cityName || code,
      areaName: getText(getFirstChild(area, "Name")),
      prefecture: getText(getFirstChild(pref, "Name")),
      intensity,
      intensityLabel: formatIntensity(intensity),
      intensityShort: formatIntensityShort(intensity),
      rank: getIntensityRank(intensity)
    }];
  }).sort((a, b) => b.rank - a.rank || String(a.code).localeCompare(String(b.code), "ja"));
}

function parseIntensityStations(observation) {
  return getElements(observation, "IntensityStation").flatMap((station) => {
    const code = getText(getFirstChild(station, "Code"));
    const stationName = getText(getFirstChild(station, "Name"));
    const intensity = normalizeIntensity(getText(getFirstChild(station, "Int")));
    if (!intensity || (!code && !stationName)) return [];

    const city = getAncestor(station, "City");
    const area = getAncestor(station, "Area");
    const pref = getAncestor(station, "Pref");
    return [{
      code,
      stationName: stationName || code,
      cityCode: getText(getFirstChild(city, "Code")),
      cityName: getText(getFirstChild(city, "Name")),
      areaCode: normalizeAreaCode(getText(getFirstChild(area, "Code"))),
      areaName: getText(getFirstChild(area, "Name")),
      prefecture: getText(getFirstChild(pref, "Name")),
      intensity,
      intensityLabel: formatIntensity(intensity),
      intensityShort: formatIntensityShort(intensity),
      rank: getIntensityRank(intensity)
    }];
  }).sort((a, b) => b.rank - a.rank || String(a.code).localeCompare(String(b.code), "ja"));
}

function attachEarthquakeMapData(earthquake, areaLookup, stationLookup) {
  if (!earthquake) return earthquake;
  const intensityStations = attachIntensityStationCoordinates(earthquake.intensityStations ?? [], stationLookup);
  const intensityAreaFeatures = buildIntensityAreaFeatures(earthquake.intensityAreas ?? [], areaLookup);
  return {
    ...earthquake,
    intensityStations,
    intensityAreaFeatures
  };
}

function buildIntensityAreaFeatures(areas, areaLookup) {
  return areas.flatMap((area) => {
    const features = areaLookup.get(normalizeAreaCode(area.code)) ?? [];
    return features.map((feature, index) => ({
      type: "Feature",
      geometry: feature.geometry,
      properties: {
        ...(feature.properties ?? {}),
        areaCode: area.code,
        areaName: area.areaName || feature.properties?.name || area.code,
        prefecture: area.prefecture || "",
        intensity: area.intensity,
        intensityLabel: area.intensityLabel,
        color: getIntensityColor(area.intensity),
        fillOpacity: 0.48,
        lineWidth: 1.3,
        sortKey: area.rank,
        popup: buildEarthquakeAreaPopup(area),
        featureIndex: index
      }
    }));
  });
}

async function loadEarthquakeAreaLookup() {
  if (!earthquakeAreaLookupPromise) {
    earthquakeAreaLookupPromise = fetchJson(JMA_ENDPOINTS.earthquakeAreas, {
      ttlMs: STATIC_DATA_CACHE_TTL_MS,
      cache: "force-cache"
    }).then(buildEarthquakeAreaLookup);
  }
  return earthquakeAreaLookupPromise;
}

function buildEarthquakeAreaLookup(geoJson) {
  const lookup = new Map();
  (geoJson?.features ?? []).forEach((feature) => {
    const code = normalizeAreaCode(feature?.properties?.code ?? feature?.properties?.areaCode);
    if (!code) return;
    if (!lookup.has(code)) lookup.set(code, []);
    lookup.get(code).push(feature);
  });
  return lookup;
}

async function loadStationCoordinateLookup() {
  if (!stationCoordinateLookupPromise) {
    stationCoordinateLookupPromise = fetchJson(JMA_ENDPOINTS.earthquakeStations, {
      ttlMs: STATIC_DATA_CACHE_TTL_MS,
      cache: "force-cache"
    }).then(buildStationCoordinateLookup);
  }
  return stationCoordinateLookupPromise;
}

function getMaxIntensity(values) {
  return values
    .filter(Boolean)
    .sort((a, b) => getIntensityRank(b) - getIntensityRank(a))[0] ?? null;
}

function buildEarthquakeId(entry, originTime, coordinate, title) {
  const time = originTime || entry.updated || entry.id || "";
  const location = coordinate?.coordinates?.join(",") || title || entry.title || "";
  return `${time}:${location}`;
}

function buildEarthquakeEventKey(entry, eventId, originTime, arrivalTime, targetDateTime) {
  if (eventId) return `event-id:${eventId}`;
  const time = normalizeEarthquakeEventTime(originTime || arrivalTime || targetDateTime);
  if (time) return `event:${time}`;
  return entry.id ? `entry:${entry.id}` : "";
}

function normalizeEarthquakeEventId(value) {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

function normalizeEarthquakeEventTime(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toISOString();
}

function getXmlCodeFromUrl(value) {
  return String(value ?? "").match(/VXSE5[1-3]/)?.[0] ?? "";
}

function getEarthquakeReportPriority(report) {
  if (report.code === "VXSE53") return 30;
  if (report.code === "VXSE52") return 20;
  if (report.code === "VXSE51") return 10;

  const text = `${report.title ?? ""} ${report.reportTitle ?? ""}`;
  if (/震源・震度|各地の震度/u.test(text)) return 30;
  if (/震源に関する/u.test(text)) return 20;
  if (/震度速報/u.test(text)) return 10;

  return getEarthquakeCompleteness(report);
}

function getDateMs(value) {
  const ms = new Date(value || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function normalizeAreaCode(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return String(Number(digits));
}

function parseJmaCoordinate(value) {
  const match = String(value ?? "").match(/([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+)?\//);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  const depthMeters = match[3] ? Math.abs(Number(match[3])) : null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    coordinates: [longitude, latitude],
    depthKm: Number.isFinite(depthMeters) ? Math.round(depthMeters / 1000) : null
  };
}

function formatMagnitude(value, description) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return `M${numeric.toFixed(1)}`;
  const match = String(description ?? "").match(/M\s*([0-9.]+)/i);
  if (match) return `M${match[1]}`;
  return value ? String(value) : "--";
}

function normalizeIntensity(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function formatIntensity(value) {
  if (!value) return "震度不明";
  return getEarthquakeIntensityLabel(value)
    ?? `震度${String(value).replace("-", "弱").replace("+", "強")}`;
}

function formatIntensityShort(value) {
  if (!value) return "--";
  return String(value).replace("-", "弱").replace("+", "強");
}

function getIntensityRank(value) {
  return getEarthquakeIntensityRank(value);
}

function getIntensityColor(value) {
  return getEarthquakeIntensityColor(value);
}

function buildEarthquakeAreaPopup(area) {
  return `
    <strong>${escapeHtml(area.areaName ?? "地震情報細分区域")}</strong><br>
    <span>${escapeHtml(area.prefecture ?? "")}</span><br>
    <span>${escapeHtml(area.intensityLabel ?? "震度不明")}</span>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getAncestor(node, localName) {
  let current = node?.parentElement ?? node?.parentNode ?? null;
  while (current) {
    if (current.localName === localName) return current;
    current = current.parentElement ?? current.parentNode ?? null;
  }
  return null;
}

function parseXml(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (getElements(xml, "parsererror").length) {
    throw new Error("JMA XML parse failed");
  }
  return xml;
}

function getElements(root, localName) {
  if (!root) return [];
  return [...root.getElementsByTagName("*")].filter((element) => element.localName === localName);
}

function getChildren(root, localName) {
  if (!root) return [];
  return [...root.children].filter((element) => element.localName === localName);
}

function getFirst(root, localName) {
  return getElements(root, localName)[0] ?? null;
}

function getFirstChild(root, localName) {
  return getChildren(root, localName)[0] ?? null;
}

function getText(node) {
  return node?.textContent?.trim() ?? "";
}
