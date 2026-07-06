const CONFIG_KEY = "app-config";
const NOTICES_KEY = "app-notices";
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
      kv: Boolean(env.ADMIN_KV),
      r2: Boolean(env.DISASTER_MAPS),
      cachePurge: Boolean(env.CLOUDFLARE_ZONE_ID && env.CLOUDFLARE_API_TOKEN)
    }
  });
}

async function status(env) {
  const config = await readJson(env.ADMIN_KV, CONFIG_KEY, DEFAULT_CONFIG);
  return json({
    ok: true,
    nowJst: new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      dateStyle: "medium",
      timeStyle: "medium"
    }).format(new Date()),
    configUpdatedAt: config?.updatedAt || "--",
    bindings: {
      kv: Boolean(env.ADMIN_KV),
      r2: Boolean(env.DISASTER_MAPS),
      cachePurge: Boolean(env.CLOUDFLARE_ZONE_ID && env.CLOUDFLARE_API_TOKEN)
    }
  });
}

async function getConfig(env) {
  const config = await readJson(env.ADMIN_KV, CONFIG_KEY, DEFAULT_CONFIG);
  return json({ config: normalizeConfig(config) });
}

async function putConfig(request, env) {
  const kv = requireKv(env);
  const payload = await request.json().catch(() => ({}));
  const config = normalizeConfig(payload.config);
  config.updatedAt = new Date().toISOString();
  await kv.put(CONFIG_KEY, JSON.stringify(config));
  return json({ config });
}

async function getNotices(env) {
  const notices = await readJson(env.ADMIN_KV, NOTICES_KEY, []);
  return json({ notices: Array.isArray(notices) ? notices : [] });
}

async function putNotices(request, env) {
  const kv = requireKv(env);
  const payload = await request.json().catch(() => ({}));
  const notices = Array.isArray(payload.notices)
    ? payload.notices.slice(0, 10).map(normalizeNotice)
    : [];
  await kv.put(NOTICES_KEY, JSON.stringify(notices));
  return json({ notices });
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
    updatedAt: notice.updatedAt || new Date().toISOString()
  };
}

async function readJson(kv, key, fallback) {
  if (!kv) return fallback;
  const value = await kv.get(key);
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function requireKv(env) {
  if (!env.ADMIN_KV) {
    throw json({ error: "ADMIN_KV が未設定です。" }, { status: 503 });
  }
  return env.ADMIN_KV;
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
