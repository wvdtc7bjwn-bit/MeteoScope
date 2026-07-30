import {
  readJmaDailyHypocenterDistribution,
  runJmaDailyHypocenterMaintenance,
  runJmaDailyFastBackfill
} from "./jmaDailyHypocenters.js";
import {
  runJmaXmlHypocenterMaintenance,
  runJmaXmlHypocenterSync
} from "./jmaXmlHypocenters.js";
import { sendDiscordEarthquakeTestNotification } from "./discordEarthquakeNotifications.js";

export const JMA_XML_SYNC_CRON = "* * * * *";
export const JMA_DAILY_BACKFILL_CRON = "17 * * * *";
export const JMA_XML_MAINTENANCE_CRON = "43 15 * * *";
export const JMA_DAILY_MAINTENANCE_CRON = "49 15 * * *";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "content-type",
  "x-content-type-options": "nosniff"
};

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}

function withCacheControl(response, cacheControl) {
  const headers = new Headers(response.headers);
  headers.set("cache-control", cacheControl);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function fetchDistribution(request, env, ctx) {
  const requestUrl = new URL(request.url);
  const fresh = requestUrl.searchParams.get("fresh") === "1";
  const cache = caches.default;
  const cacheUrl = new URL(requestUrl);
  cacheUrl.searchParams.delete("fresh");
  cacheUrl.searchParams.set(
    "_meteoscopeCache",
    fresh ? "jma-distribution-fresh-v1" : "jma-distribution-v8"
  );
  const cacheKey = new Request(cacheUrl, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return fresh ? withCacheControl(cached, "no-store") : cached;
  const response = await readJmaDailyHypocenterDistribution(request, env, ctx);
  if (!response.ok) return response;
  const cacheResponse = fresh
    ? withCacheControl(response.clone(), "public, max-age=5, s-maxage=5")
    : response.clone();
  ctx.waitUntil(cache.put(cacheKey, cacheResponse));
  return fresh ? withCacheControl(response, "no-store") : response;
}

export function getScheduledSyncName(cron) {
  if (cron === JMA_XML_MAINTENANCE_CRON) return "jma-xml-maintenance";
  if (cron === JMA_DAILY_MAINTENANCE_CRON) return "jma-daily-maintenance";
  return cron === JMA_DAILY_BACKFILL_CRON ? "daily-backfill" : "jma-xml";
}

async function runScheduledSync(cron, env, cache) {
  const syncName = getScheduledSyncName(cron);
  try {
    if (syncName === "daily-backfill") {
      return await runJmaDailyFastBackfill(env, { cache });
    }
    if (syncName === "jma-xml-maintenance") {
      return await runJmaXmlHypocenterMaintenance(env);
    }
    if (syncName === "jma-daily-maintenance") {
      return await runJmaDailyHypocenterMaintenance(env);
    }
    return await runJmaXmlHypocenterSync(env);
  }
  catch (error) {
    console.error(`[MeteoScopeHypocenterWorker] ${syncName} sync failed`, error);
    throw error;
  }
}

async function postDiscordTest(request, env) {
  if (!timingSafeEqual(
    request.headers.get("x-meteoscope-admin-token"),
    env.METEOSCOPE_ADMIN_SERVICE_TOKEN
  )) {
    return jsonResponse({ ok: false, error: "not_found" }, 404);
  }
  const result = await sendDiscordEarthquakeTestNotification(env);
  if (result.ok) {
    return jsonResponse({ ok: true, sentAt: result.sentAt });
  }
  const messages = {
    discord_webhook_not_configured: "Discord Webhook Secretが未設定です。",
    discord_rate_limited: "Discordの送信制限中です。時間をおいて再試行してください。",
    discord_timeout: "Discordへの接続がタイムアウトしました。",
    discord_network_error: "Discordへ接続できませんでした。",
    discord_message_id_missing: "Discordから投稿結果を確認できませんでした。"
  };
  return jsonResponse({
    ok: false,
    error: messages[result.error] || "Discordテスト投稿に失敗しました。"
  }, result.status || 502);
}

function timingSafeEqual(leftValue, rightValue) {
  const left = new TextEncoder().encode(String(leftValue ?? ""));
  const right = new TextEncoder().encode(String(rightValue ?? ""));
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] || 0) ^ (right[index] || 0);
  }
  return left.length > 0 && right.length > 0 && difference === 0;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }
    const pathname = new URL(request.url).pathname.replace(/^\/api\/earthquakes/u, "");
    if (pathname === "/internal/discord/test") {
      if (request.method !== "POST") {
        return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, {
          allow: "POST"
        });
      }
      return postDiscordTest(request, env);
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, {
        allow: "GET, HEAD, OPTIONS"
      });
    }
    if (pathname !== "/distribution") {
      return jsonResponse({ ok: false, error: "not_found" }, 404);
    }
    try {
      return await fetchDistribution(request, env, ctx);
    } catch (error) {
      console.error("[MeteoScopeHypocenterWorker] distribution route failed", error);
      return jsonResponse({ ok: false, error: "distribution_unavailable" }, 503, {
        "retry-after": "30"
      });
    }
  },

  async scheduled(controller, env, ctx) {
    const cache = typeof caches !== "undefined" ? caches.default : null;
    ctx.waitUntil(runScheduledSync(controller?.cron, env, cache));
  }
};
