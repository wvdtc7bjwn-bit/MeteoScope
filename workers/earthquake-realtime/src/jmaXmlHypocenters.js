import {
  buildDiscordEarthquakeNotificationUpsert,
  deliverPendingDiscordEarthquakeNotifications,
  isDiscordNotifiableEarthquakeReport
} from "./discordEarthquakeNotifications.js";

const JMA_XML_SOURCE_URL = "https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml";
const JMA_XML_CODES = new Set(["VXSE51", "VXSE52", "VXSE53"]);
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
// Keep each cron invocation well below the Workers Free external-subrequest and
// CPU limits. Processing a small, balanced batch every minute also lets the
// newest reports bypass a large backlog after an active earthquake sequence.
const MAX_REPORTS_PER_SYNC = 8;
const MAX_REPORTS_PER_SOURCE_DATE = 4;
const MAX_CONCURRENT_REPORTS = 4;
const ERROR_RETRY_MS = 10 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const FEED_ENTRY_PATTERN =
  /<(?:[A-Za-z_][\w.-]*:)?entry\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?entry\s*>/giu;
const FEED_ID_PATTERN =
  /<(?:[A-Za-z_][\w.-]*:)?id\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?id\s*>/iu;
const FEED_UPDATED_PATTERN =
  /<(?:[A-Za-z_][\w.-]*:)?updated\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?updated\s*>/iu;
const FEED_LINK_PATTERN =
  /<(?:[A-Za-z_][\w.-]*:)?link\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>/iu;
const XML_TAG_PREFIX = "(?:[A-Za-z_][\\w.-]*:)?";

export function parseJmaXmlFeed(text) {
  // Atom feeds are flat and only id/updated are needed. Building a complete
  // DOM for the feed consumes most of the Workers Free 10 ms CPU allowance.
  // Selected JMA reports use the same targeted text extraction below.
  const feedEntries = Array.from(String(text ?? "").matchAll(FEED_ENTRY_PATTERN));
  if (!feedEntries.length) throw new Error("jma_xml_feed_parse_failed");
  return feedEntries
    .map((match) => {
      const entry = match[1];
      const url = readFeedValue(entry, FEED_ID_PATTERN)
        || decodeXmlEntities(entry.match(FEED_LINK_PATTERN)?.[2] ?? "");
      const xmlCode = getXmlCodeFromUrl(url);
      const updated = readFeedValue(entry, FEED_UPDATED_PATTERN);
      return {
        url,
        xmlCode,
        updated,
        sourceDate: getJstDate(updated)
      };
    })
    .filter((entry) => entry.url && JMA_XML_CODES.has(entry.xmlCode) && entry.sourceDate);
}

function readFeedValue(entry, pattern) {
  return decodeXmlEntities(String(entry ?? "").match(pattern)?.[1] ?? "").trim();
}

function decodeXmlEntities(value) {
  const entities = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&apos;": "'"
  };
  return String(value ?? "").replace(
    /&(amp|lt|gt|quot|apos);/gu,
    (entity) => entities[entity] ?? entity
  ).replace(/&#(\d+);|&#x([\da-f]+);/giu, (entity, decimal, hexadecimal) => {
    const codePoint = Number.parseInt(decimal || hexadecimal, decimal ? 10 : 16);
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : entity;
  });
}

function hasXmlElement(source, localName) {
  return new RegExp(`<${XML_TAG_PREFIX}${localName}\\b`, "iu").test(String(source ?? ""));
}

function readXmlSection(source, localName) {
  const match = String(source ?? "").match(new RegExp(
    `<${XML_TAG_PREFIX}${localName}\\b[^>]*>([\\s\\S]*?)<\\/${XML_TAG_PREFIX}${localName}\\s*>`,
    "iu"
  ));
  return match?.[1] ?? "";
}

function readXmlText(source, localName) {
  return normalizeXmlText(readXmlSection(source, localName));
}

function readXmlTexts(source, localName) {
  const pattern = new RegExp(
    `<${XML_TAG_PREFIX}${localName}\\b[^>]*>([\\s\\S]*?)<\\/${XML_TAG_PREFIX}${localName}\\s*>`,
    "giu"
  );
  return Array.from(String(source ?? "").matchAll(pattern), (match) => (
    normalizeXmlText(match[1])
  ));
}

function normalizeXmlText(value) {
  return decodeXmlEntities(String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, "$1")
    .replace(/<[^>]+>/gu, ""))
    .trim();
}

export function parseJmaXmlHypocenterReport(text, entry = {}) {
  const report = String(text ?? "");
  if (!hasXmlElement(report, "Report")) {
    throw new Error("jma_xml_report_parse_failed");
  }

  const control = readXmlSection(report, "Control");
  const head = readXmlSection(report, "Head");
  const body = readXmlSection(report, "Body");
  const status = readXmlText(control, "Status");
  const infoType = readXmlText(head, "InfoType");
  const eventId = readXmlText(head, "EventID") || readXmlText(control, "EventID");
  const reportTime = normalizeTimestamp(
    readXmlText(head, "ReportDateTime") || readXmlText(control, "DateTime") || entry.updated
  );
  const earthquake = readXmlSection(body, "Earthquake");
  const originTime = readXmlText(earthquake, "OriginTime")
    || readXmlText(earthquake, "ArrivalTime")
    || readXmlText(head, "TargetDateTime");
  const sourceDate = getJstDate(originTime || reportTime);
  const hypocenter = readXmlSection(earthquake, "Hypocenter");
  const area = readXmlSection(hypocenter, "Area");
  const coordinate = parseJmaCoordinate(readXmlText(area, "Coordinate"));
  const magnitudeText = readXmlText(earthquake, "Magnitude");
  const magnitude = Number(magnitudeText);
  const xmlCode = entry.xmlCode || getXmlCodeFromUrl(entry.url);
  const cancelled = infoType.includes("\u53d6\u6d88");
  const normalStatus = !status || status === "\u901a\u5e38";
  const normalizedEventId = String(eventId || buildFallbackEventId(originTime, coordinate)).trim();
  const observation = readXmlSection(body, "Observation");
  const maxIntensity = readXmlText(observation, "MaxInt");
  const tsunamiText = readXmlTexts(report, "Text")
    .map((value) => value.replace(/\s+/gu, " ").trim())
    .find((value) => value.includes("\u6d25\u6ce2"))
    || "";

  if (!normalStatus) {
    return {
      ignored: true,
      reason: "non_normal_status",
      eventId: normalizedEventId,
      sourceDate
    };
  }
  if (!normalizedEventId || !sourceDate || !reportTime) {
    throw new Error("jma_xml_report_identity_missing");
  }

  return {
    eventId: normalizedEventId,
    sourceDate,
    originTime: originTime || null,
    reportTime,
    latitude: coordinate?.latitude ?? null,
    longitude: coordinate?.longitude ?? null,
    depthKm: coordinate?.depthKm ?? null,
    magnitude: Number.isFinite(magnitude) ? magnitude : null,
    place: readXmlText(area, "Name") || "\u9707\u6e90\u5730\u540d\u4e0d\u660e",
    xmlCode,
    sourceUrl: entry.url || "",
    reportPriority: getReportPriority(xmlCode),
    infoType,
    maxIntensity,
    tsunamiText,
    active: cancelled ? 0 : 1,
    ignored: !cancelled && !coordinate,
    reason: !cancelled && !coordinate ? "hypocenter_missing" : null
  };
}

export async function runJmaXmlHypocenterSync(env, options = {}) {
  const db = env?.EQ_D1;
  if (!db) throw new Error("earthquake_database_unavailable");

  const now = Number(options.now ?? Date.now());
  const retainedDates = getJmaXmlRetentionDates(now);
  const fetchImpl = options.fetchImpl ?? fetch;
  // The long-term Atom feed is roughly 17x larger than the live feed and its
  // DOM parse alone exceeds the Workers Free 10 ms CPU budget. The live feed
  // is sufficient for continuous ingestion; already-seen reports remain in D1
  // while the separate daily-catalog backfill covers historical gaps.
  const feedText = await fetchText(
    JMA_XML_SOURCE_URL,
    fetchImpl,
    "application/atom+xml,application/xml"
  );
  const entries = dedupeEntries(parseJmaXmlFeed(feedText)
    .filter((entry) => retainedDates.includes(entry.sourceDate)));

  const processed = await readProcessedEntries(db, retainedDates);
  const candidates = selectJmaXmlCandidates(entries, processed, now, retainedDates);

  const results = [];
  for (let index = 0; index < candidates.length; index += MAX_CONCURRENT_REPORTS) {
    results.push(...await Promise.all(
      candidates.slice(index, index + MAX_CONCURRENT_REPORTS)
        .map((entry) => syncOneEntry(db, entry, fetchImpl, now))
    ));
  }
  const discord = await deliverPendingDiscordEarthquakeNotifications(env, {
    fetchImpl,
    now
  });

  return {
    feedCount: 1,
    candidateCount: candidates.length,
    storedCount: results.filter((result) => result.status === "stored").length,
    ignoredCount: results.filter((result) => result.status === "ignored").length,
    failedCount: results.filter((result) => result.status === "error").length,
    discord,
    retainedDates
  };
}

export async function runJmaXmlHypocenterMaintenance(env, options = {}) {
  const db = env?.EQ_D1;
  if (!db) throw new Error("earthquake_database_unavailable");
  const retainedDates = getJmaXmlRetentionDates(Number(options.now ?? Date.now()));
  return {
    cleanup: await trimJmaXmlHypocenters(db, retainedDates),
    retainedDates
  };
}

export function selectJmaXmlCandidates(entries, processed, now, retainedDates) {
  const pending = (Array.isArray(entries) ? entries : [])
    .filter((entry) => retainedDates.includes(entry.sourceDate))
    .filter((entry) => shouldProcessEntry(entry, processed.get(entry.url), now))
    .sort((left, right) => String(right.updated).localeCompare(String(left.updated)));
  const selectedUrls = new Set();
  const selectedPerDate = new Map();
  const selected = [];

  for (const sourceDate of retainedDates) {
    for (const entry of pending) {
      if (entry.sourceDate !== sourceDate || selectedUrls.has(entry.url)) continue;
      selected.push(entry);
      selectedUrls.add(entry.url);
      const sourceDateCount = (selectedPerDate.get(sourceDate) ?? 0) + 1;
      selectedPerDate.set(sourceDate, sourceDateCount);
      if (sourceDateCount >= MAX_REPORTS_PER_SOURCE_DATE) {
        break;
      }
    }
  }
  for (const entry of pending) {
    if (selected.length >= MAX_REPORTS_PER_SYNC) break;
    if (selectedUrls.has(entry.url)) continue;
    selected.push(entry);
    selectedUrls.add(entry.url);
  }
  return selected.slice(0, MAX_REPORTS_PER_SYNC);
}

export async function readJmaXmlDay(db, sourceDate) {
  let result;
  try {
    result = await db.prepare(`
      SELECT event_id, source_date, origin_time, latitude, longitude, depth_km,
        magnitude, place
      FROM jma_xml_hypocenters
      WHERE source_date = ? AND active = 1
        AND latitude IS NOT NULL AND longitude IS NOT NULL
      ORDER BY origin_time DESC
    `).bind(sourceDate).all();
  }
  catch (error) {
    if (/no such table/iu.test(String(error?.message ?? error ?? ""))) return [];
    throw error;
  }
  return (result?.results ?? []).map((row) => ({
    id: `jma-xml:${row.event_id}`,
    sourceDate: String(row.source_date),
    originTime: String(row.origin_time ?? ""),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    depthKm: row.depth_km === null || row.depth_km === undefined ? null : Number(row.depth_km),
    magnitude: row.magnitude === null || row.magnitude === undefined ? null : Number(row.magnitude),
    place: String(row.place ?? "震源地名不明")
  })).filter((item) => (
    item.originTime && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
  ));
}

export async function readJmaXmlDailyCounts(db, now = Date.now()) {
  const dates = getJmaXmlRetentionDates(now);
  let result;
  try {
    result = await db.prepare(`
      SELECT source_date, COUNT(*) AS record_count, MAX(updated_at) AS fetched_at
      FROM jma_xml_hypocenters
      WHERE source_date BETWEEN ? AND ? AND active = 1
        AND latitude IS NOT NULL AND longitude IS NOT NULL
      GROUP BY source_date
    `).bind(dates[1], dates[0]).all();
  }
  catch (error) {
    if (!/no such table/iu.test(String(error?.message ?? error ?? ""))) throw error;
    result = { results: [] };
  }
  const counts = new Map((result?.results ?? []).map((row) => [String(row.source_date), row]));
  return dates.map((sourceDate) => ({
    source_date: sourceDate,
    record_count: Math.max(0, Number(counts.get(sourceDate)?.record_count) || 0),
    fetched_at: counts.get(sourceDate)?.fetched_at ?? null,
    status: "ok",
    source_type: "jma-xml"
  }));
}

export function getJmaXmlRetentionDates(timestamp = Date.now()) {
  const today = getJstDate(timestamp);
  return [today, shiftDate(today, -1)];
}

export function isJmaXmlRetentionDate(sourceDate, timestamp = Date.now()) {
  return getJmaXmlRetentionDates(timestamp).includes(String(sourceDate ?? ""));
}

export { JMA_XML_SOURCE_URL };

async function syncOneEntry(db, entry, fetchImpl, now) {
  const processedAt = new Date(now).toISOString();
  try {
    const text = await fetchText(entry.url, fetchImpl, "application/xml,text/xml");
    const report = parseJmaXmlHypocenterReport(text, entry);
    const status = report.ignored ? "ignored" : "stored";
    const statements = [];
    if (!report.ignored) {
      statements.push(buildReportUpsert(db, report, processedAt));
    }
    if (isDiscordNotifiableEarthquakeReport(report)) {
      statements.push(buildDiscordEarthquakeNotificationUpsert(db, report, entry, now));
    }
    statements.push(buildEntryUpsert(db, {
      ...entry,
      eventId: report.eventId,
      sourceDate: report.sourceDate || entry.sourceDate,
      status,
      processedAt,
      error: report.reason
    }));
    await db.batch(statements);
    return { url: entry.url, eventId: report.eventId, status };
  }
  catch (error) {
    const message = error?.name === "AbortError"
      ? "jma_xml_report_timeout"
      : String(error?.message ?? error).slice(0, 160);
    await buildEntryUpsert(db, {
      ...entry,
      status: "error",
      processedAt,
      error: message
    }).run();
    return { url: entry.url, status: "error", error: message };
  }
}

function buildReportUpsert(db, report, updatedAt) {
  return db.prepare(`
    INSERT INTO jma_xml_hypocenters (
      event_id, source_date, origin_time, report_time, latitude, longitude,
      depth_km, magnitude, place, xml_code, source_url, report_priority,
      info_type, active, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_id) DO UPDATE SET
      source_date = excluded.source_date,
      origin_time = excluded.origin_time,
      report_time = excluded.report_time,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      depth_km = excluded.depth_km,
      magnitude = excluded.magnitude,
      place = excluded.place,
      xml_code = excluded.xml_code,
      source_url = excluded.source_url,
      report_priority = excluded.report_priority,
      info_type = excluded.info_type,
      active = excluded.active,
      updated_at = excluded.updated_at
    WHERE excluded.report_time > jma_xml_hypocenters.report_time
      OR (
        excluded.report_time = jma_xml_hypocenters.report_time
        AND excluded.report_priority >= jma_xml_hypocenters.report_priority
      )
  `).bind(
    report.eventId,
    report.sourceDate,
    report.originTime,
    report.reportTime,
    report.latitude,
    report.longitude,
    report.depthKm,
    report.magnitude,
    report.place,
    report.xmlCode,
    report.sourceUrl,
    report.reportPriority,
    report.infoType,
    report.active,
    updatedAt
  );
}

function buildEntryUpsert(db, entry) {
  return db.prepare(`
    INSERT INTO jma_xml_feed_entries (
      entry_url, entry_updated, source_date, xml_code, event_id,
      status, processed_at, error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(entry_url) DO UPDATE SET
      entry_updated = excluded.entry_updated,
      source_date = excluded.source_date,
      xml_code = excluded.xml_code,
      event_id = excluded.event_id,
      status = excluded.status,
      processed_at = excluded.processed_at,
      error = excluded.error
  `).bind(
    entry.url,
    entry.updated,
    entry.sourceDate,
    entry.xmlCode,
    entry.eventId ?? null,
    entry.status,
    entry.processedAt,
    entry.error ?? null
  );
}

async function readProcessedEntries(db, retainedDates) {
  const result = await db.prepare(`
    SELECT entry_url, entry_updated, status, processed_at
    FROM jma_xml_feed_entries
    WHERE source_date BETWEEN ? AND ?
  `).bind(retainedDates[1], retainedDates[0]).all();
  return new Map((result?.results ?? []).map((row) => [String(row.entry_url), row]));
}

function shouldProcessEntry(entry, processed, now) {
  if (!processed || processed.entry_updated !== entry.updated) return true;
  if (processed.status !== "error") return false;
  const lastAttempt = Date.parse(String(processed.processed_at ?? ""));
  return !Number.isFinite(lastAttempt) || now - lastAttempt >= ERROR_RETRY_MS;
}

async function trimJmaXmlHypocenters(db, retainedDates) {
  const results = await db.batch([
    db.prepare(`
      DELETE FROM jma_xml_hypocenters
      WHERE source_date < ? OR source_date > ?
    `).bind(retainedDates[1], retainedDates[0]),
    db.prepare(`
      DELETE FROM jma_xml_feed_entries
      WHERE source_date < ? OR source_date > ?
    `).bind(retainedDates[1], retainedDates[0]),
    db.prepare(`
      DELETE FROM discord_earthquake_notifications
      WHERE source_date < ? OR source_date > ?
    `).bind(retainedDates[1], retainedDates[0])
  ]);
  return {
    deletedHypocenters: Number(results?.[0]?.meta?.changes ?? 0),
    deletedFeedEntries: Number(results?.[1]?.meta?.changes ?? 0),
    deletedDiscordNotifications: Number(results?.[2]?.meta?.changes ?? 0)
  };
}

async function fetchText(url, fetchImpl, accept) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: { accept },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`jma_xml_http_${response.status}`);
    const declaredLength = Number(response.headers?.get?.("content-length") ?? 0);
    if (declaredLength > MAX_RESPONSE_BYTES) throw new Error("jma_xml_response_too_large");
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new Error("jma_xml_response_too_large");
    }
    return text;
  }
  finally {
    clearTimeout(timeout);
  }
}

function parseJmaCoordinate(value) {
  const match = String(value ?? "").trim().match(
    /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)?\//u
  );
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  const depthMeters = match[3] ? Number(match[3]) : null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    depthKm: Number.isFinite(depthMeters) ? Math.abs(depthMeters) / 1000 : null
  };
}

function getXmlCodeFromUrl(url) {
  return String(url ?? "").match(/_(VXSE5[1-3])_/u)?.[1] ?? "";
}

function getReportPriority(xmlCode) {
  return { VXSE51: 1, VXSE52: 2, VXSE53: 3 }[xmlCode] ?? 0;
}

function getJstDate(value) {
  const timestamp = typeof value === "number" ? value : Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function normalizeTimestamp(value) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : String(value ?? "");
}

function shiftDate(sourceDate, dayOffset) {
  if (!DATE_PATTERN.test(String(sourceDate ?? ""))) return null;
  const timestamp = Date.parse(`${sourceDate}T00:00:00Z`);
  return new Date(timestamp + Number(dayOffset) * DAY_MS).toISOString().slice(0, 10);
}

function buildFallbackEventId(originTime, coordinate) {
  if (!originTime || !coordinate) return "";
  return [
    "fallback",
    originTime,
    coordinate.latitude.toFixed(2),
    coordinate.longitude.toFixed(2)
  ].join(":");
}

function dedupeEntries(entries) {
  const unique = new Map();
  for (const entry of entries) {
    const current = unique.get(entry.url);
    if (!current || String(entry.updated) > String(current.updated)) {
      unique.set(entry.url, entry);
    }
  }
  return [...unique.values()];
}
