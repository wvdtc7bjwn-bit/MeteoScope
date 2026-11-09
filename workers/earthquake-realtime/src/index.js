import {
  readJmaDailyHypocenterDistribution,
  runJmaDailyHypocenterMaintenance,
  runJmaDailyFastBackfill
} from "./jmaDailyHypocenters.js";
import {
  runJmaXmlHypocenterMaintenance,
  runJmaXmlHypocenterSync,
  parseJmaXmlHypocenterReport
} from "./jmaXmlHypocenters.js";
import {
  buildDiscordEarthquakeWebhookPayload,
  readDiscordEarthquakeCard,
  sendDiscordEarthquakeTestNotification,
  sendDiscordEarthquakePreviousTestNotification
} from "./discordEarthquakeNotifications.js";

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
  return result.ok
    ? jsonResponse({ ok: true, sentAt: result.sentAt })
    : jsonResponse({ ok: false, error: result.error }, result.status || 502);
}

async function postDiscordPreviousTest(request, env) {
  if (!timingSafeEqual(
    request.headers.get("x-meteoscope-admin-token"),
    env.METEOSCOPE_ADMIN_SERVICE_TOKEN
  )) return jsonResponse({ ok: false, error: "not_found" }, 404);
  const latest = await env.EQ_D1.prepare(`
    SELECT n.event_id, n.entry_url
    FROM discord_earthquake_notifications n
    JOIN jma_xml_hypocenters j ON j.event_id = n.event_id
    WHERE j.active = 1 AND n.status = 'sent'
    ORDER BY j.origin_time DESC, j.report_time DESC
    LIMIT 2
  `).all();
  const previous = latest?.results?.[1];
  if (!previous?.entry_url) {
    return jsonResponse({ ok: false, error: "前回の地震情報が見つかりません。" }, 404);
  }
  let report;
  try {
    const source = await fetch(previous.entry_url, { signal: AbortSignal.timeout(8000) });
    if (!source.ok) throw new Error("jma_source_unavailable");
    report = parseJmaXmlHypocenterReport(await source.text(), {
      url: previous.entry_url, xmlCode: "VXSE53"
    });
    if (report.eventId !== previous.event_id || report.ignored || report.active !== 1) {
      throw new Error("jma_source_mismatch");
    }
  } catch (error) {
    console.warn("[MeteoScope] Previous earthquake source unavailable", error?.message ?? error);
    return jsonResponse({ ok: false, error: "前回の地震情報を取得できませんでした。" }, 502);
  }
  const payload = buildDiscordEarthquakeWebhookPayload(report);
  await env.EQ_D1.prepare(`
    UPDATE discord_earthquake_notifications SET payload_json = ? WHERE event_id = ?
  `).bind(JSON.stringify(payload), previous.event_id).run();
  const result = await sendDiscordEarthquakePreviousTestNotification(env, {
    event_id: previous.event_id, payload_json: JSON.stringify(payload)
  });
  if (result.ok) {
    return jsonResponse({ ok: true, sentAt: result.sentAt,
      eventId: result.eventId, messageId: result.messageId, imageAttached: true });
  }
  const messages = {
    discord_webhook_not_configured: "Discord Webhook Secretが未設定です。",
    discord_rate_limited: "Discordの送信制限中です。時間をおいて再試行してください。",
    discord_timeout: "Discordへの接続がタイムアウトしました。",
    discord_network_error: "Discordへ接続できませんでした。",
    discord_message_id_missing: "Discordから投稿結果を確認できませんでした。",
    discord_test_image_unavailable: "地震の共有画像を生成できませんでした。",
    discord_test_attachment_missing: "Discordで画像添付を確認できませんでした。"
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
    if (pathname === "/internal/discord/test" || pathname === "/internal/discord/test-previous") {
      if (request.method !== "POST") {
        return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, {
          allow: "POST"
        });
      }
      return pathname.endsWith("test-previous")
        ? postDiscordPreviousTest(request, env) : postDiscordTest(request, env);
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, {
        allow: "GET, HEAD, OPTIONS"
      });
    }
    if (pathname === "/discord-card") {
      try {
        const card = await readDiscordEarthquakeCard(env.EQ_D1, new URL(request.url).searchParams.get("event"));
        return card
          ? jsonResponse(card, 200, { "cache-control": "public, max-age=60" })
          : jsonResponse({ ok: false, error: "not_found" }, 404);
      } catch (error) {
        console.error("[MeteoScopeHypocenterWorker] Discord card route failed", error);
        return jsonResponse({ ok: false, error: "card_unavailable" }, 503);
      }
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
