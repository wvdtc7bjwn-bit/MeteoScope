import { recordDiagnostic, recordRequestHealth } from "../runtimeDiagnostics.js";

const DEFAULT_REQUEST_TTL_MS = 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10 * 1000;
const DEFAULT_RETRY_COUNT = 1;
const requestCache = new Map();
const inFlightRequests = new Map();

export async function fetchJson(url, options = {}) {
  return fetchCached(url, {
    ...options,
    accept: "application/json,text/plain,*/*",
    parse: (response) => response.json()
  });
}

export async function fetchText(url, options = {}) {
  return fetchCached(url, {
    ...options,
    accept: "text/plain,*/*",
    parse: (response) => response.text()
  });
}

export async function fetchArrayBuffer(url, options = {}) {
  return fetchCached(url, {
    ...options,
    accept: options.accept ?? "application/octet-stream,*/*",
    parse: (response) => response.arrayBuffer()
  });
}

async function fetchCached(url, options) {
  const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : DEFAULT_REQUEST_TTL_MS;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_REQUEST_TIMEOUT_MS;
  const retryCount = Number.isInteger(options.retryCount) ? Math.max(0, options.retryCount) : DEFAULT_RETRY_COUNT;
  const cacheKey = `${options.accept}:${url}`;
  const now = Date.now();
  const cached = requestCache.get(cacheKey);
  if (ttlMs > 0 && cached && cached.expiresAt > now) return cached.value;

  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) return inFlight;

  const startedAt = performance.now();
  const request = fetchWithRetry(url, {
    accept: options.accept,
    cache: options.cache ?? "default",
    parse: options.parse,
    validate: options.validate,
    retryCount,
    timeoutMs
  })
    .then((value) => {
      if (ttlMs > 0) {
        requestCache.set(cacheKey, {
          value,
          expiresAt: Date.now() + ttlMs,
          storedAt: Date.now()
        });
      }
      recordRequestHealth(url, { ok: true, durationMs: performance.now() - startedAt });
      emitDataEvent("meteoscope-data-recovered", { source: getRequestSource(url) });
      return value;
    })
    .catch((error) => {
      const canUseStale = options.staleIfError !== false && cached?.value !== undefined;
      recordRequestHealth(url, {
        ok: false,
        stale: canUseStale,
        durationMs: performance.now() - startedAt
      });
      if (canUseStale) {
        recordDiagnostic("request-stale-fallback", {
          source: getRequestSource(url),
          ageMs: Date.now() - Number(cached.storedAt ?? 0)
        });
        emitDataEvent("meteoscope-data-stale", {
          source: getRequestSource(url),
          ageMs: Date.now() - Number(cached.storedAt ?? 0)
        });
        return cached.value;
      }
      throw error;
    })
    .finally(() => {
      inFlightRequests.delete(cacheKey);
    });

  inFlightRequests.set(cacheKey, request);
  return request;
}

async function fetchWithRetry(url, { accept, cache, parse, validate, retryCount, timeoutMs }) {
  let lastError;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
    try {
      const response = await fetch(url, {
        cache,
        signal: controller.signal,
        headers: { "Accept": accept }
      });
      if (!response.ok) {
        const error = new Error(`JMA request failed: ${response.status} ${response.statusText}`);
        error.status = response.status;
        throw error;
      }
      let value;
      try {
        value = await parse(response);
      } catch (error) {
        const contentType = response.headers.get("content-type") || "unknown content type";
        throw new Error(`JMA response parse failed: ${url} (${contentType})`, { cause: error });
      }
      if (typeof validate === "function" && !validate(value)) {
        throw new TypeError(`JMA response validation failed: ${url}`);
      }
      return value;
    } catch (error) {
      lastError = error;
      const retryable = attempt < retryCount && isRetryableRequestError(error);
      if (!retryable) throw error;
      await wait(180 + Math.round(Math.random() * 220));
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw lastError;
}

function isRetryableRequestError(error) {
  const status = Number(error?.status);
  if (status) return status === 408 || status === 429 || status >= 500;
  return error?.name === "AbortError"
    || error?.name === "TimeoutError"
    || error instanceof TypeError;
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function getRequestSource(value) {
  try {
    return new URL(value, globalThis.location?.origin ?? "https://local.invalid").hostname;
  } catch {
    return "unknown";
  }
}

function emitDataEvent(type, detail) {
  const browserWindow = globalThis.window;
  if (typeof browserWindow?.dispatchEvent !== "function" || typeof globalThis.CustomEvent !== "function") return;
  browserWindow.dispatchEvent(new CustomEvent(type, { detail }));
}

export function parseJmaTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Tokyo"
  }).format(date);
}
