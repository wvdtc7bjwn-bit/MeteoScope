const EVENT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,96}$/;

export function resolvePublicEarthquakeRoute(url) {
  const requestedPath = url.pathname.replace(/\/+$/, "") || "/";
  const pathname = requestedPath.startsWith("/api/earthquakes/")
    ? requestedPath.replace(/^\/api\/earthquakes/, "/api")
    : requestedPath;

  if (pathname === "/api/latest") {
    return { internalPath: "/latest", cacheSeconds: 0 };
  }

  if (pathname === "/api/stream") {
    return { internalPath: "/connect", cacheSeconds: 0, websocket: true };
  }

  if (pathname === "/api/health") {
    return { internalPath: "/health", cacheSeconds: 0 };
  }

  if (pathname === "/api/distribution") {
    const dayOffset = url.searchParams.get("dayOffset") ?? "0";
    const minMagnitude = url.searchParams.get("minMagnitude") ?? "0";
    const maxDepth = url.searchParams.get("maxDepth") ?? "all";
    if (!/^\d{1,2}$/u.test(dayOffset) || Number(dayOffset) > 14) {
      return { error: "invalid_day_offset", status: 400 };
    }
    if (!["all", "0", "1", "2", "3", "4", "5"].includes(minMagnitude)) {
      return { error: "invalid_min_magnitude", status: 400 };
    }
    if (!["all", "30", "100", "300", "700"].includes(maxDepth)) {
      return { error: "invalid_max_depth", status: 400 };
    }
    return { internalPath: "/distribution", cacheSeconds: 300, directD1: true };
  }

  if (pathname === "/api/history") {
    const rawLimit = url.searchParams.get("limit") ?? "12";
    if (!/^\d{1,3}$/.test(rawLimit)) {
      return { error: "invalid_limit", status: 400 };
    }
    const limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return { error: "invalid_limit", status: 400 };
    }
    return {
      internalPath: `/history?limit=${limit}`,
      cacheSeconds: 15
    };
  }

  const stationsMatch = pathname.match(/^\/api\/history\/([^/]+)\/stations$/);
  if (stationsMatch) {
    let eventId = "";
    try {
      eventId = decodeURIComponent(stationsMatch[1]);
    }
    catch {
      return { error: "invalid_event_id", status: 400 };
    }
    if (!EVENT_ID_PATTERN.test(eventId)) {
      return { error: "invalid_event_id", status: 400 };
    }
    return {
      internalPath: `/history/${encodeURIComponent(eventId)}/stations`,
      cacheSeconds: 24 * 60 * 60
    };
  }

  return { error: "not_found", status: 404 };
}

export function isPublicReadMethod(method) {
  return method === "GET" || method === "HEAD";
}
