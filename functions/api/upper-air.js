import { UPPER_AIR_STATIONS, parseUpperAirTemperatureHumidityHtml } from "../../src/jma/upperAir.js";
import { validateEarlyAccessToken } from "../_shared/earlyAccessAuth.js";

const JMA_UPPER_AIR_BASE = "https://www.data.jma.go.jp/stats/etrn/upper/view/daily_uth.php";
const STATION_IDS = new Set(UPPER_AIR_STATIONS.map((station) => station.id));
const RESPONSE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "X-MeteoScope-Early-Access",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600"
};

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
  if (request.method !== "GET" && request.method !== "HEAD") return errorResponse("method_not_allowed", 405);
  if (!env.NOTIFICATIONS_DB) return errorResponse("early_access_not_configured", 503);
  const access = await validateEarlyAccessToken(env.NOTIFICATIONS_DB, request.headers.get("X-MeteoScope-Early-Access") ?? "");
  if (!access.active) return errorResponse("early_access_required", 401);
  const requestUrl = new URL(request.url);
  const station = requestUrl.searchParams.get("station")?.trim() ?? "47646";
  if (!STATION_IDS.has(station)) return errorResponse("station_not_supported", 400);

  try {
    const observation = await findLatestUpperAirObservation(station);
    if (!observation) return errorResponse("upper_air_observation_not_found", 404);
    return new Response(request.method === "HEAD" ? null : JSON.stringify(observation), {
      headers: { ...RESPONSE_HEADERS, "X-MeteoScope-Source": observation.sourceUrl }
    });
  } catch (error) {
    console.error("[upper-air] JMA lookup failed", error);
    return errorResponse("jma_upper_air_unavailable", 502);
  }
}

export async function findLatestUpperAirObservation(station, fetchText = fetchJmaText, now = new Date()) {
  const candidates = buildObservationCandidates(now);
  for (const candidate of candidates) {
    const sourceUrl = buildJmaUrl(station, candidate.date, candidate.hour);
    try {
      const html = await fetchText(sourceUrl);
      const rows = parseUpperAirTemperatureHumidityHtml(html);
      if (rows.length < 8) continue;
      return { station, date: candidate.date, hour: candidate.hour, sourceUrl, html };
    } catch {
      // Individual soundings can be unavailable. Continue to the prior scheduled observation.
    }
  }
  return null;
}

export function buildObservationCandidates(now = new Date(), days = 4) {
  const japaneseNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const candidates = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(japaneseNow.getTime() - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    candidates.push({ date, hour: 21 }, { date, hour: 9 });
  }
  return candidates;
}

export function buildJmaUrl(station, date, hour) {
  const [year, month, day] = date.split("-");
  const params = new URLSearchParams({ year, month: String(Number(month)), day: String(Number(day)), hour: String(hour), point: station, atm: "", view: "" });
  return `${JMA_UPPER_AIR_BASE}?${params}`;
}

async function fetchJmaText(url) {
  const response = await fetch(url, {
    headers: { "Accept": "text/html,application/xhtml+xml", "User-Agent": "MeteoScope/1.0 (+https://meteoscope.pages.dev/)" }
  });
  if (!response.ok) throw new Error(`JMA request failed: ${response.status}`);
  return response.text();
}

function errorResponse(code, status) {
  return new Response(JSON.stringify({ error: code }), { status, headers: RESPONSE_HEADERS });
}
