const MAX_DIAGNOSTIC_EVENTS = 120;

const diagnostics = {
  startedAt: new Date().toISOString(),
  events: [],
  requests: {},
  longTasks: []
};

export function setupRuntimeDiagnostics() {
  if (typeof window === "undefined" || window.__METEOSCOPE_DIAGNOSTICS__) return diagnostics;
  Object.defineProperty(window, "__METEOSCOPE_DIAGNOSTICS__", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: diagnostics
  });

  window.addEventListener("error", (event) => {
    recordDiagnostic("javascript-error", {
      message: event.message,
      source: stripUrlDetails(event.filename),
      line: event.lineno,
      column: event.colno
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    recordDiagnostic("unhandled-rejection", {
      message: event.reason?.message ?? String(event.reason ?? "Unknown rejection")
    });
  });

  if ("PerformanceObserver" in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          const item = {
            at: Math.round(entry.startTime),
            duration: Math.round(entry.duration)
          };
          diagnostics.longTasks.push(item);
          diagnostics.longTasks.splice(0, Math.max(0, diagnostics.longTasks.length - 30));
        });
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {
      // Long Task API is not available in every browser.
    }
  }

  return diagnostics;
}

export function recordDiagnostic(type, details = {}) {
  const event = {
    type: String(type || "event"),
    at: new Date().toISOString(),
    details: sanitizeDetails(details)
  };
  diagnostics.events.push(event);
  diagnostics.events.splice(0, Math.max(0, diagnostics.events.length - MAX_DIAGNOSTIC_EVENTS));
  return event;
}

export function recordRequestHealth(url, outcome) {
  const source = getSourceName(url);
  const previous = diagnostics.requests[source] ?? {
    successes: 0,
    failures: 0,
    staleFallbacks: 0,
    lastDurationMs: 0,
    lastStatus: "idle",
    updatedAt: ""
  };
  const next = {
    ...previous,
    successes: previous.successes + Number(outcome.ok === true),
    failures: previous.failures + Number(outcome.ok === false),
    staleFallbacks: previous.staleFallbacks + Number(outcome.stale === true),
    lastDurationMs: Math.max(0, Math.round(Number(outcome.durationMs) || 0)),
    lastStatus: outcome.stale ? "stale" : (outcome.ok ? "ok" : "error"),
    updatedAt: new Date().toISOString()
  };
  diagnostics.requests[source] = next;
  return next;
}

function sanitizeDetails(details) {
  return Object.fromEntries(Object.entries(details ?? {})
    .filter(([key]) => !/coordinates?|latitude|longitude|position|endpoint/iu.test(key))
    .map(([key, value]) => [key, sanitizeValue(value)]));
}

function sanitizeValue(value) {
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 12).map(sanitizeValue);
  if (typeof value === "object") return sanitizeDetails(value);
  return String(value).slice(0, 240);
}

function stripUrlDetails(value) {
  try {
    const url = new URL(value, window.location.origin);
    return `${url.origin}${url.pathname}`;
  } catch {
    return String(value ?? "").split(/[?#]/u)[0].slice(0, 240);
  }
}

function getSourceName(value) {
  try {
    const url = new URL(value, typeof window === "undefined" ? "https://local.invalid" : window.location.origin);
    return url.origin === "https://local.invalid" ? "same-origin" : url.hostname;
  } catch {
    return "unknown";
  }
}
