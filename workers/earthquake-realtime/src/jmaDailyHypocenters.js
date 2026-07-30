import {
  getJmaXmlRetentionDates,
  isJmaXmlRetentionDate,
  JMA_XML_SOURCE_URL,
  readJmaXmlDailyCounts,
  readJmaXmlDay
} from "./jmaXmlHypocenters.js";

const JMA_DAILY_BASE_URL = "https://www.data.jma.go.jp/eqev/data/daily_map";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
export const JMA_DAILY_RETENTION_DAYS = 731;
export const JMA_DAILY_MAX_DAY_OFFSET = JMA_DAILY_RETENTION_DAYS - 1;
export const JMA_DAILY_TREND_DAYS = 90;
export const JMA_DAILY_MONTHLY_SUMMARY_AFTER_DAYS = 183;
// Workers Free の CPU 上限を超えないよう、1回の Cron では1日だけ解析する。
export const JMA_DAILY_BACKFILL_DAYS_PER_SYNC = 1;
export const JMA_DAILY_FAST_BACKFILL_CRON = "* * * * *";
const JMA_DAILY_SOURCE_LAG_BUFFER_DAYS = 7;
const JMA_DAILY_RECENT_CHECK_DAYS = JMA_DAILY_SOURCE_LAG_BUFFER_DAYS + 1;
const JMA_DAILY_PUBLICATION_LAG_DAYS = 2;
const RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const MAX_RECORDS_PER_DAY = 5_000;
const MAX_PAYLOAD_BYTES = 1_500_000;
const SUMMARY_CACHE_SECONDS = 60;
const SUMMARY_CACHE_VERSION = "jma-combined-summary-v1";
const FAST_BACKFILL_COMPLETE_CACHE_SECONDS = 6 * 60 * 60;
const MAX_STATUS_DATE_DETAILS = 31;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAILY_ROW_PATTERN = /^(\d{4})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{2}):(\d{2})\s+(\d{1,2}(?:\.\d+)?)\s+(\d{1,3})°\s*(\d{1,2}(?:\.\d+)?)'[NS]\s+(\d{1,3})°\s*(\d{1,2}(?:\.\d+)?)'[EW]\s+(\d+|-)\s+(-?\d+(?:\.\d+)?|-)\s+(.+)$/u;

export async function ensureJmaDailyHypocenterSchema(db) {
  if (!db) throw new Error("earthquake_database_unavailable");
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS jma_daily_hypocenter_days (
        source_date TEXT PRIMARY KEY,
        record_count INTEGER NOT NULL,
        payload_bytes INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS jma_daily_hypocenter_sync (
        source_date TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        record_count INTEGER NOT NULL DEFAULT 0,
        fetched_at TEXT,
        error TEXT
      )
    `)
  ]);
}

export function parseJmaDailyHypocenterHtml(html, expectedDate = "") {
  const source = String(html ?? "");
  const preMatch = source.match(/<pre(?:\s[^>]*)?>([\s\S]*?)<\/pre>/iu);
  if (!preMatch) throw new Error("jma_daily_list_not_found");

  const lines = decodeHtmlEntities(preMatch[1].replace(/<[^>]+>/gu, ""))
    .replace(/\r\n?/gu, "\n")
    .split("\n");
  const items = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = line.match(DAILY_ROW_PATTERN);
    if (!match) continue;
    const [, year, month, day, hour, minute, second, latitudeDegrees,
      latitudeMinutes, longitudeDegrees, longitudeMinutes, depth, magnitude, place] = match;
    const sourceDate = `${year}-${pad2(month)}-${pad2(day)}`;
    if (expectedDate && sourceDate !== expectedDate) continue;
    const latitude = Number(latitudeDegrees) + Number(latitudeMinutes) / 60;
    const longitude = Number(longitudeDegrees) + Number(longitudeMinutes) / 60;
    const secondValue = Number(second);
    const wholeSecond = Math.floor(secondValue);
    const milliseconds = Math.round((secondValue - wholeSecond) * 1000);
    const originTime = `${sourceDate}T${hour}:${minute}:${pad2(wholeSecond)}.${String(milliseconds).padStart(3, "0")}+09:00`;
    const depthKm = depth === "-" ? null : Number(depth);
    const magnitudeValue = magnitude === "-" ? null : Number(magnitude);
    const id = [
      "jma-daily",
      sourceDate.replaceAll("-", ""),
      `${hour}${minute}${pad2(wholeSecond)}${String(milliseconds).padStart(3, "0")}`,
      latitude.toFixed(4),
      longitude.toFixed(4),
      depthKm ?? "unknown"
    ].join(":");
    items.push({
      id,
      sourceDate,
      originTime,
      latitude,
      longitude,
      depthKm: Number.isFinite(depthKm) ? depthKm : null,
      magnitude: Number.isFinite(magnitudeValue) ? magnitudeValue : null,
      place: place.trim()
    });
  }
  if (!items.length) throw new Error("jma_daily_list_parse_failed");
  return items;
}

export function buildJmaDailyPayload(items) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error("jma_daily_payload_empty");
  }
  if (items.length > MAX_RECORDS_PER_DAY) {
    throw new Error("jma_daily_record_limit_exceeded");
  }
  const json = JSON.stringify(items);
  const bytes = new TextEncoder().encode(json).byteLength;
  if (bytes > MAX_PAYLOAD_BYTES) {
    throw new Error("jma_daily_payload_too_large");
  }
  return { json, bytes };
}

export function shouldAttemptDate(syncState, now = Date.now()) {
  if (!syncState) return true;
  if (syncState.status === "ok") return false;
  const fetchedAt = Date.parse(syncState.fetchedAt ?? "");
  return !Number.isFinite(fetchedAt) || now - fetchedAt >= RETRY_COOLDOWN_MS;
}

export async function runJmaDailyFastBackfill(env, options = {}) {
  const db = env?.EQ_D1;
  if (!db) throw new Error("earthquake_database_unavailable");
  const now = Number(options.now ?? Date.now());
  const expectedLatestDate = buildRecentJstDates(1, now)[0];
  const cache = options.cache ?? null;
  const cacheKey = new Request(
    `https://meteoscope.internal/jma-daily-backfill-complete/${JMA_DAILY_RETENTION_DAYS}/${expectedLatestDate}`
  );
  if (cache && await cache.match(cacheKey)) {
    return {
      attempted: 0,
      skipped: "backfill_complete_cached",
      backfill: { complete: true, storedDayCount: JMA_DAILY_RETENTION_DAYS, remainingDayCount: 0 }
    };
  }

  const retention = await readJmaDailyRetentionState(db);
  if (retention.complete && retention.newestSourceDate >= expectedLatestDate) {
    if (cache) {
      await cache.put(cacheKey, new Response("complete", {
        headers: { "cache-control": `max-age=${FAST_BACKFILL_COMPLETE_CACHE_SECONDS}` }
      }));
    }
    return {
      attempted: 0,
      skipped: "backfill_complete",
      backfill: { complete: true, storedDayCount: JMA_DAILY_RETENTION_DAYS, remainingDayCount: 0 }
    };
  }

  return syncNextJmaDailyHypocenter(env, {
    ...options,
    cache: undefined,
    retention
  });
}

async function readJmaDailyRetentionState(db) {
  try {
    const row = await db.prepare(`
      SELECT COUNT(*) AS stored_day_count,
        MIN(source_date) AS oldest_source_date,
        MAX(source_date) AS newest_source_date
      FROM jma_daily_hypocenter_days
    `).bind().first();
    const storedDayCount = Math.max(0, Number(row?.stored_day_count) || 0);
    const oldestSourceDate = normalizeDate(row?.oldest_source_date);
    const newestSourceDate = normalizeDate(row?.newest_source_date);
    const spanDayCount = oldestSourceDate && newestSourceDate
      ? countInclusiveDays(oldestSourceDate, newestSourceDate)
      : 0;
    return {
      storedDayCount,
      oldestSourceDate,
      newestSourceDate,
      complete: storedDayCount >= JMA_DAILY_RETENTION_DAYS
        && spanDayCount === JMA_DAILY_RETENTION_DAYS
    };
  }
  catch (error) {
    if (/no such table/iu.test(String(error?.message ?? error ?? ""))) {
      return emptyJmaDailyRetentionState();
    }
    throw error;
  }
}

async function syncNextJmaDailyHypocenter(env, options = {}) {
  const db = env?.EQ_D1;
  await ensureJmaDailyHypocenterSchema(db);
  const now = Number(options.now ?? Date.now());
  const retention = options.retention ?? await readJmaDailyRetentionState(db);
  const candidate = await findNextJmaDailySyncDate(db, retention, now);
  if (!candidate) {
    return {
      attempted: 0,
      skipped: "no_retryable_date",
      results: [],
      cleanup: { deletedDays: 0, deletedSyncRows: 0 },
      backfill: buildBackfillProgress(retention.storedDayCount)
    };
  }

  const result = await syncOneDate(db, candidate, options.fetchImpl ?? fetch);
  const newlyStoredDayCount = result.ok ? 1 : 0;
  const cleanup = retention.storedDayCount + newlyStoredDayCount > JMA_DAILY_RETENTION_DAYS
    ? await trimJmaDailyHypocenters(db)
    : { deletedDays: 0, deletedSyncRows: 0 };
  return {
    attempted: 1,
    results: [result],
    cleanup,
    backfill: buildBackfillProgress(retention.storedDayCount + newlyStoredDayCount)
  };
}

async function findNextJmaDailySyncDate(db, retention, now) {
  const recentDates = buildRecentJstDates(JMA_DAILY_RECENT_CHECK_DAYS, now);
  const recentStoredDates = await loadStoredDatesBetween(db, recentDates.at(-1), recentDates[0]);
  const recentStoredSet = new Set(recentStoredDates);
  const recentMissingDates = recentDates.filter((date) => !recentStoredSet.has(date));
  const recentStatuses = await loadSyncStatuses(db, recentMissingDates);
  const recentCandidate = recentMissingDates.find((date) => (
    shouldAttemptDate(recentStatuses.get(date), now)
  ));
  if (recentCandidate) return recentCandidate;

  const backfillCandidate = await findStoredGapOrOlderDate(db, retention);
  if (!backfillCandidate) return null;
  const backfillStatuses = await loadSyncStatuses(db, [backfillCandidate]);
  return shouldAttemptDate(backfillStatuses.get(backfillCandidate), now)
    ? backfillCandidate
    : null;
}

async function loadStoredDatesBetween(db, oldestDate, newestDate) {
  if (!oldestDate || !newestDate) return [];
  const result = await db.prepare(`
    SELECT source_date FROM jma_daily_hypocenter_days
    WHERE source_date BETWEEN ? AND ?
    ORDER BY source_date DESC
  `).bind(oldestDate, newestDate).all();
  return (result?.results ?? [])
    .map((row) => normalizeDate(row?.source_date))
    .filter(Boolean);
}

async function findStoredGapOrOlderDate(db, retention) {
  if (!retention.oldestSourceDate) return null;
  const gap = await db.prepare(`
    SELECT date(newer.source_date, '-1 day') AS source_date
    FROM jma_daily_hypocenter_days AS newer
    LEFT JOIN jma_daily_hypocenter_days AS older
      ON older.source_date = date(newer.source_date, '-1 day')
    WHERE newer.source_date > ?
      AND older.source_date IS NULL
    ORDER BY newer.source_date DESC
    LIMIT 1
  `).bind(retention.oldestSourceDate).first();
  const missingDate = normalizeDate(gap?.source_date);
  if (missingDate) return missingDate;
  if (retention.storedDayCount >= JMA_DAILY_RETENTION_DAYS) return null;
  return shiftDate(retention.oldestSourceDate, -1);
}

function emptyJmaDailyRetentionState() {
  return {
    storedDayCount: 0,
    oldestSourceDate: null,
    newestSourceDate: null,
    complete: false
  };
}

function buildBackfillProgress(storedDayCount) {
  const normalizedCount = Math.min(
    JMA_DAILY_RETENTION_DAYS,
    Math.max(0, Number(storedDayCount) || 0)
  );
  return {
    complete: normalizedCount >= JMA_DAILY_RETENTION_DAYS,
    storedDayCount: normalizedCount,
    remainingDayCount: Math.max(0, JMA_DAILY_RETENTION_DAYS - normalizedCount)
  };
}

function normalizeDate(value) {
  const normalized = String(value ?? "");
  return DATE_PATTERN.test(normalized) ? normalized : null;
}

function countInclusiveDays(oldestDate, newestDate) {
  const oldest = Date.parse(`${oldestDate}T00:00:00Z`);
  const newest = Date.parse(`${newestDate}T00:00:00Z`);
  if (!Number.isFinite(oldest) || !Number.isFinite(newest) || newest < oldest) return 0;
  return Math.floor((newest - oldest) / 86_400_000) + 1;
}

function shiftDate(sourceDate, dayOffset) {
  const timestamp = Date.parse(`${sourceDate}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp + Number(dayOffset) * 86_400_000).toISOString().slice(0, 10);
}

export async function readJmaDailyHypocenterDistribution(request, env, ctx) {
  const db = env?.EQ_D1;
  if (!db) throw new Error("earthquake_database_unavailable");
  const url = new URL(request.url);
  const requestedDayOffset = clampInteger(
    url.searchParams.get("dayOffset"),
    0,
    JMA_DAILY_MAX_DAY_OFFSET,
    0
  );
  const minMagnitudeText = url.searchParams.get("minMagnitude") ?? "0";
  const minMagnitude = minMagnitudeText === "all"
    ? null
    : parseChoice(minMagnitudeText, [0, 1, 2, 3, 4, 5], 0);
  const maxDepthText = url.searchParams.get("maxDepth") ?? "all";
  const maxDepth = maxDepthText === "all"
    ? null
    : parseChoice(maxDepthText, [30, 100, 300, 700], 700);
  const includeRecentXml = url.searchParams.get("includeRecentXml") !== "0";
  const requestedStartDate = parseSourceDate(url.searchParams.get("startDate"));
  const requestedEndDate = parseSourceDate(url.searchParams.get("endDate"));
  const requestedBounds = parseBounds(url.searchParams.get("bounds"));
  const fresh = url.searchParams.get("fresh") === "1";
  const summary = await readDistributionSummary(db, ctx, { fresh });
  const snapshot = await queryDistribution(db, {
    summary,
    requestedDayOffset,
    minMagnitude,
    maxDepth,
    includeRecentXml,
    requestedStartDate,
    requestedEndDate,
    requestedBounds
  });

  return jsonResponse({
    ok: true,
    source: "jma-combined-hypocenters",
    sourceLabel: "気象庁 防災情報XML（有感地震）／日々の震源リスト",
    sourceUrl: JMA_XML_SOURCE_URL,
    provisional: true,
    retentionDays: JMA_DAILY_RETENTION_DAYS,
    requestedDayOffset,
    minMagnitude: minMagnitudeText,
    maxDepth: maxDepthText,
    includeRecentXml,
    requestedStartDate,
    requestedEndDate,
    requestedBounds,
    ...snapshot
  }, 200, { "cache-control": "public, max-age=60, s-maxage=60" });
}

async function syncOneDate(db, date, fetchImpl) {
  const compactDate = date.replaceAll("-", "");
  const sourceUrl = `${JMA_DAILY_BASE_URL}/${compactDate}.html`;
  const fetchedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(sourceUrl, {
      headers: { accept: "text/html,application/xhtml+xml" },
      signal: controller.signal
    });
    if (response.status === 404) throw new Error("jma_daily_list_not_published");
    if (!response.ok) throw new Error(`jma_daily_list_http_${response.status}`);
    const declaredLength = Number(response.headers?.get?.("content-length") ?? 0);
    if (declaredLength > MAX_RESPONSE_BYTES) throw new Error("jma_daily_list_too_large");
    const html = await response.text();
    if (new TextEncoder().encode(html).byteLength > MAX_RESPONSE_BYTES) {
      throw new Error("jma_daily_list_too_large");
    }
    const items = parseJmaDailyHypocenterHtml(html, date);
    const payload = buildJmaDailyPayload(items);
    await db.batch([
      db.prepare(`
        INSERT INTO jma_daily_hypocenter_days (
          source_date, record_count, payload_bytes, payload_json, fetched_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(source_date) DO UPDATE SET
          record_count = excluded.record_count,
          payload_bytes = excluded.payload_bytes,
          payload_json = excluded.payload_json,
          fetched_at = excluded.fetched_at
      `).bind(date, items.length, payload.bytes, payload.json, fetchedAt),
      db.prepare(`
        INSERT INTO jma_daily_hypocenter_sync (source_date, status, record_count, fetched_at, error)
        VALUES (?, 'ok', ?, ?, NULL)
        ON CONFLICT(source_date) DO UPDATE SET
          status = 'ok', record_count = excluded.record_count,
          fetched_at = excluded.fetched_at, error = NULL
      `).bind(date, items.length, fetchedAt)
    ]);
    return { date, ok: true, count: items.length };
  } catch (error) {
    const message = error?.name === "AbortError"
      ? "jma_daily_list_timeout"
      : String(error?.message ?? error).slice(0, 160);
    await db.prepare(`
      INSERT INTO jma_daily_hypocenter_sync (source_date, status, record_count, fetched_at, error)
      VALUES (?, 'error', 0, ?, ?)
      ON CONFLICT(source_date) DO UPDATE SET
        status = 'error', fetched_at = excluded.fetched_at, error = excluded.error
    `).bind(date, fetchedAt, message).run();
    return { date, ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export function filterDistributionDates(availableDates, includeRecentXml, timestamp = Date.now()) {
  const dates = Array.isArray(availableDates) ? availableDates : [];
  if (includeRecentXml !== false) return [...dates];
  const recentDates = new Set(getJmaXmlRetentionDates(timestamp));
  return dates.filter((date) => !recentDates.has(date));
}

async function queryDistribution(
  db,
  {
    summary,
    requestedDayOffset,
    minMagnitude,
    maxDepth,
    includeRecentXml,
    requestedStartDate,
    requestedEndDate,
    requestedBounds
  }
) {
  const availableDates = filterDistributionDates(
    summary.availableDates,
    includeRecentXml
  );
  const rangeDates = getRequestedRangeDates(
    availableDates,
    requestedStartDate,
    requestedEndDate
  );
  if (rangeDates.length) {
    const storedItems = await readDistributionRange(db, rangeDates);
    const items = filterDistributionItems(
      storedItems,
      minMagnitude,
      maxDepth,
      requestedBounds
    );
    const visibleItems = items.slice(0, 75000);
    return {
      ...summary,
      availableDates,
      availableDayCount: availableDates.length,
      selectedSourceDate: null,
      selectedSource: "jma-combined",
      selectedSourceLabel: "気象庁 防災情報XML（有感地震）／日々の震源リスト",
      selectedSourceUrl: JMA_XML_SOURCE_URL,
      selectedProvisional: true,
      dayOffset: 0,
      rangeMode: true,
      rangeStartDate: rangeDates.at(-1) ?? null,
      rangeEndDate: rangeDates[0] ?? null,
      rangeDayCount: rangeDates.length,
      truncated: items.length > visibleItems.length,
      items: visibleItems
    };
  }
  const dayOffset = availableDates.length
    ? Math.min(requestedDayOffset, availableDates.length - 1)
    : 0;
  const selectedSourceDate = availableDates[dayOffset] ?? null;
  const usesXml = Boolean(selectedSourceDate && isJmaXmlRetentionDate(selectedSourceDate));
  const storedItems = selectedSourceDate
    ? await readDistributionDay(db, selectedSourceDate)
    : [];
  const items = filterDistributionItems(
    storedItems,
    minMagnitude,
    maxDepth,
    requestedBounds
  );
  const visibleItems = items.slice(0, 5000);
  return {
    ...summary,
    availableDates,
    availableDayCount: availableDates.length,
    selectedSourceDate,
    selectedSource: usesXml ? "jma-xml" : "jma-daily",
    selectedSourceLabel: usesXml
      ? "気象庁 防災情報XML（有感地震）"
      : "気象庁「日々の震源リスト」",
    selectedSourceUrl: usesXml
      ? JMA_XML_SOURCE_URL
      : `${JMA_DAILY_BASE_URL}/index.html`,
    selectedProvisional: true,
    dayOffset,
    truncated: items.length > visibleItems.length,
    items: visibleItems
  };
}

async function readDistributionDay(db, sourceDate) {
  if (isJmaXmlRetentionDate(sourceDate)) {
    return await readJmaXmlDay(db, sourceDate);
  }
  const row = await db.prepare(`
    SELECT payload_json FROM jma_daily_hypocenter_days
    WHERE source_date = ? LIMIT 1
  `).bind(sourceDate).first();
  return parseStoredPayload(row?.payload_json);
}

async function readDistributionRange(db, rangeDates) {
  const xmlDates = rangeDates.filter(isJmaXmlRetentionDate);
  const dailyDates = rangeDates.filter((date) => !isJmaXmlRetentionDate(date));
  const [xmlItems, dailyRows] = await Promise.all([
    Promise.all(xmlDates.map((date) => readJmaXmlDay(db, date))),
    dailyDates.length
      ? db.prepare(`
          SELECT source_date, payload_json
          FROM jma_daily_hypocenter_days
          WHERE source_date BETWEEN ? AND ?
          ORDER BY source_date DESC
        `).bind(dailyDates.at(-1), dailyDates[0]).all()
      : Promise.resolve({ results: [] })
  ]);
  return [
    ...xmlItems.flat(),
    ...(dailyRows?.results ?? []).flatMap((row) => parseStoredPayload(row.payload_json))
  ];
}

function filterDistributionItems(items, minMagnitude, maxDepth, bounds) {
  return items
    .filter((item) => minMagnitude === null || (
      Number.isFinite(item.magnitude) && item.magnitude >= minMagnitude
    ))
    .filter((item) => maxDepth === null || (
      Number.isFinite(item.depthKm) && item.depthKm <= maxDepth
    ))
    .filter((item) => {
      if (!bounds) return true;
      const longitude = Number(item.longitude);
      const latitude = Number(item.latitude);
      return Number.isFinite(longitude)
        && Number.isFinite(latitude)
        && longitude >= bounds[0]
        && latitude >= bounds[1]
        && longitude <= bounds[2]
        && latitude <= bounds[3];
    })
    .sort((left, right) => right.originTime.localeCompare(left.originTime));
}

function getRequestedRangeDates(availableDates, startDate, endDate) {
  if (!startDate || !endDate) return [];
  const oldest = startDate <= endDate ? startDate : endDate;
  const newest = startDate <= endDate ? endDate : startDate;
  return availableDates
    .filter((date) => date >= oldest && date <= newest);
}

function parseSourceDate(value) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/u.test(text) ? text : null;
}

function parseBounds(value) {
  const bounds = String(value ?? "").split(",").map(Number);
  if (
    bounds.length !== 4
    || !bounds.every(Number.isFinite)
    || bounds[0] >= bounds[2]
    || bounds[1] >= bounds[3]
  ) {
    return null;
  }
  return [
    Math.max(-180, bounds[0]),
    Math.max(-90, bounds[1]),
    Math.min(180, bounds[2]),
    Math.min(90, bounds[3])
  ];
}

async function readDistributionSummary(db, ctx, { fresh = false } = {}) {
  const cache = globalThis.caches?.default;
  const currentJstDate = getJmaXmlRetentionDates()[0];
  const cacheKey = cache
    ? new Request(`https://meteoscope-cache.invalid/earthquakes/distribution-summary?v=${SUMMARY_CACHE_VERSION}&date=${currentJstDate}`)
    : null;
  if (!fresh && cache && cacheKey) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached.json();
  }

  const [result, xmlRows] = await Promise.all([
    db.prepare(`
      SELECT daily.source_date, daily.record_count, daily.fetched_at,
        'ok' AS status, NULL AS error, 'jma-daily' AS source_type
      FROM jma_daily_hypocenter_days AS daily
      UNION ALL
      SELECT sync.source_date, 0 AS record_count, sync.fetched_at,
        sync.status, sync.error, 'jma-daily' AS source_type
      FROM jma_daily_hypocenter_sync AS sync
      WHERE sync.status = 'error'
        AND NOT EXISTS (
          SELECT 1 FROM jma_daily_hypocenter_days AS stored
          WHERE stored.source_date = sync.source_date
        )
      ORDER BY source_date DESC
      LIMIT ${JMA_DAILY_RETENTION_DAYS + JMA_DAILY_SOURCE_LAG_BUFFER_DAYS}
    `).bind().all(),
    readJmaXmlDailyCounts(db)
  ]);
  const summary = buildDistributionSummary([
    ...xmlRows,
    ...(result?.results ?? [])
  ]);

  if (!fresh && cache && cacheKey) {
    const response = jsonResponse(summary, 200, {
      "cache-control": `public, max-age=${SUMMARY_CACHE_SECONDS}`
    });
    const write = cache.put(cacheKey, response);
    if (typeof ctx?.waitUntil === "function") ctx.waitUntil(write);
    else await write;
  }
  return summary;
}

export function buildDistributionSummary(rows, timestamp = Date.now()) {
  const normalized = Array.isArray(rows) ? rows : [];
  const xmlDates = new Set(getJmaXmlRetentionDates(timestamp));
  const seenDates = new Set();
  const successfulRows = normalized
    .filter((row) => row?.status !== "error"
      && DATE_PATTERN.test(String(row?.source_date ?? "")))
    .filter((row) => {
      const sourceDate = String(row.source_date);
      return xmlDates.has(sourceDate)
        ? row.source_type === "jma-xml"
        : row.source_type !== "jma-xml";
    })
    .sort((left, right) => String(right.source_date).localeCompare(String(left.source_date)))
    .filter((row) => {
      const sourceDate = String(row.source_date);
      if (seenDates.has(sourceDate)) return false;
      seenDates.add(sourceDate);
      return true;
    })
    .slice(0, JMA_DAILY_RETENTION_DAYS);
  const allDailyCounts = successfulRows.map((row) => {
    const sourceDate = String(row.source_date);
    return {
      sourceDate,
      count: Math.max(0, Number(row.record_count) || 0),
      source: xmlDates.has(sourceDate) ? "jma-xml" : "jma-daily"
    };
  });
  const availableDates = allDailyCounts.map((row) => row.sourceDate);
  const latestSourceDate = availableDates[0] ?? null;
  const expectedDates = latestSourceDate
    ? buildDatesFromSourceDate(latestSourceDate, JMA_DAILY_RETENTION_DAYS)
    : [];
  const availableSet = new Set(availableDates);
  const expectedLatestSourceDate = getJmaXmlRetentionDates(timestamp)[0];
  const expectedLatestDailySourceDate = buildRecentJstDates(1, timestamp)[0];
  const errorRows = normalized.filter((row) => (
    row?.status === "error"
      && row?.source_type !== "jma-xml"
      && DATE_PATTERN.test(String(row?.source_date ?? ""))
  ));
  const pendingPublicationDates = errorRows
    .filter((row) => row.error === "jma_daily_list_not_published"
      && String(row.source_date) <= expectedLatestDailySourceDate
      && !availableSet.has(String(row.source_date)))
    .map((row) => String(row.source_date))
    .sort((left, right) => right.localeCompare(left));
  const pendingSet = new Set(pendingPublicationDates);
  const failedSourceDates = errorRows
    .map((row) => String(row.source_date))
    .filter((date) => date <= expectedLatestDailySourceDate)
    .filter((date) => !pendingSet.has(date))
    .sort((left, right) => right.localeCompare(left));
  const missingStoredDates = expectedDates.filter((date) => !availableSet.has(date));
  const lastSuccessfulFetchAt = successfulRows.reduce((latest, row) => {
    const value = String(row.fetched_at ?? "");
    return value > latest ? value : latest;
  }, "") || null;
  return {
    latestSourceDate,
    expectedLatestSourceDate,
    lastDataUpdateAt: lastSuccessfulFetchAt,
    lastSuccessfulFetchAt,
    failedDates: failedSourceDates.length,
    failedSourceDateCount: failedSourceDates.length,
    failedSourceDates: failedSourceDates.slice(0, MAX_STATUS_DATE_DETAILS),
    missingStoredDateCount: missingStoredDates.length,
    missingStoredDates: missingStoredDates.slice(0, MAX_STATUS_DATE_DETAILS),
    pendingPublicationDateCount: pendingPublicationDates.length,
    pendingPublicationDates: pendingPublicationDates.slice(0, MAX_STATUS_DATE_DETAILS),
    availableDates,
    availableDayCount: availableDates.length,
    dailyCounts: allDailyCounts.slice(0, JMA_DAILY_TREND_DAYS),
    trendDays: JMA_DAILY_TREND_DAYS,
    monthlyCounts: buildMonthlyCounts(allDailyCounts.slice(JMA_DAILY_MONTHLY_SUMMARY_AFTER_DAYS))
  };
}

function buildMonthlyCounts(dailyCounts) {
  const months = new Map();
  for (const row of dailyCounts) {
    const month = row.sourceDate.slice(0, 7);
    const current = months.get(month) ?? { month, count: 0, dayCount: 0 };
    current.count += row.count;
    current.dayCount += 1;
    months.set(month, current);
  }
  return [...months.values()].sort((left, right) => right.month.localeCompare(left.month));
}

function buildDatesFromSourceDate(sourceDate, count) {
  const [year, month, day] = sourceDate.split("-").map(Number);
  const start = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(start)) return [];
  return Array.from({ length: count }, (_, index) => (
    new Date(start - index * 86_400_000).toISOString().slice(0, 10)
  ));
}

async function loadSyncStatuses(db, dates) {
  if (!dates.length) return new Map();
  const sortedDates = [...dates].sort((left, right) => left.localeCompare(right));
  const result = await db.prepare(`
    SELECT source_date, status, fetched_at FROM jma_daily_hypocenter_sync
    WHERE source_date BETWEEN ? AND ?
    ORDER BY source_date DESC
    LIMIT ${JMA_DAILY_RETENTION_DAYS + JMA_DAILY_SOURCE_LAG_BUFFER_DAYS}
  `).bind(sortedDates[0], sortedDates.at(-1)).all();
  return new Map((result?.results ?? []).map((row) => [row.source_date, {
    status: row.status,
    fetchedAt: row.fetched_at
  }]));
}

async function trimJmaDailyHypocenters(db) {
  const results = await db.batch([
    db.prepare(`
      DELETE FROM jma_daily_hypocenter_days
      WHERE source_date IN (
        SELECT source_date FROM jma_daily_hypocenter_days
        ORDER BY source_date DESC
        LIMIT -1 OFFSET ?
      )
    `).bind(JMA_DAILY_RETENTION_DAYS),
    db.prepare(`
      DELETE FROM jma_daily_hypocenter_sync
      WHERE EXISTS (SELECT 1 FROM jma_daily_hypocenter_days)
        AND source_date < (SELECT MIN(source_date) FROM jma_daily_hypocenter_days)
    `)
  ]);
  return {
    deletedDays: Number(results?.[0]?.meta?.changes ?? 0),
    deletedSyncRows: Number(results?.[1]?.meta?.changes ?? 0)
  };
}

function parseStoredPayload(value) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => (
      item
      && typeof item.id === "string"
      && typeof item.sourceDate === "string"
      && typeof item.originTime === "string"
      && Number.isFinite(Number(item.latitude))
      && Number.isFinite(Number(item.longitude))
    )).map((item) => ({
      id: item.id,
      sourceDate: item.sourceDate,
      originTime: item.originTime,
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      depthKm: item.depthKm === null || item.depthKm === undefined ? null : Number(item.depthKm),
      magnitude: item.magnitude === null || item.magnitude === undefined ? null : Number(item.magnitude),
      place: String(item.place ?? "震央地名不明")
    }));
  }
  catch {
    return [];
  }
}

function buildRecentJstDates(count, timestamp = Date.now()) {
  const now = new Date(Number(timestamp) + 9 * 60 * 60 * 1000);
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(
      base - (index + JMA_DAILY_PUBLICATION_LAG_DAYS) * 24 * 60 * 60 * 1000
    );
    return date.toISOString().slice(0, 10);
  });
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, "\"")
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function parseChoice(value, choices, fallback) {
  const numeric = Number(value);
  return choices.includes(numeric) ? numeric : fallback;
}

function clampInteger(value, minimum, maximum, fallback) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, numeric));
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function jsonResponse(payload, status, headers) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
      ...headers
    }
  });
}
