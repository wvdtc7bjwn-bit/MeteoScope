import { normalizeGdEarthquakeItem } from "./MeteoScopeEarthquakeHub.js";
import { buildGdBackfillDates } from "./scheduledBackfillPolicy.js";

const GD_EARTHQUAKE_URL = "https://api.dmdata.jp/v2/gd/earthquake";
const LOCK_KEY = "gd-scheduled-backfill-lock-v1";
const STATE_KEY = "gd-scheduled-backfill-state-v1";
const LOCK_INTERVAL_MS = 55 * 1000;
const FETCH_TIMEOUT_MS = 8000;

function nowIso(nowMs = Date.now()) {
  return new Date(nowMs).toISOString();
}

async function fetchJsonWithTimeout(fetchImpl, url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.status === "error") {
      throw new Error(`dmdata_gd_http_${response.status}`);
    }
    return payload;
  }
  finally {
    clearTimeout(timer);
  }
}

async function ensureStateSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS meteoscope_worker_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL
    )
  `).run();
}

async function acquireBackfillLock(db, nowMs) {
  const attemptedAt = nowIso(nowMs);
  const cutoff = nowIso(nowMs - LOCK_INTERVAL_MS);
  const result = await db.prepare(`
    INSERT INTO meteoscope_worker_state (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
    WHERE meteoscope_worker_state.updated_at < ?
  `).bind(LOCK_KEY, "{}", attemptedAt, cutoff).run();
  return Number(result?.meta?.changes ?? result?.changes ?? 0) > 0;
}

async function readBackfillState(db) {
  const row = await db.prepare(`
    SELECT value, updated_at
    FROM meteoscope_worker_state
    WHERE key = ?
    LIMIT 1
  `).bind(STATE_KEY).first();
  if (!row) return null;
  try {
    return { ...JSON.parse(row.value || "{}"), updatedAt: row.updated_at ?? null };
  }
  catch {
    return { updatedAt: row.updated_at ?? null };
  }
}

async function writeBackfillState(db, state, updatedAt) {
  await db.prepare(`
    INSERT INTO meteoscope_worker_state (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).bind(STATE_KEY, JSON.stringify(state), updatedAt).run();
}

function makeEarthquakeUpsert(db, earthquake, timestamp) {
  return db.prepare(`
    INSERT INTO earthquake_history (
      event_id, telegram_type, report_number, place, origin_time,
      magnitude, depth, max_intensity, max_scale, long_period_intensity,
      tsunami_status, latitude, longitude, regions_json, updated_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_id) DO UPDATE SET
      telegram_type = COALESCE(excluded.telegram_type, earthquake_history.telegram_type),
      report_number = COALESCE(excluded.report_number, earthquake_history.report_number),
      place = COALESCE(NULLIF(excluded.place, '震源調査中'), earthquake_history.place),
      origin_time = COALESCE(excluded.origin_time, earthquake_history.origin_time),
      magnitude = COALESCE(NULLIF(excluded.magnitude, '-'), earthquake_history.magnitude),
      depth = COALESCE(NULLIF(excluded.depth, '-'), earthquake_history.depth),
      max_intensity = COALESCE(NULLIF(excluded.max_intensity, '-'), earthquake_history.max_intensity),
      max_scale = MAX(COALESCE(excluded.max_scale, 0), COALESCE(earthquake_history.max_scale, 0)),
      long_period_intensity = COALESCE(excluded.long_period_intensity, earthquake_history.long_period_intensity),
      tsunami_status = COALESCE(NULLIF(excluded.tsunami_status, ''), earthquake_history.tsunami_status),
      latitude = COALESCE(excluded.latitude, earthquake_history.latitude),
      longitude = COALESCE(excluded.longitude, earthquake_history.longitude),
      regions_json = CASE
        WHEN excluded.regions_json IS NOT NULL AND excluded.regions_json <> '[]'
          THEN excluded.regions_json
        ELSE earthquake_history.regions_json
      END,
      updated_at = excluded.updated_at
  `).bind(
    earthquake.eventId,
    earthquake.telegramType ?? "VXSE53",
    earthquake.reportNumber ?? null,
    earthquake.place ?? "震源調査中",
    earthquake.time ?? timestamp,
    earthquake.magnitude ?? "-",
    earthquake.depth ?? "-",
    earthquake.intensity ?? "-",
    Number(earthquake.scale ?? 0),
    earthquake.longPeriodIntensity ?? null,
    earthquake.tsunamiStatus ?? null,
    earthquake.latitude ?? null,
    earthquake.longitude ?? null,
    JSON.stringify(Array.isArray(earthquake.regions) ? earthquake.regions : []),
    timestamp,
    timestamp
  );
}

export async function runScheduledD1Backfill(env, options = {}) {
  const db = env?.EQ_D1;
  const apiKey = String(env?.DMDATA_API_KEY || "").trim();
  if (!db || !apiKey) {
    return { ok: false, skipped: true, reason: !db ? "d1_not_configured" : "dmdata_api_key_not_configured" };
  }

  const nowMs = Number(options.nowMs ?? Date.now());
  const fetchImpl = options.fetchImpl ?? fetch;
  await ensureStateSchema(db);
  if (!await acquireBackfillLock(db, nowMs)) {
    return { ok: true, skipped: true, reason: "recently_started" };
  }

  const startedAt = nowIso(nowMs);
  const previousState = await readBackfillState(db);
  const dates = buildGdBackfillDates(nowMs, previousState?.lastSuccessAt);
  const result = { dates, fetched: 0, upserted: 0, newestEventId: null };

  try {
    const authorization = `Basic ${btoa(`${apiKey}:`)}`;
    const earthquakesById = new Map();
    for (const date of dates) {
      const url = new URL(GD_EARTHQUAKE_URL);
      url.searchParams.set("date", date);
      url.searchParams.set("limit", "100");
      const payload = await fetchJsonWithTimeout(fetchImpl, url.toString(), {
        method: "GET",
        headers: { Authorization: authorization }
      });
      const items = Array.isArray(payload?.items) ? payload.items : [];
      result.fetched += items.length;
      for (const item of items) {
        const earthquake = normalizeGdEarthquakeItem(item);
        if (earthquake?.eventId && earthquake.isDistantEarthquake !== true) {
          earthquakesById.set(String(earthquake.eventId), earthquake);
        }
      }
    }

    const earthquakes = [...earthquakesById.values()].sort((left, right) => (
      Date.parse(left.time ?? "") - Date.parse(right.time ?? "")
    ));
    if (earthquakes.length > 0) {
      await db.batch(earthquakes.map(item => makeEarthquakeUpsert(db, item, startedAt)));
      result.upserted = earthquakes.length;
      result.newestEventId = String(earthquakes.at(-1)?.eventId ?? "") || null;
    }

    await writeBackfillState(db, {
      lastSuccessAt: startedAt,
      lastError: null,
      lastResult: result
    }, startedAt);
    return { ok: true, skipped: false, ...result };
  }
  catch (error) {
    const message = String(error?.message || error || "scheduled_backfill_failed");
    await writeBackfillState(db, {
      lastSuccessAt: previousState?.lastSuccessAt ?? null,
      lastError: message,
      lastResult: result
    }, startedAt).catch(() => {});
    return { ok: false, skipped: false, error: message, ...result };
  }
}
