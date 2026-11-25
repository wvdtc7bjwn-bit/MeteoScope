import { normalizeP2pEarthquake, mergeRealtimeEarthquakes } from "./realtimeEarthquake.js";

const PAGE_SIZE = 100;
const MAX_PAGES = 5;
const ORIGIN = "https://api.p2pquake.net/v2";

export function p2pOriginDate(event) {
  const time = Date.parse(event?.eventTimeRaw);
  return Number.isFinite(time) ? new Date(time + 9 * 3_600_000).toISOString().slice(0, 10) : "";
}

// Keep transport IDs separate from JMA database IDs. The latter cannot be
// reconstructed from the rounded origin time of a public bulletin.
export function p2pHistoryRecord(event) {
  if (!event?.coordinates || !event.maxIntensity || !p2pOriginDate(event)
    || !/^[a-f0-9]{24}$/iu.test(event.sourceReportId ?? "")) return null;
  const localTime = new Date(Date.parse(event.eventTimeRaw) + 9 * 3_600_000).toISOString().slice(0, -1);
  return {
    id: `p2p:${event.sourceReportId}`, dataSource: "p2p", originTime: `${localTime}+09:00`,
    place: event.hypocenterName, coordinates: event.coordinates,
    longitude: event.coordinates[0], latitude: event.coordinates[1],
    magnitude: event.magnitude === "--" ? null : Number(event.magnitude),
    depthKm: event.depth, maxIntensity: event.maxIntensity,
    sourceUrl: "", recentEarthquake: event
  };
}

export async function loadP2pHistory({ startDate, endDate, signal, fetchImpl = fetch }) {
  const reports = [];
  const errors = [];
  let historyComplete = false;
  let historyLimited = false;
  async function request(url) {
    signal?.throwIfAborted();
    const response = await fetchImpl(url, { signal, headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`P2P HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Invalid P2P history");
    return payload;
  }
  // The archive can lag a minute. Fetch the realtime history independently so
  // an archive outage does not also discard the latest received bulletins.
  const outcomes = await Promise.allSettled([
    (async () => {
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const query = new URLSearchParams({ since_date: startDate.replaceAll("-", ""),
          until_date: endDate.replaceAll("-", ""), limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE), order: "1" });
        const batch = await request(`${ORIGIN}/jma/quake?${query}`);
        reports.push(...batch);
        if (batch.length < PAGE_SIZE) { historyComplete = true; return; }
      }
      historyLimited = true;
    })(),
    request(`${ORIGIN}/history?codes=551&limit=100`).then(batch => { reports.push(...batch); })
  ]);
  signal?.throwIfAborted();
  outcomes.forEach((outcome, index) => {
    if (outcome.status === "rejected") errors.push(index === 0 ? "archive_failed" : "realtime_failed");
  });
  const normalized = reports.filter(report => !report?.cancelled && !report?.training && !report?.test)
    .map(normalizeP2pEarthquake).filter(Boolean);
  // Reports from this single provider share an origin-time key. Do not use
  // the cross-provider fuzzy time match to combine distinct nearby quakes.
  const groups = new Map();
  for (const event of normalized) {
    if (!p2pOriginDate(event)) continue;
    const group = groups.get(event.eventKey) ?? [];
    group.push(event);
    groups.set(event.eventKey, group);
  }
  const events = [...groups.values()].map(group => mergeRealtimeEarthquakes([], group, 1)[0])
    .filter(event => p2pOriginDate(event) >= startDate && p2pOriginDate(event) <= endDate);
  const items = events.map(p2pHistoryRecord).filter(Boolean);
  return { ok: true, items, complete: historyComplete && !errors.length, limited: historyLimited,
    errors, startDate, endDate, fetchedAt: new Date().toISOString() };
}
