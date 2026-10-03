import {
  buildJmaIntensitySearchForm, isJmaHistoryDate, validateJmaHistoryConditions,
  JMA_EARTHQUAKE_HISTORY_SOURCE_URL, JMA_EARTHQUAKE_INTENSITY_API_URL,
  isCoordinateWithinRadius
} from "../../src/jma/earthquakeHistoryApi.js";
import { normalizeHistoricalEpicenterName } from "../../src/jma/historicalEpicenterNames.js";

const CACHE_TTL_SECONDS = 6 * 60 * 60;
const API_RESULT_LIMIT = 1_000;

function jsonResponse(payload, status = 200, cacheControl = "no-store") {
  return Response.json(payload, { status, headers: {
    "cache-control": cacheControl, "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff"
  } });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const startDate = url.searchParams.get("start") ?? "";
  const endDate = url.searchParams.get("end") ?? "";
  const startTime = url.searchParams.get("startTime") ?? "00:00";
  const endTime = url.searchParams.get("endTime") ?? "23:59";
  const latestAvailableDate = getJmaLatestDate();
  if (!isJmaHistoryDate(startDate) || !isJmaHistoryDate(endDate)
    || startDate < "1919-01-01" || startDate > endDate
    || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(endTime)
    || (startDate === endDate && startTime > endTime)) {
    return jsonResponse({ ok: false, error: "invalid_date_range" }, 400);
  }
  if (endDate > latestAvailableDate) return jsonResponse({ ok: false, error: "date_not_yet_available", latestAvailableDate }, 400);
  let conditions;
  try {
    conditions = validateJmaHistoryConditions(Object.fromEntries(
      ["minIntensity", "minMagnitude", "maxDepth", "sort", "keyword", "nearbyLat", "nearbyLon", "nearbyRadiusKm"].flatMap((key) => url.searchParams.has(key) ? [[key, url.searchParams.get(key)]] : [])
    ));
  } catch {
    return jsonResponse({ ok: false, error: "invalid_search_conditions" }, 400);
  }
  // Versioning separates the former recursively-expanded annual cache.
  const cacheUrl = new URL("/api/earthquake-history", url.origin);
  const { nearby, ...plainConditions } = conditions;
  cacheUrl.search = new URLSearchParams({ v: "3", start: startDate, end: endDate, startTime, endTime, ...plainConditions,
    ...(nearby ? { nearbyLat: String(nearby.latitude), nearbyLon: String(nearby.longitude), nearbyRadiusKm: String(nearby.radiusKm) } : {}) });
  const cacheKey = new Request(cacheUrl);
  const cache = globalThis.caches?.default;
  if (cache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    } catch (error) {
      console.warn("[earthquake-history-proxy] cache read failed", error);
    }
  }
  try {
    context.request.signal.throwIfAborted();
    const response = await fetch(JMA_EARTHQUAKE_INTENSITY_API_URL, {
      method: "POST",
      headers: { accept: "application/json", referer: JMA_EARTHQUAKE_HISTORY_SOURCE_URL },
      body: buildJmaIntensitySearchForm(startDate, endDate, startTime, endTime, conditions),
      signal: AbortSignal.any([context.request.signal, AbortSignal.timeout(25_000)])
    });
    if (response.status === 400 || response.status === 422) return jsonResponse({ ok: false, error: "jma_invalid_search_conditions" }, 400);
    if (!response.ok) throw new Error(`JMA returned HTTP ${response.status}`);
    const payload = await response.json();
    const candidates = Array.isArray(payload?.res) ? payload.res
      : typeof payload?.res === "string" && /検索結果地震数\s*[:：]\s*ありませんでした/u.test(payload.res) ? [] : null;
    if (!candidates) {
      const message = [typeof payload?.res === "string" ? payload.res : "", ...(Array.isArray(payload?.str) ? payload.str : [])].join("\n");
      if (/検索条件|条件.*見直|期間.*指定|入力.*不正/u.test(message)) return jsonResponse({ ok: false, error: "jma_invalid_search_conditions" }, 400);
      throw new Error("JMA returned an unsupported response");
    }
    const summary = Array.isArray(payload.str) ? payload.str.join("\n") : "";
    const reportedCount = summary.match(/検索結果地震数\s*[:：]\s*(\d+)\s*地震/u);
    const limitExceeded = /上限を超え/u.test(summary);
    const limited = limitExceeded || (candidates.length >= API_RESULT_LIMIT && Number(reportedCount?.[1]) !== candidates.length);
    const keyword = conditions.keyword.toLocaleLowerCase("ja-JP");
    const records = keyword ? candidates.filter((record) => normalizeHistoricalEpicenterName(String(record.id), record.name).toLocaleLowerCase("ja-JP").includes(keyword)) : candidates;
    const matchedRecords = nearby ? records.filter((record) => isWithinNearbyRadius(record, nearby)) : records;
    const result = jsonResponse({
      ok: true, startDate, endDate, startTime, endTime, conditions,
      sourceUrl: JMA_EARTHQUAKE_HISTORY_SOURCE_URL,
      records: matchedRecords,
      candidateCount: candidates.length, limited, limitExceeded, totalMatched: limited ? null : matchedRecords.length, upstreamQueryCount: 1
    }, 200, `public, max-age=0, s-maxage=${CACHE_TTL_SECONDS}`);
    if (cache) {
      const write = cache.put(cacheKey, result.clone()).catch((error) => console.warn("[earthquake-history-proxy] cache write failed", error));
      if (context.waitUntil) context.waitUntil(write);
      else await write;
    }
    return result;
  } catch (error) {
    if (context.request.signal.aborted) return jsonResponse({ ok: false, error: "request_aborted" }, 499);
    console.error("[earthquake-history-proxy] JMA query failed", error);
    return jsonResponse({ ok: false, error: "jma_query_failed" }, 502);
  }
}

function isWithinNearbyRadius(record, nearby) {
  const latitude = Number(record?.lat);
  const longitude = Number(record?.lon);
  return isCoordinateWithinRadius([longitude, latitude], [nearby.longitude, nearby.latitude], nearby.radiusKm);
}

function getJmaLatestDate() {
  const jstDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(Date.parse(`${jstDate}T00:00:00Z`) - 2 * 86_400_000).toISOString().slice(0, 10);
}
