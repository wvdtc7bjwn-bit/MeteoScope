const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function parseArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function mapD1EarthquakeRow(row) {
  if (!row) return null;
  return {
    event_id: row.event_id,
    telegram_type: row.telegram_type,
    report_number: row.report_number,
    place: row.place,
    origin_time: row.origin_time,
    magnitude: row.magnitude,
    depth: row.depth,
    max_intensity: row.max_intensity,
    max_scale: Number(row.max_scale ?? 0),
    long_period_intensity: row.long_period_intensity,
    tsunami_status: row.tsunami_status ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    regions: parseArray(row.regions_json),
    updated_at: row.updated_at,
    created_at: row.created_at
  };
}

function mapStationRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => /^\d{7}$/.test(String(row.station_code ?? "")))
    .map((row) => ({
      event_id: row.event_id,
      station_code: row.station_code,
      station_name: row.station_name,
      intensity: row.intensity ?? "-",
      scale: Number(row.scale ?? 0),
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      updated_at: row.updated_at
    }));
}

export function mapD1TsunamiRow(row) {
  if (!row || Number(row.revoked) === 1) return null;
  return {
    eventId: String(row.event_id ?? ""),
    telegramType: row.telegram_type ?? null,
    type: row.telegram_type ?? null,
    time: row.issue_time ?? row.updated_at,
    reportTime: row.issue_time ?? row.updated_at,
    revoked: false,
    isCanceled: false,
    areas: parseArray(row.areas_json),
    observations: parseArray(row.observations_json),
    estimations: parseArray(row.estimations_json),
    comments: (() => {
      if (!row.comments_json) return null;
      try { return JSON.parse(row.comments_json); } catch { return row.comments_json; }
    })()
  };
}

async function queryEarthquakes(db, limit) {
  const result = await db.prepare(`
    SELECT event_id, telegram_type, report_number, place, origin_time,
      magnitude, depth, max_intensity, max_scale, long_period_intensity,
      tsunami_status, latitude, longitude, regions_json, updated_at, created_at
    FROM earthquake_history
    WHERE event_id NOT LIKE 'TEST%'
      AND place NOT LIKE '%テスト%'
      AND COALESCE(place, '') != '震源調査中'
    ORDER BY datetime(origin_time) DESC, datetime(updated_at) DESC
    LIMIT ?
  `).bind(limit).all();
  return (result?.results ?? []).map(mapD1EarthquakeRow).filter(Boolean);
}

async function queryStations(db, eventId) {
  const result = await db.prepare(`
    SELECT event_id, station_code, station_name, intensity,
      scale, latitude, longitude, updated_at
    FROM station_intensities
    WHERE event_id = ?
    ORDER BY scale DESC, station_code ASC
  `).bind(eventId).all();
  return mapStationRows(result?.results ?? []);
}

async function historyFallback(request, db) {
  const requested = Number(new URL(request.url).searchParams.get("limit") ?? 12);
  const limit = Math.max(1, Math.min(100, Number.isFinite(requested) ? requested : 12));
  return json({
    enabled: true,
    items: await queryEarthquakes(db, limit),
    source: "d1-fallback",
    degraded: true
  });
}

async function stationsFallback(route, db) {
  const match = route.internalPath.match(/^\/history\/([^/]+)\/stations$/);
  const eventId = match ? decodeURIComponent(match[1]) : "";
  return json({
    enabled: true,
    eventId,
    items: eventId ? await queryStations(db, eventId) : [],
    source: "d1-fallback",
    degraded: true
  });
}

async function latestFallback(db) {
  const [earthquake] = await queryEarthquakes(db, 1);
  const points = earthquake ? await queryStations(db, earthquake.event_id) : [];
  const tsunamiRow = await db.prepare(`
    SELECT event_id, telegram_type, issue_time, revoked, areas_json,
      observations_json, estimations_json, comments_json, updated_at, created_at
    FROM tsunami_history
    WHERE revoked = 0
      AND datetime(COALESCE(issue_time, updated_at)) >= datetime('now', '-24 hours')
    ORDER BY datetime(issue_time) DESC, datetime(updated_at) DESC
    LIMIT 1
  `).first();
  const tsunami = mapD1TsunamiRow(tsunamiRow);
  return json({
    ok: true,
    latest: {
      earthquake: earthquake ? {
        receivedAt: earthquake.updated_at ?? earthquake.origin_time,
        data: {
          eventId: earthquake.event_id,
          reportNumber: earthquake.report_number,
          place: earthquake.place,
          scale: earthquake.max_scale,
          intensity: earthquake.max_intensity ?? "-",
          magnitude: earthquake.magnitude ?? "-",
          depth: earthquake.depth ?? "-",
          latitude: earthquake.latitude,
          longitude: earthquake.longitude,
          time: earthquake.origin_time,
          points: points.map((point) => ({
            code: point.station_code,
            name: point.station_name,
            intensity: point.intensity,
            scale: point.scale,
            latitude: point.latitude,
            longitude: point.longitude
          })),
          regions: earthquake.regions,
          telegramType: earthquake.telegram_type
        }
      } : null,
      eew: null,
      tsunami: tsunami ? {
        data: tsunami,
        receivedAt: tsunamiRow.updated_at ?? tsunamiRow.issue_time
      } : null,
      finalizedEewEventIds: []
    },
    source: "d1-fallback",
    degraded: true
  });
}

async function healthFallback(db, reason) {
  const count = await db.prepare(`
    SELECT COUNT(*) AS count FROM earthquake_history
    WHERE event_id NOT LIKE 'TEST%'
  `).first();
  return json({
    ok: true,
    service: "meteoscope-earthquake-d1-fallback",
    timestamp: new Date().toISOString(),
    historyCount: Number(count?.count ?? 0),
    degraded: true,
    realtimeAvailable: false,
    reason: String(reason?.message ?? reason ?? "durable_object_unavailable").slice(0, 160)
  });
}

export async function fetchD1ReadFallback(request, env, route, reason) {
  const db = env?.EQ_D1;
  if (!db || route.websocket) return null;
  if (route.internalPath === "/latest") return latestFallback(db);
  if (route.internalPath === "/health") return healthFallback(db, reason);
  if (route.internalPath.startsWith("/history?")) return historyFallback(request, db);
  if (/^\/history\/[^/]+\/stations$/.test(route.internalPath)) {
    return stationsFallback(route, db);
  }
  return null;
}
