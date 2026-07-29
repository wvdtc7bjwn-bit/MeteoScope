import {
  findLatestJmaForecastDetailUrl,
  isJmaForecastXml
} from "../../src/jma/vpfw50Feed.js";

const SHORT_FEED_URL = "https://www.data.jma.go.jp/developer/xml/feed/regular.xml";
const LONG_FEED_URL = "https://www.data.jma.go.jp/developer/xml/feed/regular_l.xml";
const OFFICE_CODE_PATTERN = /^\d{6}$/u;
const SUPPORTED_BULLETIN_CODES = new Set(["VPFW50", "VPFD51"]);
const RESPONSE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/xml; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600"
};

export async function onRequest({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return errorResponse("method_not_allowed", 405);
  }

  const requestUrl = new URL(request.url);
  const officeCode = requestUrl.searchParams.get("officeCode")?.trim() ?? "";
  const bulletinCode = requestUrl.searchParams.get("bulletinCode")?.trim().toUpperCase()
    || "VPFW50";
  if (!OFFICE_CODE_PATTERN.test(officeCode)) {
    return errorResponse("office_code_required", 400);
  }
  if (!SUPPORTED_BULLETIN_CODES.has(bulletinCode)) {
    return errorResponse("bulletin_code_not_supported", 400);
  }

  try {
    const detailUrl = await findLatestForecastUrl(officeCode, bulletinCode);
    if (!detailUrl) return errorResponse("weekly_forecast_not_found", 404);
    const xml = await fetchJmaText(detailUrl);
    if (!isJmaForecastXml(xml)) {
      throw new Error(`Unexpected ${bulletinCode} response`);
    }
    return new Response(request.method === "HEAD" ? null : xml, {
      status: 200,
      headers: {
        ...RESPONSE_HEADERS,
        "X-MeteoScope-JMA-Code": bulletinCode,
        "X-MeteoScope-Source": detailUrl
      }
    });
  } catch (error) {
    console.error(`[weekly-weather] ${bulletinCode} lookup failed`, error);
    return errorResponse("jma_weekly_forecast_unavailable", 502);
  }
}

export async function findLatestWeeklyForecastUrl(officeCode, fetchText = fetchJmaText) {
  return findLatestForecastUrl(officeCode, "VPFW50", fetchText);
}

export async function findLatestForecastUrl(
  officeCode,
  bulletinCode,
  fetchText = fetchJmaText
) {
  const fileSuffix = `_${bulletinCode}_${officeCode}.xml`;
  let lastError = null;
  for (const feedUrl of [SHORT_FEED_URL, LONG_FEED_URL]) {
    let feed;
    try {
      feed = await fetchText(feedUrl);
    } catch (error) {
      lastError = error;
      continue;
    }
    const detailUrl = findLatestJmaForecastDetailUrl(feed, officeCode, bulletinCode);
    if (detailUrl?.endsWith(fileSuffix)) return detailUrl;
  }
  if (lastError) throw lastError;
  return "";
}

async function fetchJmaText(url) {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/atom+xml,application/xml,text/xml,*/*",
      "User-Agent": "MeteoScope/1.0 (+https://meteoscope.pages.dev/)"
    }
  });
  if (!response.ok) throw new Error(`JMA request failed: ${response.status}`);
  return response.text();
}

function errorResponse(code, status) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><error>${code}</error>`, {
    status,
    headers: RESPONSE_HEADERS
  });
}
