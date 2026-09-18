import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import AdmZip from "adm-zip";
import { normalizeHistoricalEpicenterName } from "../src/jma/historicalEpicenterNames.js";

const ARCHIVE_BASE_URL = "https://www.data.jma.go.jp/eqev/data/bulletin/data/hypo";
const INTENSITY_API_URL = "https://www.data.jma.go.jp/eqdb/data/shindo/api/";
const SOURCE_PAGE_URL = "https://www.data.jma.go.jp/eqdb/data/shindo/";
const OUTPUT_DIR = path.resolve("public/data/earthquake-history");
const CACHE_DIR = path.resolve(".cache/jma-earthquake-history");
const ARCHIVE_LAST_YEAR = 2023;
const HISTORY_YEARS = 50;
const RECENT_REFRESH_DAYS = 14;
const REQUEST_INTERVAL_MS = 2_000;
const API_RESULT_LIMIT = 1_000;
const textDecoder = new TextDecoder("shift_jis");
let lastRequestAt = 0;

async function main() {
  await Promise.all([mkdir(OUTPUT_DIR, { recursive: true }), mkdir(CACHE_DIR, { recursive: true })]);
  const manifestPath = path.join(OUTPUT_DIR, "manifest.json");
  const previousManifest = await readOptionalJson(manifestPath);
  const requestedLatestDate = formatJstDate(Date.now() - (2 * 86_400_000));
  const recentUpdate = await readRecentIntensityWindow(requestedLatestDate);
  const latestDate = maxDate(recentUpdate.latestDate, previousManifest?.endDate ?? recentUpdate.latestDate);
  const earliestDate = shiftYear(latestDate, -HISTORY_YEARS);
  const earliestYear = Number(earliestDate.slice(0, 4));
  const latestYear = Number(latestDate.slice(0, 4));
  const recordsByYear = new Map();
  const removedYearFileCount = await pruneExpiredYearFiles(earliestYear, latestYear);
  const existingYears = new Set();

  for (let year = earliestYear; year <= latestYear; year += 1) {
    const records = await readExistingYear(year);
    if (!records) continue;
    addRecords(recordsByYear, records);
    existingYears.add(year);
  }

  const hasMissingEarlyArchiveYear = Array.from(
    { length: Math.max(0, Math.min(1982, latestYear) - earliestYear + 1) },
    (_, index) => earliestYear + index
  ).some((year) => !existingYears.has(year));
  if (earliestYear <= 1982 && hasMissingEarlyArchiveYear) {
    const records = await readArchive("1967");
    addRecords(recordsByYear, records.filter((record) => {
      const year = Number(record.t.slice(0, 4));
      return year >= earliestYear && year <= 1982;
    }));
  }
  for (let year = Math.max(1983, earliestYear); year <= Math.min(ARCHIVE_LAST_YEAR, latestYear); year += 1) {
    if (existingYears.has(year)) continue;
    if (year === 1997) {
      addRecords(recordsByYear, [
        ...await readArchive("199701"),
        ...await readArchive("199710")
      ]);
    } else {
      addRecords(recordsByYear, await readArchive(String(year)));
    }
  }
  for (let year = Math.max(ARCHIVE_LAST_YEAR + 1, earliestYear); year <= latestYear; year += 1) {
    if (existingYears.has(year)) continue;
    addRecords(recordsByYear, await readIntensityRange(
      maxDate(`${year}-01-01`, earliestDate),
      minDate(`${year}-12-31`, latestDate)
    ));
  }
  const refreshStartDate = maxDate(shiftDate(latestDate, -(RECENT_REFRESH_DAYS - 1)), earliestDate);
  if (recentUpdate.latestDate >= latestDate) {
    replaceRecordsInRange(recordsByYear, refreshStartDate, latestDate, recentUpdate.records);
  } else {
    console.warn(`JMA data is currently available through ${recentUpdate.latestDate}; retaining existing data through ${latestDate}.`);
  }

  const years = [];
  let totalCount = 0;
  let recordsChanged = false;
  const contentHash = createHash("sha256");
  for (let year = earliestYear; year <= latestYear; year += 1) {
    const records = deduplicateAndSort(recordsByYear.get(year) ?? [])
      .filter((record) => record.t.slice(0, 10) >= earliestDate && record.t.slice(0, 10) <= latestDate);
    if (!records.length) continue;
    const fileName = `${year}.json`;
    recordsChanged = await writeJsonIfChanged(path.join(OUTPUT_DIR, fileName), records) || recordsChanged;
    contentHash.update(JSON.stringify(records)).update("\n");
    years.push({ year, count: records.length, file: fileName });
    totalCount += records.length;
    console.log(`${year}: ${records.length.toLocaleString("ja-JP")} felt earthquakes`);
  }
  const manifestContent = {
    startDate: earliestDate,
    endDate: latestDate,
    source: "気象庁 地震月報（カタログ編）・震度データベース検索",
    sourceUrl: SOURCE_PAGE_URL,
    totalCount,
    contentHash: contentHash.digest("hex"),
    years
  };
  const manifestChanged = recordsChanged
    || removedYearFileCount > 0
    || JSON.stringify(toComparableManifest(previousManifest)) !== JSON.stringify(manifestContent);
  await writeJsonIfChanged(manifestPath, {
    generatedAt: manifestChanged ? new Date().toISOString() : previousManifest?.generatedAt,
    ...manifestContent
  });
  console.log(`Updated ${years.length} yearly files (${totalCount.toLocaleString("ja-JP")} records).`);
}

async function readRecentIntensityWindow(requestedLatestDate) {
  const requestedStartDate = shiftDate(requestedLatestDate, -(RECENT_REFRESH_DAYS - 1));
  try {
    return {
      latestDate: requestedLatestDate,
      records: await readIntensityRange(requestedStartDate, requestedLatestDate, { bypassCache: true })
    };
  } catch (error) {
    if (!(error instanceof JmaIntensityAvailabilityError) || error.latestAvailableDate >= requestedLatestDate) throw error;
    const refreshStartDate = shiftDate(error.latestAvailableDate, -(RECENT_REFRESH_DAYS - 1));
    console.warn(`JMA data is currently available through ${error.latestAvailableDate}; retrying the recent window through that date.`);
    return {
      latestDate: error.latestAvailableDate,
      records: await readIntensityRange(refreshStartDate, error.latestAvailableDate, { bypassCache: true })
    };
  }
}

async function readExistingYear(year) {
  try {
    const records = JSON.parse(await readFile(path.join(OUTPUT_DIR, `${year}.json`), "utf8"));
    if (!Array.isArray(records)) throw new Error(`${year}年の既存地震データが配列ではありません`);
    return records.map((record) => ({
      ...record,
      p: normalizeHistoricalEpicenterName(record?.id, record?.p)
    }));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function replaceRecordsInRange(recordsByYear, startDate, endDate, refreshedRecords) {
  for (const [year, records] of recordsByYear) {
    recordsByYear.set(year, records.filter((record) => {
      const date = String(record?.t ?? "").slice(0, 10);
      return date < startDate || date > endDate;
    }));
  }
  addRecords(recordsByYear, refreshedRecords);
}

async function pruneExpiredYearFiles(earliestYear, latestYear) {
  const entries = await readdir(OUTPUT_DIR, { withFileTypes: true });
  const removedFiles = await Promise.all(entries.flatMap((entry) => {
    const match = entry.isFile() ? entry.name.match(/^(\d{4})\.json$/u) : null;
    if (!match) return [];
    const year = Number(match[1]);
    return year < earliestYear || year > latestYear
      ? [unlink(path.join(OUTPUT_DIR, entry.name))]
      : [];
  }));
  return removedFiles.length;
}

async function readArchive(label) {
  const fileName = `h${label}.zip`;
  const buffer = await readCachedUrl(`${ARCHIVE_BASE_URL}/${fileName}`, fileName);
  const zip = new AdmZip(buffer);
  return zip.getEntries().flatMap((entry) => {
    if (entry.isDirectory) return [];
    return textDecoder.decode(entry.getData()).split(/\r?\n/u).flatMap(parseHypocenterRecord);
  });
}

function parseHypocenterRecord(line) {
  if (line.length < 96 || !["J", "U", "I"].includes(line[0])) return [];
  const year = parseInteger(line.slice(1, 5));
  const month = parseInteger(line.slice(5, 7));
  const day = parseInteger(line.slice(7, 9));
  const hour = parseInteger(line.slice(9, 11));
  const minute = parseInteger(line.slice(11, 13));
  const seconds = parseFixedHundredths(line.slice(13, 17));
  const latitudeDegrees = parseInteger(line.slice(21, 24));
  const latitudeMinutes = parseFixedHundredths(line.slice(24, 28));
  const longitudeDegrees = parseInteger(line.slice(32, 36));
  const longitudeMinutes = parseFixedHundredths(line.slice(36, 40));
  const intensity = normalizeArchiveIntensity(line[61]);
  if (![year, month, day, hour, minute, seconds, latitudeDegrees, latitudeMinutes, longitudeDegrees, longitudeMinutes].every(Number.isFinite)) return [];
  if (!intensity) return [];
  const latitude = roundCoordinate(latitudeDegrees + latitudeMinutes / 60);
  const longitude = roundCoordinate(longitudeDegrees + longitudeMinutes / 60);
  const wholeSeconds = Math.floor(seconds);
  const milliseconds = Math.round((seconds - wholeSeconds) * 1000);
  const date = `${year}-${pad2(month)}-${pad2(day)}`;
  const time = `${pad2(hour)}:${pad2(minute)}:${pad2(wholeSeconds)}.${String(milliseconds).padStart(3, "0")}`;
  const sourceId = `${year}${pad2(month)}${pad2(day)}${pad2(hour)}${pad2(minute)}${pad2(wholeSeconds)}`;
  const id = `${sourceId}${String(milliseconds).padStart(3, "0")}`;
  return [{
    id,
    t: `${date}T${time}+09:00`,
    p: normalizeHistoricalEpicenterName(id, line.slice(68, 92)),
    la: latitude,
    lo: longitude,
    d: parseDepth(line.slice(44, 49)),
    m: parseMagnitude(line.slice(52, 54)),
    i: intensity,
    u: `${SOURCE_PAGE_URL}#${sourceId}`
  }];
}

async function readIntensityRange(startDate, endDate, { bypassCache = false } = {}) {
  const payload = await readCachedIntensityQuery(startDate, endDate, { bypassCache });
  const rows = Array.isArray(payload?.res) ? payload.res : [];
  if (rows.length < API_RESULT_LIMIT || startDate === endDate) return rows.flatMap(normalizeIntensityApiRecord);
  const [leftEnd, rightStart] = splitDateRange(startDate, endDate);
  const left = await readIntensityRange(startDate, leftEnd, { bypassCache });
  const right = await readIntensityRange(rightStart, endDate, { bypassCache });
  return [...left, ...right];
}

async function readCachedIntensityQuery(startDate, endDate, { bypassCache = false } = {}) {
  const cachePath = path.join(CACHE_DIR, `shindo-${startDate}-${endDate}.json`);
  if (!bypassCache) {
    try {
      return JSON.parse(await readFile(cachePath, "utf8"));
    } catch {}
  }
  await waitForRequestSlot();
  const response = await fetch(INTENSITY_API_URL, {
    method: "POST",
    body: buildIntensitySearchForm(startDate, endDate),
    headers: {
      accept: "application/json",
      "user-agent": "MeteoScope archive updater (low-frequency static-data refresh)"
    },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`JMA intensity search failed: HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload?.res)) {
    const latestAvailableDate = String(payload?.res ?? payload?.str?.join(" ") ?? "")
      .match(/\b(\d{4}-\d{2}-\d{2})\b/u)?.[1];
    if (latestAvailableDate) throw new JmaIntensityAvailabilityError(latestAvailableDate);
    throw new Error("JMA intensity search returned an invalid response");
  }
  await writeFile(cachePath, `${JSON.stringify(payload)}\n`, "utf8");
  return payload;
}

class JmaIntensityAvailabilityError extends Error {
  constructor(latestAvailableDate) {
    super(`JMA intensity data is currently available through ${latestAvailableDate}`);
    this.name = "JmaIntensityAvailabilityError";
    this.latestAvailableDate = latestAvailableDate;
  }
}

function buildIntensitySearchForm(startDate, endDate) {
  const form = new FormData();
  [
    ["mode", "search"],
    ["dateTimeF[]", startDate], ["dateTimeF[]", "00:00"],
    ["dateTimeT[]", endDate], ["dateTimeT[]", "23:59"],
    ["mag[]", "0.0"], ["mag[]", "9.9"], ["dep[]", "000"], ["dep[]", "999"],
    ["epi[]", "99"], ["pref[]", "99"], ["city[]", "99"], ["station[]", "99"],
    ["obsInt", "1"], ["maxInt", "1"], ["additionalC", "false"],
    ["Sort", "S0"], ["Comp", "C0"], ["seisCount", "false"], ["observed", "false"]
  ].forEach(([key, value]) => form.append(key, value));
  return form;
}

function normalizeIntensityApiRecord(entry) {
  const latitude = Number(entry?.lat);
  const longitude = Number(entry?.lon);
  const originTime = normalizeApiOriginTime(entry?.ot);
  if (!entry?.id || !originTime || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
  const magnitude = Number(entry.mag);
  const depthMatch = String(entry.dep ?? "").match(/(\d+(?:\.\d+)?)\s*km/iu);
  return [{
    id: String(entry.id),
    t: originTime,
    p: normalizeHistoricalEpicenterName(entry.id, entry.name),
    la: roundCoordinate(latitude),
    lo: roundCoordinate(longitude),
    d: depthMatch ? Number(depthMatch[1]) : null,
    m: Number.isFinite(magnitude) ? magnitude : null,
    i: normalizeApiIntensity(entry.maxI),
    u: `${SOURCE_PAGE_URL}#${encodeURIComponent(String(entry.id))}`
  }];
}

async function readCachedUrl(url, fileName) {
  const cachePath = path.join(CACHE_DIR, fileName);
  try {
    return await readFile(cachePath);
  } catch {}
  await waitForRequestSlot();
  const response = await fetch(url, {
    headers: { "user-agent": "MeteoScope archive updater (low-frequency static-data refresh)" },
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(cachePath, buffer);
  return buffer;
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function toComparableManifest(manifest) {
  if (!manifest) return null;
  const { generatedAt, ...content } = manifest;
  return content;
}

async function writeJsonIfChanged(filePath, value) {
  const next = `${JSON.stringify(value)}\n`;
  try {
    if (await readFile(filePath, "utf8") === next) return false;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await writeFile(filePath, next, "utf8");
  return true;
}

async function waitForRequestSlot() {
  const waitMs = Math.max(0, REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastRequestAt = Date.now();
}

function addRecords(map, records) {
  records.forEach((record) => {
    const year = Number(record.t.slice(0, 4));
    if (!map.has(year)) map.set(year, []);
    map.get(year).push(record);
  });
}

function deduplicateAndSort(records) {
  const unique = new Map();
  records.forEach((record) => unique.set(`${record.id}|${record.la}|${record.lo}`, record));
  return [...unique.values()].sort((left, right) => right.t.localeCompare(left.t));
}

function normalizeArchiveIntensity(value) {
  if (["1", "2", "3", "4", "7"].includes(value)) return value;
  if (value === "A") return "5-";
  if (value === "B") return "5+";
  if (value === "C") return "6-";
  if (value === "D") return "6+";
  if (["5", "6"].includes(value)) return value;
  if (["L", "S", "M", "R", "F", "X"].includes(value)) return "felt";
  return "";
}

function normalizeApiIntensity(value) {
  return String(value ?? "")
    .replace(/^震度/u, "")
    .replace(/[０-９]/gu, (digit) => String("０１２３４５６７８９".indexOf(digit)))
    .replace("弱", "-")
    .replace("強", "+")
    .trim() || "felt";
}

function parseMagnitude(value) {
  const text = String(value ?? "");
  if (!text.trim()) return null;
  if (/^\d{2}$/u.test(text)) return Number(text) / 10;
  if (/^-\d$/u.test(text)) return -Number(text[1]) / 10;
  if (/^[A-C]\d$/u.test(text)) return -((text.charCodeAt(0) - 64) + Number(text[1]) / 10);
  return null;
}

function parseDepth(value) {
  const field = String(value ?? "");
  const text = field.trim();
  if (!text) return null;
  if (/\s{2}$/u.test(field)) {
    const wholeKilometers = Number(text);
    return Number.isFinite(wholeKilometers) ? wholeKilometers : null;
  }
  const hundredthsOfKilometers = Number(text.replace(/\s/gu, ""));
  return Number.isFinite(hundredthsOfKilometers) ? hundredthsOfKilometers / 100 : null;
}

function parseFixedHundredths(value) {
  const text = String(value ?? "").trim();
  if (!text) return NaN;
  return text.includes(".") ? Number(text) : Number(text) / 100;
}

function parseInteger(value) {
  const number = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(number) ? number : NaN;
}

function normalizeApiOriginTime(value) {
  const match = String(value ?? "").match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/u);
  if (!match) return "";
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] ?? "00"}+09:00`;
}

function splitDateRange(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const middle = start + Math.floor((end - start) / (2 * 86_400_000)) * 86_400_000;
  return [formatUtcDate(middle), formatUtcDate(middle + 86_400_000)];
}

function formatJstDate(timestamp) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(timestamp));
}

function formatUtcDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function shiftYear(date, offset) {
  const [year, month, day] = date.split("-").map(Number);
  const shiftedYear = year + offset;
  const lastDay = new Date(Date.UTC(shiftedYear, month, 0)).getUTCDate();
  return `${shiftedYear}-${pad2(month)}-${pad2(Math.min(day, lastDay))}`;
}

function shiftDate(date, offset) {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return formatUtcDate(timestamp + offset * 86_400_000);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function roundCoordinate(value) {
  return Math.round(value * 10_000) / 10_000;
}

function minDate(left, right) {
  return left <= right ? left : right;
}

function maxDate(left, right) {
  return left >= right ? left : right;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
