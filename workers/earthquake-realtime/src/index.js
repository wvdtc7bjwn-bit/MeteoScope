import {
  readJmaDailyHypocenterDistribution,
  runJmaDailyFastBackfill
} from "./jmaDailyHypocenters.js";
import { runJmaXmlHypocenterSync } from "./jmaXmlHypocenters.js";

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

async function runScheduledSync(env, cache) {
  const jobs = [
    ["JMA XML", runJmaXmlHypocenterSync(env)],
    ["JMA daily backfill", runJmaDailyFastBackfill(env, { cache })]
  ];
  const results = await Promise.allSettled(jobs.map(([, job]) => job));
  const failures = results.flatMap((result, index) => {
    if (result.status !== "rejected") return [];
    const [name] = jobs[index];
    console.error(`[MeteoScopeHypocenterWorker] ${name} sync failed`, result.reason);
    return [result.reason instanceof Error ? result.reason : new Error(String(result.reason))];
  });
  if (failures.length) {
    throw new AggregateError(failures, "scheduled_earthquake_sync_failed");
  }
  return results.map((result) => result.value);
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
    ctx.waitUntil(runScheduledSync(env, cache));
  }
};
