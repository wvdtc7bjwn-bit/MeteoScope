import {
  buildJmaIntensitySearchForm,
  JMA_EARTHQUAKE_HISTORY_SOURCE_URL,
  JMA_EARTHQUAKE_INTENSITY_API_URL,
  splitJmaEarthquakeDateRange
} from "../../src/jma/earthquakeHistoryApi.js";

const CACHE_TTL_SECONDS = 6 * 60 * 60;
const API_RESULT_LIMIT = 1_000;
// Keep two external-subrequest slots free under Cloudflare Workers Free's 50-call cap.
const MAX_UPSTREAM_QUERIES = 48;
const EARLIEST_DATE = "1919-01-01";

function jsonResponse(payload, status = 200, cacheControl = "no-store") {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": cacheControl,
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff"
    }
  });
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const startDate = requestUrl.searchParams.get("start") ?? "";
  const endDate = requestUrl.searchParams.get("end") ?? "";
  const latestAvailableDate = getJmaLatestDate();
  if (!isDate(startDate) || !isDate(endDate) || startDate < EARLIEST_DATE || startDate > endDate) {
    return jsonResponse({ ok: false, error: "invalid_date_range" }, 400);
  }
  if (endDate > latestAvailableDate) {
    return jsonResponse({ ok: false, error: "date_not_yet_available", latestAvailableDate }, 400);
  }
  if (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`) > 366 * 86_400_000) {
    return jsonResponse({ ok: false, error: "date_range_too_large" }, 400);
  }

  const cacheKey = new Request(new URL(
    `/api/earthquake-history?start=${startDate}&end=${endDate}`,
    requestUrl.origin
  ));
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
    const queryState = { count: 0 };
    const records = await queryJmaRange(startDate, endDate, queryState);
    const response = jsonResponse({
      ok: true,
      startDate,
      endDate,
      sourceUrl: JMA_EARTHQUAKE_HISTORY_SOURCE_URL,
      records
    }, 200, `public, max-age=0, s-maxage=${CACHE_TTL_SECONDS}`);
    if (cache) {
      const cacheWrite = cache.put(cacheKey, response.clone()).catch((error) => {
        console.warn("[earthquake-history-proxy] cache write failed", error);
      });
      context.waitUntil?.(cacheWrite);
    }
    return response;
  } catch (error) {
    console.error("[earthquake-history-proxy] JMA query failed", error);
    if (error?.message === "JMA query split limit exceeded") {
      return jsonResponse({ ok: false, error: "jma_query_range_too_dense" }, 422);
    }
    return jsonResponse({ ok: false, error: "jma_query_failed" }, 502);
  }
}

async function queryJmaRange(startDate, endDate, state) {
  return queryJmaTimeRange(startDate, "00:00", endDate, "23:59", state);
}

async function queryJmaTimeRange(startDate, startTime, endDate, endTime, state) {
  state.count += 1;
  if (state.count > MAX_UPSTREAM_QUERIES) {
    throw new Error("JMA query split limit exceeded");
  }
  const response = await fetch(JMA_EARTHQUAKE_INTENSITY_API_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      referer: JMA_EARTHQUAKE_HISTORY_SOURCE_URL,
      "user-agent": "MeteoScope earthquake history search"
    },
    body: buildJmaIntensitySearchForm(startDate, endDate, startTime, endTime),
    signal: AbortSignal.timeout(25_000)
  });
  if (!response.ok) throw new Error(`JMA returned HTTP ${response.status}`);
  const payload = await response.json();
  const records = normalizeJmaResults(payload?.res);
  if (!records) {
    throw new Error("JMA returned an unsupported response");
  }
  if (records.length < API_RESULT_LIMIT) return records;
  if (startDate === endDate) {
    if (startTime === endTime) throw new Error("JMA result limit reached for a single minute");
    const [leftEndTime, rightStartTime] = splitJmaTimeRange(startTime, endTime);
    const left = await queryJmaTimeRange(startDate, startTime, startDate, leftEndTime, state);
    const right = await queryJmaTimeRange(startDate, rightStartTime, endDate, endTime, state);
    return [...left, ...right];
  }

  const [leftEnd, rightStart] = splitJmaEarthquakeDateRange(startDate, endDate);
  const left = await queryJmaRange(startDate, leftEnd, state);
  const right = await queryJmaRange(rightStart, endDate, state);
  return [...left, ...right];
}

function splitJmaTimeRange(startTime, endTime) {
  const startMinutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime);
  const middleMinutes = startMinutes + Math.floor((endMinutes - startMinutes) / 2);
  return [fromMinutes(middleMinutes), fromMinutes(middleMinutes + 1)];
}

function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function fromMinutes(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function normalizeJmaResults(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && /検索結果地震数\s*[:：]\s*ありませんでした/u.test(value)) return [];
  return null;
}

function getJmaLatestDate() {
  const now = new Date();
  const jstDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(now);
  return new Date(Date.parse(`${jstDate}T00:00:00Z`) - 2 * 86_400_000).toISOString().slice(0, 10);
}

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
