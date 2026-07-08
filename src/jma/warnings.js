import { JMA_ENDPOINTS, JMA_WARNING_OFFICE_CODES, STATIC_DATA_CACHE_TTL_MS } from "../config.js";
import { fetchJson, parseJmaTime } from "./jmaClient.js";
import {
  PREFECTURE_NAMES,
  applyWarningKinds,
  getPrefectureNameByCode,
  highestSeverityLevel,
  severityRank,
  shouldShowWarningLevel,
  severityValue
} from "./warningCore.js";

const EARLY_WARNING_WIND_ONLY_CLASS10_CODES = new Set([
  "130020", "130030", "130040",
  "460040",
  "471010", "471020", "471030", "472000", "473000", "474010", "474020"
]);

export { getPrefectureNameByCode } from "./warningCore.js";

export async function fetchWarningMap(options = {}) {
  const includeDetails = Boolean(options.includeDetails);
  const [warningReports, municipalityGeoJson] = await Promise.all([
    fetchWarningReports(),
    fetchJson(JMA_ENDPOINTS.warningMunicipalities, { ttlMs: STATIC_DATA_CACHE_TTL_MS, cache: "force-cache" })
  ]);
  const municipalityIndex = buildMunicipalityIndex(municipalityGeoJson);
  let outlookByAreaCode = new Map();
  let earlyWarnings = buildEmptyEarlyWarningData();

  if (includeDetails) {
    const [warningTimelineReports, areaConst, earlyWarningReports, noWaveTideConst] = await Promise.all([
      fetchWarningTimelineReports(),
      fetchJson(JMA_ENDPOINTS.areaConst, { ttlMs: STATIC_DATA_CACHE_TTL_MS, cache: "force-cache" }),
      fetchEarlyWarningReports(),
      fetchNoWaveTideConst()
    ]);
    const areaHierarchy = buildAreaHierarchy(areaConst, municipalityIndex);
    const noWaveTideIndex = buildNoWaveTideIndex(noWaveTideConst);
    outlookByAreaCode = buildWarningOutlookMap(warningTimelineReports, municipalityIndex);
    earlyWarnings = buildEarlyWarningData(earlyWarningReports, municipalityIndex, areaHierarchy, noWaveTideIndex);
  }

  const areaMap = buildWarningAreaMap(warningReports, municipalityIndex, outlookByAreaCode);
  const activeAreas = [...areaMap.values()];
  const groups = buildWarningGroups(activeAreas);
  const latestReportTime = getLatestReportTime(warningReports);

  return {
    raw: warningReports,
    groups,
    activeAreas,
    earlyWarnings,
    earlyAreas: earlyWarnings.areas,
    earlyMunicipalityAreas: earlyWarnings.municipalityAreas,
    summary: `発表中 ${activeAreas.length} 市区町村`,
    latestTime: parseJmaTime(latestReportTime) ?? latestReportTime,
    updatedAt: parseJmaTime(latestReportTime) ?? "取得済み",
    detailsLoaded: includeDetails
  };
}

export async function fetchWarningDetails() {
  return fetchWarningMap({ includeDetails: true });
}

async function fetchWarningReports() {
  const reportsByOffice = await Promise.all(
    JMA_WARNING_OFFICE_CODES.map(async (officeCode) => {
      try {
        const reports = await fetchJson(`${JMA_ENDPOINTS.warningsBase}/${officeCode}.json`);
        return Array.isArray(reports) ? reports : [];
      } catch (error) {
        console.warn(`[MeteoScope] warning JSON unavailable: ${officeCode}`, error);
        return [];
      }
    })
  );
  return reportsByOffice.flat();
}

async function fetchWarningTimelineReports() {
  const reportsByOffice = await Promise.all(
    JMA_WARNING_OFFICE_CODES.map(async (officeCode) => {
      try {
        return await fetchJson(`${JMA_ENDPOINTS.warningTimelineBase}/${officeCode}.json`);
      } catch (error) {
        console.warn(`[MeteoScope] warning timeline JSON unavailable: ${officeCode}`, error);
        return null;
      }
    })
  );
  return reportsByOffice.filter(Boolean);
}

async function fetchEarlyWarningReports() {
  try {
    const reports = await fetchJson(JMA_ENDPOINTS.probabilityMap);
    return Array.isArray(reports) ? reports : [];
  } catch (error) {
    console.warn("[MeteoScope] early warning probability JSON unavailable", error);
    return [];
  }
}

async function fetchNoWaveTideConst() {
  try {
    return await fetchJson(JMA_ENDPOINTS.noWaveTide, { ttlMs: STATIC_DATA_CACHE_TTL_MS, cache: "force-cache" });
  } catch (error) {
    console.warn("[MeteoScope] no-wave/tide JSON unavailable", error);
    return {};
  }
}

function buildEmptyEarlyWarningData() {
  return {
    raw: [],
    groups: [],
    areas: [],
    municipalityAreas: [],
    latestTime: "",
    updatedAt: "未取得"
  };
}

function buildWarningAreaMap(warningReports, municipalityIndex, outlookByAreaCode = new Map()) {
  const reports = Array.isArray(warningReports)
    ? [...warningReports].sort((a, b) => new Date(a.reportDatetime).getTime() - new Date(b.reportDatetime).getTime())
    : [];
  const areasByCode = new Map();

  reports.forEach((report) => {
    const areas = getMunicipalityAreas(report);
    areas.forEach((area) => {
      const areaCode = String(area.code ?? area.areaCode ?? "");
      if (!areaCode) return;
      expandToMunicipalityCodes(areaCode, municipalityIndex).forEach((resolvedArea) => {
        const resolvedCode = resolvedArea.code;
        const current = areasByCode.get(resolvedCode) ?? {
          areaCode: resolvedCode,
          areaName: resolvedArea.name ?? area.name ?? `エリア ${resolvedCode}`,
          prefectureCode: resolvedCode.slice(0, 2),
          prefecture: getPrefectureNameByCode(resolvedCode),
          updatedAt: report.reportDatetime,
          warnings: [],
          outlook: outlookByAreaCode.get(resolvedCode) ?? []
        };

        current.warnings = applyWarningKinds(current.warnings, area.warnings ?? area.kinds, report.reportDatetime);
        current.updatedAt = chooseLatestTime(current.updatedAt, report.reportDatetime);
        current.level = highestSeverityLevel(current.warnings);
        if (current.warnings.length > 0) {
          areasByCode.set(resolvedCode, current);
        } else {
          areasByCode.delete(resolvedCode);
        }
      });
    });
  });

  return areasByCode;
}

function buildWarningOutlookMap(timelineReports, municipalityIndex) {
  const outlookByAreaCode = new Map();

  (timelineReports ?? []).forEach((report) => {
    (report.timeSeries ?? []).forEach((series) => {
      const timeDefines = series.timeDefines ?? [];
      ["class20Items", "class10Items"].forEach((bucketName) => {
        (series[bucketName] ?? []).forEach((item) => {
          const rows = buildWarningOutlookRows(item.kinds ?? [], timeDefines);
          if (rows.length === 0) return;

          expandToMunicipalityCodes(String(item.areaCode ?? ""), municipalityIndex).forEach((resolvedArea) => {
            const areaCode = resolvedArea.code;
            const currentRows = outlookByAreaCode.get(areaCode) ?? [];
            outlookByAreaCode.set(areaCode, mergeOutlookRows(currentRows, rows));
          });
        });
      });
    });
  });

  return outlookByAreaCode;
}

function buildWarningOutlookRows(kinds = [], timeDefines = []) {
  const rows = [];

  kinds.forEach((kind) => {
    (kind.significancyParts ?? []).forEach((part) => {
      const partType = String(part?.type ?? "");
      if (!partType.includes("危険度")) return;
      rows.push(...buildOutlookPartRows(part, timeDefines, "code", shouldShowWarningLevel(partType)));
    });
  });

  return rows.filter((row) => row.slots.some((slot) => slot.level >= 2));
}

function buildOutlookPartRows(part, timeDefines, valueType, showLevelLabel = false) {
  if (!Array.isArray(part?.locals)) return [];

  return part.locals.flatMap((local) => {
    const values = valueType === "code" ? local.codes : local.values;
    if (!Array.isArray(values)) return [];
    const slots = timeDefines.map((timeDefine, index) => buildOutlookSlot(timeDefine, values[index], valueType, showLevelLabel));
    if (!slots.some((slot) => slot.level >= 2 || slot.label)) return [];

    return [{
      type: normalizeOutlookType(part.type),
      localName: local.areaName ?? "",
      slots
    }];
  });
}

function buildOutlookSlot(timeDefine, value, valueType, showLevelLabel = false) {
  if (valueType !== "code") {
    const text = value?.value ?? value ?? "";
    return {
      time: timeDefine?.dateTime ?? "",
      duration: timeDefine?.duration ?? "",
      label: text ? String(text) : "",
      level: 0
    };
  }

  const code = String(value ?? "");
  const level = warningOutlookLevel(code);
  return {
    time: timeDefine?.dateTime ?? "",
    duration: timeDefine?.duration ?? "",
    code,
    label: showLevelLabel ? warningOutlookLabel(code) : "",
    level
  };
}

function normalizeOutlookType(type) {
  return normalizeWeatherHazardType(type);
}

function warningOutlookLevel(code) {
  if (code === "51" || code === "50") return 5;
  if (code === "41") return 4;
  if (code === "31" || code === "30") return 3;
  if (code === "22" || code === "21" || code === "20") return 2;
  return 0;
}

function warningOutlookLabel(code) {
  const level = warningOutlookLevel(code);
  return level > 0 ? `レベル${level}` : "";
}

function mergeOutlookRows(currentRows, nextRows) {
  const rowsByKey = new Map(currentRows.map((row) => [outlookRowKey(row), row]));
  nextRows.forEach((row) => {
    if (!rowsByKey.has(outlookRowKey(row))) rowsByKey.set(outlookRowKey(row), row);
  });
  return [...rowsByKey.values()].slice(0, 10);
}

function outlookRowKey(row) {
  return `${row.type}|${row.localName}|${row.slots.map((slot) => `${slot.time}:${slot.code ?? slot.label}`).join(",")}`;
}

function buildMunicipalityIndex(geoJson) {
  const features = Array.isArray(geoJson?.features) ? geoJson.features : [];
  const byCode = new Map();
  const byParentCode = new Map();

  features.forEach((feature) => {
    const code = String(feature?.properties?.code ?? "");
    if (!code) return;

    const area = {
      code,
      name: feature.properties?.name ?? feature.properties?.regionName ?? ""
    };
    byCode.set(code, area);

    const parentCode = `${code.slice(0, 5)}00`;
    if (parentCode !== code) {
      if (!byParentCode.has(parentCode)) byParentCode.set(parentCode, []);
      byParentCode.get(parentCode).push(area);
    }
  });

  return { byCode, byParentCode };
}

function buildAreaHierarchy(areaConst, municipalityIndex) {
  const nodes = new Map();
  ["offices", "class10s", "class15s", "class20s"].forEach((bucketName) => {
    const bucket = areaConst?.[bucketName] ?? {};
    Object.entries(bucket).forEach(([code, value]) => {
      const normalizedCode = String(code);
      const current = nodes.get(normalizedCode) ?? {
        code: normalizedCode,
        name: "",
        parent: "",
        children: new Set(),
        buckets: new Set()
      };
      current.name = current.name || value?.name || "";
      current.parent = current.parent || String(value?.parent ?? "");
      current.buckets.add(bucketName);
      (value?.children ?? []).forEach((childCode) => current.children.add(String(childCode)));
      nodes.set(normalizedCode, current);
    });
  });

  function collectMunicipalityCodes(areaCode) {
    const result = new Set();
    const visited = new Set();

    function walk(code) {
      const normalizedCode = String(code ?? "");
      if (!normalizedCode || visited.has(normalizedCode)) return;
      visited.add(normalizedCode);

      if (municipalityIndex.byCode.has(normalizedCode)) {
        result.add(normalizedCode);
        return;
      }

      const children = nodes.get(normalizedCode)?.children ?? [];
      [...children].forEach(walk);
    }

    walk(areaCode);
    return [...result];
  }

  function getAreaName(areaCode) {
    const code = String(areaCode ?? "");
    return nodes.get(code)?.name
      ?? municipalityIndex.byCode.get(code)?.name
      ?? "";
  }

  function getDisplayAreaCodes(areaCode) {
    const normalizedCode = String(areaCode ?? "");
    const class10Children = [...(nodes.get(normalizedCode)?.children ?? [])]
      .map((code) => String(code))
      .filter((code) => code !== normalizedCode && nodes.get(code)?.buckets?.has("class10s"))
      .filter((code) => collectMunicipalityCodes(code).length > 0);
    return class10Children.length > 0 ? class10Children : [normalizedCode];
  }

  return { collectMunicipalityCodes, getAreaName, getDisplayAreaCodes };
}

function buildNoWaveTideIndex(noWaveTideConst = {}) {
  return {
    wave: buildNoWaveTideCodeSet(noWaveTideConst.wave),
    tide: buildNoWaveTideCodeSet(noWaveTideConst.tide)
  };
}

function buildNoWaveTideCodeSet(entry = {}) {
  const codes = new Set();
  (entry.class10s ?? []).forEach((code) => codes.add(String(code)));
  (entry.class15s ?? []).forEach((code) => codes.add(String(code)));
  Object.values(entry.class20s ?? {}).flat().forEach((code) => codes.add(String(code)));
  return codes;
}

function expandToMunicipalityCodes(areaCode, municipalityIndex) {
  const direct = municipalityIndex.byCode.get(areaCode);
  if (direct) return [direct];
  return municipalityIndex.byParentCode.get(areaCode) ?? [{ code: areaCode, name: "" }];
}

function buildEarlyWarningData(probabilityReports, municipalityIndex, areaHierarchy, noWaveTideIndex = {}) {
  const areasByCode = new Map();
  const reports = flattenProbabilityReports(probabilityReports)
    .sort((a, b) => new Date(a.reportDatetime).getTime() - new Date(b.reportDatetime).getTime());

  reports.forEach((report) => {
    (report.timeSeries ?? []).forEach((series) => {
      const slots = buildEarlyWarningSlots(series.timeDefines ?? []);
      (series.areas ?? []).forEach((area) => {
        const areaCode = String(area.code ?? "");
        if (!areaCode) return;

        const rows = buildEarlyWarningRows(area.properties ?? [], slots);
        if (rows.length === 0) return;

        areaHierarchy.getDisplayAreaCodes(areaCode).forEach((displayAreaCode) => {
          const municipalityCodes = areaHierarchy.collectMunicipalityCodes(displayAreaCode);
          if (municipalityCodes.length === 0) return;
          const rowsForArea = filterEarlyWarningRowsForArea(rows, displayAreaCode, noWaveTideIndex);
          if (rowsForArea.length === 0) return;

          const current = areasByCode.get(displayAreaCode) ?? {
            kind: "early",
            areaCode: displayAreaCode,
            sourceAreaCodes: [],
            areaName: areaHierarchy.getAreaName(displayAreaCode) || `エリア ${displayAreaCode}`,
            prefectureCode: displayAreaCode.slice(0, 2),
            prefecture: getPrefectureNameByCode(displayAreaCode),
            updatedAt: report.reportDatetime,
            level: "none",
            probabilities: [],
            rows: [],
            municipalityCodes: []
          };

          current.sourceAreaCodes = [...new Set([...current.sourceAreaCodes, areaCode])];
          current.updatedAt = chooseLatestTime(current.updatedAt, report.reportDatetime);
          current.rows = mergeEarlyWarningRows(current.rows, rowsForArea);
          current.probabilities = buildEarlyWarningSummary(current.rows);
          current.level = highestEarlyWarningLevel(current.probabilities);
          current.municipalityCodes = [...new Set([...current.municipalityCodes, ...municipalityCodes])];
          areasByCode.set(displayAreaCode, current);
        });
      });
    });
  });

  const areas = [...areasByCode.values()]
    .sort((a, b) =>
      earlySeverityValue(b.level) - earlySeverityValue(a.level) ||
      String(a.areaCode).localeCompare(String(b.areaCode), "ja")
    );
  const municipalityAreas = buildEarlyMunicipalityAreas(areas, municipalityIndex);
  const groups = buildEarlyWarningGroups(areas);
  const latestRawTime = reports.reduce((latest, report) => chooseLatestTime(latest, report.reportDatetime), "");
  const latestTime = parseJmaTime(latestRawTime) ?? latestRawTime;

  return {
    raw: probabilityReports,
    groups,
    areas,
    municipalityAreas,
    latestTime,
    updatedAt: latestTime || "未取得"
  };
}

function filterEarlyWarningRowsForArea(rows, areaCode, noWaveTideIndex = {}) {
  const code = String(areaCode ?? "");
  return rows.flatMap((row) => {
    if (row.type === "波浪" && noWaveTideIndex.wave?.has(code)) return [];
    if (row.type === "高潮" && noWaveTideIndex.tide?.has(code)) return [];
    if (!hasApplicableEarlyWarningSlots(row)) return [];

    if (row.type === "暴風(雪)" && EARLY_WARNING_WIND_ONLY_CLASS10_CODES.has(code)) {
      return [{ ...row, type: "暴風" }];
    }
    return [row];
  });
}

function hasApplicableEarlyWarningSlots(row) {
  return (row.slots ?? []).some((slot) => slot.available !== false);
}

function flattenProbabilityReports(probabilityReports) {
  return (probabilityReports ?? [])
    .flatMap((entry) => Array.isArray(entry) ? entry : [entry])
    .filter((report) => report?.reportDatetime && Array.isArray(report?.timeSeries));
}

function buildEarlyWarningRows(properties = [], slots = []) {
  return properties.flatMap((property) => {
    const type = normalizeEarlyWarningType(property?.type);
    if (!type) return [];

    const values = Array.isArray(property?.probabilities) ? property.probabilities : [];
    const rowSlots = slots.map((slot, index) => {
      const rawLabel = String(values[index] ?? "").trim();
      const label = normalizeEarlyProbability(rawLabel);
      return {
        ...slot,
        rawLabel,
        available: rawLabel !== "なし",
        label,
        level: earlyProbabilityLevel(label)
      };
    });

    return [{
      type,
      localName: "",
      slots: rowSlots
    }];
  });
}

function buildEarlyWarningSlots(timeDefines = []) {
  const dates = timeDefines.map((value) => new Date(value));
  return timeDefines.map((value, index) => {
    const start = dates[index];
    const next = dates[index + 1];
    const durationHours = Number.isFinite(next?.getTime?.())
      ? Math.max(1, Math.round((next.getTime() - start.getTime()) / (60 * 60 * 1000)))
      : fallbackEarlySlotDuration(start);
    return {
      time: value,
      duration: `PT${durationHours}H`,
      displayLabel: formatEarlySlotLabel(start, durationHours),
      isDaily: isEarlyDailySlot(start, durationHours)
    };
  });
}

function fallbackEarlySlotDuration(start) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return 24;
  const startHour = Number(getJstDatePart(start, "hour"));
  return startHour > 0 ? Math.max(1, 24 - startHour) : 24;
}

function formatEarlySlotLabel(start, durationHours) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return "--";
  const day = getJstDatePart(start, "day");
  if (durationHours >= 23) return `${Number(day)}日`;

  const startHour = Number(getJstDatePart(start, "hour"));
  const endHourValue = startHour + durationHours;
  const endHour = endHourValue >= 24 ? 24 : endHourValue;
  return `${Number(day)}日 ${String(startHour).padStart(2, "0")}-${String(endHour).padStart(2, "0")}`;
}

function isEarlyDailySlot(start, durationHours) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return false;
  return Number(getJstDatePart(start, "hour")) === 0 && durationHours >= 23;
}

function getJstDatePart(date, type) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Tokyo"
  }).formatToParts(date);
  return parts.find((part) => part.type === type)?.value ?? "00";
}

function normalizeEarlyWarningType(type) {
  return normalizeWeatherHazardType(type);
}

function normalizeWeatherHazardType(type) {
  const text = String(type ?? "");
  if (!text) return "";
  if (text.includes("土砂災害")) return "土砂災害";
  if (text.includes("河川氾濫")) return "河川氾濫";
  if (text.includes("洪水")) return "洪水";
  if (text.includes("大雨") || text.includes("雨の")) return "大雨";
  if (text.includes("風（風雪）") || text.includes("風(風雪)")) return "暴風(雪)";
  if (text.includes("暴風雪") || text.includes("風雪")) return "暴風雪";
  if (text.includes("暴風") || text.includes("強風") || text.includes("風")) return "暴風";
  if (text.includes("大雪") || text.includes("雪")) return "大雪";
  if (text.includes("波浪") || text.includes("波")) return "波浪";
  if (text.includes("高潮") || text.includes("潮")) return "高潮";
  return text
    .replace("危険度", "")
    .replace("の警報級の可能性", "")
    .trim();
}

function normalizeEarlyProbability(value) {
  const text = String(value ?? "").trim();
  if (text === "高" || text === "中") return text;
  return "";
}

function earlyProbabilityLevel(label) {
  if (label === "高") return "high";
  if (label === "中") return "middle";
  return "none";
}

function mergeEarlyWarningRows(currentRows, nextRows) {
  const rowsByType = new Map(currentRows.map((row) => [row.type, { ...row, slots: [...row.slots] }]));

  nextRows.forEach((row) => {
    const current = rowsByType.get(row.type);
    if (!current) {
      rowsByType.set(row.type, { ...row, slots: [...row.slots] });
      return;
    }

    const slotsByKey = new Map(current.slots.map((slot) => [earlySlotKey(slot), slot]));
    row.slots.forEach((slot) => {
      const key = earlySlotKey(slot);
      const previous = slotsByKey.get(key);
      slotsByKey.set(key, chooseEarlyWarningSlot(previous, slot));
    });
    current.slots = [...slotsByKey.values()].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  });

  return normalizeEarlyWarningRows([...rowsByType.values()])
    .sort((a, b) => earlyWarningTypeOrder(a.type) - earlyWarningTypeOrder(b.type));
}

function earlySlotKey(slot) {
  return `${slot.time}|${slot.duration}`;
}

function chooseEarlyWarningSlot(previous, next) {
  if (!previous) return next;
  if (previous.available === false && next.available !== false) return next;
  if (earlySeverityValue(next.level) > earlySeverityValue(previous.level)) return next;
  return previous;
}

function normalizeEarlyWarningRows(rows) {
  const normalizedRows = rows.map((row) => ({ ...row, slots: [...(row.slots ?? [])] }));
  const coveredPartialDays = new Set();

  normalizedRows.forEach((row) => {
    row.slots.forEach((slot) => {
      if (!slot.isDaily) coveredPartialDays.add(earlySlotDateKey(slot));
    });
  });

  normalizedRows.forEach((row) => {
    row.slots = row.slots.filter((slot) => !slot.isDaily || !coveredPartialDays.has(earlySlotDateKey(slot)));
  });

  syncDailyRainAndLandslideRows(normalizedRows);

  return normalizedRows.filter(hasApplicableEarlyWarningSlots);
}

function syncDailyRainAndLandslideRows(rows) {
  const rainRow = rows.find((row) => row.type === "大雨");
  const landslideRow = rows.find((row) => row.type === "土砂災害");
  if (!rainRow || !landslideRow) return;
  if (!hasApplicableEarlyWarningSlots(rainRow) || !hasApplicableEarlyWarningSlots(landslideRow)) return;

  const dailySlotsByKey = new Map();
  [rainRow, landslideRow].forEach((row) => {
    row.slots.forEach((slot) => {
      if (!slot.isDaily || slot.available === false) return;
      const key = earlySlotKey(slot);
      dailySlotsByKey.set(key, chooseEarlyWarningSlot(dailySlotsByKey.get(key), slot));
    });
  });

  if (dailySlotsByKey.size === 0) return;

  [rainRow, landslideRow].forEach((row) => {
    const slotsByKey = new Map(row.slots.map((slot) => [earlySlotKey(slot), slot]));
    dailySlotsByKey.forEach((slot, key) => {
      slotsByKey.set(key, chooseEarlyWarningSlot(slotsByKey.get(key), { ...slot }));
    });
    row.slots = [...slotsByKey.values()].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  });
}

function earlySlotDateKey(slot) {
  const date = new Date(slot?.time ?? "");
  if (Number.isNaN(date.getTime())) return String(slot?.time ?? "");
  const parts = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo"
  }).formatToParts(date);
  const getPart = (type) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
}

function buildEarlyWarningSummary(rows) {
  const activeSummaries = rows
    .map((row) => {
      const level = highestEarlyWarningLevel(row.slots);
      if (level === "none") return null;
      return {
        type: row.type,
        label: row.slots.some((slot) => slot.level === "high") ? "高" : "中",
        level
      };
    })
    .filter(Boolean)
    .sort((a, b) =>
      earlySeverityValue(b.level) - earlySeverityValue(a.level) ||
      earlyWarningTypeOrder(a.type) - earlyWarningTypeOrder(b.type)
    );
  return activeSummaries.length > 0
    ? activeSummaries
    : [{ type: "今後の情報等に留意", label: "", level: "none" }];
}

function highestEarlyWarningLevel(items = []) {
  return items.reduce((current, item) =>
    earlySeverityValue(item.level) > earlySeverityValue(current) ? item.level : current
  , "none");
}

function earlySeverityValue(level) {
  if (level === "high") return 2;
  if (level === "middle") return 1;
  return 0;
}

function earlyWarningTypeOrder(type) {
  return ["大雨", "土砂災害", "大雪", "暴風(雪)", "暴風雪", "暴風", "波浪", "高潮"].indexOf(type) + 1 || 99;
}

function buildEarlyMunicipalityAreas(areas, municipalityIndex) {
  const municipalityAreasByCode = new Map();

  areas.forEach((area) => {
    area.municipalityCodes.forEach((municipalityCode) => {
      const previous = municipalityAreasByCode.get(municipalityCode);
      if (previous && earlySeverityValue(previous.level) >= earlySeverityValue(area.level)) return;
      municipalityAreasByCode.set(municipalityCode, {
        ...area,
        areaCode: municipalityCode,
        areaName: municipalityIndex.byCode.get(municipalityCode)?.name ?? area.areaName,
        displayAreaCode: area.areaCode,
        displayAreaName: area.areaName
      });
    });
  });

  return [...municipalityAreasByCode.values()];
}

function buildEarlyWarningGroups(areas) {
  const grouped = new Map();

  areas.forEach((area) => {
    if (!grouped.has(area.prefecture)) grouped.set(area.prefecture, []);
    grouped.get(area.prefecture).push(area);
  });

  return [...grouped.entries()]
    .map(([prefecture, areasInGroup]) => ({
      prefecture,
      level: highestEarlyWarningLevel(areasInGroup),
      count: areasInGroup.length,
      areas: areasInGroup
    }))
    .sort((a, b) =>
      earlySeverityValue(b.level) - earlySeverityValue(a.level) ||
      prefectureOrder(a.prefecture) - prefectureOrder(b.prefecture)
    );
}

function buildWarningGroups(activeAreas) {
  const grouped = new Map();

  activeAreas.forEach((area) => {
    if (!grouped.has(area.prefecture)) grouped.set(area.prefecture, []);
    grouped.get(area.prefecture).push(area);
  });

  return [...grouped.entries()]
    .map(([prefecture, areas]) => ({
      prefecture,
      level: highestSeverityLevel(areas.flatMap((area) => area.warnings)),
      count: areas.length,
      areas: areas
        .sort((a, b) =>
          severityRank(b.warnings) - severityRank(a.warnings) ||
          String(a.areaCode).localeCompare(String(b.areaCode), "ja")
        )
    }))
    .sort((a, b) =>
      severityValue(b.level) - severityValue(a.level) ||
      prefectureOrder(a.prefecture) - prefectureOrder(b.prefecture)
    );
}

function getMunicipalityAreas(report) {
  if (Array.isArray(report.items)) {
    return report.items.map((item) => ({
      code: item.code,
      name: item.name,
      warnings: item.warnings ?? []
    }));
  }

  if (Array.isArray(report.warning?.class20Items)) {
    return report.warning.class20Items.map((item) => ({
      code: item.areaCode,
      warnings: item.kinds ?? []
    }));
  }

  return report.areaTypes?.[1]?.areas ?? [];
}

function getLatestReportTime(warningReports) {
  const reports = Array.isArray(warningReports) ? warningReports : [];
  return reports.reduce((latest, report) => chooseLatestTime(latest, report.reportDatetime), "");
}

function chooseLatestTime(current, next) {
  if (!current) return next ?? "";
  if (!next) return current;
  return new Date(next).getTime() > new Date(current).getTime() ? next : current;
}

function prefectureOrder(prefecture) {
  const entry = Object.entries(PREFECTURE_NAMES).find(([, name]) => name === prefecture);
  return entry ? Number(entry[0]) : 99;
}

