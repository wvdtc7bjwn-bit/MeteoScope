const JMA_DAILY_BASE_URL = "https://www.data.jma.go.jp/eqev/data/daily_map";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
export const JMA_DAILY_RETENTION_DAYS = 30;
export const JMA_DAILY_MAX_DAY_OFFSET = JMA_DAILY_RETENTION_DAYS - 1;
// 15日なら、外部fetch・D1 batch・管理クエリを合わせてもFreeの
// 1回50クエリ/サブリクエスト以内に収まり、既存15日から1回で補完できる。
export const JMA_DAILY_BACKFILL_DAYS_PER_SYNC = 15;
const RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const MAX_RECORDS_PER_DAY = 5_000;
const MAX_PAYLOAD_BYTES = 1_500_000;

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

export async function syncJmaDailyHypocenters(env, options = {}) {
  const db = env?.EQ_D1;
  await ensureJmaDailyHypocenterSchema(db);
  const maxDays = clampInteger(
    options.maxDays,
    1,
    JMA_DAILY_BACKFILL_DAYS_PER_SYNC,
    JMA_DAILY_BACKFILL_DAYS_PER_SYNC
  );
  const dates = buildRecentJstDates(JMA_DAILY_RETENTION_DAYS);
  const statuses = await loadSyncStatuses(db, dates);
  const now = Number(options.now ?? Date.now());
  const pendingDates = dates.filter((date) => shouldAttemptDate(statuses.get(date), now)).slice(0, maxDays);
  const results = [];
  for (const date of pendingDates) {
    results.push(await syncOneDate(db, date, options.fetchImpl ?? fetch));
  }
  await cleanupJmaDailyHypocenters(db);
  const previouslyStoredDayCount = [...statuses.values()]
    .filter((state) => state.status === "ok")
    .length;
  const newlyStoredDayCount = results.filter((result) => result.ok).length;
  const storedDayCount = Math.min(
    JMA_DAILY_RETENTION_DAYS,
    previouslyStoredDayCount + newlyStoredDayCount
  );
  return {
    attempted: pendingDates.length,
    results,
    backfill: {
      complete: storedDayCount >= JMA_DAILY_RETENTION_DAYS,
      storedDayCount,
      remainingDayCount: Math.max(0, JMA_DAILY_RETENTION_DAYS - storedDayCount)
    }
  };
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
  const startDate = buildRecentJstDates(JMA_DAILY_RETENTION_DAYS).at(-1);

  const snapshot = await queryDistribution(db, {
    startDate,
    requestedDayOffset,
    minMagnitude,
    maxDepth
  });

  return jsonResponse({
    ok: true,
    source: "jma-daily-hypocenters",
    sourceLabel: "気象庁 日々の震源リスト",
    sourceUrl: `${JMA_DAILY_BASE_URL}/index.html`,
    provisional: true,
    retentionDays: JMA_DAILY_RETENTION_DAYS,
    requestedDayOffset,
    minMagnitude: minMagnitudeText,
    maxDepth: maxDepthText,
    ...snapshot
  }, 200, { "cache-control": "public, max-age=300, s-maxage=300" });
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

async function queryDistribution(db, { startDate, requestedDayOffset, minMagnitude, maxDepth }) {
  const datesResult = await db.prepare(`
    SELECT daily.source_date, daily.record_count
    FROM jma_daily_hypocenter_days AS daily
    INNER JOIN jma_daily_hypocenter_sync AS sync
      ON sync.source_date = daily.source_date AND sync.status = 'ok'
    WHERE daily.source_date >= ?
    ORDER BY daily.source_date DESC
    LIMIT ${JMA_DAILY_RETENTION_DAYS}
  `).bind(startDate).all();
  const dailyCounts = (datesResult?.results ?? []).map((row) => ({
    sourceDate: row.source_date,
    count: Math.max(0, Number(row.record_count) || 0)
  }));
  const availableDates = dailyCounts.map((row) => row.sourceDate);
  const dayOffset = availableDates.length
    ? Math.min(requestedDayOffset, availableDates.length - 1)
    : 0;
  const selectedSourceDate = availableDates[dayOffset] ?? null;
  const selectedDay = selectedSourceDate
    ? await db.prepare(`
        SELECT payload_json FROM jma_daily_hypocenter_days
        WHERE source_date = ? LIMIT 1
      `).bind(selectedSourceDate).first()
    : null;
  const items = parseStoredPayload(selectedDay?.payload_json)
    .filter((item) => minMagnitude === null || (
      Number.isFinite(item.magnitude) && item.magnitude >= minMagnitude
    ))
    .filter((item) => maxDepth === null || (
      Number.isFinite(item.depthKm) && item.depthKm <= maxDepth
    ))
    .sort((left, right) => right.originTime.localeCompare(left.originTime));
  const visibleItems = items.slice(0, 5000);
  const sync = await db.prepare(`
    SELECT MAX(CASE WHEN status = 'ok' THEN source_date END) AS latest_source_date,
      MAX(CASE WHEN status = 'ok' THEN fetched_at END) AS last_successful_fetch_at,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS failed_dates
    FROM jma_daily_hypocenter_sync
    WHERE source_date >= ?
  `).bind(startDate).first();
  return {
    latestSourceDate: sync?.latest_source_date ?? availableDates[0] ?? null,
    lastSuccessfulFetchAt: sync?.last_successful_fetch_at ?? null,
    failedDates: Number(sync?.failed_dates ?? 0),
    availableDates,
    availableDayCount: availableDates.length,
    dailyCounts,
    selectedSourceDate,
    dayOffset,
    truncated: items.length > visibleItems.length,
    items: visibleItems
  };
}

async function loadSyncStatuses(db, dates) {
  const placeholders = dates.map(() => "?").join(",");
  const result = await db.prepare(`
    SELECT source_date, status, fetched_at FROM jma_daily_hypocenter_sync
    WHERE source_date IN (${placeholders})
  `).bind(...dates).all();
  return new Map((result?.results ?? []).map((row) => [row.source_date, {
    status: row.status,
    fetchedAt: row.fetched_at
  }]));
}

async function cleanupJmaDailyHypocenters(db) {
  // The published list starts with yesterday, so retaining 30 published days
  // requires keeping source dates through 30 calendar days ago.
  const oldestRetainedDay = `-${JMA_DAILY_RETENTION_DAYS} days`;
  await db.batch([
    db.prepare("DELETE FROM jma_daily_hypocenter_days WHERE source_date < date('now', '+9 hours', ?)")
      .bind(oldestRetainedDay),
    db.prepare("DELETE FROM jma_daily_hypocenter_sync WHERE source_date < date('now', '+9 hours', ?)")
      .bind(oldestRetainedDay)
  ]);
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

function buildRecentJstDates(count) {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(base - (index + 1) * 24 * 60 * 60 * 1000);
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
