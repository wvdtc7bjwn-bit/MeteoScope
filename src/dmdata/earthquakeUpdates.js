import { DMDATA_ENDPOINTS } from "../config.js";

const REFRESH_EVENT_TYPES = new Set(["snapshot", "earthquake", "tsunami"]);
const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 30000;

export function parseDmdataEarthquakeUpdate(message) {
  try {
    const envelope = JSON.parse(String(message ?? ""));
    const type = String(envelope?.type ?? "");
    if (!REFRESH_EVENT_TYPES.has(type)) return null;
    return {
      type,
      token: String(envelope?.timestamp ?? Date.now())
    };
  } catch {
    return null;
  }
}

export function toDmdataWebSocketUrl(endpoint = DMDATA_ENDPOINTS.earthquakeStream) {
  const baseUrl = globalThis.location?.href ?? "https://meteoscope.pages.dev/";
  const url = new URL(endpoint, baseUrl);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  return url.toString();
}

export function startDmdataEarthquakeUpdates({
  onUpdate,
  onConnectionChange,
  WebSocketClass = globalThis.WebSocket
} = {}) {
  if (typeof onUpdate !== "function" || typeof WebSocketClass !== "function") {
    return () => {};
  }

  let socket = null;
  let reconnectTimer = null;
  let stopped = false;
  let retryMs = INITIAL_RETRY_MS;
  let connected = false;

  const setConnected = (nextConnected) => {
    const normalized = Boolean(nextConnected);
    if (connected === normalized) return;
    connected = normalized;
    if (typeof onConnectionChange === "function") onConnectionChange(connected);
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer !== null) return;
    reconnectTimer = globalThis.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, retryMs);
    retryMs = Math.min(MAX_RETRY_MS, retryMs * 2);
  };

  const connect = () => {
    if (stopped || socket) return;
    try {
      const nextSocket = new WebSocketClass(toDmdataWebSocketUrl());
      socket = nextSocket;
      nextSocket.addEventListener("open", () => {
        retryMs = INITIAL_RETRY_MS;
        setConnected(true);
      });
      nextSocket.addEventListener("message", (event) => {
        const update = parseDmdataEarthquakeUpdate(event.data);
        if (update) onUpdate(update);
      });
      nextSocket.addEventListener("close", () => {
        if (socket === nextSocket) socket = null;
        setConnected(false);
        scheduleReconnect();
      });
      nextSocket.addEventListener("error", () => {
        nextSocket.close();
      });
    } catch {
      socket = null;
      setConnected(false);
      scheduleReconnect();
    }
  };

  connect();
  return () => {
    stopped = true;
    if (reconnectTimer !== null) globalThis.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    const activeSocket = socket;
    socket = null;
    setConnected(false);
    activeSocket?.close();
  };
}
