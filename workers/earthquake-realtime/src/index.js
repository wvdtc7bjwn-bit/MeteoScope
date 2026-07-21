import {
  readJmaDailyHypocenterDistribution,
  runJmaDailyFastBackfill
} from "./jmaDailyHypocenters.js";

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

async function fetchDistribution(request, env, ctx) {
  const cache = caches.default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set("_meteoscopeCache", "jma-distribution-v6");
  const cacheKey = new Request(cacheUrl, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const response = await readJmaDailyHypocenterDistribution(request, env, ctx);
  if (response.ok) ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, {
        allow: "GET, HEAD, OPTIONS"
      });
    }
    const pathname = new URL(request.url).pathname.replace(/^\/api\/earthquakes/u, "");
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

  async scheduled(_controller, env, ctx) {
    const cache = typeof caches !== "undefined" ? caches.default : null;
    ctx.waitUntil(runJmaDailyFastBackfill(env, { cache }));
  }
};
