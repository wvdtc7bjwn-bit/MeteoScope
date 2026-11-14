import { isSameEarthquake } from "../../../src/earthquake/realtimeEarthquake.js";
import { parseJstDateTime } from "../../../src/utils/jstDateTime.js";

function descriptor(value) {
  return {
    eventTimeRaw: value.originTime,
    hypocenterName: value.place,
    coordinates: value.coordinates,
    magnitude: value.magnitude,
    depth: value.depthKm
  };
}

export function isSameDiscordEarthquake(left, right) {
  if (left.sourceEventId && left.sourceEventId === right.sourceEventId) return true;
  const a = descriptor(left);
  const b = descriptor(right);
  if (!a.eventTimeRaw || !b.eventTimeRaw) return false;
  // Do not merge simultaneous earthquakes at different epicenters. The shared
  // matcher also handles the minute-rounded times in some P2P/JMA reports.
  if (a.coordinates && b.coordinates
    && (Math.abs(a.coordinates[0] - b.coordinates[0]) > 0.051
      || Math.abs(a.coordinates[1] - b.coordinates[1]) > 0.051)) return false;
  if (!a.coordinates || !b.coordinates) {
    if (!a.hypocenterName || a.hypocenterName !== b.hypocenterName) return false;
  }
  return isSameEarthquake(a, b);
}

function savedIdentity(row) {
  try {
    const payload = JSON.parse(row.payload_json);
    if (payload._earthquake) return payload._earthquake;
    // Compatibility with pending rows created before image generation retired.
    const card = payload._shareCard;
    if (!card) return null;
    return {
      sourceEventId: row.event_id,
      originTime: parseJstDateTime(card.eventTime),
      coordinates: card.coordinates,
      place: card.hypocenter,
      magnitude: String(card.magnitude ?? "").replace(/^M/u, ""),
      depthKm: String(card.depth ?? "").replace(/km$/u, "")
    };
  } catch { return null; }
}

export async function readDiscordEarthquakeIdentities(db, sourceDate) {
  const dayBefore = new Date(Date.parse(sourceDate + "T00:00:00Z") - 86400000)
    .toISOString().slice(0, 10);
  const rows = await db.prepare(`
    SELECT event_id, payload_json FROM discord_earthquake_notifications
    WHERE source_date >= ? AND source_date <= ?
    ORDER BY entry_updated DESC LIMIT 200
  `).bind(dayBefore, sourceDate).all();
  return rows?.results ?? [];
}

export async function resolveDiscordEarthquakeIdentity(db, report, knownRows = null) {
  const incoming = {
    sourceEventId: report.eventId,
    originTime: report.originTime,
    coordinates: report.longitude != null && report.latitude != null
      ? [report.longitude, report.latitude] : null,
    place: report.place, magnitude: report.magnitude, depthKm: report.depthKm
  };
  const rows = knownRows ?? await readDiscordEarthquakeIdentities(db, report.sourceDate);
  for (const row of rows) {
    const identity = savedIdentity(row);
    if (row.event_id === report.eventId || (identity && isSameDiscordEarthquake(identity, incoming))) {
      return { ...report, sourceEventId: report.eventId, eventId: row.event_id };
    }
  }
  return report;
}
