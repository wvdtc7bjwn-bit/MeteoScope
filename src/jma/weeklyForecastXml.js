import { JMA_ENDPOINTS } from "../config.js";
import { fetchJson, fetchText, parseJmaTime } from "./jmaClient.js";
import { findLatestVpFw50DetailUrl, isVpFw50Xml } from "./vpfw50Feed.js";

const AREA_COLLECTIONS = ["class20s", "class15s", "class10s", "offices", "centers"];
const WEEKLY_FORECAST_TTL_MS = 15 * 60 * 1000;
const WEEKLY_AREA_TTL_MS = 24 * 60 * 60 * 1000;

export async function fetchWeeklyForecastForLocation(locationInfo) {
  const municipalityCode = String(locationInfo?.areaCode ?? "").trim();
  if (!municipalityCode) throw new Error("現在地の市区町村を特定できません。");

  const [areaData, weekAreaData] = await fetchWeeklyForecastAreaData();
  const target = resolveWeeklyForecastTarget(areaData, weekAreaData, municipalityCode);

  const xml = await fetchLatestVpFw50Xml(target.officeCode);
  return parseWeeklyForecastXml(xml, {
    areaPath: target.areaPath,
    targetAreaName: target.areaName,
    coordinates: locationInfo?.coordinates,
    municipalityName: locationInfo?.areaName,
    officeCode: target.officeCode,
    officeName: target.officeName,
    stationCode: target.stationCode
  });
}

export async function fetchWeeklyForecastForRegion(region) {
  const officeCode = String(region?.officeCode ?? "").trim();
  const areaCode = String(region?.areaCode ?? "").trim();
  if (!/^\d{6}$/u.test(officeCode) || !/^\d{6}$/u.test(areaCode)) {
    throw new Error("選択した予報区域を確認できません。");
  }

  const areaData = await fetchJson(JMA_ENDPOINTS.areaConst, {
    ttlMs: WEEKLY_AREA_TTL_MS,
    staleIfError: true
  });
  const officeName = areaData?.offices?.[officeCode]?.name ?? String(region?.officeName ?? "");
  const forecastAreaCode = String(region?.forecastAreaCode ?? "");
  const areaPath = [
    areaCode,
    forecastAreaCode,
    ...resolveJmaAreaPath(areaData, areaCode).filter((code) => code !== areaCode),
    officeCode
  ];
  const xml = await fetchLatestVpFw50Xml(officeCode);
  return parseWeeklyForecastXml(xml, {
    areaPath: [...new Set(areaPath)],
    targetAreaName: String(region?.areaName ?? ""),
    municipalityName: officeName,
    officeCode,
    officeName,
    stationCode: String(region?.stationCode ?? "")
  });
}

export async function fetchWeeklyForecastRegionCatalog() {
  const [areaData, weekAreaData] = await fetchWeeklyForecastAreaData();
  return buildWeeklyForecastRegionCatalog(areaData, weekAreaData);
}

async function fetchWeeklyForecastAreaData() {
  return Promise.all([
    fetchJson(JMA_ENDPOINTS.areaConst, {
      ttlMs: WEEKLY_AREA_TTL_MS,
      staleIfError: true
    }),
    fetchJson(JMA_ENDPOINTS.weeklyForecastAreaConst, {
      ttlMs: WEEKLY_AREA_TTL_MS,
      staleIfError: true
    })
  ]);
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

export function resolveWeeklyForecastTarget(areaData, weekAreaData, areaCode) {
  const areaPath = resolveJmaAreaPath(areaData, areaCode);
  const officeCode = areaPath.find((code) => areaData?.offices?.[code]) ?? "";
  if (!officeCode) throw new Error("現在地に対応する予報官署を特定できません。");

  const candidates = Array.isArray(weekAreaData?.[officeCode])
    ? weekAreaData[officeCode]
    : [];
  const mapped = candidates.find((entry) => areaPath.includes(String(entry?.srf ?? ""))
      && String(entry?.week ?? "") !== officeCode)
    ?? candidates.find((entry) => areaPath.includes(String(entry?.srf ?? "")))
    ?? candidates.find((entry) => String(entry?.week ?? "") === officeCode)
    ?? candidates[0];
  const weeklyAreaCode = String(mapped?.week ?? officeCode);
  const forecastAreaCode = String(mapped?.srf ?? weeklyAreaCode);

  return {
    officeCode,
    officeName: areaData?.offices?.[officeCode]?.name ?? "",
    areaCode: weeklyAreaCode,
    forecastAreaCode,
    areaName: findAreaEntry(areaData, forecastAreaCode)?.name
      ?? findAreaEntry(areaData, weeklyAreaCode)?.name
      ?? "",
    areaPath: [...new Set([
      weeklyAreaCode,
      forecastAreaCode,
      ...areaPath.filter((code) => code !== weeklyAreaCode)
    ])],
    stationCode: String(mapped?.amedas ?? "")
  };
}

export function buildWeeklyForecastRegionCatalog(areaData, weekAreaData) {
  return Object.entries(weekAreaData ?? {}).flatMap(([officeCode, mappings]) => {
    if (!areaData?.offices?.[officeCode] || !Array.isArray(mappings)) return [];
    const regions = [];
    const seen = new Set();

    const mappingsByForecastArea = new Map();
    mappings.forEach((mapping) => {
      const forecastAreaCode = String(mapping?.srf ?? "").trim();
      if (!/^\d{6}$/u.test(forecastAreaCode)) return;
      const candidates = mappingsByForecastArea.get(forecastAreaCode) ?? [];
      candidates.push(mapping);
      mappingsByForecastArea.set(forecastAreaCode, candidates);
    });

    mappingsByForecastArea.forEach((candidates, forecastAreaCode) => {
      if (seen.has(forecastAreaCode)) return;
      seen.add(forecastAreaCode);
      const mapping = candidates.find((entry) => String(entry?.week ?? "") === forecastAreaCode)
        ?? candidates[0];
      const areaCode = String(mapping?.week ?? forecastAreaCode).trim();
      const areaEntry = findAreaEntry(areaData, forecastAreaCode);
      regions.push({
        areaCode,
        forecastAreaCode,
        areaName: areaEntry?.name ?? areaData.offices[officeCode].name,
        stationCode: String(mapping?.amedas ?? "").trim()
      });
    });
    if (!regions.length) return [];

    return [{
      officeCode,
      officeName: areaData.offices[officeCode].name,
      centerCode: String(areaData.offices[officeCode].parent ?? ""),
      centerName: areaData?.centers?.[areaData.offices[officeCode].parent]?.name ?? "",
      regions
    }];
  });
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
  const areaSelection = chooseAreaSelection(
    areaInfos,
    context.areaPath,
    context.targetAreaName
  );
  if (!areaSelection) throw new Error("選択地域に対応する週間予報がありません。");

  const daysByRef = buildDayMap(areaSelection.series);
  applyAreaForecastValues(areaSelection.item, daysByRef);

  const pointSelection = choosePointSelection(
    pointInfos,
    context.stationCode,
    areaSelection.itemIndex
  );
  if (pointSelection) applyTemperatureValues(pointSelection.item, daysByRef);

  const area = areaSelection.target;
  const station = pointSelection?.target ?? null;
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

function chooseAreaSelection(infos, areaPath = [], targetAreaName = "") {
  const selections = buildSeriesItemSelections(infos, "Area");
  for (const areaCode of areaPath) {
    const match = selections.find((selection) => selection.target?.code === String(areaCode));
    if (match) return match;
  }
  const normalizedTargetName = normalizeAreaName(targetAreaName);
  if (normalizedTargetName) {
    const nameMatch = selections.find((selection) => {
      const candidateName = normalizeAreaName(selection.target?.name);
      return candidateName
        && (candidateName.includes(normalizedTargetName)
          || normalizedTargetName.includes(candidateName));
    });
    if (nameMatch) return nameMatch;
  }
  return selections[0] ?? null;
}

function normalizeAreaName(value) {
  return String(value ?? "")
    .replace(/[（）()・･\s]/gu, "")
    .replace(/地方$/u, "");
}

function choosePointSelection(infos, stationCode, preferredIndex = 0) {
  const selections = buildSeriesItemSelections(infos, "Station");
  if (stationCode) {
    const exact = selections.find((selection) => selection.target?.code === String(stationCode));
    if (exact) return exact;
  }
  const firstSeries = selections[0]?.series;
  return selections.find((selection) => selection.series === firstSeries
      && selection.itemIndex === preferredIndex)
    ?? selections[0]
    ?? null;
}

function buildSeriesItemSelections(infos, targetTagName) {
  return infos.flatMap((info) =>
    elementsByLocalName(info, "TimeSeriesInfo").flatMap((series) =>
      elementsByLocalName(series, "Item").map((item, itemIndex) => ({
        series,
        item,
        itemIndex,
        target: getForecastTarget(item, targetTagName)
      }))
    )
  );
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
