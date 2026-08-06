import { JMA_ENDPOINTS } from "../config.js";
import { fetchJson, fetchText, parseJmaTime } from "./jmaClient.js";
import {
  findLatestJmaForecastDetailUrl,
  isJmaForecastXml
} from "./vpfw50Feed.js";

const AREA_COLLECTIONS = ["class20s", "class15s", "class10s", "offices", "centers"];
const FORECAST_TTL_MS = 5 * 60 * 1000;
const WEEKLY_AREA_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MERGED_FORECAST_DAYS = 8;

export async function fetchWeeklyForecastForLocation(locationInfo) {
  const municipalityCode = String(locationInfo?.areaCode ?? "").trim();
  if (!municipalityCode) throw new Error("現在地の市区町村を特定できません。");

  const [areaData, weekAreaData] = await fetchWeeklyForecastAreaData();
  const target = resolveWeeklyForecastTarget(areaData, weekAreaData, municipalityCode);

  return fetchAndMergeForecasts(target.officeCode, {
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
  return fetchAndMergeForecasts(officeCode, {
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

async function fetchAndMergeForecasts(officeCode, context) {
  const [weeklyXml, shortTermXml] = await Promise.all([
    fetchLatestForecastXml(officeCode, "VPFW50"),
    fetchLatestForecastXml(officeCode, "VPFD51").catch((error) => {
      console.warn("[MeteoScope] latest VPFD51 unavailable; using VPFW50 only", error);
      return "";
    })
  ]);
  const weeklyForecast = parseWeeklyForecastXml(weeklyXml, context);
  if (!shortTermXml) return weeklyForecast;
  try {
    return mergeWeeklyForecastWithShortTerm(
      weeklyForecast,
      parseForecastXml(shortTermXml, context, "VPFD51")
    );
  } catch (error) {
    console.warn("[MeteoScope] latest VPFD51 could not be merged; using VPFW50 only", error);
    return weeklyForecast;
  }
}

async function fetchLatestForecastXml(officeCode, bulletinCode) {
  try {
    const query = new URLSearchParams({ officeCode, bulletinCode });
    return await fetchText(`${JMA_ENDPOINTS.weeklyForecastXml}?${query}`, {
      ttlMs: FORECAST_TTL_MS,
      timeoutMs: 15 * 1000,
      staleIfError: true,
      validate: isJmaForecastXml
    });
  } catch (apiError) {
    console.warn(`[MeteoScope] ${bulletinCode} API unavailable; using JMA XML feed`, apiError);
    for (const feedUrl of [JMA_ENDPOINTS.weatherXmlFeed, JMA_ENDPOINTS.weatherXmlLongFeed]) {
      try {
        const feed = await fetchText(feedUrl, {
          ttlMs: FORECAST_TTL_MS,
          timeoutMs: 20 * 1000,
          staleIfError: true
        });
        const detailUrl = findLatestJmaForecastDetailUrl(feed, officeCode, bulletinCode);
        if (detailUrl) {
          return fetchText(detailUrl, {
            ttlMs: FORECAST_TTL_MS,
            timeoutMs: 15 * 1000,
            staleIfError: true,
            validate: isJmaForecastXml
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
  const forecastAreaCode = areaPath.find((code) =>
    areaData?.class10s?.[code] || areaData?.class15s?.[code]
  ) ?? "";
  const officeWideMapping = candidates.find((entry) => String(entry?.week ?? "") === officeCode);
  const mapped = candidates.find((entry) => String(entry?.srf ?? "") === forecastAreaCode)
    ?? officeWideMapping
    ?? candidates.find((entry) => areaPath.includes(String(entry?.srf ?? "")))
    ?? candidates[0];
  const weeklyAreaCode = String(mapped?.week ?? officeCode);
  const resolvedForecastAreaCode = forecastAreaCode || String(mapped?.srf ?? weeklyAreaCode);

  return {
    officeCode,
    officeName: areaData?.offices?.[officeCode]?.name ?? "",
    areaCode: weeklyAreaCode,
    forecastAreaCode: resolvedForecastAreaCode,
    areaName: findAreaEntry(areaData, resolvedForecastAreaCode)?.name
      ?? findAreaEntry(areaData, weeklyAreaCode)?.name
      ?? "",
    areaPath: [...new Set([
      weeklyAreaCode,
      resolvedForecastAreaCode,
      ...areaPath.filter((code) => code !== weeklyAreaCode)
    ])],
    stationCode: String(mapped?.srf ?? "") === resolvedForecastAreaCode
      ? String(mapped?.amedas ?? "")
      : ""
  };
}

export function buildWeeklyForecastRegionCatalog(areaData, weekAreaData) {
  return Object.entries(weekAreaData ?? {}).flatMap(([officeCode, mappings]) => {
    if (!areaData?.offices?.[officeCode] || !Array.isArray(mappings)) return [];
    const regions = [];
    const seen = new Set();

    const forecastAreas = Object.entries(areaData?.class10s ?? {})
      .filter(([, entry]) => String(entry?.parent ?? "") === officeCode);
    mappings.forEach((mapping) => {
      const forecastAreaCode = String(mapping?.srf ?? "").trim();
      if (!forecastAreas.some(([code]) => code === forecastAreaCode)) {
        const areaEntry = findAreaEntry(areaData, forecastAreaCode);
        if (areaEntry) forecastAreas.push([forecastAreaCode, areaEntry]);
      }
    });
    const officeWideMapping = mappings.find((entry) => String(entry?.week ?? "") === officeCode);

    forecastAreas.forEach(([forecastAreaCode, forecastAreaEntry]) => {
      if (seen.has(forecastAreaCode)) return;
      seen.add(forecastAreaCode);
      const mapping = mappings.find((entry) => String(entry?.srf ?? "") === forecastAreaCode)
        ?? officeWideMapping
        ?? mappings[0];
      const areaCode = String(mapping?.week ?? forecastAreaCode).trim();
      regions.push({
        areaCode,
        forecastAreaCode,
        areaName: forecastAreaEntry?.name
          ?? areaData.offices[officeCode].name,
        stationCode: String(mapping?.srf ?? "") === forecastAreaCode
          ? String(mapping?.amedas ?? "").trim()
          : ""
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
  return parseForecastXml(xml, context, "VPFW50");
}

function parseForecastXml(xml, context = {}, bulletinCode = "VPFW50") {
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
  if (pointSelection) {
    applyTemperatureValues(pointSelection.series, pointSelection.item, daysByRef);
  }

  const area = areaSelection.target;
  const station = pointSelection?.target ?? null;
  const days = [...daysByRef.values()].sort((left, right) => left.date.localeCompare(right.date));
  const threeHourlyForecasts = buildThreeHourlyForecasts(
    areaInfos,
    pointInfos,
    context
  );

  return {
    source: "気象庁 防災情報XML",
    bulletinCode,
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
    days,
    threeHourlyForecasts
  };
}

export function mergeWeeklyForecastWithShortTerm(weeklyForecast, shortTermForecast) {
  if (!shortTermForecast?.days?.length) return weeklyForecast;
  const daysByDate = new Map(
    (weeklyForecast?.days ?? []).map((day) => [forecastDateKey(day.date), day])
  );
  shortTermForecast.days.forEach((shortTermDay) => {
    const dateKey = forecastDateKey(shortTermDay.date);
    const weeklyDay = daysByDate.get(dateKey);
    daysByDate.set(dateKey, weeklyDay ? {
      ...weeklyDay,
      weather: shortTermDay.weather || weeklyDay.weather,
      weatherCode: shortTermDay.weatherCode || weeklyDay.weatherCode,
      precipitationProbability: shortTermDay.precipitationProbability
        ?? weeklyDay.precipitationProbability,
      minTemperature: shortTermDay.minTemperature ?? weeklyDay.minTemperature,
      maxTemperature: shortTermDay.maxTemperature ?? weeklyDay.maxTemperature
    } : shortTermDay);
  });
  const mergedDays = [...daysByDate.values()]
    .sort((left, right) => forecastDateKey(left.date).localeCompare(forecastDateKey(right.date)))
    .slice(0, MAX_MERGED_FORECAST_DAYS);
  const shortTermIsNewer = forecastTimestamp(shortTermForecast.reportTime)
    > forecastTimestamp(weeklyForecast.reportTime);
  const latest = shortTermIsNewer ? shortTermForecast : weeklyForecast;

  return {
    ...weeklyForecast,
    areaCode: shortTermForecast.areaCode || weeklyForecast.areaCode,
    areaName: shortTermForecast.areaName || weeklyForecast.areaName,
    reportTime: latest.reportTime,
    reportTimeLabel: latest.reportTimeLabel,
    publishingOffice: latest.publishingOffice,
    bulletinCode: "VPFD51+VPFW50",
    bulletinCodes: ["VPFD51", "VPFW50"],
    days: mergedDays,
    threeHourlyForecasts: shortTermForecast.threeHourlyForecasts ?? []
  };
}

function buildThreeHourlyForecasts(areaInfos, pointInfos, context) {
  const weatherSelection = chooseAreaSelectionByProperty(
    areaInfos,
    context.areaPath,
    context.targetAreaName,
    "３時間内卓越天気"
  );
  if (!weatherSelection) return [];

  const slots = buildForecastSlots(weatherSelection.series);
  if (!slots.length) return [];
  const slotsByDateTime = new Map(slots.map((slot) => [slot.dateTime, slot]));
  applyTimedTextValues(weatherSelection.series, weatherSelection.item, slotsByDateTime, "Weather", "weather");
  applyTimedTextValues(weatherSelection.series, weatherSelection.item, slotsByDateTime, "WeatherCode", "weatherCode");
  applyTimedTextValues(weatherSelection.series, weatherSelection.item, slotsByDateTime, "WindDirection", "windDirection");
  applyTimedWindSpeedValues(weatherSelection.series, weatherSelection.item, slotsByDateTime);

  const temperatureSelection = choosePointSelectionByProperty(
    pointInfos,
    context.stationCode,
    "３時間毎気温"
  );
  if (temperatureSelection) {
    applyTimedNumberValues(
      temperatureSelection.series,
      temperatureSelection.item,
      slotsByDateTime,
      "Temperature",
      "temperature"
    );
  }

  const precipitationSelection = chooseAreaSelectionByProperty(
    areaInfos,
    context.areaPath,
    context.targetAreaName,
    "降水確率"
  );
  if (precipitationSelection) {
    applyPrecipitationIntervals(
      precipitationSelection.series,
      precipitationSelection.item,
      slots
    );
  }

  return slots.map((slot) => ({
    ...slot,
    areaCode: weatherSelection.target?.code ?? "",
    areaName: weatherSelection.target?.name ?? "",
    stationCode: temperatureSelection?.target?.code ?? "",
    stationName: temperatureSelection?.target?.name ?? ""
  }));
}

function buildForecastSlots(series) {
  return elementsByLocalName(series, "TimeDefine")
    .map((definition) => ({
      refId: definition.getAttribute("timeId") ?? "",
      dateTime: textOfFirst(definition, "DateTime"),
      duration: textOfFirst(definition, "Duration"),
      weather: "",
      weatherCode: "",
      temperature: null,
      windDirection: "",
      windSpeedRange: "",
      windSpeedDescription: "",
      precipitationProbability: null
    }))
    .filter((slot) => slot.refId && slot.dateTime)
    .sort((left, right) => left.dateTime.localeCompare(right.dateTime));
}

function chooseAreaSelectionByProperty(infos, areaPath, targetAreaName, propertyType) {
  const selections = buildSeriesItemSelections(infos, "Area")
    .filter((selection) => itemHasPropertyType(selection.item, propertyType));
  return chooseSelectionByArea(selections, areaPath, targetAreaName);
}

function choosePointSelectionByProperty(infos, stationCode, propertyType) {
  const selections = buildSeriesItemSelections(infos, "Station")
    .filter((selection) => itemHasPropertyType(selection.item, propertyType));
  if (stationCode) {
    const exact = selections.find(
      (selection) => selection.target?.code === String(stationCode)
    );
    if (exact) return exact;
  }
  return selections[0] ?? null;
}

function itemHasPropertyType(item, propertyType) {
  return elementsByLocalName(item, "Property").some(
    (property) => textOfFirst(property, "Type") === propertyType
  );
}

function applyTimedTextValues(series, item, slotsByDateTime, tagName, key) {
  const dateTimeByRef = buildDateTimeByRef(series);
  elementsByLocalName(item, tagName).forEach((node) => {
    const slot = slotsByDateTime.get(dateTimeByRef.get(node.getAttribute("refID") ?? ""));
    if (slot) slot[key] = node.textContent?.trim() ?? "";
  });
}

function applyTimedNumberValues(series, item, slotsByDateTime, tagName, key) {
  const dateTimeByRef = buildDateTimeByRef(series);
  elementsByLocalName(item, tagName).forEach((node) => {
    const slot = slotsByDateTime.get(dateTimeByRef.get(node.getAttribute("refID") ?? ""));
    if (slot) slot[key] = numberOrNull(node.textContent);
  });
}

function applyTimedWindSpeedValues(series, item, slotsByDateTime) {
  const dateTimeByRef = buildDateTimeByRef(series);
  elementsByLocalName(item, "WindSpeedLevel").forEach((node) => {
    const slot = slotsByDateTime.get(dateTimeByRef.get(node.getAttribute("refID") ?? ""));
    if (!slot) return;
    slot.windSpeedRange = node.getAttribute("range") ?? "";
    slot.windSpeedDescription = node.getAttribute("description") ?? "";
  });
}

function applyPrecipitationIntervals(series, item, slots) {
  const definitions = new Map(
    elementsByLocalName(series, "TimeDefine").map((definition) => [
      definition.getAttribute("timeId") ?? "",
      {
        dateTime: textOfFirst(definition, "DateTime"),
        duration: textOfFirst(definition, "Duration")
      }
    ])
  );
  elementsByLocalName(item, "ProbabilityOfPrecipitation").forEach((node) => {
    const definition = definitions.get(node.getAttribute("refID") ?? "");
    const start = Date.parse(definition?.dateTime ?? "");
    const durationMs = parseIsoDurationMs(definition?.duration);
    const value = numberOrNull(node.textContent);
    if (!Number.isFinite(start) || !durationMs || value === null) return;
    slots.forEach((slot) => {
      const slotTime = Date.parse(slot.dateTime);
      if (slotTime >= start && slotTime < start + durationMs) {
        slot.precipitationProbability = value;
      }
    });
  });
}

function buildDateTimeByRef(series) {
  return new Map(
    elementsByLocalName(series, "TimeDefine").map((definition) => [
      definition.getAttribute("timeId") ?? "",
      textOfFirst(definition, "DateTime")
    ])
  );
}

function parseIsoDurationMs(value) {
  const match = String(value ?? "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/u);
  if (!match) return 0;
  return ((Number(match[1]) || 0) * 60 + (Number(match[2]) || 0)) * 60 * 1000;
}

function forecastDateKey(value) {
  return String(value ?? "").slice(0, 10);
}

function forecastTimestamp(value) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function findAreaEntry(areaData, areaCode) {
  for (const collection of AREA_COLLECTIONS) {
    if (areaData?.[collection]?.[areaCode]) return areaData[collection][areaCode];
  }
  return null;
}

function chooseAreaSelection(infos, areaPath = [], targetAreaName = "") {
  const selections = buildSeriesItemSelections(infos, "Area");
  return chooseSelectionByArea(selections, areaPath, targetAreaName);
}

function chooseSelectionByArea(selections, areaPath = [], targetAreaName = "") {
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
    const exactMatches = selections.filter(
      (selection) => selection.target?.code === String(stationCode)
    );
    const exact = exactMatches.find((selection) => hasDailyTemperatureValues(selection.item))
      ?? exactMatches[0];
    if (exact) return exact;
  }
  const firstSeries = selections[0]?.series;
  return selections.find((selection) => hasDailyTemperatureValues(selection.item))
    ?? selections.find((selection) => selection.series === firstSeries
      && selection.itemIndex === preferredIndex)
    ?? selections[0]
    ?? null;
}

function hasDailyTemperatureValues(item) {
  return elementsByLocalName(item, "Temperature").some((node) =>
    Boolean(dailyTemperatureKey(node.getAttribute("type")))
  );
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

function applyTemperatureValues(series, item, days) {
  const dateKeyByRef = new Map(
    elementsByLocalName(series, "TimeDefine").map((definition) => [
      definition.getAttribute("timeId") ?? "",
      forecastDateKey(textOfFirst(definition, "DateTime"))
    ])
  );
  const daysByDate = new Map(
    [...days.values()].map((day) => [forecastDateKey(day.date), day])
  );

  elementsByLocalName(item, "Temperature").forEach((node) => {
    const key = dailyTemperatureKey(node.getAttribute("type"));
    const dateKey = dateKeyByRef.get(node.getAttribute("refID") ?? "");
    const day = daysByDate.get(dateKey);
    if (key && day) day[key] = numberOrNull(node.textContent);
  });
}

function dailyTemperatureKey(type) {
  return {
    "最低気温": "minTemperature",
    "朝の最低気温": "minTemperature",
    "最低気温予測範囲（下端）": "minTemperatureLower",
    "最低気温予測範囲（上端）": "minTemperatureUpper",
    "最高気温": "maxTemperature",
    "日中の最高気温": "maxTemperature",
    "最高気温予測範囲（下端）": "maxTemperatureLower",
    "最高気温予測範囲（上端）": "maxTemperatureUpper"
  }[String(type ?? "")] ?? "";
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
