import {
  findLatestJmaForecastDetailUrl,
  isJmaForecastXml
} from "../../src/jma/vpfw50Feed.js";

const SHORT_FEED_URL = "https://www.data.jma.go.jp/developer/xml/feed/regular.xml";
const LONG_FEED_URL = "https://www.data.jma.go.jp/developer/xml/feed/regular_l.xml";
const WEEK_AREA_URL = "https://www.jma.go.jp/bosai/forecast/const/week_area.json";
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
    const source = await findForecastSource(officeCode, bulletinCode);
    if (!source) return errorResponse("weekly_forecast_not_found", 404);
    const { detailUrl, xml } = source;
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

// Some JMA offices share a bulletin, for example Tokachi and Kushiro/Nemuro.
// Only use a related bulletin when it contains one of the requested area's codes.
export async function findForecastSource(officeCode, bulletinCode, fetchText = fetchJmaText) {
  const ownUrl = await findLatestForecastUrl(officeCode, bulletinCode, fetchText);
  if (ownUrl) return { detailUrl: ownUrl, xml: await fetchText(ownUrl) };

  const mappings = JSON.parse(await fetchText(WEEK_AREA_URL));
  const ownMappings = Array.isArray(mappings[officeCode]) ? mappings[officeCode] : [];
  const sharedCodes = new Set(ownMappings.map((item) => String(item.week ?? "")).filter((code) => /^\d{6}$/u.test(code)));
  if (!sharedCodes.size) return null;
  const allowedCodes = new Set([
    officeCode,
    ...(bulletinCode === "VPFW50" ? sharedCodes : []),
    ...ownMappings.map((item) => String(item.srf ?? ""))
  ]);
  for (const [otherOffice, entries] of Object.entries(mappings)) {
    if (otherOffice === officeCode || !OFFICE_CODE_PATTERN.test(otherOffice) || !Array.isArray(entries)
      || !entries.some((item) => sharedCodes.has(String(item.week ?? "")))) continue;
    const detailUrl = await findLatestForecastUrl(otherOffice, bulletinCode, fetchText);
    if (!detailUrl) continue;
    const xml = await fetchText(detailUrl);
    const areas = [...xml.matchAll(/<(?:\w+:)?Area\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Area>/gu)];
    const containsRequestedArea = areas.some((match) => {
      const code = match[1].match(/<(?:\w+:)?Code\b[^>]*>\s*(\d{6})\s*<\/(?:\w+:)?Code>/u)?.[1];
      return allowedCodes.has(code);
    });
    if (containsRequestedArea && isJmaForecastXml(xml)) return { detailUrl, xml };
  }
  return null;
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
