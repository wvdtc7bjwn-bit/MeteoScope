import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, app, weatherMap, dashboard, swiftMap] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8"),
  readFile(new URL("../ios/MeteoScope/Views/MapDashboardView.swift", import.meta.url), "utf8"),
  readFile(new URL("../ios/MeteoScope/Map/WeatherMapView.swift", import.meta.url), "utf8")
]);

assert.match(html, /<html lang="ja" class="app-initializing">/);
assert.match(html, /html\.app-initializing #app\s*{\s*visibility: hidden;/);
assert.match(html, /id="app-startup-loader"[^>]*role="status"/);
assert.match(html, /地図を読み込み中/);

assert.match(weatherMap, /function whenReady\(\)/);
assert.match(weatherMap, /map\.once\("idle", finishAfterPaint\)/);
assert.match(weatherMap, /requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)/);
assert.match(weatherMap, /return \{ initialize, whenReady,/);

assert.match(app, /const initialMapReady = weatherMap\.whenReady\(\)/);
assert.match(app, /void initialMapReady\.then\(\(\) => \{\s*finishInitialMapLoading\(\);\s*if \(!legalConsent\.showIfRequired\(\)\) startUserServices\(\);/);
assert.match(app, /classList\.remove\("app-initializing"\)/);
assert.match(app, /loader\.hidden = true/);

assert.match(dashboard, /@State private var isMapReady = false/);
assert.match(dashboard, /InitialMapLoadingView\(\)/);
assert.match(dashboard, /Text\("地図を読み込み中"\)/);
assert.match(dashboard, /\.opacity\(isMapReady \? 1 : 0\)/);
assert.match(swiftMap, /@Binding var isMapReady: Bool/);
assert.match(swiftMap, /func mapViewDidBecomeIdle\(_ mapView: MLNMapView\)/);
assert.match(swiftMap, /guard didLoadInitialStyle, !didReportInitialMapReady/);

console.log("Initial map loading gates: OK");
