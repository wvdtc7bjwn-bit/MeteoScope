const WOLFX_EEW_WEBSOCKET_URL = "wss://ws-api.wolfx.jp/jma_eew";
const WOLFX_EEW_HTTP_URL = "https://api.wolfx.jp/jma_eew.json";

export const EEW_ACTIVE_MAX_AGE_MS = 3 * 60 * 1000;
export const EEW_FINAL_DISPLAY_MS = 90 * 1000;
export const EEW_CANCEL_DISPLAY_MS = 20 * 1000;
export const EEW_CANCEL_TOMBSTONE_MS = 15 * 60 * 1000;
export const EEW_RECENT_HISTORY_MS = 10 * 60 * 1000;

const FUTURE_TIME_TOLERANCE_MS = 60 * 1000;
const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 45_000;
const CONNECTION_STALE_MS = 95_000;

function parseWolfxTime(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const normalized = /^\d{4}[/-]\d{1,2}[/-]\d{1,2}[ T]\d{1,2}:\d{2}:\d{2}$/.test(text)
    ? `${text.replaceAll("/", "-").replace(" ", "T")}+09:00`
    : text;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function asBoolean(value) {
  return value === true || value === 1 || String(value).toLowerCase() === "true";
}

function asFiniteNumber(value, { min = -Infinity, max = Infinity } = {}) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max ? numeric : null;
}

function cleanText(value, fallback = "", maxLength = 300) {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return (text || fallback).slice(0, maxLength);
}

function normalizeIntensity(value) {
  const text = String(value ?? "").trim();
  const aliases = { "5弱": "5-", "5強": "5+", "6弱": "6-", "6強": "6+" };
  const normalized = aliases[text] ?? text;
  return ["1", "2", "3", "4", "5-", "5+", "6-", "6+", "7"].includes(normalized) ? normalized : "";
}

function detectPlum(payload) {
  if (asBoolean(payload.isPlum ?? payload.isPLUM ?? payload.PLUM)) return true;
  return [payload.CodeType, payload.Accuracy?.Epicenter, payload.Accuracy?.Depth, payload.OriginalText]
    .some((value) => /\bPLUM\b/i.test(String(value ?? "")));
}

function getReportTimestamp(eew) {
  const announced = Date.parse(eew?.announcedTime ?? "");
  if (Number.isFinite(announced)) return announced;
  const origin = Date.parse(eew?.originTime ?? "");
  return Number.isFinite(origin) ? origin : NaN;
}

function getReceivedTimestamp(eew) {
  const received = Date.parse(eew?.receivedAt ?? "");
  return Number.isFinite(received) ? received : NaN;
}

function getTerminalPriority(eew) {
  if (eew?.isCancel) return 3;
  if (eew?.isFinal) return 2;
  return 1;
}

function compareReportVersions(next, current) {
  if (!current) return 1;
  if (next.serial !== current.serial) return next.serial > current.serial ? 1 : -1;
  const nextReportTime = getReportTimestamp(next);
  const currentReportTime = getReportTimestamp(current);
  if (nextReportTime !== currentReportTime) {
    if (!Number.isFinite(nextReportTime)) return -1;
    if (!Number.isFinite(currentReportTime)) return 1;
    return nextReportTime > currentReportTime ? 1 : -1;
  }
  const terminalDifference = getTerminalPriority(next) - getTerminalPriority(current);
  if (terminalDifference) return Math.sign(terminalDifference);
  const sourcePriority = { websocket: 2, http: 1 };
  return (sourcePriority[next.transport] ?? 0) - (sourcePriority[current.transport] ?? 0);
}

function getIntensityRank(value) {
  return ["", "1", "2", "3", "4", "5-", "5+", "6-", "6+", "7"].indexOf(value);
}

function sortDisplayEvents(events) {
  return events.sort((a, b) => {
    if (a.isCancel !== b.isCancel) return a.isCancel ? 1 : -1;
    if (a.isWarn !== b.isWarn) return a.isWarn ? -1 : 1;
    const intensityDifference = getIntensityRank(b.maxIntensity) - getIntensityRank(a.maxIntensity);
    if (intensityDifference) return intensityDifference;
    return (getReportTimestamp(b) || 0) - (getReportTimestamp(a) || 0);
  });
}

export function normalizeWolfxEew(payload, { receivedAt = Date.now(), transport = "websocket" } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const eventId = cleanText(payload.EventID, "", 80);
  if (!eventId) return null;

  const announcedTime = parseWolfxTime(payload.AnnouncedTime);
  const originTime = parseWolfxTime(payload.OriginTime);
  const latitude = asFiniteNumber(payload.Latitude, { min: -90, max: 90 });
  const longitude = asFiniteNumber(payload.Longitude, { min: -180, max: 180 });
  const depth = asFiniteNumber(payload.Depth, { min: 0, max: 1_000 });
  const rawMagnitude = asFiniteNumber(payload.Magnitude ?? payload.Magunitude, { min: 0, max: 10.5 });
  const magnitude = rawMagnitude !== null && rawMagnitude > 0 ? rawMagnitude : null;
  const isCancel = asBoolean(payload.isCancel);
  const isAssumption = asBoolean(payload.isAssumption);
  const isPlum = detectPlum(payload);
  const coordinates = latitude !== null && longitude !== null ? [longitude, latitude] : null;
  const canRenderWaves = Boolean(coordinates && originTime && depth !== null && !isAssumption && !isPlum);

  return {
    source: "Wolfx JMA EEW",
    transport,
    eventId,
    serial: Math.max(0, Number.parseInt(payload.Serial, 10) || 0),
    title: cleanText(payload.Title, "緊急地震速報"),
    codeType: cleanText(payload.CodeType),
    issueSource: cleanText(payload.Issue?.Source, "気象庁"),
    issueStatus: cleanText(payload.Issue?.Status),
    announcedTime,
    originTime,
    hypocenter: cleanText(payload.Hypocenter, "震源調査中"),
    coordinates,
    magnitude,
    depth,
    maxIntensity: normalizeIntensity(payload.MaxIntensity),
    accuracy: {
      epicenter: cleanText(payload.Accuracy?.Epicenter),
      depth: cleanText(payload.Accuracy?.Depth),
      magnitude: cleanText(payload.Accuracy?.Magnitude)
    },
    warnAreas: Array.isArray(payload.WarnArea)
      ? payload.WarnArea.slice(0, 200).map((area) => ({
        code: cleanText(area?.Code, "", 20),
        name: cleanText(area?.Chiiki),
        from: normalizeIntensity(area?.Shindo1),
        to: normalizeIntensity(area?.Shindo2),
        arrivalTime: parseWolfxTime(area?.Time),
        arrived: asBoolean(area?.Arrive),
        type: cleanText(area?.Type)
      })).filter((area) => area.name)
      : [],
    isWarn: asBoolean(payload.isWarn),
    isFinal: asBoolean(payload.isFinal),
    isCancel,
    isTraining: asBoolean(payload.isTraining) || /訓練|練習/.test(cleanText(payload.Title)),
    isAssumption,
    isPlum,
    canRenderWaves,
    uncertaintyLabel: isPlum
      ? "PLUM法による情報（震源要素が確定していません）"
      : (isAssumption ? "仮定震源要素を使用" : ""),
    receivedAt: new Date(receivedAt).toISOString()
  };
}

export function isWolfxEewActive(eew, now = Date.now()) {
  if (!eew || eew.isCancel || eew.isTraining) return false;
  const referenceTime = getReportTimestamp(eew);
  if (!Number.isFinite(referenceTime) || referenceTime > now + FUTURE_TIME_TOLERANCE_MS) return false;
  const maxAge = eew.isFinal ? EEW_FINAL_DISPLAY_MS : EEW_ACTIVE_MAX_AGE_MS;
  return now - referenceTime <= maxAge;
}

export function createWolfxEewEventStore({ now = () => Date.now() } = {}) {
  const activeByEventId = new Map();
  const recentByEventId = new Map();
  const cancelledByEventId = new Map();

  function prune() {
    const currentTime = now();
    for (const [eventId, eew] of activeByEventId) {
      if (isWolfxEewActive(eew, currentTime)) continue;
      activeByEventId.delete(eventId);
      recentByEventId.set(eventId, eew);
    }
    for (const [eventId, tombstone] of cancelledByEventId) {
      if (tombstone.expiresAt <= currentTime) cancelledByEventId.delete(eventId);
    }
    for (const [eventId, eew] of recentByEventId) {
      const receivedTime = getReceivedTimestamp(eew);
      if (!Number.isFinite(receivedTime) || currentTime - receivedTime > EEW_RECENT_HISTORY_MS) recentByEventId.delete(eventId);
    }
  }

  function accept(payload, { transport = "websocket" } = {}) {
    const currentTime = now();
    const next = normalizeWolfxEew(payload, { receivedAt: currentTime, transport });
    if (!next) return { accepted: false, reason: "invalid-payload" };
    if (next.isTraining) return { accepted: false, reason: "training", event: next };
    prune();

    if (next.isCancel) {
      const current = activeByEventId.get(next.eventId) ?? recentByEventId.get(next.eventId);
      if (current && compareReportVersions(next, current) <= 0) {
        return { accepted: false, reason: "older-or-duplicate", event: next };
      }
      activeByEventId.delete(next.eventId);
      recentByEventId.set(next.eventId, next);
      cancelledByEventId.set(next.eventId, {
        serial: next.serial,
        cancelledAt: currentTime,
        expiresAt: currentTime + EEW_CANCEL_TOMBSTONE_MS
      });
      return { accepted: true, reason: "cancelled", event: next };
    }
    if (cancelledByEventId.has(next.eventId)) return { accepted: false, reason: "cancelled-event", event: next };

    const current = activeByEventId.get(next.eventId) ?? recentByEventId.get(next.eventId);
    if (compareReportVersions(next, current) <= 0) return { accepted: false, reason: "older-or-duplicate", event: next };
    if (!isWolfxEewActive(next, currentTime)) {
      recentByEventId.set(next.eventId, next);
      activeByEventId.delete(next.eventId);
      return { accepted: false, reason: "stale", event: next };
    }
    activeByEventId.set(next.eventId, next);
    recentByEventId.set(next.eventId, next);
    return { accepted: true, reason: "updated", event: next };
  }

  function getSnapshot(connection = {}) {
    prune();
    const currentTime = now();
    const cancellationEvents = [...recentByEventId.values()].filter((eew) => (
      eew.isCancel && currentTime - getReceivedTimestamp(eew) <= EEW_CANCEL_DISPLAY_MS
    ));
    const activeEvents = sortDisplayEvents([...activeByEventId.values(), ...cancellationEvents])
      .map((eew) => ({ ...eew, phase: eew.isCancel ? "cancelled" : (eew.isFinal ? "final" : "active") }));
    return {
      activeEvents,
      recentEvents: sortDisplayEvents([...recentByEventId.values()]).map((eew) => ({ ...eew })),
      connection: { ...connection },
      updatedAt: new Date(currentTime).toISOString()
    };
  }

  function getNextTransitionAt() {
    prune();
    const transitions = [];
    for (const eew of activeByEventId.values()) {
      const referenceTime = getReportTimestamp(eew);
      const maxAge = eew.isFinal ? EEW_FINAL_DISPLAY_MS : EEW_ACTIVE_MAX_AGE_MS;
      if (Number.isFinite(referenceTime)) transitions.push(referenceTime + maxAge);
    }
    for (const eew of recentByEventId.values()) {
      if (!eew.isCancel) continue;
      const receivedTime = getReceivedTimestamp(eew);
      if (Number.isFinite(receivedTime)) transitions.push(receivedTime + EEW_CANCEL_DISPLAY_MS);
    }
    return transitions.filter((value) => value > now()).sort((a, b) => a - b)[0] ?? null;
  }

  function clear() {
    activeByEventId.clear();
    recentByEventId.clear();
    cancelledByEventId.clear();
  }

  return { accept, clear, getNextTransitionAt, getSnapshot, prune };
}

export function createWolfxEewClient({
  onUpdate,
  onStatus,
  onDiagnostic,
  WebSocketImpl = globalThis.WebSocket,
  fetchImpl = globalThis.fetch,
  windowRef = globalThis.window,
  documentRef = globalThis.document,
  now = () => Date.now()
} = {}) {
  const store = createWolfxEewEventStore({ now });
  let socket = null;
  let socketGeneration = 0;
  let stopped = true;
  let reconnectTimer = 0;
  let expiryTimer = 0;
  let heartbeatTimer = 0;
  let healthTimer = 0;
  let reconnectDelay = RECONNECT_MIN_MS;
  let snapshotAbortController = null;
  let connectionStatus = "stopped";
  let lastConnectedAt = null;
  let lastMessageAt = null;

  const setTimeoutRef = windowRef?.setTimeout?.bind(windowRef) ?? globalThis.setTimeout;
  const clearTimeoutRef = windowRef?.clearTimeout?.bind(windowRef) ?? globalThis.clearTimeout;
  const setIntervalRef = windowRef?.setInterval?.bind(windowRef) ?? globalThis.setInterval;
  const clearIntervalRef = windowRef?.clearInterval?.bind(windowRef) ?? globalThis.clearInterval;

  const connectionSnapshot = () => ({ status: connectionStatus, lastConnectedAt, lastMessageAt });

  function emit() {
    onUpdate?.(store.getSnapshot(connectionSnapshot()));
    scheduleExpiry();
  }

  function setStatus(status, detail = "") {
    connectionStatus = status;
    onStatus?.({ status, detail, lastConnectedAt, lastMessageAt });
    emit();
  }

  function clearTimers() {
    clearTimeoutRef(reconnectTimer);
    clearTimeoutRef(expiryTimer);
    clearIntervalRef(heartbeatTimer);
    clearIntervalRef(healthTimer);
    reconnectTimer = 0;
    expiryTimer = 0;
    heartbeatTimer = 0;
    healthTimer = 0;
  }

  function scheduleExpiry() {
    clearTimeoutRef(expiryTimer);
    expiryTimer = 0;
    const nextTransitionAt = store.getNextTransitionAt();
    if (!nextTransitionAt) return;
    expiryTimer = setTimeoutRef(() => {
      expiryTimer = 0;
      emit();
    }, Math.max(100, nextTransitionAt - now() + 100));
  }

  function acceptPayload(payload, transport) {
    const result = store.accept(payload, { transport });
    if (!result.accepted) {
      onDiagnostic?.({ type: "payload-ignored", reason: result.reason, eventId: result.event?.eventId ?? "" });
      if (["stale", "cancelled-event"].includes(result.reason)) emit();
      return result;
    }
    emit();
    return result;
  }

  async function fetchSnapshot(generation) {
    if (typeof fetchImpl !== "function" || stopped) return;
    snapshotAbortController?.abort();
    const controller = new AbortController();
    snapshotAbortController = controller;
    try {
      const response = await fetchImpl(WOLFX_EEW_HTTP_URL, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (stopped || generation !== socketGeneration) return;
      acceptPayload(payload, "http");
    } catch (error) {
      if (error?.name !== "AbortError") onDiagnostic?.({ type: "snapshot-error", message: cleanText(error?.message, "取得失敗", 120) });
    } finally {
      if (snapshotAbortController === controller) snapshotAbortController = null;
    }
  }

  function requestLatest({ includeHttp = true } = {}) {
    const generation = socketGeneration;
    if (socket?.readyState === WebSocketImpl?.OPEN) {
      try { socket.send("query_jmaeew"); } catch (error) {
        onDiagnostic?.({ type: "query-error", message: cleanText(error?.message, "送信失敗", 120) });
      }
    }
    if (includeHttp) void fetchSnapshot(generation);
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    setStatus("reconnecting");
    reconnectTimer = setTimeoutRef(() => {
      reconnectTimer = 0;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(RECONNECT_MAX_MS, reconnectDelay * 2);
  }

  function connect() {
    if (stopped || socket?.readyState === WebSocketImpl?.OPEN || socket?.readyState === WebSocketImpl?.CONNECTING) return;
    if (typeof WebSocketImpl !== "function") {
      setStatus("unsupported", "WebSocket unavailable");
      void fetchSnapshot(socketGeneration);
      return;
    }
    const generation = ++socketGeneration;
    setStatus("connecting");
    let nextSocket;
    try {
      nextSocket = new WebSocketImpl(WOLFX_EEW_WEBSOCKET_URL);
      socket = nextSocket;
    } catch (error) {
      onDiagnostic?.({ type: "connection-error", message: cleanText(error?.message, "接続失敗", 120) });
      void fetchSnapshot(generation);
      scheduleReconnect();
      return;
    }
    const isCurrent = () => !stopped && generation === socketGeneration && socket === nextSocket;

    nextSocket.addEventListener("open", () => {
      if (!isCurrent()) return;
      reconnectDelay = RECONNECT_MIN_MS;
      lastConnectedAt = new Date(now()).toISOString();
      lastMessageAt = lastConnectedAt;
      setStatus("connected");
      requestLatest({ includeHttp: true });
      clearIntervalRef(heartbeatTimer);
      clearIntervalRef(healthTimer);
      heartbeatTimer = setIntervalRef(() => {
        if (!isCurrent() || nextSocket.readyState !== WebSocketImpl.OPEN) return;
        try { nextSocket.send("ping"); } catch { nextSocket.close(); }
      }, HEARTBEAT_INTERVAL_MS);
      healthTimer = setIntervalRef(() => {
        const lastMessageTimestamp = Date.parse(lastMessageAt ?? "");
        if (!isCurrent() || !Number.isFinite(lastMessageTimestamp) || now() - lastMessageTimestamp <= CONNECTION_STALE_MS) return;
        setStatus("stale", "heartbeat timeout");
        nextSocket.close();
      }, 15_000);
    });
    nextSocket.addEventListener("message", (event) => {
      if (!isCurrent()) return;
      lastMessageAt = new Date(now()).toISOString();
      const text = String(event.data ?? "");
      if (!text || text === "pong") return;
      if (text === "ping") {
        try { nextSocket.send("pong"); } catch { nextSocket.close(); }
        return;
      }
      try {
        const payload = JSON.parse(text);
        if (["heartbeat", "pong"].includes(payload?.type)) {
          if (payload.type === "heartbeat") nextSocket.send("pong");
          return;
        }
        acceptPayload(payload, "websocket");
      } catch (error) {
        onDiagnostic?.({ type: "message-error", message: cleanText(error?.message, "解析失敗", 120) });
      }
    });
    nextSocket.addEventListener("close", () => {
      if (!isCurrent()) return;
      clearIntervalRef(heartbeatTimer);
      clearIntervalRef(healthTimer);
      heartbeatTimer = 0;
      healthTimer = 0;
      socket = null;
      scheduleReconnect();
    });
    nextSocket.addEventListener("error", () => {
      if (!isCurrent()) return;
      onDiagnostic?.({ type: "socket-error" });
      nextSocket.close();
    });
  }

  function handleVisibilityChange() {
    if (documentRef?.visibilityState === "visible") refresh();
  }

  function start() {
    if (!stopped) {
      refresh();
      return;
    }
    stopped = false;
    documentRef?.addEventListener?.("visibilitychange", handleVisibilityChange);
    connect();
  }

  function refresh() {
    if (stopped) {
      start();
      return;
    }
    if (socket?.readyState === WebSocketImpl?.OPEN) {
      requestLatest({ includeHttp: true });
      return;
    }
    if (socket?.readyState !== WebSocketImpl?.CONNECTING) connect();
    else void fetchSnapshot(socketGeneration);
  }

  function stop({ clear = true } = {}) {
    stopped = true;
    socketGeneration += 1;
    documentRef?.removeEventListener?.("visibilitychange", handleVisibilityChange);
    snapshotAbortController?.abort();
    snapshotAbortController = null;
    clearTimers();
    const closingSocket = socket;
    socket = null;
    try { closingSocket?.close(); } catch { /* no-op */ }
    if (clear) store.clear();
    setStatus("stopped");
  }

  return {
    getLatest: () => store.getSnapshot(connectionSnapshot()).activeEvents[0] ?? null,
    getSnapshot: () => store.getSnapshot(connectionSnapshot()),
    refresh,
    start,
    stop
  };
}
