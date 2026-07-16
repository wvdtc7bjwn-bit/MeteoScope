import { readJson, writeJson, requireD1 } from "../../_shared/d1Store.js";
import { readCloudflareD1Usage } from "../../_shared/cloudflareD1Analytics.js";
import { readQuizOperationalMetrics } from "../../_shared/quizMaintenance.js";
import { listAdminPushBroadcasts, queueAdminPushBroadcast, readWarningCronHealth } from "../push/[[path]].js";

const CONFIG_KEY = "app-config";
const NOTICES_KEY = "app-notices";
const FEEDBACK_KEY = "user-feedback";
const EARLY_ACCESS_CODES_KEY = "early-access-codes";
const PDF_OBJECT_KEY = "admin/disaster-map.pdf";
const SESSION_COOKIE = "weather_viewer_admin";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

const DEFAULT_CONFIG = {
  maintenance: {
    enabled: false,
    message: ""
  },
  settings: {}
};

export async function onRequest({ request, env }) {
  try {
    const url = new URL(request.url);
    const route = url.pathname.replace(/^\/api\/admin\/?/, "");
    const method = request.method.toUpperCase();

    if (route === "login" && method === "POST") return await login(request, env);
    if (route === "logout" && method === "POST") return logout();
    if (route === "session" && method === "GET") return await sessionStatus(request, env);

    const auth = await isAuthenticated(request, env);
    if (!auth.ok) return json({ error: "認証が必要です。" }, { status: 401 });

    if ((route === "" || route === "status") && method === "GET") return await status(env);
    if (route === "config" && method === "GET") return await getConfig(env);
    if (route === "config" && method === "PUT") return await putConfig(request, env);
    if (route === "notices" && method === "GET") return await getNotices(env);
    if (route === "notices" && method === "PUT") return await putNotices(request, env);
    if (route === "push/broadcasts" && method === "GET") return await getPushBroadcasts(env);
    if (route === "push/broadcasts" && method === "POST") return await postPushBroadcast(request, env);
    if (route === "feedback" && method === "GET") return await getFeedback(env);
    if (route === "early-access/codes" && method === "GET") return await getEarlyAccessCodes(env);
    if (route === "early-access/codes" && method === "POST") return await createEarlyAccessCode(request, env);
    if (route.startsWith("early-access/codes/") && method === "DELETE") {
      return await deleteEarlyAccessCode(decodeURIComponent(route.slice("early-access/codes/".length)), env);
    }
    if (route === "disaster-map" && method === "GET") return await getDisasterMapInfo(env);
    if (route === "disaster-map" && method === "POST") return await putDisasterMap(request, env);
    if (route === "disaster-map" && method === "DELETE") return await deleteDisasterMap(env);
    if (route === "disaster-map/file" && method === "GET") return await getDisasterMapFile(env);
    if (route === "cache/purge" && method === "POST") return await purgeCache(env);

    return json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[Admin API]", error);
    return json({ error: "管理APIでエラーが発生しました。" }, { status: 500 });
  }
}

async function login(request, env) {
  if (!env.ADMIN_PASSWORD) {
    return json({ error: "ADMIN_PASSWORD が未設定です。" }, { status: 503 });
  }
  const payload = await request.json().catch(() => ({}));
  const password = String(payload.password || "");
  if (!timingSafeEqual(password, env.ADMIN_PASSWORD)) {
    return json({ error: "パスワードが違います。" }, { status: 401 });
  }
  const token = await createSessionToken(env);
  return json(
    { authenticated: true },
    {
      headers: {
        "Set-Cookie": buildSessionCookie(token)
      }
    }
  );
}

function logout() {
  return json(
    { authenticated: false },
    {
      headers: {
        "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=0`
      }
    }
  );
}

async function sessionStatus(request, env) {
  const auth = await isAuthenticated(request, env);
  return json({
    authenticated: auth.ok,
    setup: {
      passwordConfigured: Boolean(env.ADMIN_PASSWORD),
      d1: Boolean(env.NOTIFICATIONS_DB),
      r2: Boolean(env.DISASTER_MAPS),
      cachePurge: Boolean(env.CLOUDFLARE_ZONE_ID && env.CLOUDFLARE_API_TOKEN)
    }
  });
}

async function status(env) {
  const [config, warningCron, quiz, d1Usage] = await Promise.all([
    readJson(env.NOTIFICATIONS_DB, CONFIG_KEY, DEFAULT_CONFIG),
    readWarningCronHealth(env),
    readQuizOperationalMetrics(env),
    readCloudflareD1Usage(env)
  ]);
  return json({
    ok: true,
    nowJst: new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      dateStyle: "medium",
      timeStyle: "medium"
    }).format(new Date()),
    configUpdatedAt: config?.updatedAt || "--",
    warningCron,
    quiz,
    d1Usage,
    bindings: {
      d1: Boolean(env.NOTIFICATIONS_DB),
      r2: Boolean(env.DISASTER_MAPS),
      cachePurge: Boolean(env.CLOUDFLARE_ZONE_ID && env.CLOUDFLARE_API_TOKEN),
      d1Analytics: Boolean(
        env.CLOUDFLARE_ACCOUNT_ID
          && env.D1_DATABASE_ID
          && (env.CLOUDFLARE_ANALYTICS_API_TOKEN || env.CLOUDFLARE_API_TOKEN)
      )
    }
  });
}

async function getConfig(env) {
  const config = await readJson(env.NOTIFICATIONS_DB, CONFIG_KEY, DEFAULT_CONFIG);
  return json({ config: normalizeConfig(config) });
}

async function putConfig(request, env) {
  const db = requireDb(env);
  const payload = await request.json().catch(() => ({}));
  const config = normalizeConfig(payload.config);
  config.updatedAt = new Date().toISOString();
  await writeJson(db, CONFIG_KEY, config);
  return json({ config });
}

async function getNotices(env) {
  const notices = await readJson(env.NOTIFICATIONS_DB, NOTICES_KEY, []);
  return json({ notices: Array.isArray(notices) ? notices.map(normalizeNotice) : [] });
}

async function putNotices(request, env) {
  const db = requireDb(env);
  const payload = await request.json().catch(() => ({}));
  const notices = Array.isArray(payload.notices)
    ? payload.notices.slice(0, 10).map(normalizeNotice)
    : [];
  await writeJson(db, NOTICES_KEY, notices);
  return json({ notices });
}

async function getPushBroadcasts(env) {
  const broadcasts = await listAdminPushBroadcasts(env);
  return json({ broadcasts });
}

async function postPushBroadcast(request, env) {
  const payload = await request.json().catch(() => ({}));
  const broadcast = await queueAdminPushBroadcast(env, payload);
  const broadcasts = await listAdminPushBroadcasts(env);
  return json({ broadcast, broadcasts }, { status: 202 });
}

async function getFeedback(env) {
  const feedback = await readJson(env.NOTIFICATIONS_DB, FEEDBACK_KEY, []);
  return json({
    feedback: Array.isArray(feedback)
      ? feedback.slice(0, 100).map(normalizeFeedback)
      : []
  });
}

async function getEarlyAccessCodes(env) {
  const codes = await readJson(env.NOTIFICATIONS_DB, EARLY_ACCESS_CODES_KEY, []);
  return json({ codes: Array.isArray(codes) ? codes.map(publicEarlyAccessCode) : [] });
}

async function createEarlyAccessCode(request, env) {
  const db = requireDb(env);
  try {
    const payload = await request.json().catch(() => ({}));
    const codes = await readJson(db, EARLY_ACCESS_CODES_KEY, []);
    if (Array.isArray(codes) && codes.length >= 100) {
      return json({ error: "発行済みコードが100件に達しています。不要なコードを失効してください。" }, { status: 400 });
    }
    const serial = generateSerialCode();
    const expiresAt = normalizeExpiration(payload.expiresAt);
    const maxUses = Math.min(10000, Math.max(1, Number.parseInt(payload.maxUses, 10) || 1));
    const entry = {
      id: generateEntryId(),
      codeHash: await hashValue(normalizeSerial(serial)),
      label: String(payload.label || "アーリーアクセス").trim().slice(0, 80) || "アーリーアクセス",
      createdAt: new Date().toISOString(),
      expiresAt,
      maxUses,
      uses: 0,
      lastUsedAt: null
    };
    const nextCodes = [entry, ...(Array.isArray(codes) ? codes : [])];
    await writeJson(db, EARLY_ACCESS_CODES_KEY, nextCodes);
    return json({ serial, codes: nextCodes.map(publicEarlyAccessCode) }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[Admin API] early access serial generation failed", error);
    const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
    return json({ error: `シリアルコードを保存できませんでした${detail}` }, { status: 503 });
  }
}

async function deleteEarlyAccessCode(id, env) {
  const db = requireDb(env);
  const codes = await readJson(db, EARLY_ACCESS_CODES_KEY, []);
  const nextCodes = (Array.isArray(codes) ? codes : []).filter((item) => item.id !== id);
  if (nextCodes.length === codes.length) return json({ error: "対象のコードが見つかりません。" }, { status: 404 });
  await writeJson(db, EARLY_ACCESS_CODES_KEY, nextCodes);
  return json({ codes: nextCodes.map(publicEarlyAccessCode) });
}

function publicEarlyAccessCode(entry) {
  return {
    id: String(entry?.id || ""),
    label: String(entry?.label || "アーリーアクセス"),
    createdAt: entry?.createdAt || null,
    expiresAt: entry?.expiresAt || null,
    maxUses: Math.max(1, Number(entry?.maxUses) || 1),
    uses: Math.max(0, Number(entry?.uses) || 0),
    lastUsedAt: entry?.lastUsedAt || null
  };
}

function normalizeExpiration(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return null;
  return new Date(timestamp).toISOString();
}

function generateSerialCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const value = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
  return `MS-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
}

function generateEntryId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeSerial(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function hashValue(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getDisasterMapInfo(env) {
  if (!env.DISASTER_MAPS) return json({ hasFile: false, configured: false });
  const object = await env.DISASTER_MAPS.head(PDF_OBJECT_KEY);
  return json({
    hasFile: Boolean(object),
    configured: true,
    meta: object ? objectMeta(object) : null
  });
}

async function putDisasterMap(request, env) {
  const bucket = requireR2(env);
  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return json({ error: "PDFファイルを選択してください。" }, { status: 400 });
  }
  if (file.type && file.type !== "application/pdf") {
    return json({ error: "PDFファイルのみ保存できます。" }, { status: 400 });
  }
  await bucket.put(PDF_OBJECT_KEY, file.stream(), {
    httpMetadata: {
      contentType: "application/pdf"
    },
    customMetadata: {
      name: file.name || "disaster-map.pdf",
      size: String(file.size || 0),
      updatedAt: new Date().toISOString()
    }
  });
  return await getDisasterMapInfo(env);
}

async function deleteDisasterMap(env) {
  const bucket = requireR2(env);
  await bucket.delete(PDF_OBJECT_KEY);
  return json({ hasFile: false, configured: true, meta: null });
}

async function getDisasterMapFile(env) {
  const bucket = requireR2(env);
  const object = await bucket.get(PDF_OBJECT_KEY);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "application/pdf",
      "Content-Disposition": `inline; filename="${sanitizeFilename(object.customMetadata?.name || "disaster-map.pdf")}"`,
      "Cache-Control": "private, max-age=60"
    }
  });
}

async function purgeCache(env) {
  if (!env.CLOUDFLARE_ZONE_ID || !env.CLOUDFLARE_API_TOKEN) {
    return json({
      ok: false,
      message: "Cloudflare の Zone ID または API Token が未設定です。"
    });
  }
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/purge_cache`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ purge_everything: true })
  });
  const result = await response.json().catch(() => ({}));
  return json(
    {
      ok: response.ok,
      message: response.ok ? "Cloudflare キャッシュを削除しました。" : "キャッシュ削除に失敗しました。",
      result
    },
    { status: response.ok ? 200 : 502 }
  );
}

function normalizeConfig(config) {
  return {
    ...DEFAULT_CONFIG,
    ...(config || {}),
    maintenance: {
      ...DEFAULT_CONFIG.maintenance,
      ...(config?.maintenance || {}),
      enabled: Boolean(config?.maintenance?.enabled),
      message: String(config?.maintenance?.message || "").slice(0, 300)
    },
    settings: config?.settings && typeof config.settings === "object" ? config.settings : {}
  };
}

function normalizeNotice(notice) {
  return {
    id: String(notice.id || crypto.randomUUID()),
    title: String(notice.title || "お知らせ").slice(0, 80),
    body: String(notice.body || "").slice(0, 500),
    level: ["info", "warning", "critical"].includes(notice.level) ? notice.level : "info",
    enabled: notice.enabled !== false,
    isTicker: Boolean(notice.isTicker),
    tickerSpeed: ["slow", "normal", "fast"].includes(notice.tickerSpeed) ? notice.tickerSpeed : "normal",
    tickerDirection: notice.tickerDirection === "right" ? "right" : "left",
    updatedAt: notice.updatedAt || new Date().toISOString()
  };
}

function normalizeFeedback(item) {
  return {
    id: String(item.id || ""),
    category: ["request", "bug", "design", "other"].includes(item.category) ? item.category : "other",
    message: String(item.message || "").slice(0, 1000),
    page: String(item.page || "").slice(0, 200),
    createdAt: item.createdAt || ""
  };
}

function requireDb(env) {
  try { return requireD1(env.NOTIFICATIONS_DB); }
  catch { throw json({ error: "NOTIFICATIONS_DB が未設定です。" }, { status: 503 }); }
}

function requireR2(env) {
  if (!env.DISASTER_MAPS) {
    throw json({ error: "DISASTER_MAPS が未設定です。" }, { status: 503 });
  }
  return env.DISASTER_MAPS;
}

function objectMeta(object) {
  return {
    name: object.customMetadata?.name || "disaster-map.pdf",
    size: Number(object.customMetadata?.size || object.size || 0),
    updatedAt: object.customMetadata?.updatedAt || object.uploaded?.toISOString?.() || null
  };
}

function sanitizeFilename(name) {
  return String(name).replace(/["\\\r\n]/g, "_");
}

async function isAuthenticated(request, env) {
  if (!env.ADMIN_PASSWORD) return { ok: false };
  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const token = cookies[SESSION_COOKIE];
  if (!token) return { ok: false };
  return { ok: await verifySessionToken(token, env) };
}

async function createSessionToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now,
    exp: now + SESSION_TTL_SECONDS
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(encodedPayload, env);
  return `${encodedPayload}.${signature}`;
}

async function verifySessionToken(token, env) {
  const [encodedPayload, signature] = String(token).split(".");
  if (!encodedPayload || !signature) return false;
  const expected = await sign(encodedPayload, env);
  if (!timingSafeEqual(signature, expected)) return false;
  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    return Number(payload.exp || 0) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function sign(value, env) {
  const keyData = new TextEncoder().encode(env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD);
  const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function buildSessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=${SESSION_TTL_SECONDS}`;
}

function parseCookies(header) {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1
          ? [part, ""]
          : [part.slice(0, index), part.slice(index + 1)];
      })
  );
}

function timingSafeEqual(a, b) {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] || 0) ^ (right[index] || 0);
  }
  return diff === 0;
}

function base64UrlEncode(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function json(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(init.headers || {})
    }
  });
}
