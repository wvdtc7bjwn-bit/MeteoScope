import { loadP2pHistory } from "../../src/earthquake/p2pHistory.js";
import { getJstHistoryDate, isJmaHistoryDate, shiftHistoryDate } from "../../src/jma/earthquakeHistoryApi.js";

export async function onRequestGet({ request, waitUntil }) {
  const url = new URL(request.url);
  const today = getJstHistoryDate();
  const startDate = url.searchParams.get("start");
  if (!isJmaHistoryDate(startDate) || startDate > today || startDate < shiftHistoryDate(today, -14)) {
    return Response.json({ ok: false, error: "invalid_date_range" }, { status: 400 });
  }
  // The response is independent of map/search filters and is shared at the
  // edge. Never cache failed or capped acquisition as an empty complete range.
  const cacheUrl = new URL("/api/earthquake-recent", url.origin);
  cacheUrl.search = new URLSearchParams({ start: startDate, end: today, v: "1" }).toString();
  const key = new Request(cacheUrl);
  const cache = globalThis.caches?.default;
  try {
    const cached = await cache?.match(key);
    if (cached) return cached;
  } catch { /* A cache outage must not prevent acquisition. */ }
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]);
    const result = await loadP2pHistory({ startDate, endDate: today, signal });
    const response = Response.json(result, { headers: {
      "cache-control": result.complete ? "public, max-age=0, s-maxage=30" : "no-store",
      "access-control-allow-origin": "*", "x-content-type-options": "nosniff"
    } });
    if (cache && result.complete) {
      const write = cache.put(key, response.clone()).catch(() => {});
      if (waitUntil) waitUntil(write); else await write;
    }
    return response;
  } catch {
    return Response.json({ ok: false, error: "p2p_unavailable" }, { status: request.signal.aborted ? 499 : 502 });
  }
}
