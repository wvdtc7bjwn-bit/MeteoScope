import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  isPublicReadMethod,
  resolvePublicEarthquakeRoute
} from "../workers/earthquake-realtime/src/routePolicy.js";
import {
  buildJmaIntensityStationCoordinateLookup,
  findJmaIntensityStationCoordinate,
  isJmaIntensityStationCode,
  normalizeJmaIntensityStationCode,
  preserveJmaIntensityStationPoints,
  sanitizeJmaIntensityStationPoints
} from "../workers/earthquake-realtime/src/earthquakeStationPolicy.js";

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
  resolvePublicEarthquakeRoute(new URL("https://example.test/api/stream")),
  { internalPath: "/connect", cacheSeconds: 0, websocket: true }
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
assert.equal(isJmaIntensityStationCode("0320224"), true);
assert.equal(isJmaIntensityStationCode("17"), false);
assert.equal(isJmaIntensityStationCode("391"), false);
assert.equal(isJmaIntensityStationCode("cf-0"), false);
assert.equal(normalizeJmaIntensityStationCode(" 0320224 "), "0320224");

const arrayCoordinateLookup = buildJmaIntensityStationCoordinateLookup([
  { name: "石狩市花川", latitude: 43.17, longitude: 141.32 },
  { name: "札幌南区石山", latitude: 42.97, longitude: 141.33 }
]);
assert.equal(
  findJmaIntensityStationCoordinate(arrayCoordinateLookup, {
    code: "1",
    name: "石川県"
  }),
  null
);
assert.deepEqual(
  findJmaIntensityStationCoordinate(arrayCoordinateLookup, {
    code: "0120221",
    name: "札幌南区石山"
  }),
  { latitude: 42.97, longitude: 141.33 }
);

const dmdataParameterLookup = buildJmaIntensityStationCoordinateLookup([{
  code: "1720130",
  name: "金沢市西念",
  latitude: 36.5881,
  longitude: 136.6331,
  status: "廃止"
}, {
  code: "1720130",
  name: "金沢市西念",
  latitude: 36.5872,
  longitude: 136.6336,
  status: "現"
}]);
assert.deepEqual(
  findJmaIntensityStationCoordinate(dmdataParameterLookup, {
    code: "1720130",
    name: "金沢市西念"
  }),
  { latitude: 36.5872, longitude: 136.6336 }
);
assert.deepEqual(
  sanitizeJmaIntensityStationPoints({
    eventId: "20260716012301",
    points: [
      { code: "17", name: "石川県" },
      { code: "391", name: "石川県加賀" },
      { code: "1720130", name: "金沢市西念" }
    ]
  }).points,
  [{ code: "1720130", name: "金沢市西念" }]
);
assert.deepEqual(
  preserveJmaIntensityStationPoints(
    { eventId: "20260716012301", points: [{ code: "1721020", name: "白山市別宮町＊" }] },
    { eventId: "20260716012301", points: [], magnitude: "3.0" }
  ).points,
  [{ code: "1721020", name: "白山市別宮町＊" }]
);
assert.deepEqual(
  preserveJmaIntensityStationPoints(
    { eventId: "old", points: [{ code: "1721020" }] },
    { eventId: "new", points: [] }
  ).points,
  []
);

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

let forwardedUpgrade = "";
const streamResponse = await onRequest({
  request: new Request(
    "https://meteoscope.pages.dev/api/earthquakes/stream",
    { headers: { upgrade: "websocket" } }
  ),
  env: {
    EARTHQUAKE_REALTIME: {
      async fetch(request) {
        forwardedUpgrade = request.headers.get("upgrade") ?? "";
        return new Response(null, { status: 200 });
      }
    }
  }
});
assert.equal(streamResponse.status, 200);
assert.equal(forwardedUpgrade, "websocket");

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
assert.doesNotMatch(publicWorkerSource, /\/ingest|\/auth|\/discord/);
assert.match(publicWorkerSource, /x-eew-authenticated/u);

for (const relativePath of [
  "src/config.js",
  "ios/MeteoScope/Services/MeteoScopeEndpoints.swift"
]) {
  const source = await fs.readFile(path.join(root, relativePath), "utf8");
  assert.doesNotMatch(source, /rt\.eq-signal\.com/);
}

const dmdataOnlySources = await Promise.all([
  "src/config.js",
  "src/dmdata/earthquakes.js",
  "ios/MeteoScope/Services/MeteoScopeEndpoints.swift",
  "ios/MeteoScope/Services/WeatherAPIClient.swift"
].map(relativePath => fs.readFile(path.join(root, relativePath), "utf8")));

for (const source of dmdataOnlySources) {
  assert.doesNotMatch(source, /developer\/xml\/feed\/eqvol(?:_l)?\.xml/u);
}
assert.match(dmdataOnlySources[1], /latestPayload\?\.latest\?\.tsunami/u);
assert.match(dmdataOnlySources[3], /DMDataTsunamiBuilder\.build/u);

console.log("Earthquake Worker route tests passed.");
