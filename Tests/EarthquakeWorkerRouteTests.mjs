import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  isPublicReadMethod,
  resolvePublicEarthquakeRoute
} from "../workers/earthquake-realtime/src/routePolicy.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagesProxyUrl = pathToFileURL(
  path.join(root, "functions", "api", "earthquakes", "[[path]].js")
);
const { onRequest } = await import(pagesProxyUrl.href);

assert.deepEqual(
  resolvePublicEarthquakeRoute(new URL("https://example.test/api/latest")),
  { internalPath: "/latest", cacheSeconds: 0 }
);
assert.deepEqual(
  resolvePublicEarthquakeRoute(
    new URL("https://example.test/api/earthquakes/latest")
  ),
  { internalPath: "/latest", cacheSeconds: 0 }
);
assert.deepEqual(
  resolvePublicEarthquakeRoute(new URL("https://example.test/api/history?limit=11")),
  { internalPath: "/history?limit=11", cacheSeconds: 15 }
);
assert.equal(
  resolvePublicEarthquakeRoute(new URL("https://example.test/api/history?limit=101")).error,
  "invalid_limit"
);
assert.equal(
  resolvePublicEarthquakeRoute(new URL("https://example.test/api/history?limit=1.5")).error,
  "invalid_limit"
);
assert.equal(
  resolvePublicEarthquakeRoute(
    new URL("https://example.test/api/history/%2E%2E%2Fingest/stations")
  ).error,
  "invalid_event_id"
);
assert.deepEqual(
  resolvePublicEarthquakeRoute(
    new URL("https://example.test/api/history/20260715052500/stations")
  ),
  {
    internalPath: "/history/20260715052500/stations",
    cacheSeconds: 24 * 60 * 60
  }
);
assert.equal(isPublicReadMethod("GET"), true);
assert.equal(isPublicReadMethod("HEAD"), true);
assert.equal(isPublicReadMethod("POST"), false);

let forwardedUrl = "";
const proxyResponse = await onRequest({
  request: new Request(
    "https://meteoscope.pages.dev/api/earthquakes/history?limit=7"
  ),
  env: {
    EARTHQUAKE_REALTIME: {
      async fetch(request) {
        forwardedUrl = request.url;
        return Response.json({ enabled: true, items: [] });
      }
    }
  }
});
assert.equal(proxyResponse.status, 200);
assert.equal(forwardedUrl, "https://earthquake-worker.internal/api/history?limit=7");
assert.equal(proxyResponse.headers.get("access-control-allow-origin"), "*");

const unconfiguredResponse = await onRequest({
  request: new Request("https://meteoscope.pages.dev/api/earthquakes/health"),
  env: {}
});
assert.equal(unconfiguredResponse.status, 503);
assert.equal(
  (await unconfiguredResponse.json()).error,
  "earthquake_service_not_configured"
);

const disallowedMethodResponse = await onRequest({
  request: new Request("https://meteoscope.pages.dev/api/earthquakes/history", {
    method: "POST"
  }),
  env: {}
});
assert.equal(disallowedMethodResponse.status, 405);

const publicWorkerSource = await fs.readFile(
  path.join(root, "workers", "earthquake-realtime", "src", "index.js"),
  "utf8"
);
assert.doesNotMatch(publicWorkerSource, /\/ingest|\/connect|\/auth|\/discord/);

for (const relativePath of [
  "src/config.js",
  "ios/MeteoScope/Services/MeteoScopeEndpoints.swift"
]) {
  const source = await fs.readFile(path.join(root, relativePath), "utf8");
  assert.doesNotMatch(source, /rt\.eq-signal\.com/);
}

console.log("Earthquake Worker route tests passed.");
