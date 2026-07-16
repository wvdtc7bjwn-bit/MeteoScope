const JMA_INTENSITY_STATION_CODE_PATTERN = /^\d{7}$/u;
const ACTIVE_STATION_STATUSES = new Set(["現", "新規", "変更"]);

export function normalizeJmaIntensityStationCode(value) {
  return String(value ?? "").trim();
}

export function isJmaIntensityStationCode(value) {
  return JMA_INTENSITY_STATION_CODE_PATTERN.test(
    normalizeJmaIntensityStationCode(value)
  );
}

export function normalizeJmaIntensityStationName(value) {
  return String(value ?? "")
    .replace(/[\s　]+/gu, "")
    .trim();
}

export function buildJmaIntensityStationCoordinateLookup(source) {
  const byCode = new Map();
  const byName = new Map();
  const codeStatuses = new Map();
  const nameStatuses = new Map();
  const entries = Array.isArray(source)
    ? source.map(station => [station?.code, station])
    : Object.entries(source ?? {});

  for (const [code, station] of entries) {
    if (!station || typeof station !== "object") {
      continue;
    }
    const normalizedCode = normalizeJmaIntensityStationCode(code ?? station.code);
    const normalizedName = normalizeJmaIntensityStationName(station.name);
    const latitude = Number(station.latitude);
    const longitude = Number(station.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }
    const coordinate = {
      latitude,
      longitude
    };
    const status = String(station.status ?? "");
    if (
      isJmaIntensityStationCode(normalizedCode) &&
      shouldReplaceStationStatus(codeStatuses.get(normalizedCode), status)
    ) {
      byCode.set(normalizedCode, coordinate);
      codeStatuses.set(normalizedCode, status);
    }
    if (
      normalizedName &&
      shouldReplaceStationStatus(nameStatuses.get(normalizedName), status)
    ) {
      byName.set(normalizedName, coordinate);
      nameStatuses.set(normalizedName, status);
    }
  }

  return { byCode, byName };
}

function shouldReplaceStationStatus(current, next) {
  if (current === undefined) {
    return true;
  }
  if (ACTIVE_STATION_STATUSES.has(next) && !ACTIVE_STATION_STATUSES.has(current)) {
    return true;
  }
  if (next === "現" && current !== "現") {
    return true;
  }
  return next === "新規" && current === "廃止";
}

export function findJmaIntensityStationCoordinate(lookup, { code, name } = {}) {
  const normalizedCode = normalizeJmaIntensityStationCode(code);
  if (isJmaIntensityStationCode(normalizedCode)) {
    const byCode = lookup?.byCode?.get(normalizedCode);
    if (byCode) {
      return byCode;
    }
  }

  const normalizedName = normalizeJmaIntensityStationName(name);
  return normalizedName ? lookup?.byName?.get(normalizedName) ?? null : null;
}

export function sanitizeJmaIntensityStationPoints(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.points)) {
    return data;
  }
  const points = data.points.filter(point => (
    isJmaIntensityStationCode(point?.code ?? point?.station_code)
  ));
  return points.length === data.points.length ? data : { ...data, points };
}

export function preserveJmaEarthquakeDetails(previous, next) {
  const sanitizedNext = sanitizeJmaIntensityStationPoints(next);
  if (!previous || !sanitizedNext) {
    return sanitizedNext;
  }
  const previousEventId = String(previous.eventId ?? previous.event_id ?? "");
  const nextEventId = String(sanitizedNext.eventId ?? sanitizedNext.event_id ?? "");
  if (!previousEventId || previousEventId !== nextEventId) {
    return sanitizedNext;
  }
  const previousPoints = sanitizeJmaIntensityStationPoints(previous)?.points ?? [];
  const nextPoints = Array.isArray(sanitizedNext.points) ? sanitizedNext.points : [];
  const regions = mergeEarthquakeRegions(previous.regions, sanitizedNext.regions);

  return {
    ...sanitizedNext,
    points: nextPoints.length > 0 || previousPoints.length === 0
      ? nextPoints
      : previousPoints,
    regions
  };
}

function mergeEarthquakeRegions(previousRegions, nextRegions) {
  const merged = new Map();
  const append = region => {
    const code = String(
      region?.code ?? region?.areaCode ?? region?.regionCode ?? ""
    ).trim();
    if (!code) {
      return;
    }
    const current = merged.get(code);
    merged.set(code, current ? { ...current, ...region } : region);
  };

  (Array.isArray(previousRegions) ? previousRegions : []).forEach(append);
  (Array.isArray(nextRegions) ? nextRegions : []).forEach(append);
  return [...merged.values()];
}
