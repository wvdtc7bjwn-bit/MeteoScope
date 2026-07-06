const CONFIG_KEY = "app-config";
const NOTICES_KEY = "app-notices";

const DEFAULT_CONFIG = {
  maintenance: {
    enabled: false,
    message: ""
  },
  settings: {}
};

export async function onRequestGet({ env }) {
  const config = await readJson(env.ADMIN_KV, CONFIG_KEY, DEFAULT_CONFIG);
  const notices = await readJson(env.ADMIN_KV, NOTICES_KEY, []);

  return json({
    maintenance: {
      enabled: Boolean(config?.maintenance?.enabled),
      message: String(config?.maintenance?.message || "")
    },
    settings: config?.settings || {},
    notices: Array.isArray(notices)
      ? notices.filter((notice) => notice?.enabled !== false).map(publicNotice)
      : [],
    generatedAt: new Date().toISOString()
  });
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

function publicNotice(notice) {
  return {
    id: notice.id,
    title: notice.title,
    body: notice.body,
    level: notice.level || "info",
    enabled: notice.enabled !== false,
    isTicker: Boolean(notice.isTicker),
    tickerSpeed: ["slow", "normal", "fast"].includes(notice.tickerSpeed) ? notice.tickerSpeed : "normal",
    tickerDirection: notice.tickerDirection === "right" ? "right" : "left",
    updatedAt: notice.updatedAt
  };
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
