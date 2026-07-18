import { MeteoScopeEarthquakeHub } from "./MeteoScopeEarthquakeHub.js";
import { fetchD1ReadFallback } from "./d1ReadFallback.js";
import { readJmaDailyHypocenterDistribution, syncJmaDailyHypocenters } from "./jmaDailyHypocenters.js";
import { isPublicReadMethod, resolvePublicEarthquakeRoute } from "./routePolicy.js";

export { MeteoScopeEarthquakeHub };

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "content-type",
  "x-content-type-options": "nosniff"
};
const PUBLIC_CACHE_VERSION = "station-coordinates-v3";

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}

function getHub(env) {
  const id = env.EARTHQUAKE_HUB.idFromName("primary");
  return env.EARTHQUAKE_HUB.get(id);
}

async function fetchFromHub(request, env, route) {
  if (route.websocket) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return jsonResponse({ ok: false, error: "websocket_upgrade_required" }, 426, {
        upgrade: "websocket"
      });
    }
    return getHub(env).fetch(
      new Request(`https://earthquake-hub.internal${route.internalPath}`, {
        method: "GET",
        headers: {
          upgrade: "websocket",
          "x-eew-authenticated": "0"
        }
      })
    );
  }

  const cache = caches.default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set("_meteoscopeCache", PUBLIC_CACHE_VERSION);
  const cacheKey = new Request(cacheUrl, { method: "GET" });

  if (route.cacheSeconds > 0) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const upstream = await getHub(env).fetch(
    new Request(`https://earthquake-hub.internal${route.internalPath}`, {
      method: "GET",
      headers: { "x-eew-authenticated": "0" }
    })
  );
  const headers = new Headers(upstream.headers);
  Object.entries(JSON_HEADERS).forEach(([key, value]) => headers.set(key, value));
  headers.set(
    "cache-control",
    route.cacheSeconds > 0
      ? `public, max-age=${route.cacheSeconds}, s-maxage=${route.cacheSeconds}`
      : "no-store"
  );
  const response = new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  });

  if (route.cacheSeconds > 0 && response.ok) {
    await cache.put(cacheKey, response.clone());
  }
  return response;
}

async function fetchDirectD1(request, env, ctx, route) {
  const cache = caches.default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set("_meteoscopeCache", "jma-distribution-v3");
  const cacheKey = new Request(cacheUrl, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const response = await readJmaDailyHypocenterDistribution(request, env, ctx);
  if (response.ok && route.cacheSeconds > 0) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }
    if (!isPublicReadMethod(request.method)) {
      return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, {
        allow: "GET, HEAD, OPTIONS"
      });
    }

    const route = resolvePublicEarthquakeRoute(new URL(request.url));
    if (route.error) {
      return jsonResponse({ ok: false, error: route.error }, route.status);
    }

    try {
      if (route.directD1) {
        return await fetchDirectD1(request, env, ctx, route);
      }
      const response = await fetchFromHub(request, env, route);
      if (!route.websocket && response.status >= 500) {
        const fallback = await fetchD1ReadFallback(
          request,
          env,
          route,
          `hub_status_${response.status}`
        );
        if (fallback) {
          return fallback;
        }
        return response;
      }
      return response;
    }
    catch (error) {
      console.error("[MeteoScopeEarthquakeWorker] public route failed", error);
      const fallback = await fetchD1ReadFallback(request, env, route, error).catch(
        (fallbackError) => {
          console.error("[MeteoScopeEarthquakeWorker] D1 fallback failed", fallbackError);
          return null;
        }
      );
      if (fallback) {
        return fallback;
      }
      return jsonResponse({ ok: false, error: "earthquake_service_unavailable" }, 503, {
        "retry-after": "30"
      });
    }
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(syncJmaDailyHypocenters(env, { maxDays: 1 }));
  }
};
