import { getDistanceKm } from "../location/distance.js";

export const MECHANISM_ROOT = "https://www.data.jma.go.jp/eqev/data/mech/";
export const MECHANISM_TYPES = { cmt: { directory: "cmt", prefix: "cmt", label: "CMT解" }, initial: { directory: "ini", prefix: "mc", label: "初動発震機構解" } };

// Match catalogue origin times in JST, never publication times or place names alone.
export function mechanismEvent(event) {
  const raw = event.eventTimeRaw || event.originTime;
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
  const time = Date.parse(raw);
  const coordinates = event.coordinates;
  if (!Number.isFinite(time) || !Array.isArray(coordinates) || coordinates.length !== 2
    || !coordinates.every(Number.isFinite) || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90) return null;
  return { time, coordinates };
}

export function mechanismMonths(time) {
  // Include adjacent JST month when minute precision straddles midnight.
  return [...new Set([-90000, 0, 90000].map(offset => new Date(time + offset + 9 * 3600000).toISOString().slice(0, 7).replace("-", "")))];
}

export function matchMechanism(records, event) {
  const target = mechanismEvent(event);
  if (!target) return { status: "insufficient", record: null };
  const candidates = records.filter(record => Number.isFinite(record.time)
    && Math.abs(record.time - target.time) <= 90000
    && getDistanceKm(record.coordinates, target.coordinates) <= 30);
  // Never choose arbitrarily when nearby earthquakes cannot be distinguished.
  return { status: candidates.length > 1 ? "ambiguous" : candidates.length ? "matched" : "missing", record: candidates.length === 1 ? candidates[0] : null };
}

export function mechanismLinks(type, id) {
  const definition = Object.hasOwn(MECHANISM_TYPES, type) ? MECHANISM_TYPES[type] : null;
  if (!definition || !new RegExp(`^${definition.prefix}\\d{14}$`).test(id)) return null;
  const base = `${MECHANISM_ROOT}${definition.directory}/fig/${id}`;
  return { source: `${base}.html`, image: `${base}.png` };
}
