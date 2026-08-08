import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const [html, app, weatherMap, main, serviceWorker, headers, lightManifestSource, darkManifestSource] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8"),
  readFile(new URL("../src/main.js", import.meta.url), "utf8"),
  readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  readFile(new URL("../public/_headers", import.meta.url), "utf8"),
  readFile(new URL("../public/site.webmanifest", import.meta.url), "utf8"),
  readFile(new URL("../public/site-dark.webmanifest", import.meta.url), "utf8")
]);

const lightManifest = JSON.parse(lightManifestSource);
const darkManifest = JSON.parse(darkManifestSource);

assert.match(html, /<html lang="ja" class="app-initializing">/);
assert.match(html, /html\.app-initializing #app\s*{\s*visibility: hidden;/);
assert.match(html, /id="app-startup-loader"[^>]*role="status"/);

const appleTouchIcon = html.match(/<link rel="apple-touch-icon"[^>]*>/)?.[0] ?? "";
assert.match(appleTouchIcon, /href="%BASE_URL%icons\/icon-180\.png\?v=20260808-3"/);
assert.match(appleTouchIcon, /data-system-theme-install-icon/);
assert.match(appleTouchIcon, /data-light-icon="icon-180\.png\?v=20260808-3"/);
assert.match(appleTouchIcon, /data-dark-icon="icon-dark-180\.png\?v=20260808-3"/);
assert.match(html, /document\.querySelectorAll\('link\[rel="icon"\]\[data-theme-icon\]'/);
assert.match(html, /data-system-theme-manifest/);
assert.match(html, /data-dark-manifest="site-dark\.webmanifest\?v=20260808-3"/);
assert.match(html, /matchMedia\("\(prefers-color-scheme: dark\)"\)/);
assert.match(html, /systemTheme\.addEventListener\?\.\("change", syncSystemThemeInstallMetadata\)/);
assert.equal(lightManifest.id, darkManifest.id);
assert.equal(lightManifest.theme_color, "#eaf1f8");
assert.equal(darkManifest.theme_color, "#050914");
assert.deepEqual(lightManifest.icons.map(({ src }) => src), [
  "icons/icon-192.png",
  "icons/icon-512.png"
]);
assert.deepEqual(darkManifest.icons.map(({ src }) => src), [
  "icons/icon-dark-192.png",
  "icons/icon-dark-512.png",
  "icons/icon-maskable-dark-512.png"
]);
assert.ok(lightManifest.icons.every(({ purpose }) => purpose === "any maskable"));
assert.match(serviceWorker, /meteoscope-shell-v6/);
assert.match(serviceWorker, /site-dark\.webmanifest/);
assert.match(serviceWorker, /icon-dark-180/);
assert.match(serviceWorker, /icon-dark-512/);
assert.match(serviceWorker, /icon-maskable-dark-512/);
assert.match(html, /地図を読み込み中/);

const themeBootstrapScript = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1] ?? "";
const installIcon = {
  dataset: {
    lightIcon: "icon-180.png?v=20260808-3",
    darkIcon: "icon-dark-180.png?v=20260808-3"
  },
  href: ""
};
const themeManifest = {
  dataset: {
    lightManifest: "site.webmanifest?v=20260808-3",
    darkManifest: "site-dark.webmanifest?v=20260808-3"
  },
  href: ""
};
let systemDark = true;
let systemThemeChangeListener = null;
runInNewContext(themeBootstrapScript, {
  URL,
  localStorage: { getItem: () => "system" },
  matchMedia: (query) => ({
    get matches() {
      return query.includes("dark") ? systemDark : !systemDark;
    },
    addEventListener: (_type, listener) => {
      if (query.includes("dark")) systemThemeChangeListener = listener;
    }
  }),
  document: {
    baseURI: "https://meteoscope.example/",
    documentElement: { dataset: {} },
    querySelectorAll: () => [],
    querySelector: (selector) => selector.includes("apple-touch-icon") ? installIcon : themeManifest
  },
  MutationObserver: class {
    observe() {}
  }
});
assert.equal(installIcon.href, "https://meteoscope.example/icons/icon-dark-180.png?v=20260808-3");
assert.equal(themeManifest.href, "https://meteoscope.example/site-dark.webmanifest?v=20260808-3");
assert.equal(typeof systemThemeChangeListener, "function");
systemDark = false;
systemThemeChangeListener();
assert.equal(installIcon.href, "https://meteoscope.example/icons/icon-180.png?v=20260808-3");
assert.equal(themeManifest.href, "https://meteoscope.example/site.webmanifest?v=20260808-3");

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
