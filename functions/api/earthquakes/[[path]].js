const RESPONSE_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "content-type",
  "x-content-type-options": "nosniff"
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...RESPONSE_HEADERS,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }
  const sourceUrl = new URL(request.url);
  const suffix = sourceUrl.pathname.replace(/^\/api\/earthquakes/, "") || "/";
  if (suffix !== "/distribution") {
    return jsonResponse({ ok: false, error: "not_found" }, 404);
  }
  if (!env.HYPOCENTER_ARCHIVE?.fetch) {
    return jsonResponse({ ok: false, error: "earthquake_service_not_configured" }, 503);
  }

  const target = new URL(`https://earthquake-worker.internal/api/earthquakes${suffix}`);
  target.search = sourceUrl.search;

  try {
    const upstream = await env.HYPOCENTER_ARCHIVE.fetch(
      new Request(target, {
        method: request.method
      })
    );
    const headers = new Headers(upstream.headers);
    Object.entries(RESPONSE_HEADERS).forEach(([key, value]) => headers.set(key, value));
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers
    });
  }
  catch (error) {
    console.error("[hypocenter-distribution-proxy] service binding failed", error);
    return jsonResponse({ ok: false, error: "earthquake_service_unavailable" }, 503);
  }
}
