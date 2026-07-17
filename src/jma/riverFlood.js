import { JMA_ENDPOINTS } from "../config.js";
import { fetchJson, fetchText, parseJmaTime } from "./jmaClient.js";

const RIVER_XML_CODE = /_VXKO\d{2}_/u;
const ENTRY_LIMIT = 64;
const FEED_TTL_MS = 60 * 1000;
const GEOMETRY_TTL_MS = 5 * 60 * 1000;

export async function fetchRiverFloodForecasts() {
  const feeds = await fetchFeeds();
  const entries = uniqueBy(feeds.flatMap(({ feed }) => getElements(feed, "entry")
    .map(parseFeedEntry)
    .filter((entry) => entry.url && RIVER_XML_CODE.test(entry.url))), (entry) => entry.url)
    .sort((a, b) => dateMs(b.updated) - dateMs(a.updated))
    .slice(0, ENTRY_LIMIT);
  const settled = await Promise.allSettled(entries.map(fetchReport));
  const latestReports = dedupeReports(settled.filter((result) => result.status === "fulfilled" && result.value).map((result) => result.value));
  const reports = latestReports.filter((report) => report.active);
  const riverFeatures = await fetchRiverFeatures(reports).catch((error) => {
    console.warn("[MeteoScope] river flood geometry unavailable", error);
    return emptyCollection();
  });
  const latestTime = latestReports[0]?.updatedAt ?? latestFeedTime(feeds) ?? "未取得";
  return { source: "jma-xml", reports, latestReports, riverFeatures, hasActiveReports: reports.length > 0, latestTime, updatedAt: latestTime };
}

async function fetchFeeds() {
  const urls = [JMA_ENDPOINTS.riverFloodXmlFeed, JMA_ENDPOINTS.riverFloodXmlLongFeed].filter(Boolean);
  const settled = await Promise.allSettled(urls.map(async (url) => ({
    url,
    feed: parseXml(await fetchText(url, { ttlMs: FEED_TTL_MS, cache: "no-store" }))
  })));
  const feeds = settled.filter((result) => result.status === "fulfilled").map((result) => result.value);
  if (feeds.length) return feeds;
  throw settled.find((result) => result.status === "rejected")?.reason ?? new Error("River flood XML feed unavailable");
}

async function fetchReport(entry) {
  return parseRiverFloodReport(await fetchText(entry.url, { ttlMs: FEED_TTL_MS, cache: "no-store" }), entry);
}

export function parseRiverFloodReport(text, entry = {}) {
  const xml = parseXml(text);
  const report = getFirst(xml, "Report") ?? xml;
  const control = getFirstChild(report, "Control");
  const head = getFirstChild(report, "Head");
  const body = getFirstChild(report, "Body");
  const title = textOf(getFirstChild(head, "Title")) || entry.title || "指定河川洪水予報";
  const rawHeadline = textOf(getFirst(getFirstChild(head, "Headline"), "Text"));
  const headline = normalizeRiverWarningText(rawHeadline);
  const updatedAtRaw = textOf(getFirstChild(head, "ReportDateTime")) || textOf(getFirstChild(control, "DateTime"));
  const eventId = textOf(getFirstChild(head, "EventID")) || entry.id || entry.url;
  const information = parseHeadlineInformation(head);
  const forecastArea = information.find((item) => item.type.includes("予報区域"))?.areas[0]
    ?? information.flatMap((item) => item.areas).find((area) => /^\d{12}$/u.test(area.code));
  const riverAreas = information.filter((item) => item.type.includes("河川")).flatMap((item) => item.areas);
  const condition = information.map((item) => item.condition).find(Boolean) ?? "";
  const level = resolveRiverFloodLevel({
    condition,
    kindNames: information.map((item) => item.kindName),
    title
  });
  const active = !/解除/u.test(`${title} ${headline} ${condition}`);
  return {
    id: String(eventId || forecastArea?.code || entry.url),
    eventId: String(eventId || ""),
    title,
    headline,
    updatedAt: parseJmaTime(updatedAtRaw) ?? updatedAtRaw ?? "--",
    updatedAtRaw,
    level,
    levelLabel: getRiverFloodLevelLabel(level),
    condition,
    active,
    forecastAreaCode: String(forecastArea?.code ?? ""),
    forecastAreaName: forecastArea?.name || stripLevelTitle(title),
    rivers: uniqueBy(riverAreas, (area) => area.code || area.name),
    warningTexts: parseWarningTexts(body),
    stations: parseWaterLevelStations(body),
    rainfall: parseRainfall(body),
    affectedAreas: parseAffectedAreas(body),
    offices: getElements(getFirst(body, "OfficeInfo"), "Office").map((office) => ({
      name: textOf(getFirstChild(office, "Name")),
      contact: textOf(getFirstChild(office, "ContactInfo")),
      url: textOf(getFirstChild(office, "URI"))
    })).filter((office) => office.name),
    url: entry.url ?? ""
  };
}

function parseHeadlineInformation(head) {
  return getElements(getFirstChild(head, "Headline"), "Information").map((information) => {
    const item = getFirstChild(information, "Item");
    const kind = getFirstChild(item, "Kind");
    return {
      type: information.getAttribute("type") ?? "",
      kindName: textOf(getFirstChild(kind, "Name")),
      condition: textOf(getFirstChild(kind, "Condition")),
      areas: getElements(getFirstChild(item, "Areas"), "Area").map((area) => ({
        name: textOf(getFirstChild(area, "Name")),
        code: textOf(getFirstChild(area, "Code"))
      })).filter((area) => area.name || area.code)
    };
  });
}

function parseWarningTexts(body) {
  return getElements(getFirst(body, "Warning"), "Item").flatMap((item) => getElements(item, "Property").flatMap((property) => {
    const type = textOf(getFirstChild(property, "Type"));
    const value = normalizeRiverWarningText(textOf(getFirstChild(property, "Text")));
    return value && type.includes("主文") ? [value] : [];
  }));
}

export function normalizeRiverWarningText(value) {
  return String(value ?? "")
    .replace(/[［[]洪水[］\]]/gu, "")
    .trim();
}

function parseAffectedAreas(body) {
  return uniqueBy(getElements(getFirst(body, "Warning"), "Item").flatMap((item) => {
    const kindName = textOf(getFirst(getFirstChild(item, "Kind"), "Name"));
    if (!kindName.includes("浸水")) return [];
    return getElements(getFirstChild(item, "Areas"), "Area").map((area) => ({
      stationName: textOf(getFirstChild(area, "Name")),
      prefecture: textOf(getFirstChild(area, "Prefecture")),
      city: textOf(getFirstChild(area, "City")),
      cityCode: textOf(getFirstChild(area, "CityCode")),
      subCityList: textOf(getFirstChild(area, "SubCityList"))
    }));
  }).filter((area) => area.city), (area) => `${area.cityCode}|${area.stationName}`);
}

function parseWaterLevelStations(body) {
  return getElements(body, "MeteorologicalInfos")
    .filter((element) => (element.getAttribute("type") ?? "").includes("水位"))
    .flatMap((group) => getElements(group, "TimeSeriesInfo").flatMap((series) => {
      const times = parseTimeDefines(series);
      return getChildren(series, "Item").map((item) => {
        const station = getFirstChild(item, "Station");
        const byTime = new Map();
        getElements(item, "WaterLevel").forEach((element) => {
          const refId = element.getAttribute("refID") ?? "";
          const rawValue = textOf(element).trim();
          const numeric = rawValue === "" ? Number.NaN : Number(rawValue);
          const type = element.getAttribute("type") ?? "";
          const condition = element.getAttribute("condition") ?? "";
          const value = byTime.get(refId) ?? { ...times.get(refId) };
          if (type.includes("レベル")) {
            value.level = Number.isFinite(numeric) ? numeric : null;
            value.levelCondition = condition;
          }
          else {
            value.value = Number.isFinite(numeric) ? numeric : null;
            value.unit = element.getAttribute("unit") ?? "m";
            value.condition = condition || (Number.isFinite(numeric) ? "" : "欠測");
          }
          byTime.set(refId, value);
        });
        return {
          name: textOf(getFirstChild(station, "Name")),
          code: textOf(getFirstChild(station, "Code")),
          location: textOf(getFirstChild(station, "Location")),
          values: [...byTime.values()].filter((value) => value.time)
        };
      }).filter((station) => station.name && station.values.length);
    }));
}

function parseRainfall(body) {
  return getElements(body, "MeteorologicalInfos")
    .filter((element) => (element.getAttribute("type") ?? "").includes("雨量"))
    .flatMap((group) => getElements(group, "TimeSeriesInfo").flatMap((series) => {
      const times = parseTimeDefines(series);
      return getChildren(series, "Item").map((item) => ({
        areaName: textOf(getFirst(getFirstChild(item, "Area"), "Name")),
        values: getElements(item, "Precipitation").map((element) => {
          const rawValue = textOf(element).trim();
          const numeric = rawValue === "" ? Number.NaN : Number(rawValue);
          return {
            ...times.get(element.getAttribute("refID") ?? ""),
            value: Number.isFinite(numeric) ? numeric : null,
            unit: element.getAttribute("unit") ?? "mm",
            condition: element.getAttribute("condition") || (Number.isFinite(numeric) ? "" : "欠測")
          };
        }).filter((value) => value.time)
      })).filter((item) => item.areaName && item.values.length);
    }));
}

function parseTimeDefines(series) {
  return new Map(getElements(getFirstChild(series, "TimeDefines"), "TimeDefine").map((element) => [
    element.getAttribute("timeId") ?? "",
    { time: textOf(getFirstChild(element, "DateTime")), name: textOf(getFirstChild(element, "Name")), duration: textOf(getFirstChild(element, "Duration")) }
  ]));
}

async function fetchRiverFeatures(reports) {
  const reportByCode = new Map(reports.filter((report) => report.forecastAreaCode).map((report) => [report.forecastAreaCode, report]));
  const baseQuery = new URLSearchParams({
    where: "1=1",
    outFields: "FAREACODE,RIVERNAME",
    returnGeometry: "true",
    outSR: "4326",
    maxAllowableOffset: "0.003",
    geometryPrecision: "5",
    f: "geojson"
  });
  const baseCollection = await fetchJson(`${JMA_ENDPOINTS.riverFloodGeometry}?${baseQuery}`, { ttlMs: GEOMETRY_TTL_MS });
  let detailedFeatures = [];

  if (reportByCode.size) {
    const where = `FAREACODE IN (${[...reportByCode.keys()].map((code) => `'${code.replaceAll("'", "''")}'`).join(",")})`;
    const detailQuery = new URLSearchParams({
      where,
      outFields: "FAREACODE,RIVERNAME",
      returnGeometry: "true",
      outSR: "4326",
      geometryPrecision: "6",
      f: "geojson"
    });
    const detailCollection = await fetchJson(`${JMA_ENDPOINTS.riverFloodGeometry}?${detailQuery}`, { ttlMs: GEOMETRY_TTL_MS });
    detailedFeatures = detailCollection?.features ?? [];
  }

  const detailedByCode = new Map(detailedFeatures.map((feature) => [String(feature?.properties?.FAREACODE ?? ""), feature]));
  const features = (baseCollection?.features ?? []).map((feature) => {
    const code = String(feature?.properties?.FAREACODE ?? "");
    const report = reportByCode.get(code);
    const geometryFeature = detailedByCode.get(code) ?? feature;
    return {
      ...geometryFeature,
      properties: {
        ...geometryFeature.properties,
        reportId: report?.id ?? "",
        level: report?.level ?? 0,
        levelLabel: report?.levelLabel ?? "",
        forecastAreaName: report?.forecastAreaName ?? geometryFeature?.properties?.RIVERNAME ?? ""
      }
    };
  });

  return { type: "FeatureCollection", features };
}

function dedupeReports(reports) {
  const byEvent = new Map();
  reports.forEach((report) => {
    const key = report.eventId || report.forecastAreaCode || report.title;
    const current = byEvent.get(key);
    if (!current || dateMs(report.updatedAtRaw) > dateMs(current.updatedAtRaw)) byEvent.set(key, report);
  });
  return [...byEvent.values()].sort((a, b) => dateMs(b.updatedAtRaw) - dateMs(a.updatedAtRaw));
}

function parseFeedEntry(entry) {
  const link = getChildren(entry, "link").find((element) => element.getAttribute("href"));
  return { id: textOf(getFirstChild(entry, "id")), title: textOf(getFirstChild(entry, "title")), updated: textOf(getFirstChild(entry, "updated")), url: link?.getAttribute("href") ?? "" };
}

function latestFeedTime(feeds) {
  return feeds.map(({ feed }) => textOf(getFirst(feed, "updated")))
    .sort((a, b) => dateMs(b) - dateMs(a))
    .map((value) => parseJmaTime(value) ?? value)
    .find(Boolean);
}

function riverLevel(value) {
  if (/レベル\s*5|氾濫(?:特別警報|発生情報)/u.test(value)) return 5;
  if (/レベル\s*4|氾濫危険/u.test(value)) return 4;
  if (/レベル\s*3|氾濫(?:警報|警戒情報)/u.test(value)) return 3;
  if (/レベル\s*2|氾濫注意/u.test(value)) return 2;
  return 0;
}

export function resolveRiverFloodLevel({ condition = "", kindNames = [], title = "" } = {}) {
  return [condition, kindNames.join(" "), title]
    .map((value) => riverLevel(value))
    .find((level) => level > 0) ?? 0;
}

export function getRiverFloodLevelLabel(level) {
  return ({ 5: "レベル5 氾濫特別警報・発生情報", 4: "レベル4 氾濫危険警報", 3: "レベル3 氾濫警報", 2: "レベル2 氾濫注意報" })[Number(level)] ?? "指定河川洪水予報";
}

function stripLevelTitle(value) { return String(value ?? "").replace(/レベル\s*[2-5].*$/u, "").trim() || "対象河川"; }
function uniqueBy(items, getKey) { const map = new Map(); items.forEach((item) => { const key = getKey(item); if (key && !map.has(key)) map.set(key, item); }); return [...map.values()]; }
function parseXml(text) { const xml = new DOMParser().parseFromString(text, "application/xml"); const error = xml.querySelector("parsererror"); if (error) throw new Error(error.textContent || "Invalid river flood XML"); return xml; }
function getElements(root, localName) { return root ? [...root.getElementsByTagName("*")].filter((element) => element.localName === localName) : []; }
function getChildren(root, localName) { return root ? [...root.children].filter((element) => element.localName === localName) : []; }
function getFirst(root, localName) { return getElements(root, localName)[0] ?? null; }
function getFirstChild(root, localName) { return getChildren(root, localName)[0] ?? null; }
function textOf(element) { return element?.textContent?.trim() ?? ""; }
function dateMs(value) { const time = new Date(value ?? 0).getTime(); return Number.isFinite(time) ? time : 0; }
function emptyCollection() { return { type: "FeatureCollection", features: [] }; }
