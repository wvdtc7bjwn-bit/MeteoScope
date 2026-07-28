import { JMA_ENDPOINTS } from "../config.js";
import { fetchJson, fetchText, parseJmaTime } from "./jmaClient.js";
import { findLatestVpFw50DetailUrl, isVpFw50Xml } from "./vpfw50Feed.js";

const AREA_COLLECTIONS = ["class20s", "class15s", "class10s", "offices", "centers"];
const WEEKLY_FORECAST_TTL_MS = 15 * 60 * 1000;

export async function fetchWeeklyForecastForLocation(locationInfo) {
  const municipalityCode = String(locationInfo?.areaCode ?? "").trim();
  if (!municipalityCode) throw new Error("現在地の市区町村を特定できません。");

  const areaData = await fetchJson(JMA_ENDPOINTS.areaConst, {
    ttlMs: 24 * 60 * 60 * 1000,
    staleIfError: true
  });
  const areaPath = resolveJmaAreaPath(areaData, municipalityCode);
  const officeCode = areaPath.find((code) => areaData?.offices?.[code]) ?? "";
  if (!officeCode) throw new Error("現在地に対応する予報官署を特定できません。");

  const xml = await fetchLatestVpFw50Xml(officeCode);
  return parseWeeklyForecastXml(xml, {
    areaPath,
    coordinates: locationInfo?.coordinates,
    municipalityName: locationInfo?.areaName,
    officeCode,
    officeName: areaData.offices?.[officeCode]?.name ?? ""
  });
}

async function fetchLatestVpFw50Xml(officeCode) {
  try {
    return await fetchText(`${JMA_ENDPOINTS.weeklyForecastXml}?officeCode=${encodeURIComponent(officeCode)}`, {
      ttlMs: WEEKLY_FORECAST_TTL_MS,
      timeoutMs: 15 * 1000,
      staleIfError: true,
      validate: isVpFw50Xml
    });
  } catch (apiError) {
    console.warn("[MeteoScope] weekly forecast API unavailable; using JMA XML feed", apiError);
    for (const feedUrl of [JMA_ENDPOINTS.weatherXmlFeed, JMA_ENDPOINTS.weatherXmlLongFeed]) {
      try {
        const feed = await fetchText(feedUrl, {
          ttlMs: WEEKLY_FORECAST_TTL_MS,
          timeoutMs: 20 * 1000,
          staleIfError: true
        });
        const detailUrl = findLatestVpFw50DetailUrl(feed, officeCode);
        if (detailUrl) {
          return fetchText(detailUrl, {
            ttlMs: WEEKLY_FORECAST_TTL_MS,
            timeoutMs: 15 * 1000,
            staleIfError: true,
            validate: isVpFw50Xml
          });
        }
      } catch (feedError) {
        console.warn("[MeteoScope] JMA weekly forecast feed unavailable", feedError);
      }
    }
    throw apiError;
  }
}

export function resolveJmaAreaPath(areaData, areaCode) {
  const path = [];
  const visited = new Set();
  let currentCode = String(areaCode ?? "").trim();

  while (currentCode && !visited.has(currentCode)) {
    visited.add(currentCode);
    path.push(currentCode);
    const entry = findAreaEntry(areaData, currentCode);
    currentCode = String(entry?.parent ?? "").trim();
  }

  if (!path.some((code) => areaData?.offices?.[code])) {
    const fallbackOfficeCode = `${path[0]?.slice(0, 2) ?? ""}0000`;
    if (areaData?.offices?.[fallbackOfficeCode]) path.push(fallbackOfficeCode);
  }
  return path;
}

export function parseWeeklyForecastXml(xml, context = {}) {
  const documentNode = new DOMParser().parseFromString(String(xml ?? ""), "application/xml");
  if (elementsByLocalName(documentNode, "parsererror").length > 0) {
    throw new Error("週間天気予報XMLを解析できません。");
  }

  const reportTime = textOfFirst(documentNode, "ReportDateTime");
  const publishingOffice = textOfFirst(documentNode, "PublishingOffice") || context.officeName;
  const areaInfos = elementsByLocalName(documentNode, "MeteorologicalInfos")
    .filter((node) => node.getAttribute("type") === "区域予報");
  const pointInfos = elementsByLocalName(documentNode, "MeteorologicalInfos")
    .filter((node) => node.getAttribute("type") === "地点予報");
  const areaSeries = chooseAreaSeries(areaInfos, context.areaPath);
  if (!areaSeries) throw new Error("現在地に対応する週間予報がありません。");

  const daysByRef = buildDayMap(areaSeries);
  applyAreaForecastValues(areaSeries, daysByRef);

  const pointSeries = choosePointSeries(pointInfos, context.stationCode);
  if (pointSeries) applyTemperatureValues(pointSeries, daysByRef);

  const area = getForecastTarget(areaSeries, "Area");
  const station = pointSeries ? getForecastTarget(pointSeries, "Station") : null;
  const days = [...daysByRef.values()].sort((left, right) => left.date.localeCompare(right.date));

  return {
    source: "気象庁 防災情報XML",
    bulletinCode: "VPFW50",
    reportTime,
    reportTimeLabel: parseJmaTime(reportTime) ?? reportTime,
    publishingOffice,
    officeCode: context.officeCode ?? "",
    officeName: context.officeName ?? "",
    municipalityName: context.municipalityName ?? "",
    areaCode: area?.code ?? "",
    areaName: area?.name ?? context.officeName ?? "",
    stationCode: station?.code ?? "",
    stationName: station?.name ?? "",
    days
  };
}

function findAreaEntry(areaData, areaCode) {
  for (const collection of AREA_COLLECTIONS) {
    if (areaData?.[collection]?.[areaCode]) return areaData[collection][areaCode];
  }
  return null;
}

function chooseAreaSeries(infos, areaPath = []) {
  const series = infos.flatMap((info) => elementsByLocalName(info, "TimeSeriesInfo"));
  return series.find((node) => areaPath.includes(getForecastTarget(node, "Area")?.code)) ?? series[0] ?? null;
}

function choosePointSeries(infos, stationCode) {
  const series = infos.flatMap((info) => elementsByLocalName(info, "TimeSeriesInfo"));
  if (!stationCode) return series[0] ?? null;
  return series.find((node) => getForecastTarget(node, "Station")?.code === String(stationCode)) ?? series[0] ?? null;
}

function buildDayMap(series) {
  const days = new Map();
  elementsByLocalName(series, "TimeDefine").forEach((definition) => {
    const refId = definition.getAttribute("timeId") ?? "";
    const date = textOfFirst(definition, "DateTime");
    if (!refId || !date) return;
    days.set(refId, {
      refId,
      date,
      weather: "",
      weatherCode: "",
      precipitationProbability: null,
      reliability: "",
      minTemperature: null,
      minTemperatureLower: null,
      minTemperatureUpper: null,
      maxTemperature: null,
      maxTemperatureLower: null,
      maxTemperatureUpper: null
    });
  });
  return days;
}

function applyAreaForecastValues(series, days) {
  elementsByLocalName(series, "Weather").forEach((node) => setDayValue(days, node, "weather", node.textContent?.trim() ?? ""));
  elementsByLocalName(series, "WeatherCode").forEach((node) => setDayValue(days, node, "weatherCode", node.textContent?.trim() ?? ""));
  elementsByLocalName(series, "ProbabilityOfPrecipitation").forEach((node) => {
    setDayValue(days, node, "precipitationProbability", numberOrNull(node.textContent));
  });
  elementsByLocalName(series, "ReliabilityClass").forEach((node) => setDayValue(days, node, "reliability", node.textContent?.trim() ?? ""));
}

function applyTemperatureValues(series, days) {
  elementsByLocalName(series, "Temperature").forEach((node) => {
    const type = node.getAttribute("type") ?? "";
    const key = {
      "最低気温": "minTemperature",
      "最低気温予測範囲（下端）": "minTemperatureLower",
      "最低気温予測範囲（上端）": "minTemperatureUpper",
      "最高気温": "maxTemperature",
      "最高気温予測範囲（下端）": "maxTemperatureLower",
      "最高気温予測範囲（上端）": "maxTemperatureUpper"
    }[type];
    if (key) setDayValue(days, node, key, numberOrNull(node.textContent));
  });
}

function setDayValue(days, node, key, value) {
  const day = days.get(node.getAttribute("refID") ?? "");
  if (day) day[key] = value;
}

function getForecastTarget(series, tagName) {
  const node = elementsByLocalName(series, tagName)[0];
  if (!node) return null;
  return {
    name: textOfFirst(node, "Name"),
    code: textOfFirst(node, "Code")
  };
}

function elementsByLocalName(root, localName) {
  return Array.from(root.getElementsByTagNameNS("*", localName));
}

function textOfFirst(root, localName) {
  return elementsByLocalName(root, localName)[0]?.textContent?.trim() ?? "";
}

function numberOrNull(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}
