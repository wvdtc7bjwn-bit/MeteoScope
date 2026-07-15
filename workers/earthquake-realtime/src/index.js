import { MeteoScopeEarthquakeHub } from "./MeteoScopeEarthquakeHub.js";
import { isPublicReadMethod, resolvePublicEarthquakeRoute } from "./routePolicy.js";

// Keep the deployed Durable Object class name so the existing namespace,
// alarms, and DM-D.S.S secret can be adopted without losing history.
export { MeteoScopeEarthquakeHub, MeteoScopeEarthquakeHub as RealtimeHub };

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

function getHub(env) {
  const id = env.EARTHQUAKE_HUB.idFromName("primary");
  return env.EARTHQUAKE_HUB.get(id);
}

async function fetchFromHub(request, env, route) {
  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: "GET" });

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

export default {
  async fetch(request, env) {
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
      return await fetchFromHub(request, env, route);
    }
    catch (error) {
      console.error("[MeteoScopeEarthquakeWorker] public route failed", error);
      return jsonResponse({ ok: false, error: "earthquake_service_unavailable" }, 503, {
        "retry-after": "30"
      });
    }
  }
};
