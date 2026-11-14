import { normalizeP2pEarthquake } from "../../../src/earthquake/realtimeEarthquake.js";
import { buildDiscordEarthquakeNotificationUpsert, buildDiscordEarthquakeWebhookPayload, deliverPendingDiscordEarthquakeNotifications } from "./discordEarthquakeNotifications.js";
import { readDiscordEarthquakeIdentities, resolveDiscordEarthquakeIdentity } from "./discordEarthquakeIdentity.js";

export const P2P_DISCORD_HISTORY_URL = "https://api.p2pquake.net/v2/history?codes=551&limit=20";
const MAX_REPORT_AGE_MS = 10 * 60 * 1000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export function normalizeP2pDiscordReport(payload, now = Date.now()) {
  if (!payload || payload.test === true || payload.training === true
    || !["ScaleAndDestination", "DetailScale"].includes(payload.issue?.type)) return null;
  // Reuse the app's P2P value/time validation; station lists are not needed for
  // text notifications and must not be expanded into another stored copy.
  const event = normalizeP2pEarthquake({ ...payload, points: [] });
  if (!event || !event.sourceReportId || !event.eventTimeRaw || !event.reportTimeRaw) return null;
  const issued = Date.parse(event.reportTimeRaw);
  const origin = Date.parse(event.eventTimeRaw);
  if (issued > now + 60000 || issued < now - MAX_REPORT_AGE_MS
    || origin > now + 60000 || origin > issued + 60000
    || !event.maxIntensity || !event.coordinates) return null;
  const sourceDate = new Date(origin + 9 * 3600000).toISOString().slice(0, 10);
  const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  const yesterday = new Date(now + 9 * 3600000 - 86400000).toISOString().slice(0, 10);
  if (sourceDate !== today && sourceDate !== yesterday) return null;
  return {
    eventId: event.rawId,
    source: "p2p", sourceDate,
    originTime: event.eventTimeRaw, reportTime: event.reportTimeRaw,
    longitude: event.coordinates[0], latitude: event.coordinates[1],
    depthKm: event.depth,
    magnitude: event.magnitude === "--" ? null : Number(event.magnitude),
    place: event.hypocenterName,
    maxIntensity: event.maxIntensity,
    tsunamiText: payload.earthquake?.domesticTsunami === "Watch"
      ? "津波注意報が発表されています。最新の津波情報を確認してください。"
      : payload.earthquake?.domesticTsunami === "Warning"
        ? "津波警報等が発表されています。最新の津波情報を確認してください。" : event.tsunamiComment,
    infoType: ["ScaleOnly", "DestinationOnly", "ScaleAndDestination"].includes(payload.issue?.correct) ? "訂正" : "発表",
    active: 1, ignored: false,
    sourceUrl: P2P_DISCORD_HISTORY_URL
  };
}

export async function runP2pDiscordNotifications(env, options = {}) {
  if (!env.DISCORD_EARTHQUAKE_WEBHOOK_URL) return { enabled: false, received: 0 };
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = Number(options.now ?? Date.now());
  let reports;
  try {
    const response = await fetchImpl(P2P_DISCORD_HISTORY_URL, {
      headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`p2p_http_${response.status}`);
    if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) throw new Error("p2p_response_too_large");
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new Error("p2p_response_too_large");
    const data = JSON.parse(text);
    if (!Array.isArray(data) || data.length > 20 || data.some(item => item?.code !== 551)) throw new Error("p2p_response_invalid");
    reports = data.map(item => normalizeP2pDiscordReport(item, now)).filter(Boolean)
      .sort((a, b) => a.reportTime.localeCompare(b.reportTime));
  } catch (error) {
    // Never log external bodies, request headers or the Webhook secret.
    const reason = /^(?:p2p_http_\d+|p2p_response_\w+)$/u.test(error?.message)
      ? error.message : "p2p_fetch_failed";
    console.warn(`[MeteoScope] Discord P2P unavailable: ${reason}; using JMA XML`);
    return { enabled: true, ok: false, received: 0, error: reason };
  }
  const known = reports.length
    ? await readDiscordEarthquakeIdentities(env.EQ_D1, reports.at(-1).sourceDate) : [];
  for (const report of reports) {
    const resolved = await resolveDiscordEarthquakeIdentity(env.EQ_D1, report, known);
    await buildDiscordEarthquakeNotificationUpsert(env.EQ_D1, resolved,
      { updated: report.reportTime, url: report.sourceUrl }, now, env.DISCORD_EARTHQUAKE_ROLE_IDS).run();
    known.push({ event_id: resolved.eventId, payload_json: JSON.stringify(buildDiscordEarthquakeWebhookPayload(resolved)) });
  }
  // Deliver before starting XML retrieval, including any queued retries.
  const discord = await deliverPendingDiscordEarthquakeNotifications(env, { fetchImpl, now });
  return { enabled: true, ok: true, received: reports.length, discord };
}
