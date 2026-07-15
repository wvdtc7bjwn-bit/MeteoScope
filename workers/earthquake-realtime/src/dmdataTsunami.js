export function getDmdataTsunamiEventId(value) {
  return String(
    value?.eventId ??
    value?.earthquake?.eventId ??
    value?.earthquakes?.[0]?.eventId ??
    ""
  ).trim();
}

function mergeByKey(existing = [], incoming = [], getKey) {
  const merged = new Map();
  for (const item of [...existing, ...incoming]) {
    const key = String(getKey(item) ?? "").trim();
    if (!key) continue;
    merged.set(key, { ...(merged.get(key) ?? {}), ...item });
  }
  return [...merged.values()];
}

function mergeObservationGroups(existing = [], incoming = []) {
  return mergeByKey(existing, incoming, item => item?.code ?? item?.name).map(group => {
    const previous = existing.find(item => String(item?.code ?? item?.name) === String(group?.code ?? group?.name));
    const next = incoming.find(item => String(item?.code ?? item?.name) === String(group?.code ?? group?.name));
    return {
      ...group,
      stations: mergeByKey(previous?.stations, next?.stations, station => station?.code ?? station?.name)
    };
  });
}

export function mergeDmdataTsunamiSnapshots(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const existingEventId = getDmdataTsunamiEventId(existing);
  const incomingEventId = getDmdataTsunamiEventId(incoming);
  if (!existingEventId || !incomingEventId || existingEventId !== incomingEventId) return incoming;

  if (incoming.isCanceled === true) {
    return {
      ...existing,
      ...incoming,
      eventId: incomingEventId,
      areas: [],
      isCanceled: true
    };
  }

  const incomingType = String(incoming.type ?? incoming.telegramType ?? "").toUpperCase();
  const replaceForecasts = incomingType === "VTSE41";
  return {
    ...existing,
    ...incoming,
    eventId: incomingEventId,
    title: incoming.title || existing.title,
    headline: incoming.headline || existing.headline,
    text: incoming.text || existing.text,
    validTime: incoming.validTime || existing.validTime,
    earthquake: incoming.earthquake?.eventId ? incoming.earthquake : existing.earthquake,
    earthquakes: incoming.earthquakes?.length ? incoming.earthquakes : existing.earthquakes,
    areas: replaceForecasts
      ? (incoming.areas ?? [])
      : (incoming.areas?.length ? incoming.areas : existing.areas ?? []),
    observations: mergeObservationGroups(existing.observations, incoming.observations),
    estimations: mergeByKey(existing.estimations, incoming.estimations, item => item?.code ?? item?.name),
    isCanceled: false
  };
}

export function isAllowedDmdataTelegramDataUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" && url.hostname === "data.api.dmdata.jp" && /^\/v1\/[A-Za-z0-9._~-]+$/u.test(url.pathname);
  }
  catch {
    return false;
  }
}
