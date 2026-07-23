import { JMA_ENDPOINTS } from "../config.js";
import { fetchText, parseJmaTime } from "./jmaClient.js";

const VOLCANO_XML_CODES = new Set(["VFVO50", "VFVO51", "VFVO52", "VFVO53", "VFVO54", "VFVO55", "VFVO56"]);
const VOLCANO_DETAIL_FETCH_LIMIT = 32;
const VOLCANO_WARNING_DETAIL_CODES = new Set(["VFVO50", "VFVO51"]);
const VOLCANO_ASH_FORECAST_CODES = new Set(["VFVO53", "VFVO54", "VFVO55"]);
const VOLCANO_WARNING_DETAIL_LIMIT = 20;
const VOLCANO_ASH_FORECAST_LIMIT = 10;
const VOLCANO_DISPLAY_LIMIT = 130;

export async function fetchVolcanoXmlList() {
  const [feeds, baselineReports] = await Promise.all([
    fetchVolcanoFeeds().catch(() => []),
    fetchVolcanoBaseline()
  ]);
  const allEntries = uniqueEntries(feeds.flatMap(({ feed }) => getElements(feed, "entry")
    .map(parseFeedEntry)
    .filter((entry) => VOLCANO_XML_CODES.has(entry.code))));
  const entries = selectVolcanoFeedEntries(allEntries, VOLCANO_DETAIL_FETCH_LIMIT);
  const results = await Promise.allSettled(entries.map(fetchVolcanoDetail));
  const reports = results
    .filter((result) => result.status === "fulfilled" && result.value)
    .map((result) => result.value)
    .sort((left, right) => dateMs(right.reportTime) - dateMs(left.reportTime));

  if (entries.length > 0 && reports.length === 0 && baselineReports.length === 0) {
    throw new Error("Volcano XML detail unavailable");
  }

  const consolidatedReports = consolidateVolcanoReports([...reports, ...baselineReports]).slice(0, VOLCANO_DISPLAY_LIMIT);
  const updatedAt = reports[0]?.reportTime
    ?? baselineReports[0]?.reportTime
    ?? feeds.map(({ feed }) => getText(getFirst(feed, "updated"))).sort((a, b) => dateMs(b) - dateMs(a))[0]
    ?? null;

  return {
    source: "jma-volcano-xml",
    sourceLabel: "気象庁 火山情報（JSON・XML）",
    reports: consolidatedReports,
    mapVolcanoes: consolidatedReports.filter((report) => Array.isArray(report.coordinates)),
    updatedAt: parseJmaTime(updatedAt) ?? updatedAt ?? "未取得",
    latestTime: parseJmaTime(updatedAt) ?? updatedAt ?? "未取得"
  };
}

export function selectVolcanoFeedEntries(entries, limit = VOLCANO_DETAIL_FETCH_LIMIT) {
  const unique = uniqueEntries(entries);
  const warningEntries = unique
    .filter((entry) => VOLCANO_WARNING_DETAIL_CODES.has(entry.code))
    .slice(0, Math.min(VOLCANO_WARNING_DETAIL_LIMIT, limit));
  const ashForecastEntries = unique
    .filter((entry) => VOLCANO_ASH_FORECAST_CODES.has(entry.code))
    .slice(0, Math.min(VOLCANO_ASH_FORECAST_LIMIT, Math.max(0, limit - warningEntries.length)));
  const remainingEntries = unique.filter((entry) =>
    !VOLCANO_WARNING_DETAIL_CODES.has(entry.code) && !VOLCANO_ASH_FORECAST_CODES.has(entry.code)
  );
  return [...warningEntries, ...ashForecastEntries, ...remainingEntries].slice(0, limit);
}

export function getVolcanoWarningDetailReport(report) {
  const relatedReports = report?.relatedReports?.length ? report.relatedReports : [report].filter(Boolean);
  return relatedReports.find((item) =>
    VOLCANO_WARNING_DETAIL_CODES.has(item?.bulletinCode)
      && (item.prevention || item.activity || item.volcanoHeadline || item.headline)
  ) ?? null;
}

export function getLatestVolcanoReportsByType(reports) {
  const latestByType = new Map();
  [...(reports ?? [])]
    .sort((left, right) => dateMs(right.reportTimeRaw || right.reportTime) - dateMs(left.reportTimeRaw || left.reportTime))
    .forEach((report) => {
      const type = String(report?.bulletinCode || report?.infoKind || report?.title || report?.id || "").trim();
      if (type && !latestByType.has(type)) latestByType.set(type, report);
    });
  return [...latestByType.values()];
}

export function getHighestPriorityVolcanoReport(reports) {
  return [...(reports ?? [])].sort(compareVolcanoReportsByPriority)[0] ?? null;
}

export function consolidateVolcanoReports(reports) {
  const groups = new Map();
  [...reports]
    .sort((left, right) => dateMs(right.reportTimeRaw || right.reportTime) - dateMs(left.reportTimeRaw || left.reportTime))
    .forEach((report) => {
      const key = String(report.volcanoCode || report.volcanoName || report.id || "").trim();
      if (!key) return;
      const group = groups.get(key) ?? [];
      group.push(report);
      groups.set(key, group);
    });

  return [...groups.values()].map((relatedReports) => {
    const latest = relatedReports[0];
    const alertReport = relatedReports.find((report) => report.bulletinCode === "CURRENT")
      ?? relatedReports.find((report) => report.bulletinCode === "VFVO50" && Number(report.alertPriority || report.level) > 0)
      ?? relatedReports.find((report) => Number(report.alertPriority || report.level) > 0);
    const coordinateReport = relatedReports.find((report) => Array.isArray(report.coordinates));
    return {
      ...latest,
      level: Number(alertReport?.level) || Number(latest.level) || 0,
      alertPriority: Number(alertReport?.alertPriority) || Number(alertReport?.level) || Number(latest.alertPriority) || 0,
      condition: alertReport?.condition || latest.condition,
      currentStatus: alertReport?.kindName || latest.kindName || latest.infoKind || "警戒状況未確認",
      coordinates: coordinateReport?.coordinates ?? latest.coordinates ?? null,
      relatedReports
    };
  }).sort(compareVolcanoReportsByPriority);
}

function compareVolcanoReportsByPriority(left, right) {
  const levelDifference = (Number(right?.alertPriority || right?.level) || 0)
    - (Number(left?.alertPriority || left?.level) || 0);
  if (levelDifference !== 0) return levelDifference;
  return dateMs(right?.reportTimeRaw || right?.reportTime) - dateMs(left?.reportTimeRaw || left?.reportTime);
}

async function fetchVolcanoBaseline() {
  const [statusText, catalogText] = await Promise.all([
    fetchText(JMA_ENDPOINTS.volcanoStatus, { ttlMs: 5 * 60 * 1000, cache: "no-store" }),
    fetchText(JMA_ENDPOINTS.volcanoCatalog, { ttlMs: 24 * 60 * 60 * 1000, cache: "force-cache" })
  ]);
  const status = JSON.parse(statusText);
  const catalog = JSON.parse(catalogText);
  const statusByCode = new Map();
  (status?.volcanoInfos ?? []).forEach((info) => {
    (info?.items ?? []).forEach((item) => {
      (item?.areas ?? []).forEach((area) => statusByCode.set(String(area.code), item));
    });
  });
  return (Array.isArray(catalog) ? catalog : []).map((volcano) => {
    const item = statusByCode.get(String(volcano.code));
    const kindCode = String(item?.code ?? "");
    const level = volcanoAlertLevel(item?.name, kindCode);
    const coordinates = Array.isArray(volcano.latlon)
      ? [Number(volcano.latlon[1]), Number(volcano.latlon[0])]
      : null;
    return {
      id: `current-${volcano.code}`,
      bulletinCode: "CURRENT",
      volcanoCode: String(volcano.code),
      volcanoName: normalizeVolcanoAscii(volcano.name_jp) || "火山名不明",
      coordinates: coordinates?.every(Number.isFinite) ? coordinates : null,
      reportTime: parseJmaTime(status.reportDatetime) ?? status.reportDatetime ?? "未取得",
      reportTimeRaw: status.reportDatetime ?? "",
      infoKind: "現在の噴火警報・予報",
      kindName: normalizeVolcanoAscii(item?.name) || "警戒状況未確認",
      kindCode,
      level,
      alertPriority: volcanoAlertPriority(level, kindCode),
      headline: normalizeVolcanoAscii(item?.name) || "現在の警戒状況を確認できません",
      sourceUrl: "https://www.jma.go.jp/bosai/volcano/"
    };
  });
}

function volcanoAlertPriority(level, code) {
  if (Number(level) > 0) return Number(level);
  return ({ 25: 5, 24: 4, 23: 3, 22: 2, 36: 2, 21: 1, 35: 1 })[Number(code)] ?? 0;
}

export function parseVolcanoReport(text, entry = {}) {
  const xml = parseXml(text);
  const report = getFirst(xml, "Report") ?? xml;
  const control = getFirstChild(report, "Control");
  const head = getFirstChild(report, "Head");
  const body = getFirstChild(report, "Body");
  const volcanoInfo = getElements(body, "VolcanoInfo").find((element) =>
    String(element.getAttribute("type") ?? "").includes("対象火山")
  ) ?? getFirst(body, "VolcanoInfo");
  const item = getFirst(volcanoInfo, "Item");
  const area = getElements(item, "Area").find((element) => getFirstChild(element, "Coordinate"))
    ?? getFirst(item, "Area")
    ?? getElements(head, "Area")[0];
  const kind = getFirstChild(item, "Kind") ?? getFirst(head, "Kind");
  const content = getFirst(body, "VolcanoInfoContent");
  const observation = getFirst(body, "VolcanoObservation");
  const coordinateText = getText(getFirstChild(area, "CraterCoordinate"))
    || getText(getFirstChild(area, "Coordinate"));
  const plumeHeightNode = getFirst(observation, "PlumeHeightAboveCrater");
  const plumeHeight = getText(plumeHeightNode);
  const reportTimeRaw = getText(getFirstChild(head, "ReportDateTime"))
    || getText(getFirstChild(control, "DateTime"))
    || entry.updated;
  const eventTimeRaw = getText(getFirst(body, "EventDateTime"))
    || getText(getFirstChild(head, "TargetDateTime"));
  const volcanoName = getText(getFirstChild(area, "Name"))
    || extractVolcanoName(getText(getFirstChild(head, "Title")));
  const infoKind = getText(getFirstChild(head, "InfoKind"))
    || getText(getFirstChild(control, "Title"))
    || entry.title
    || "火山情報";

  return {
    id: entry.id || `${getText(getFirstChild(head, "EventID"))}-${reportTimeRaw}-${entry.code}`,
    title: normalizeText(getText(getFirstChild(head, "Title")) || entry.title),
    bulletinCode: entry.code || getXmlCodeFromUrl(entry.url),
    volcanoCode: getText(getFirstChild(area, "Code")),
    volcanoName: volcanoName || "火山名不明",
    craterName: getText(getFirstChild(area, "CraterName")),
    coordinates: parseVolcanoCoordinate(coordinateText),
    reportTime: parseJmaTime(reportTimeRaw) ?? reportTimeRaw ?? "未取得",
    reportTimeRaw,
    eventTime: parseJmaTime(eventTimeRaw) ?? eventTimeRaw ?? "",
    infoKind,
    kindName: getText(getFirstChild(kind, "Name")) || infoKind,
    kindCode: getText(getFirstChild(kind, "Code")),
    condition: getText(getFirstChild(kind, "Condition")),
    level: volcanoAlertLevel(getText(getFirstChild(kind, "Name")), getText(getFirstChild(kind, "Code"))),
    headline: normalizeText(getText(getFirst(getFirstChild(head, "Headline"), "Text"))),
    volcanoHeadline: normalizeText(getText(getFirstChild(content, "VolcanoHeadline"))),
    activity: normalizeText(getText(getFirstChild(content, "VolcanoActivity"))),
    prevention: normalizeText(getText(getFirstChild(content, "VolcanoPrevention"))),
    nextAdvisory: normalizeText(getText(getFirstChild(content, "NextAdvisory"))),
    plumeHeight: plumeHeight ? `${plumeHeight}${plumeHeightNode?.getAttribute("unit") ?? "m"}` : "",
    plumeDirection: getText(getFirst(observation, "PlumeDirection")),
    observation: normalizeText(getText(getFirstChild(observation, "OtherObservation"))),
    targetAreas: entry.code === "VFVO50" ? parseVolcanoTargetAreas(body) : [],
    ashForecasts: parseAshForecasts(body, entry.code || getXmlCodeFromUrl(entry.url)),
    sourceUrl: entry.url || "https://www.jma.go.jp/bosai/volcano/"
  };
}

function parseAshForecasts(body, bulletinCode) {
  return getElements(body, "AshInfo").map((ashInfo, forecastIndex) => {
    const startTimeRaw = getText(getFirstChild(ashInfo, "StartTime"));
    const endTimeRaw = getText(getFirstChild(ashInfo, "EndTime"));
    const areas = getChildren(ashInfo, "Item").flatMap((item, itemIndex) => {
      const municipalityGroups = getChildren(item, "Areas");
      const municipalities = municipalityGroups
        .flatMap((group) => getChildren(group, "Area"))
        .map((area) => ({
          name: getText(getFirstChild(area, "Name")),
          code: getText(getFirstChild(area, "Code"))
        }))
        .filter((area) => area.name);
      return getChildren(item, "Kind").flatMap((kind, kindIndex) => {
        const property = getFirstChild(kind, "Property") ?? getFirst(item, "Property");
        const kindName = getText(getFirstChild(kind, "Name")) || "降灰予報";
        const sizeNode = getFirst(property, "Size");
        const distanceNode = getFirst(property, "Distance");
        const polygonGroups = groupVolcanoPolygonRings(
          getElements(property, "Polygon")
            .map((polygonNode) => parseVolcanoPolygon(getText(polygonNode)))
            .filter((polygon) => polygon.length >= 4)
        );
        return polygonGroups.map(({ polygon, holes }, polygonIndex) => ({
          id: `${bulletinCode || "VFVO"}-${forecastIndex}-${itemIndex}-${kindIndex}-${polygonIndex}`,
          kindName,
          kindCode: getText(getFirstChild(kind, "Code")),
          category: /小さな噴石/u.test(kindName) ? "small-cinders" : "ashfall",
          amount: ashfallAmount(kindName),
          polygon,
          holes,
          plumeDirection: getText(getFirst(property, "PlumeDirection")),
          plumeDirectionDescription: getFirst(property, "PlumeDirection")?.getAttribute("description") ?? "",
          size: measurement(sizeNode),
          distance: measurement(distanceNode),
          municipalities
        }));
      });
    });
    return {
      id: `${bulletinCode || "VFVO"}-${forecastIndex}-${startTimeRaw}-${endTimeRaw}`,
      bulletinCode,
      startTimeRaw,
      endTimeRaw,
      startTime: parseJmaTime(startTimeRaw) ?? startTimeRaw,
      endTime: parseJmaTime(endTimeRaw) ?? endTimeRaw,
      areas
    };
  }).filter((forecast) => forecast.areas.length > 0);
}

function ashfallAmount(kindName) {
  if (/やや多量/u.test(kindName)) return "moderate";
  if (/多量/u.test(kindName)) return "heavy";
  if (/少量/u.test(kindName)) return "light";
  return "unknown";
}

function measurement(node) {
  const value = getText(node);
  return value ? {
    value,
    type: node?.getAttribute("type") ?? "",
    unit: node?.getAttribute("unit") ?? ""
  } : null;
}

export function parseVolcanoPolygon(value) {
  const coordinates = String(value ?? "")
    .split("/")
    .map((coordinate) => parseVolcanoCoordinate(coordinate))
    .filter(Boolean);
  if (coordinates.length < 3) return [];
  const [firstLongitude, firstLatitude] = coordinates[0];
  const [lastLongitude, lastLatitude] = coordinates.at(-1);
  if (firstLongitude !== lastLongitude || firstLatitude !== lastLatitude) {
    coordinates.push([...coordinates[0]]);
  }
  return coordinates;
}

export function groupVolcanoPolygonRings(rings) {
  const validRings = (rings ?? [])
    .filter((ring) => Array.isArray(ring) && ring.length >= 4)
    .map((ring, index) => ({
      index,
      ring,
      area: Math.abs(polygonSignedArea(ring)),
      parent: -1,
      depth: 0
    }));

  validRings.forEach((candidate) => {
    const point = candidate.ring[0];
    const containers = validRings
      .filter((other) =>
        other.index !== candidate.index
        && other.area > candidate.area
        && pointInPolygon(point, other.ring)
      )
      .sort((left, right) => left.area - right.area);
    candidate.parent = containers[0]?.index ?? -1;
  });

  const byIndex = new Map(validRings.map((item) => [item.index, item]));
  const getDepth = (item) => {
    if (item.parent < 0) return 0;
    const parent = byIndex.get(item.parent);
    return parent ? getDepth(parent) + 1 : 0;
  };
  validRings.forEach((item) => {
    item.depth = getDepth(item);
  });

  return validRings
    .filter((item) => item.depth % 2 === 0)
    .map((outer) => ({
      polygon: outer.ring,
      holes: validRings
        .filter((item) => item.parent === outer.index && item.depth === outer.depth + 1)
        .map((item) => item.ring)
    }));
}

function polygonSignedArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [leftX, leftY] = ring[index];
    const [rightX, rightY] = ring[index + 1];
    area += leftX * rightY - rightX * leftY;
  }
  return area / 2;
}

function pointInPolygon([pointX, pointY], ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [currentX, currentY] = ring[index];
    const [previousX, previousY] = ring[previous];
    const intersects = (currentY > pointY) !== (previousY > pointY)
      && pointX < ((previousX - currentX) * (pointY - currentY))
        / ((previousY - currentY) || Number.EPSILON) + currentX;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function getAvailableVolcanoAshForecasts(report, now = Date.now()) {
  const candidates = (report?.relatedReports ?? [report])
    .flatMap((item) => item?.ashForecasts ?? [])
    .filter((forecast) => forecast?.areas?.some((area) => Array.isArray(area?.polygon) && area.polygon.length >= 4))
    .map((forecast) => ({
      ...forecast,
      startMs: Date.parse(forecast.startTimeRaw || forecast.startTime || ""),
      endMs: Date.parse(forecast.endTimeRaw || forecast.endTime || "")
    }))
    .filter((forecast) => Number.isFinite(forecast.endMs) && forecast.endMs >= now);
  const uniqueForecasts = new Map();
  candidates.forEach((forecast) => {
    const key = `${forecast.startTimeRaw || forecast.startTime}|${forecast.endTimeRaw || forecast.endTime}`;
    if (!uniqueForecasts.has(key)) uniqueForecasts.set(key, forecast);
  });
  return [...uniqueForecasts.values()].sort((left, right) => {
    const leftCurrent = !Number.isFinite(left.startMs) || left.startMs <= now;
    const rightCurrent = !Number.isFinite(right.startMs) || right.startMs <= now;
    if (leftCurrent !== rightCurrent) return leftCurrent ? -1 : 1;
    return left.endMs - right.endMs;
  });
}

function parseVolcanoTargetAreas(body) {
  return getElements(body, "VolcanoInfo")
    .filter((element) => String(element.getAttribute("type") ?? "").includes("市町村"))
    .flatMap((information) => getChildren(information, "Item"))
    .map((item) => {
      const kind = getFirstChild(item, "Kind");
      const areas = getChildren(item, "Areas")
        .filter((element) => String(element.getAttribute("codeType") ?? "").includes("市町村"))
        .flatMap((element) => getChildren(element, "Area"))
        .map((area) => ({
          name: getText(getFirstChild(area, "Name")),
          code: getText(getFirstChild(area, "Code"))
        }))
        .filter((area) => area.name);
      return {
        kindName: getText(getFirstChild(kind, "Name")) || "噴火警報・予報の対象地域",
        condition: getText(getFirstChild(kind, "Condition")),
        areas
      };
    })
    .filter((group) => group.areas.length > 0);
}

export function parseVolcanoCoordinate(value) {
  const text = String(value ?? "").trim();
  const degreeMinute = text.match(/^([+-])(\d{2})(\d{2}(?:\.\d+)?)([+-])(\d{3})(\d{2}(?:\.\d+)?)/u);
  if (degreeMinute) {
    const latitude = (Number(degreeMinute[2]) + Number(degreeMinute[3]) / 60) * (degreeMinute[1] === "-" ? -1 : 1);
    const longitude = (Number(degreeMinute[5]) + Number(degreeMinute[6]) / 60) * (degreeMinute[4] === "-" ? -1 : 1);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? [longitude, latitude] : null;
  }
  const decimal = text.match(/^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/u);
  if (!decimal) return null;
  const latitude = Number(decimal[1]);
  const longitude = Number(decimal[2]);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? [longitude, latitude] : null;
}

export function volcanoAlertLevel(name, code) {
  const match = normalizeVolcanoAscii(name).match(/レベル\s*([1-5])/u);
  if (match) return Number(match[1]);
  const numericCode = Number(code);
  if (numericCode >= 11 && numericCode <= 15) return numericCode - 10;
  if (/噴火速報|噴火に関する火山観測報/u.test(String(name ?? ""))) return 3;
  return 0;
}

async function fetchVolcanoFeeds() {
  const urls = [JMA_ENDPOINTS.earthquakeXmlFeed, JMA_ENDPOINTS.earthquakeXmlLongFeed].filter(Boolean);
  const results = await Promise.allSettled(urls.map(async (url) => ({
    url,
    feed: parseXml(await fetchText(url, { ttlMs: 60 * 1000, cache: "no-store" }))
  })));
  const feeds = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
  if (feeds.length) return feeds;
  throw results.find((result) => result.status === "rejected")?.reason ?? new Error("Volcano XML feed unavailable");
}

async function fetchVolcanoDetail(entry) {
  return parseVolcanoReport(await fetchText(entry.url, { ttlMs: 60 * 1000, cache: "no-store" }), entry);
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

function uniqueEntries(entries) {
  return [...new Map(entries.map((entry) => [entry.url || entry.id, entry])).values()]
    .sort((left, right) => dateMs(right.updated) - dateMs(left.updated));
}

function getXmlCodeFromUrl(url) {
  return String(url ?? "").match(/_([A-Z]{4}\d{2})_/u)?.[1] ?? "";
}

function extractVolcanoName(title) {
  return String(title ?? "").match(/火山名[\s　]+(.+?)[\s　]+(?:噴火|火山|降灰)/u)?.[1]?.trim() ?? "";
}

function normalizeText(value) {
  return normalizeVolcanoAscii(value).replace(/\r\n?/gu, "\n").replace(/[ \t　]+/gu, " ").trim();
}

export function normalizeVolcanoAscii(value) {
  return String(value ?? "").replace(/[０-９Ａ-Ｚａ-ｚ]/gu, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0xfee0)
  );
}

export function parseVolcanoSeismicCountTable(value) {
  const lines = normalizeVolcanoAscii(value)
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .filter(Boolean);
  const headerIndex = lines.findIndex((line) => /^火山性地震\s+爆発$/u.test(line));
  if (headerIndex < 0) return null;

  const rows = [];
  let lineIndex = headerIndex + 1;
  for (; lineIndex < lines.length; lineIndex += 1) {
    const match = lines[lineIndex].match(
      /^((?:\d{1,2}月\s*)?\d{1,2}日(?:\s*\d{1,2}時(?:\d{1,2}分)?(?:まで)?)?)\s+(\d[\d,]*)回\s+(\d[\d,]*)回$/u
    );
    if (!match) break;
    rows.push({
      period: match[1].replace(/\s+/gu, ""),
      earthquakeCount: match[2],
      explosionCount: match[3]
    });
  }
  if (!rows.length) return null;

  return {
    before: lines.slice(0, headerIndex),
    rows,
    after: lines.slice(lineIndex)
  };
}

function dateMs(value) {
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : 0;
}

function parseXml(text) {
  const parser = new DOMParser();
  const document = parser.parseFromString(text, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("Volcano XML parse failed");
  return document;
}

function localName(element) {
  return element?.localName ?? element?.nodeName?.split(":").at(-1) ?? "";
}

function getElements(root, name) {
  return root ? [...root.getElementsByTagNameNS("*", name)] : [];
}

function getChildren(root, name) {
  return root ? [...root.children].filter((element) => localName(element) === name) : [];
}

function getFirst(root, name) {
  return getElements(root, name)[0] ?? null;
}

function getFirstChild(root, name) {
  return getChildren(root, name)[0] ?? null;
}

function getText(element) {
  return normalizeVolcanoAscii(element?.textContent).trim();
}
