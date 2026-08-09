import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, app, weatherMap, main, serviceWorker, headers, manifestSource] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8"),
  readFile(new URL("../src/main.js", import.meta.url), "utf8"),
  readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  readFile(new URL("../public/_headers", import.meta.url), "utf8"),
  readFile(new URL("../public/site.webmanifest", import.meta.url), "utf8")
]);

const manifest = JSON.parse(manifestSource);

assert.match(html, /<html lang="ja" class="app-initializing">/);
assert.match(html, /html\.app-initializing #app\s*{\s*visibility: hidden;/);
assert.match(html, /id="app-startup-loader"[^>]*role="status"/);

const appleTouchIcon = html.match(/<link rel="apple-touch-icon"[^>]*>/)?.[0] ?? "";
assert.match(appleTouchIcon, /href="%BASE_URL%icons\/icon-180\.png\?v=20260808-4"/);
assert.doesNotMatch(appleTouchIcon, /data-(?:system-theme|light|dark)-/);
assert.match(html, /href="%BASE_URL%site\.webmanifest\?v=20260808-4"/);
assert.doesNotMatch(html, /site-dark\.webmanifest/);
assert.doesNotMatch(html, /icon-dark-/);
assert.equal(manifest.theme_color, "#eaf1f8");
assert.deepEqual(manifest.icons.map(({ src }) => src), [
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png"
]);
assert.deepEqual(manifest.icons.map(({ purpose }) => purpose), ["any", "any", "maskable"]);
assert.match(serviceWorker, /meteoscope-shell-v\d+/);
assert.doesNotMatch(serviceWorker, /site-dark\.webmanifest/);
assert.doesNotMatch(serviceWorker, /icon-dark-/);
assert.match(html, /地図を読み込み中/);

assert.match(weatherMap, /function whenReady\(\)/);
assert.doesNotMatch(weatherMap, /map\.once\("render", finishAfterPaint\)/);
assert.match(weatherMap, /map\.once\("load", finishReady\)/);
assert.match(weatherMap, /map\.once\("idle", finishReady\)/);
assert.match(weatherMap, /finishAfterPaint\(Boolean\(map\.loaded\(\) \|\| map\.isStyleLoaded\?\.\(\)\)\)/);
assert.match(weatherMap, /\}, 8000\)/);
assert.match(weatherMap, /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => resolve\(true\)\)\)/);
assert.match(weatherMap, /return \{ initialize, whenReady,/);
assert.match(weatherMap, /const INITIAL_GEOMETRY_LAYER_IDS = \[/);
assert.match(weatherMap, /map\.on\("load", \(\) => \{\s*revealInitialGeometryLayers\(map\);/);
assert.match(weatherMap, /function revealInitialGeometryLayers\(map\)/);
assert.match(weatherMap, /map\.setLayoutProperty\(layerId, "visibility", "visible"\)/);
assert.match(weatherMap, /if \(!map\.isStyleLoaded\?\.\(\)\) \{[\s\S]*?map\.once\("idle", \(\) => \{[\s\S]*?setMode\(activeMode\);/);

assert.match(app, /const initialMapReady = weatherMap\.whenReady\(\)/);
assert.match(app, /void initialMapReady\.then\(\(ready\) => \{\s*if \(!ready\) \{\s*showInitialMapLoadingError\(\);\s*return;\s*\}\s*finishInitialMapLoading\(\);\s*if \(!legalConsent\.showIfRequired\(\)\) startUserServices\(\);/);
assert.match(app, /classList\.remove\("app-initializing"\)/);
assert.match(app, /loader\.hidden = true/);
assert.match(app, /function showInitialMapLoadingError\(\)/);
assert.match(app, /function startLocationWatchOnLaunch\(\)/);
assert.match(app, /void startLocationWatchOnLaunch\(\)/);

assert.match(weatherMap, /import\("\.\/data\/worldLandGeoJson\.js"\)/);
assert.match(weatherMap, /import\("\.\/data\/worldCountriesGeoJson\.js"\)/);
assert.doesNotMatch(weatherMap, /\bglyphs\s*:/);
assert.match(weatherMap, /localIdeographFontFamily:/);
assert.match(weatherMap, /data: JMA_ENDPOINTS\.warningMunicipalitiesMap/);
assert.match(weatherMap, /data: JMA_ENDPOINTS\.prefecturesMap/);

assert.match(main, /navigator\.serviceWorker\.register\("\/sw\.js"\)/);
assert.match(serviceWorker, /request\.mode === "navigate"[\s\S]*?url\.pathname === "\/" \|\| url\.pathname === "\/index\.html"/);
assert.match(serviceWorker, /url\.pathname\.startsWith\("\/assets\/"\)/);
assert.match(headers, /Content-Security-Policy:/);
assert.match(headers, /\/data\/\*[\s\S]*?max-age=0, must-revalidate/);

console.log("Initial map loading gates: OK");
