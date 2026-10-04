import { JMA_EARTHQUAKE_HISTORY_SOURCE_URL, JMA_EARTHQUAKE_INTENSITY_API_URL } from "../../src/jma/earthquakeHistoryApi.js";

const EVENT_ID_PATTERN = /^\d{12,17}$/u;
const CACHE_TTL_SECONDS = 24 * 60 * 60;

function jsonResponse(payload, status = 200, cacheControl = "no-store") {
  return Response.json(payload, { status, headers: {
    "cache-control": cacheControl,
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff"
  } });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const id = String(url.searchParams.get("id") ?? "");
  if (!EVENT_ID_PATTERN.test(id)) return jsonResponse({ ok: false, error: "invalid_event_id" }, 400);
  // Local archive IDs can include milliseconds; JMA's event API uses the
  // 14-digit, second-resolution ID.
  const jmaEventId = id.slice(0, 14);

  const cacheKey = new Request(new URL(`/api/earthquake-history-event?v=1&id=${encodeURIComponent(jmaEventId)}`, url.origin));
  const cache = globalThis.caches?.default;
  if (cache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    } catch (error) {
      console.warn("[earthquake-history-event] cache read failed", error);
    }
  }

  try {
    context.request.signal.throwIfAborted();
    const form = new URLSearchParams({ mode: "event", id: jmaEventId });
    const response = await fetch(JMA_EARTHQUAKE_INTENSITY_API_URL, {
      method: "POST",
      headers: { accept: "application/json", referer: JMA_EARTHQUAKE_HISTORY_SOURCE_URL },
      body: form,
      signal: AbortSignal.any([context.request.signal, AbortSignal.timeout(20_000)])
    });
    if (!response.ok) throw new Error(`JMA returned HTTP ${response.status}`);
    const payload = await response.json();
    const source = payload?.res;
    const hypocenter = Array.isArray(source?.hyp)
      ? source.hyp.find((item) => String(item?.id) === jmaEventId) ?? source.hyp[0]
      : source?.hyp;
    const observations = Array.isArray(source?.int) ? source.int : null;
    if (!hypocenter || !observations) throw new Error("JMA returned an unsupported event response");
    const event = {
      hypocenter: {
        id: String(hypocenter.id ?? jmaEventId),
        originTime: String(hypocenter.ot ?? ""),
        place: String(hypocenter.name ?? ""),
        lat: hypocenter.lat,
        lon: hypocenter.lon,
        depth: String(hypocenter.dep ?? ""),
        magnitude: hypocenter.mag,
        maxIntensity: String(hypocenter.maxI ?? "")
      },
      stations: observations.map((station) => ({
        name: String(station?.name ?? ""),
        latitude: station?.lat,
        longitude: station?.lon,
        code: String(station?.code ?? ""),
        intensity: String(station?.int ?? ""),
        character: String(station?.char ?? "")
      }))
    };
    const result = jsonResponse({ ok: true, event }, 200, `public, max-age=0, s-maxage=${CACHE_TTL_SECONDS}`);
    if (cache) {
      const write = cache.put(cacheKey, result.clone()).catch((error) => console.warn("[earthquake-history-event] cache write failed", error));
      if (context.waitUntil) context.waitUntil(write);
      else await write;
    }
    return result;
  } catch (error) {
    if (context.request.signal.aborted) return jsonResponse({ ok: false, error: "request_aborted" }, 499);
    console.error("[earthquake-history-event] JMA query failed", error);
    return jsonResponse({ ok: false, error: "jma_event_query_failed" }, 502);
  }
}
