import { DOMParser } from "@xmldom/xmldom";

const JMA_XML_FEED_URLS = [
  "https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml",
  "https://www.data.jma.go.jp/developer/xml/feed/eqvol_l.xml"
];
const JMA_XML_SOURCE_URL = "https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml";
const JMA_XML_CODES = new Set(["VXSE51", "VXSE52", "VXSE53"]);
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REPORTS_PER_SYNC = 24;
const ERROR_RETRY_MS = 10 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export async function ensureJmaXmlHypocenterSchema(db) {
  if (!db) throw new Error("earthquake_database_unavailable");
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS jma_xml_hypocenters (
        event_id TEXT PRIMARY KEY,
        source_date TEXT NOT NULL,
        origin_time TEXT,
        report_time TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        depth_km REAL,
        magnitude REAL,
        place TEXT,
        xml_code TEXT NOT NULL,
        source_url TEXT NOT NULL,
        report_priority INTEGER NOT NULL DEFAULT 0,
        info_type TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_jma_xml_hypocenters_date
      ON jma_xml_hypocenters(source_date, active, origin_time)
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS jma_xml_feed_entries (
        entry_url TEXT PRIMARY KEY,
        entry_updated TEXT,
        source_date TEXT NOT NULL,
        xml_code TEXT NOT NULL,
        event_id TEXT,
        status TEXT NOT NULL,
        processed_at TEXT NOT NULL,
        error TEXT
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_jma_xml_feed_entries_date
      ON jma_xml_feed_entries(source_date, status)
    `)
  ]);
}

export function parseJmaXmlFeed(text) {
  const document = parseXml(text, "jma_xml_feed_parse_failed");
  return descendants(document, "entry")
    .map((entry) => {
      const url = childText(entry, "id")
        || descendants(entry, "link")
          .map((node) => node.getAttribute?.("href") ?? "")
          .find(Boolean)
        || "";
      const xmlCode = getXmlCodeFromUrl(url);
      const updated = childText(entry, "updated");
      return {
        url,
        xmlCode,
        updated,
        sourceDate: getJstDate(updated)
      };
    })
    .filter((entry) => entry.url && JMA_XML_CODES.has(entry.xmlCode) && entry.sourceDate);
}

export function parseJmaXmlHypocenterReport(text, entry = {}) {
  const document = parseXml(text, "jma_xml_report_parse_failed");
  const report = firstDescendant(document, "Report") ?? document;
  const control = firstChild(report, "Control");
  const head = firstChild(report, "Head");
  const body = firstChild(report, "Body");
  const status = childText(control, "Status");
  const infoType = childText(head, "InfoType");
  const eventId = childText(head, "EventID") || childText(control, "EventID");
  const reportTime = normalizeTimestamp(
    childText(head, "ReportDateTime") || childText(control, "DateTime") || entry.updated
  );
  const earthquake = firstChild(body, "Earthquake");
  const originTime = childText(earthquake, "OriginTime")
    || childText(earthquake, "ArrivalTime")
    || childText(head, "TargetDateTime");
  const sourceDate = getJstDate(originTime || reportTime);
  const hypocenter = firstDescendant(earthquake, "Hypocenter");
  const area = firstChild(hypocenter, "Area");
  const coordinate = parseJmaCoordinate(childText(area, "Coordinate"));
  const magnitudeText = childText(earthquake, "Magnitude");
  const magnitude = Number(magnitudeText);
  const xmlCode = entry.xmlCode || getXmlCodeFromUrl(entry.url);
  const cancelled = infoType.includes("取消");
  const normalStatus = !status || status === "通常";
  const normalizedEventId = String(eventId || buildFallbackEventId(originTime, coordinate)).trim();

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
    place: childText(area, "Name") || "震源地名不明",
    xmlCode,
    sourceUrl: entry.url || "",
    reportPriority: getReportPriority(xmlCode),
    infoType,
    active: cancelled ? 0 : 1,
    ignored: !cancelled && !coordinate,
    reason: !cancelled && !coordinate ? "hypocenter_missing" : null
  };
}

export async function runJmaXmlHypocenterSync(env, options = {}) {
  const db = env?.EQ_D1;
  if (!db) throw new Error("earthquake_database_unavailable");
  await ensureJmaXmlHypocenterSchema(db);

  const now = Number(options.now ?? Date.now());
  const retainedDates = getJmaXmlRetentionDates(now);
  const cleanup = await trimJmaXmlHypocenters(db, retainedDates);
  const fetchImpl = options.fetchImpl ?? fetch;
  const feeds = await Promise.allSettled(JMA_XML_FEED_URLS.map((url) => (
    fetchText(url, fetchImpl, "application/atom+xml,application/xml")
  )));
  const entries = dedupeEntries(feeds
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => parseJmaXmlFeed(result.value))
    .filter((entry) => retainedDates.includes(entry.sourceDate)));

  if (!entries.length && feeds.every((result) => result.status === "rejected")) {
    throw feeds.find((result) => result.status === "rejected")?.reason
      ?? new Error("jma_xml_feeds_unavailable");
  }

  const processed = await readProcessedEntries(db, retainedDates);
  const candidates = entries
    .filter((entry) => shouldProcessEntry(entry, processed.get(entry.url), now))
    .sort((left, right) => String(right.updated).localeCompare(String(left.updated)))
    .slice(0, MAX_REPORTS_PER_SYNC)
    .sort((left, right) => String(left.updated).localeCompare(String(right.updated)));

  const results = [];
  for (const entry of candidates) {
    results.push(await syncOneEntry(db, entry, fetchImpl, now));
  }
  const cleanupAfterSync = await trimJmaXmlHypocenters(db, retainedDates);

  return {
    feedCount: feeds.filter((result) => result.status === "fulfilled").length,
    candidateCount: candidates.length,
    storedCount: results.filter((result) => result.status === "stored").length,
    ignoredCount: results.filter((result) => result.status === "ignored").length,
    failedCount: results.filter((result) => result.status === "error").length,
    cleanup: {
      deletedHypocenters: cleanup.deletedHypocenters + cleanupAfterSync.deletedHypocenters,
      deletedFeedEntries: cleanup.deletedFeedEntries + cleanupAfterSync.deletedFeedEntries
    },
    retainedDates
  };
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
    `).bind(retainedDates[1], retainedDates[0])
  ]);
  return {
    deletedHypocenters: Number(results?.[0]?.meta?.changes ?? 0),
    deletedFeedEntries: Number(results?.[1]?.meta?.changes ?? 0)
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

function parseXml(text, errorCode) {
  const document = new DOMParser().parseFromString(String(text ?? ""), "application/xml");
  if (!document?.documentElement || descendants(document, "parsererror").length) {
    throw new Error(errorCode);
  }
  return document;
}

function descendants(node, localName) {
  if (!node?.getElementsByTagName) return [];
  return Array.from(node.getElementsByTagName("*"))
    .filter((item) => item.localName === localName || item.nodeName === localName);
}

function firstDescendant(node, localName) {
  return descendants(node, localName)[0] ?? null;
}

function firstChild(node, localName) {
  return Array.from(node?.childNodes ?? [])
    .find((item) => item.nodeType === 1
      && (item.localName === localName || item.nodeName === localName))
    ?? null;
}

function childText(node, localName) {
  return String(firstChild(node, localName)?.textContent ?? "").trim();
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
