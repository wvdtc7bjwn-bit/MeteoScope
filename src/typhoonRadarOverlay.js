const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DEFAULT_MAX_TIME_DIFFERENCE_MS = 7.5 * 60 * 1000;

export function parseTyphoonRadarTime(value, { numericTimeZone = "utc" } = {}) {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }

  if (Number.isFinite(value)) return Number(value);
  const text = String(value ?? "").trim();
  if (!text) return null;

  const compact = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?$/);
  if (compact) {
    const time = Date.UTC(
      Number(compact[1]),
      Number(compact[2]) - 1,
      Number(compact[3]),
      Number(compact[4]),
      Number(compact[5]),
      Number(compact[6] ?? 0)
    );
    return numericTimeZone === "jst" ? time - JST_OFFSET_MS : time;
  }

  const local = text.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+|T)(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );
  if (local) {
    return Date.UTC(
      Number(local[1]),
      Number(local[2]) - 1,
      Number(local[3]),
      Number(local[4]),
      Number(local[5]),
      Number(local[6] ?? 0)
    ) - JST_OFFSET_MS;
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function selectTyphoonRadarFrame(
  frames = [],
  typhoonUpdatedAt,
  { maxTimeDifferenceMs = DEFAULT_MAX_TIME_DIFFERENCE_MS } = {}
) {
  const targetTimeMs = parseTyphoonRadarTime(typhoonUpdatedAt, { numericTimeZone: "jst" });
  if (!Number.isFinite(targetTimeMs)) return null;

  const candidates = frames
    .filter((frame) => frame && !frame.isForecast && frame.radarTileUrl)
    .map((frame) => ({
      frame,
      frameTimeMs: parseTyphoonRadarTime(frame.validtime ?? frame.basetime)
    }))
    .filter(({ frameTimeMs }) => Number.isFinite(frameTimeMs))
    .map((candidate) => ({
      ...candidate,
      targetTimeMs,
      differenceMs: Math.abs(candidate.frameTimeMs - targetTimeMs)
    }))
    .sort((a, b) => a.differenceMs - b.differenceMs);

  const selected = candidates[0] ?? null;
  if (!selected || selected.differenceMs > maxTimeDifferenceMs) return null;
  return selected;
}
