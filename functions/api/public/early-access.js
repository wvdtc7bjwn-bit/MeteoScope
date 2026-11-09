import { getAccountEarlyAccess } from "../../_shared/accountEarlyAccess.js";

export async function onRequest({ request, env }) {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.headers.has("Origin") && !cors["Access-Control-Allow-Origin"]) return response({ error: "許可されていない接続元です。" }, 403);
  if (request.method !== "POST") return withHeaders(response({ error: "Method not allowed" }, 405), cors);
  if (!env.NOTIFICATIONS_DB) return withHeaders(response({ active: false, error: "認証機能が設定されていません。" }, 503), cors);
  const payload = await request.json().catch(() => ({}));
  const access = await getAccountEarlyAccess(request, env.NOTIFICATIONS_DB);
  if (!access.active) return withHeaders(response(access, access.authenticated ? 403 : 401), cors);
  const result = payload.action === "active-fault"
    ? access.activeFaultSource === "gsj"
      ? await getProtectedActiveFaultData(env.NOTIFICATIONS_DB)
      : response({ error: "このアカウントには産総研データの利用が許可されていません。" }, 403)
    : payload.action === "status" || !payload.action
      ? response(access)
      : response({ error: "未対応の操作です。" }, 400);
  return withHeaders(result, cors);
}

const ACTIVE_FAULT_MANIFEST_KEY = "early-access-active-fault:manifest";
const ACTIVE_FAULT_CHUNK_PREFIX = "early-access-active-fault:chunk:";

async function getProtectedActiveFaultData(db) {

  const manifest = await readAppRecord(db, ACTIVE_FAULT_MANIFEST_KEY);
  const chunkCount = Math.max(0, Number(manifest?.chunkCount) || 0);
  if (!chunkCount || manifest?.encoding !== "gzip-base64") {
    return response({ error: "産総研活断層データが設定されていません。" }, 503);
  }

  const rows = await db.prepare(
    `SELECT key, value
       FROM app_records
      WHERE key LIKE ?
      ORDER BY key`
  ).bind(`${ACTIVE_FAULT_CHUNK_PREFIX}%`).all();
  const chunks = (rows?.results ?? [])
    .map((row) => ({ key: String(row?.key ?? ""), value: parseStoredJson(row?.value, "") }))
    .filter((row) => row.key.startsWith(ACTIVE_FAULT_CHUNK_PREFIX) && typeof row.value === "string");
  if (chunks.length !== chunkCount) {
    return response({ error: "産総研活断層データが不完全です。" }, 503);
  }

  const gzipBytes = decodeBase64(chunks.map((row) => row.value).join(""));
  let geoJsonText;
  try {
    geoJsonText = await decompressGzipText(gzipBytes);
    const data = JSON.parse(geoJsonText);
    if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) throw new Error("Invalid GeoJSON");
  } catch {
    return response({ error: "産総研活断層データを展開できませんでした。" }, 503);
  }
  return withHeaders(new Response(geoJsonText, {
    headers: {
      "Content-Type": "application/geo+json; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Meteoscope-Data-Source": "GSJ Active Fault Database"
    }
  }), corsHeadersForProtectedData());
}

async function readAppRecord(db, key) {
  const row = await db.prepare("SELECT value FROM app_records WHERE key = ?").bind(key).first();
  return parseStoredJson(row?.value, null);
}

function parseStoredJson(value, fallback) {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function decompressGzipText(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function corsHeadersForProtectedData() {
  return {
    "Content-Disposition": "inline",
    "Vary": "Origin"
  };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  const allowed = origin === new URL(request.url).origin || origin === "https://wvdtc7bjwn-bit.github.io" || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/u.test(origin);
  return allowed ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  } : {};
}

function withHeaders(result, headers) {
  const next = new Headers(result.headers);
  Object.entries(headers).forEach(([key, value]) => next.set(key, value));
  return new Response(result.body, { status: result.status, statusText: result.statusText, headers: next });
}
