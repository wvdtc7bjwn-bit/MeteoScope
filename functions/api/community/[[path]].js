import { authenticateAccount, requireAccountAuthentication } from "../../_shared/accountAuth.js";
import {
  COMMUNITY_REPORT_RETENTION_MS,
  normalizeCommunityReportInput,
  publicCommunityReport
} from "../../_shared/communityReports.js";
import { requireD1 } from "../../_shared/d1Store.js";
import { validateEarlyAccessToken } from "../../_shared/earlyAccessAuth.js";

const MAX_REQUEST_BYTES = 8 * 1024;
const MAX_REPORTS = 300;
const POST_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_POSTS_PER_24_HOURS = 24;

export async function onRequest({ request, env }) {
  const originHeaders = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: originHeaders });
  if (request.headers.has("Origin") && !originHeaders["Access-Control-Allow-Origin"]) {
    return json({ error: "許可されていない接続元です。" }, { status: 403 });
  }
  try {
    const route = new URL(request.url).pathname.replace(/^\/api\/community\/?/u, "").replace(/\/$/u, "");
    const method = request.method.toUpperCase();
    let response;
    if ((route === "" || route === "reports") && method === "GET") response = await listReports(request, env);
    else if ((route === "" || route === "reports") && method === "POST") response = await createReport(request, env);
    else if (route.startsWith("reports/") && method === "DELETE") {
      response = await deleteReport(request, env, decodeURIComponent(route.slice("reports/".length)));
    } else if (route.startsWith("reports/") && route.endsWith("/flag") && method === "POST") {
      response = await flagReport(request, env, decodeURIComponent(route.slice(8, -5)));
    } else response = json({ error: "Not found" }, { status: 404 });
    return withHeaders(await response, originHeaders);
  } catch (error) {
    const response = error instanceof Response
      ? error
      : json({ error: "現在地の投稿を処理できませんでした。" }, { status: 500 });
    return withHeaders(response, originHeaders);
  }
}

async function listReports(request, env) {
  const db = requireD1(env.NOTIFICATIONS_DB);
  const auth = await authenticateAccount(request, db);
  const url = new URL(request.url);
  const bounds = parseBounds(url.searchParams.get("bbox"));
  const limit = Math.min(MAX_REPORTS, Math.max(1, Number.parseInt(url.searchParams.get("limit"), 10) || MAX_REPORTS));
  const now = new Date().toISOString();
  let statement;
  if (bounds) {
    statement = db.prepare(
      `SELECT reports.*, accounts.display_name,
              CASE WHEN reports.account_id = ?1 THEN 1 ELSE 0 END AS is_own
       FROM community_reports reports
       JOIN quiz_accounts accounts ON accounts.id = reports.account_id
       WHERE reports.expires_at > ?2
         AND reports.longitude BETWEEN ?3 AND ?4
         AND reports.latitude BETWEEN ?5 AND ?6
       ORDER BY reports.created_at DESC LIMIT ?7`
    ).bind(auth?.account?.id || "", now, bounds.west, bounds.east, bounds.south, bounds.north, limit);
  } else {
    statement = db.prepare(
      `SELECT reports.*, accounts.display_name,
              CASE WHEN reports.account_id = ?1 THEN 1 ELSE 0 END AS is_own
       FROM community_reports reports
       JOIN quiz_accounts accounts ON accounts.id = reports.account_id
       WHERE reports.expires_at > ?2
       ORDER BY reports.created_at DESC LIMIT ?3`
    ).bind(auth?.account?.id || "", now, limit);
  }
  const result = await statement.all();
  return json({ reports: (result?.results ?? []).map(publicCommunityReport), retentionHours: 5 });
}

async function createReport(request, env) {
  const db = requireD1(env.NOTIFICATIONS_DB);
  const auth = await requireAccountAuthentication(request, db, "投稿にはMeteoScopeアカウントへのログインが必要です。");
  const access = await validateEarlyAccessToken(
    db,
    request.headers.get("X-MeteoScope-Early-Access"),
    { accountID: auth.account.id, bindAccount: true }
  );
  if (!access.active) throw json({ error: access.error || "アーリーアクセス認証が必要です。" }, { status: 403 });
  const input = normalizeCommunityReportInput(await readJSON(request));
  if (input.error) throw json({ error: input.error }, { status: 400 });
  await enforcePostingLimits(db, auth.account.id);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + COMMUNITY_REPORT_RETENTION_MS);
  const id = crypto.randomUUID();
  const activityDate = createdAt.toISOString().slice(0, 10);
  const counterExpiresAt = new Date(createdAt.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
  await db.batch([
    db.prepare(
      `INSERT INTO community_reports
       (id, account_id, weather, comment, sensation, temperature_tenths, hazards_json,
        latitude, longitude, area_code, area_name, created_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`
    ).bind(
      id, auth.account.id, input.weather, input.comment, input.sensation, input.temperatureTenths,
      JSON.stringify(input.hazards), input.latitude, input.longitude, input.areaCode,
      input.areaName, createdAt.toISOString(), expiresAt.toISOString()
    ),
    db.prepare(
      `INSERT INTO community_post_daily (account_id, activity_date, post_count, expires_at)
       VALUES (?1, ?2, 1, ?3)
       ON CONFLICT(account_id, activity_date) DO UPDATE SET
         post_count = community_post_daily.post_count + 1,
         expires_at = excluded.expires_at`
    ).bind(auth.account.id, activityDate, counterExpiresAt)
  ]);
  return json({ report: publicCommunityReport({
    id,
    display_name: auth.account.display_name,
    ...toDatabaseInput(input),
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    is_own: 1
  }) }, { status: 201 });
}

async function deleteReport(request, env, reportID) {
  if (!isUUID(reportID)) throw json({ error: "投稿IDが正しくありません。" }, { status: 400 });
  const db = requireD1(env.NOTIFICATIONS_DB);
  const auth = await requireAccountAuthentication(request, db, "投稿の削除にはログインが必要です。");
  const result = await db.prepare(
    "DELETE FROM community_reports WHERE id = ?1 AND account_id = ?2"
  ).bind(reportID, auth.account.id).run();
  if (Number(result?.meta?.changes || result?.changes || 0) === 0) {
    throw json({ error: "削除できる投稿がありません。" }, { status: 404 });
  }
  return json({ deleted: true });
}

async function flagReport(request, env, reportID) {
  if (!isUUID(reportID)) throw json({ error: "投稿IDが正しくありません。" }, { status: 400 });
  const db = requireD1(env.NOTIFICATIONS_DB);
  const auth = await requireAccountAuthentication(request, db, "通報にはログインが必要です。");
  const payload = await readJSON(request);
  const reason = String(payload?.reason ?? "misleading");
  if (!["misleading", "location", "spam", "other"].includes(reason)) {
    throw json({ error: "通報理由が正しくありません。" }, { status: 400 });
  }
  const result = await db.prepare(
    `INSERT INTO community_report_flags (report_id, reporter_account_id, reason, created_at)
     SELECT id, ?2, ?3, ?4 FROM community_reports WHERE id = ?1
     ON CONFLICT(report_id, reporter_account_id) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at`
  ).bind(reportID, auth.account.id, reason, new Date().toISOString()).run();
  if (Number(result?.meta?.changes || result?.changes || 0) === 0) {
    throw json({ error: "通報対象の投稿がありません。" }, { status: 404 });
  }
  return json({ flagged: true });
}

async function enforcePostingLimits(db, accountID) {
  const latest = await db.prepare(
    "SELECT created_at FROM community_reports WHERE account_id = ?1 ORDER BY created_at DESC LIMIT 1"
  ).bind(accountID).first();
  const elapsed = Date.now() - Date.parse(String(latest?.created_at || ""));
  if (Number.isFinite(elapsed) && elapsed < POST_COOLDOWN_MS) {
    const retryAfter = Math.max(1, Math.ceil((POST_COOLDOWN_MS - elapsed) / 1000));
    throw json({ error: "投稿後5分間は新しい投稿を送信できません。" }, {
      status: 429, headers: { "Retry-After": String(retryAfter) }
    });
  }
  const count = await db.prepare(
    "SELECT post_count FROM community_post_daily WHERE account_id = ?1 AND activity_date = ?2"
  ).bind(accountID, new Date().toISOString().slice(0, 10)).first();
  if (Number(count?.post_count || 0) >= MAX_POSTS_PER_24_HOURS) {
    throw json({ error: "本日の投稿上限に達しました。" }, { status: 429, headers: { "Retry-After": "3600" } });
  }
}

function toDatabaseInput(input) {
  return {
    weather: input.weather,
    comment: input.comment,
    sensation: input.sensation,
    temperature_tenths: input.temperatureTenths,
    hazards_json: JSON.stringify(input.hazards),
    latitude: input.latitude,
    longitude: input.longitude,
    area_code: input.areaCode,
    area_name: input.areaName
  };
}

function parseBounds(value) {
  if (!value) return null;
  const parts = value.split(",").map(Number);
  if (parts.length !== 4 || parts.some((number) => !Number.isFinite(number))) return null;
  const [west, south, east, north] = parts;
  if (west >= east || south >= north || west < 120 || east > 155 || south < 20 || north > 50) return null;
  return { west, south, east, north };
}

async function readJSON(request) {
  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) throw json({ error: "リクエストが大きすぎます。" }, { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_REQUEST_BYTES) {
    throw json({ error: "リクエストが大きすぎます。" }, { status: 413 });
  }
  try { return JSON.parse(text || "{}"); }
  catch { throw json({ error: "JSONが正しくありません。" }, { status: 400 }); }
}

function isUUID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(String(value));
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  const requestOrigin = new URL(request.url).origin;
  const allowed = origin === requestOrigin || origin === "https://wvdtc7bjwn-bit.github.io" || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/u.test(origin);
  if (!allowed) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-MeteoScope-Early-Access",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Vary": "Origin"
  };
}

function withHeaders(response, headers) {
  const next = new Headers(response.headers);
  Object.entries(headers).forEach(([key, value]) => next.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: next });
}

function json(payload, init = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json; charset=utf-8");
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(payload), { ...init, headers });
}
