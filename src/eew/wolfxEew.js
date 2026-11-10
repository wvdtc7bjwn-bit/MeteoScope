const WOLFX_EEW_WEBSOCKET_URL = "wss://ws-api.wolfx.jp/jma_eew";
const ACTIVE_EEW_MAX_AGE_MS = 8 * 60 * 1000;
const FINAL_EEW_DISPLAY_MS = 90 * 1000;
const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

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

function asFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeIntensity(value) {
  const text = String(value ?? "").trim();
  const aliases = {
    "5弱": "5-",
    "5強": "5+",
    "6弱": "6-",
    "6強": "6+"
  };
  return aliases[text] ?? text;
}

export function normalizeWolfxEew(payload) {
  if (!payload || typeof payload !== "object") return null;
  const latitude = asFiniteNumber(payload.Latitude);
  const longitude = asFiniteNumber(payload.Longitude);
  const announcedTime = parseWolfxTime(payload.AnnouncedTime);
  const originTime = parseWolfxTime(payload.OriginTime);
  const eventId = String(payload.EventID ?? "").trim();
  if (!eventId || latitude === null || longitude === null || (!announcedTime && !originTime)) return null;

  return {
    source: "Wolfx JMA EEW",
    eventId,
    serial: Math.max(0, Number.parseInt(payload.Serial, 10) || 0),
    title: String(payload.Title ?? "緊急地震速報").trim() || "緊急地震速報",
    codeType: String(payload.CodeType ?? "").trim(),
    issueSource: String(payload.Issue?.Source ?? "気象庁").trim() || "気象庁",
    issueStatus: String(payload.Issue?.Status ?? "").trim(),
    announcedTime,
    originTime: originTime ?? announcedTime,
    hypocenter: String(payload.Hypocenter ?? "震源調査中").trim() || "震源調査中",
    coordinates: [longitude, latitude],
    magnitude: asFiniteNumber(payload.Magnitude ?? payload.Magunitude),
    depth: asFiniteNumber(payload.Depth),
    maxIntensity: normalizeIntensity(payload.MaxIntensity),
    warnAreas: Array.isArray(payload.WarnArea)
      ? payload.WarnArea.map((area) => ({
        name: String(area?.Chiiki ?? "").trim(),
        from: normalizeIntensity(area?.Shindo1),
        to: normalizeIntensity(area?.Shindo2),
        arrivalTime: parseWolfxTime(area?.Time),
        arrived: asBoolean(area?.Arrive)
      })).filter((area) => area.name)
      : [],
    isWarn: asBoolean(payload.isWarn),
    isFinal: asBoolean(payload.isFinal),
    isCancel: asBoolean(payload.isCancel),
    isTraining: asBoolean(payload.isTraining),
    isAssumption: asBoolean(payload.isAssumption),
    receivedAt: new Date().toISOString()
  };
}

export function isWolfxEewActive(eew, now = Date.now()) {
  if (!eew || eew.isCancel || eew.isTraining || eew.isAssumption) return false;
  const referenceTime = Date.parse(eew.announcedTime ?? eew.originTime ?? "");
  if (!Number.isFinite(referenceTime)) return false;
  const maxAge = eew.isFinal ? FINAL_EEW_DISPLAY_MS : ACTIVE_EEW_MAX_AGE_MS;
  return now >= referenceTime - 30_000 && now - referenceTime <= maxAge;
}

export function createWolfxEewClient({ onUpdate, onStatus } = {}) {
  let socket = null;
  let stopped = true;
  let reconnectTimer = 0;
  let expiryTimer = 0;
  let heartbeatTimer = 0;
  let reconnectDelay = RECONNECT_MIN_MS;
  let latestEew = null;

  function clearTimers() {
    window.clearTimeout(reconnectTimer);
    window.clearTimeout(expiryTimer);
    window.clearInterval(heartbeatTimer);
    reconnectTimer = 0;
    expiryTimer = 0;
    heartbeatTimer = 0;
  }

  function clearActiveEew() {
    if (!latestEew) return;
    latestEew = null;
    onUpdate?.(null);
  }

  function scheduleExpiry(eew) {
    window.clearTimeout(expiryTimer);
    const referenceTime = Date.parse(eew.announcedTime ?? eew.originTime ?? "");
    const maxAge = eew.isFinal ? FINAL_EEW_DISPLAY_MS : ACTIVE_EEW_MAX_AGE_MS;
    const delay = Math.max(0, referenceTime + maxAge - Date.now());
    expiryTimer = window.setTimeout(clearActiveEew, delay + 100);
  }

  function acceptPayload(payload) {
    const next = normalizeWolfxEew(payload);
    if (!next) return;
    if (next.isCancel) {
      if (!latestEew || next.eventId === latestEew.eventId) clearActiveEew();
      return;
    }
    if (!isWolfxEewActive(next)) return;
    if (
      latestEew
      && next.eventId === latestEew.eventId
      && next.serial < latestEew.serial
    ) return;
    latestEew = next;
    scheduleExpiry(next);
    onUpdate?.(next);
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    onStatus?.("reconnecting");
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = 0;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(RECONNECT_MAX_MS, reconnectDelay * 2);
  }

  function connect() {
    if (stopped || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
    onStatus?.("connecting");
    try {
      socket = new WebSocket(WOLFX_EEW_WEBSOCKET_URL);
    } catch {
      scheduleReconnect();
      return;
    }
    socket.addEventListener("open", () => {
      reconnectDelay = RECONNECT_MIN_MS;
      onStatus?.("connected");
      socket?.send("query_jmaeew");
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = window.setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
      }, 45_000);
    });
    socket.addEventListener("message", (event) => {
      const text = String(event.data ?? "");
      if (!text || text === "pong") return;
      if (text === "ping") {
        if (socket?.readyState === WebSocket.OPEN) socket.send("pong");
        return;
      }
      try {
        acceptPayload(JSON.parse(text));
      } catch {
        // Ignore non-JSON heartbeat or maintenance messages.
      }
    });
    socket.addEventListener("close", () => {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = 0;
      socket = null;
      scheduleReconnect();
    });
    socket.addEventListener("error", () => socket?.close());
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      connect();
    },
    stop() {
      stopped = true;
      clearTimers();
      socket?.close();
      socket = null;
      clearActiveEew();
      onStatus?.("stopped");
    },
    getLatest() {
      return latestEew;
    }
  };
}
