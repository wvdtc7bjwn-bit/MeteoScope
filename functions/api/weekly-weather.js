import { findLatestVpFw50DetailUrl, isVpFw50Xml } from "../../src/jma/vpfw50Feed.js";

const SHORT_FEED_URL = "https://www.data.jma.go.jp/developer/xml/feed/regular.xml";
const LONG_FEED_URL = "https://www.data.jma.go.jp/developer/xml/feed/regular_l.xml";
const OFFICE_CODE_PATTERN = /^\d{6}$/u;
const RESPONSE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/xml; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=21600"
};

export async function onRequest({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return errorResponse("method_not_allowed", 405);
  }

  const officeCode = new URL(request.url).searchParams.get("officeCode")?.trim() ?? "";
  if (!OFFICE_CODE_PATTERN.test(officeCode)) {
    return errorResponse("office_code_required", 400);
  }

  try {
    const detailUrl = await findLatestWeeklyForecastUrl(officeCode);
    if (!detailUrl) return errorResponse("weekly_forecast_not_found", 404);
    const xml = await fetchJmaText(detailUrl);
    if (!isVpFw50Xml(xml)) {
      throw new Error("Unexpected VPFW50 response");
    }
    return new Response(request.method === "HEAD" ? null : xml, {
      status: 200,
      headers: {
        ...RESPONSE_HEADERS,
        "X-MeteoScope-JMA-Code": "VPFW50",
        "X-MeteoScope-Source": detailUrl
      }
    });
  } catch (error) {
    console.error("[weekly-weather] VPFW50 lookup failed", error);
    return errorResponse("jma_weekly_forecast_unavailable", 502);
  }
}

export async function findLatestWeeklyForecastUrl(officeCode, fetchText = fetchJmaText) {
  const fileSuffix = `_VPFW50_${officeCode}.xml`;
  let lastError = null;
  for (const feedUrl of [SHORT_FEED_URL, LONG_FEED_URL]) {
    let feed;
    try {
      feed = await fetchText(feedUrl);
    } catch (error) {
      lastError = error;
      continue;
    }
    const detailUrl = findLatestVpFw50DetailUrl(feed, officeCode);
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
