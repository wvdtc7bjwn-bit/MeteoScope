import { parseJstDateTime } from "../utils/jstDateTime.js";

const P2P_HISTORY_URL = "https://api.p2pquake.net/v2/history?codes=551&limit=20";
const P2P_WEBSOCKET_URL = "wss://api.p2pquake.net/v2/ws";
const HISTORY_LIMIT = 50;
const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

const ISSUE_PRIORITIES = Object.freeze({
  ScalePrompt: 1,
  Destination: 2,
  ScaleAndDestination: 3,
  DetailScale: 4,
  Foreign: 1,
  Other: 0
});

const INTENSITY_BY_SCALE = Object.freeze({
  10: "1",
  20: "2",
  30: "3",
  40: "4",
  45: "5-",
  46: "5-",
  50: "5+",
  55: "6-",
  60: "6+",
  70: "7"
});

const INTENSITY_RANK = Object.freeze({ "": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5-": 5, "5+": 6, "6-": 7, "6+": 8, "7": 9 });

function cleanText(value, fallback = "", maxLength = 300) {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return (text || fallback).slice(0, maxLength);
}

function finiteNumber(value, { min = -Infinity, max = Infinity } = {}) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max ? numeric : null;
}

function formatJstTime(value) {
  const timestamp = Date.parse(value ?? "");
  if (!Number.isFinite(timestamp)) return "--";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(timestamp)).replace(/\//g, "/");
}

export function normalizeRealtimeIntensity(value) {
  if (typeof value === "number" || /^\d+$/.test(String(value ?? "").trim())) {
    return INTENSITY_BY_SCALE[Number(value)] ?? "";
  }
  const text = cleanText(value);
  const aliases = { "5弱": "5-", "5強": "5+", "6弱": "6-", "6強": "6+" };
  const normalized = aliases[text] ?? text;
  return Object.hasOwn(INTENSITY_RANK, normalized) ? normalized : "";
}

function intensityLabel(intensity) {
  return intensity ? `震度${intensity.replace("-", "弱").replace("+", "強")}` : "震度不明";
}

function buildEventKey(originTime, latitude, longitude, fallback = "") {
  const timestamp = Date.parse(originTime ?? "");
  if (Number.isFinite(timestamp)) return `eq:${Math.floor(timestamp / 1000)}`;
  if (latitude !== null && longitude !== null) return `eq:${latitude.toFixed(2)}:${longitude.toFixed(2)}:${fallback}`;
  return `eq:${fallback}`;
}

function tsunamiCommentFromState(state) {
  const value = cleanText(state);
  if (value === "None") return "この地震による津波の心配はありません。";
  if (value === "Checking") return "津波の有無を調査中です。";
  if (value === "NonEffective") return "若干の海面変動が予想されますが、被害の心配はありません。";
  if (["Watch", "Warning"].includes(value)) return "津波情報が発表されています。";
  return "";
}

function normalizeP2pPoints(points) {
  const stations = [];
  const areas = [];
  for (const point of Array.isArray(points) ? points : []) {
    const intensity = normalizeRealtimeIntensity(point?.scale);
    const name = cleanText(point?.addr);
    if (!intensity || !name) continue;
    const common = {
      intensity,
      intensityLabel: intensityLabel(intensity),
      intensityShort: intensity,
      rank: INTENSITY_RANK[intensity] ?? 0,
      prefecture: cleanText(point?.pref)
    };
    if (point?.isArea) {
      areas.push({ ...common, code: "", areaName: name });
    } else {
      stations.push({ ...common, code: "", stationName: name, cityName: "", areaName: "" });
    }
  }
  return { areas, stations };
}

export function normalizeP2pEarthquake(payload) {
  if (!payload || typeof payload !== "object" || Number(payload.code) !== 551) return null;
  const issueType = cleanText(payload.issue?.type, "Other", 40);
  const issueTimeRaw = parseJstDateTime(payload.issue?.time) ?? parseJstDateTime(payload.time);
  const originTimeRaw = parseJstDateTime(payload.earthquake?.time);
  const latitude = finiteNumber(payload.earthquake?.hypocenter?.latitude, { min: -90, max: 90 });
  const longitude = finiteNumber(payload.earthquake?.hypocenter?.longitude, { min: -180, max: 180 });
  const depth = finiteNumber(payload.earthquake?.hypocenter?.depth, { min: 0, max: 1_000 });
  const magnitudeValue = finiteNumber(payload.earthquake?.hypocenter?.magnitude, { min: 0, max: 10.5 });
  const magnitude = magnitudeValue !== null && magnitudeValue > 0 ? magnitudeValue.toFixed(1) : "--";
  const maxIntensity = normalizeRealtimeIntensity(payload.earthquake?.maxScale);
  const { areas, stations } = normalizeP2pPoints(payload.points);
  const sourceId = cleanText(payload.id, `${issueType}:${issueTimeRaw ?? "unknown"}`, 100);
  const eventKey = buildEventKey(originTimeRaw, latitude, longitude, sourceId);
  const titleByType = {
    ScalePrompt: "震度速報",
    Destination: "震源に関する情報",
    ScaleAndDestination: "震源・震度情報",
    DetailScale: "各地の震度に関する情報"
  };
  return {
    id: eventKey,
    rawId: `p2p:${sourceId}`,
    eventId: eventKey,
    eventKey,
    source: "p2p",
    sourceReportId: sourceId,
    issueType,
    reportPriority: ISSUE_PRIORITIES[issueType] ?? 0,
    title: titleByType[issueType] ?? "地震情報",
    reportTitle: titleByType[issueType] ?? "地震情報",
    reportTime: formatJstTime(issueTimeRaw),
    reportTimeRaw: issueTimeRaw ?? "",
    eventTime: formatJstTime(originTimeRaw),
    eventTimeRaw: originTimeRaw ?? "",
    hypocenterName: cleanText(payload.earthquake?.hypocenter?.name, "震源調査中"),
    coordinates: latitude !== null && longitude !== null ? [longitude, latitude] : null,
    depth,
    magnitude,
    maxIntensity,
    maxIntensityLabel: intensityLabel(maxIntensity),
    maxIntensityShort: maxIntensity || "--",
    intensityAreas: areas,
    intensityCities: [],
    intensityStations: stations,
    headline: cleanText(payload.comments?.freeFormComment),
    tsunamiComment: tsunamiCommentFromState(payload.earthquake?.domesticTsunami),
    url: "",
    receivedAt: new Date().toISOString()
  };
}

function dateMs(value) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function numericMagnitude(value) {
  return finiteNumber(cleanText(value).replace(/^M\s*/i, ""), { min: 0, max: 10.5 });
}

function isSameEarthquake(left, right) {
  if (!left || !right) return false;
  if (left.eventKey && right.eventKey && left.eventKey === right.eventKey) return true;
  const leftTime = dateMs(left.eventTimeRaw);
  const rightTime = dateMs(right.eventTimeRaw);
  if (leftTime > 0 && rightTime > 0 && Math.abs(leftTime - rightTime) <= 2_000) return true;

  // 配信元ごとに「発生時刻」と「検知時刻」が1分前後ずれる場合がある。
  // 近接した別地震をまとめないよう、時刻以外の震源要素がすべて一致する場合だけ統合する。
  if (!(leftTime > 0 && rightTime > 0) || Math.abs(leftTime - rightTime) > 2 * 60 * 1000) return false;
  const leftCoordinates = Array.isArray(left.coordinates) ? left.coordinates.map(Number) : [];
  const rightCoordinates = Array.isArray(right.coordinates) ? right.coordinates.map(Number) : [];
  if (leftCoordinates.length !== 2 || rightCoordinates.length !== 2) return false;
  const coordinateMatch = Math.abs(leftCoordinates[0] - rightCoordinates[0]) <= 0.051
    && Math.abs(leftCoordinates[1] - rightCoordinates[1]) <= 0.051;
  const nameMatch = cleanText(left.hypocenterName) === cleanText(right.hypocenterName)
    && cleanText(left.hypocenterName) !== "震源調査中";
  const leftDepth = finiteNumber(left.depth, { min: 0, max: 1_000 });
  const rightDepth = finiteNumber(right.depth, { min: 0, max: 1_000 });
  const depthMatch = leftDepth !== null && rightDepth !== null && Math.abs(leftDepth - rightDepth) <= 1;
  const leftMagnitude = numericMagnitude(left.magnitude);
  const rightMagnitude = numericMagnitude(right.magnitude);
  const magnitudeMatch = leftMagnitude !== null && rightMagnitude !== null
    && Math.abs(leftMagnitude - rightMagnitude) <= 0.11;
  return coordinateMatch && nameMatch && depthMatch && magnitudeMatch;
}

function completeness(item) {
  return [item.coordinates, item.hypocenterName && item.hypocenterName !== "震源調査中", item.magnitude && item.magnitude !== "--", item.maxIntensity, item.intensityStations?.length, item.intensityAreas?.length].filter(Boolean).length;
}

function sourcePriority(item) {
  return item?.source === "xml" ? 3 : item?.source === "p2p" ? 2 : 1;
}

function choosePrimary(left, right) {
  const reportDelta = (left.reportPriority ?? 0) - (right.reportPriority ?? 0);
  if (reportDelta) return reportDelta > 0 ? left : right;
  const completenessDelta = completeness(left) - completeness(right);
  if (completenessDelta) return completenessDelta > 0 ? left : right;
  const sourceDelta = sourcePriority(left) - sourcePriority(right);
  if (sourceDelta) return sourceDelta > 0 ? left : right;
  return dateMs(left.reportTimeRaw) >= dateMs(right.reportTimeRaw) ? left : right;
}

function mergeEarthquake(left, right) {
  const primary = choosePrimary(left, right);
  const fallback = primary === left ? right : left;
  return {
    ...fallback,
    ...primary,
    id: primary.id || fallback.id,
    eventId: primary.eventId || fallback.eventId,
    eventKey: primary.eventKey || fallback.eventKey,
    coordinates: primary.coordinates ?? fallback.coordinates,
    depth: primary.depth ?? fallback.depth,
    magnitude: primary.magnitude && primary.magnitude !== "--" ? primary.magnitude : fallback.magnitude,
    maxIntensity: primary.maxIntensity || fallback.maxIntensity,
    maxIntensityLabel: primary.maxIntensity ? primary.maxIntensityLabel : fallback.maxIntensityLabel,
    maxIntensityShort: primary.maxIntensity ? primary.maxIntensityShort : fallback.maxIntensityShort,
    intensityAreas: primary.intensityAreas?.length ? primary.intensityAreas : (fallback.intensityAreas ?? []),
    intensityCities: primary.intensityCities?.length ? primary.intensityCities : (fallback.intensityCities ?? []),
    intensityStations: primary.intensityStations?.length ? primary.intensityStations : (fallback.intensityStations ?? []),
    headline: primary.headline || fallback.headline,
    tsunamiComment: primary.tsunamiComment || fallback.tsunamiComment,
    url: primary.url || fallback.url
  };
}

export function mergeRealtimeEarthquakes(baseEarthquakes = [], realtimeEarthquakes = [], limit = HISTORY_LIMIT) {
  const merged = [];
  for (const item of [...realtimeEarthquakes, ...baseEarthquakes].filter(Boolean)) {
    const index = merged.findIndex((candidate) => isSameEarthquake(candidate, item));
    if (index >= 0) merged[index] = mergeEarthquake(merged[index], item);
    else merged.push({ ...item });
  }
  return merged
    .sort((a, b) => dateMs(b.eventTimeRaw || b.reportTimeRaw) - dateMs(a.eventTimeRaw || a.reportTimeRaw))
    .slice(0, Math.max(1, limit));
}

export function shouldTemporarilyShowEarthquakeInfo(earthquake) {
  return ["ScalePrompt", "Destination", "ScaleAndDestination", "DetailScale"].includes(earthquake?.issueType);
}

export function createRealtimeEarthquakeClient({
  onUpdate = () => {},
  onStatus = () => {},
  fetchImpl = globalThis.fetch?.bind(globalThis),
  WebSocketImpl = globalThis.WebSocket,
  now = () => Date.now()
} = {}) {
  let running = false;
  let generation = 0;
  let p2pSocket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let historyAbortController = null;
  let connection = { status: "stopped", source: "", lastMessageAt: null, error: "" };
  let earthquakes = [];
  const seenP2pIds = new Set();

  const emit = (incoming = null) => onUpdate({
    earthquakes: earthquakes.map((item) => ({ ...item })),
    incoming,
    connection: { ...connection },
    updatedAt: new Date(now()).toISOString()
  });

  const setStatus = (next) => {
    connection = { ...connection, ...next };
    onStatus({ ...connection });
    emit();
  };

  const accept = (items, incoming = null) => {
    earthquakes = mergeRealtimeEarthquakes(earthquakes, items, HISTORY_LIMIT);
    connection.lastMessageAt = new Date(now()).toISOString();
    emit(incoming);
  };

  async function fetchP2pHistory(expectedGeneration = generation) {
    if (!fetchImpl) throw new Error("fetch unavailable");
    historyAbortController?.abort();
    const controller = new AbortController();
    historyAbortController = controller;
    try {
      const response = await fetchImpl(P2P_HISTORY_URL, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`P2P history HTTP ${response.status}`);
      const payload = await response.json();
      if (!running || expectedGeneration !== generation) return;
      const items = (Array.isArray(payload) ? payload : []).map(normalizeP2pEarthquake).filter(Boolean);
      for (const entry of Array.isArray(payload) ? payload : []) if (entry?.id) seenP2pIds.add(String(entry.id));
      accept(items);
    } finally {
      if (historyAbortController === controller) historyAbortController = null;
    }
  }

  function closeSocket(socket) {
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try { socket.close(); } catch { /* already closed */ }
  }

  function scheduleReconnect(expectedGeneration) {
    if (!running || generation !== expectedGeneration || reconnectTimer) return;
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** reconnectAttempt++);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectP2p(expectedGeneration);
    }, delay);
  }

  function connectP2p(expectedGeneration) {
    if (!running || generation !== expectedGeneration || p2pSocket || !WebSocketImpl) return;
    setStatus({ status: "connecting", source: "p2p", error: "" });
    const socket = new WebSocketImpl(P2P_WEBSOCKET_URL);
    p2pSocket = socket;
    socket.onopen = () => {
      if (!running || generation !== expectedGeneration || socket !== p2pSocket) return;
      reconnectAttempt = 0;
      setStatus({ status: "connected", source: "p2p", error: "" });
      void fetchP2pHistory(expectedGeneration).catch(() => {});
    };
    socket.onmessage = (event) => {
      if (!running || generation !== expectedGeneration || socket !== p2pSocket) return;
      try {
        const payload = JSON.parse(event.data);
        if (Number(payload?.code) !== 551) return;
        const id = cleanText(payload.id);
        if (id && seenP2pIds.has(id)) return;
        if (id) seenP2pIds.add(id);
        const item = normalizeP2pEarthquake(payload);
        if (item) accept([item], item);
      } catch { /* ignore malformed upstream frame */ }
    };
    socket.onerror = () => {
      if (socket === p2pSocket) setStatus({ status: "error", source: "p2p", error: "P2P接続エラー" });
    };
    socket.onclose = () => {
      if (socket !== p2pSocket) return;
      p2pSocket = null;
      if (!running) return;
      scheduleReconnect(expectedGeneration);
    };
  }

  async function refresh() {
    if (!running) return;
    const expectedGeneration = generation;
    try {
      await fetchP2pHistory(expectedGeneration);
      if (!running || generation !== expectedGeneration) return;
      if (p2pSocket?.readyState !== 1) {
        closeSocket(p2pSocket);
        p2pSocket = null;
        connectP2p(generation);
      }
    } catch (error) {
      if (error?.name === "AbortError" || !running || generation !== expectedGeneration) return;
      if (!p2pSocket) connectP2p(generation);
      connection = { ...connection, error: cleanText(error?.message, "再取得に失敗") };
      emit();
    }
  }

  function start() {
    if (running) {
      void refresh();
      return;
    }
    running = true;
    generation += 1;
    connectP2p(generation);
    void fetchP2pHistory(generation).catch(() => {});
  }

  function stop({ clear = false } = {}) {
    running = false;
    generation += 1;
    historyAbortController?.abort();
    historyAbortController = null;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    closeSocket(p2pSocket);
    p2pSocket = null;
    if (clear) earthquakes = [];
    setStatus({ status: "stopped", source: "", error: "" });
  }

  return { start, stop, refresh, getSnapshot: () => ({ earthquakes: [...earthquakes], connection: { ...connection } }) };
}
