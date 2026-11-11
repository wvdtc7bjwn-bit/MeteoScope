export function parseJstDateTime(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const localMatch = text.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/u
  );
  const normalized = localMatch
    ? `${localMatch[1]}-${localMatch[2].padStart(2, "0")}-${localMatch[3].padStart(2, "0")}T${localMatch[4].padStart(2, "0")}:${localMatch[5]}:${localMatch[6] ?? "00"}+09:00`
    : text;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
