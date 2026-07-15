function collectTsunamiStatusCandidates(data, candidates = [], seen = new Set()) {
  if (data === null || data === undefined || data === "") return candidates;
  if (typeof data === "string" || typeof data === "number") {
    candidates.push(String(data));
    return candidates;
  }
  if (typeof data !== "object" || seen.has(data)) return candidates;
  seen.add(data);

  if (Array.isArray(data)) {
    for (const item of data) collectTsunamiStatusCandidates(item, candidates, seen);
    return candidates;
  }

  for (const key of [
    "text", "name", "value", "kind", "status", "comment", "free", "warning",
    "tsunami", "tsunamiText", "tsunamiStatus", "tsunamiForecast", "domesticTsunami",
    "foreignTsunami", "forecast", "forecasts", "areas", "comments", "forecastComment",
    "varComment", "freeFormComment"
  ]) {
    collectTsunamiStatusCandidates(data[key], candidates, seen);
  }
  return candidates;
}

export function getEarthquakeTsunamiStatus(body = {}, report = {}, telegram = {}) {
  const forecastCodes = [
    body?.comments?.forecast?.codes,
    report?.comments?.forecast?.codes,
    telegram?.body?.comments?.forecast?.codes
  ].flatMap(value => Array.isArray(value) ? value : []);
  const candidates = collectTsunamiStatusCandidates([
    body?.tsunami,
    body?.tsunamiText,
    body?.tsunamiStatus,
    body?.tsunamiForecast,
    body?.domesticTsunami,
    body?.foreignTsunami,
    body?.comments,
    body?.text,
    body?.earthquake,
    report?.comments,
    report?.text,
    telegram?.body,
    telegram?.head?.headline
  ])
    .map(value => String(value || "").trim())
    .filter(Boolean);

  if (candidates.some(text => text.includes("大津波警報"))) return "大津波警報";
  if (candidates.some(text => text.includes("津波警報") && !text.includes("大津波警報"))) return "津波警報";
  if (candidates.some(text => text.includes("津波注意報"))) return "津波注意報";
  if (candidates.some(text => text.includes("若干") || text.includes("海面変動") || text.includes("津波予報"))) {
    return "若干の海面変動";
  }
  if (candidates.some(text => (
    text.includes("津波の心配なし") ||
    text.includes("津波の心配はありません") ||
    text.includes("津波なし") ||
    text.includes("心配なし")
  ))) {
    return "心配なし";
  }
  if (forecastCodes.some(code => String(code).trim() === "0215")) {
    return "心配なし";
  }
  return null;
}
