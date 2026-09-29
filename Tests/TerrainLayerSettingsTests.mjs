import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, config, weatherMap, settingsModal, index, styles] = await Promise.all([
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/config.js", import.meta.url), "utf8"),
  readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/settingsModal.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/style.css", import.meta.url), "utf8")
]);

assert.match(config, /gsiReliefTiles: "https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/relief\/\{z\}\/\{x\}\/\{y\}\.png"/);
assert.match(config, /gsiHillshadeTiles: "https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/hillshademap\/\{z\}\/\{x\}\/\{y\}\.png"/);
assert.match(weatherMap, /function setTerrainLayer\(\{ visible, opacity \} = \{\}\)/);
assert.match(weatherMap, /function ensureTerrainLayers\(\)/);
assert.match(weatherMap, /map\.getLayer\(WARNING_OVERLAY_LAYER_ID\)[\s\S]*?WARNING_OVERLAY_LAYER_ID/);
assert.match(weatherMap, /tiles: \[MAP_DATA_ENDPOINTS\.gsiReliefTiles\]/);
assert.match(weatherMap, /tiles: \[MAP_DATA_ENDPOINTS\.gsiHillshadeTiles\]/);
assert.match(weatherMap, /minzoom: 5,[\s\S]*?maxzoom: 15/);
assert.match(weatherMap, /minzoom: 2,[\s\S]*?maxzoom: 16/);
assert.match(weatherMap, /map\.once\("idle", \(\) => \{[\s\S]*?syncTerrainLayer\(\);/);
assert.match(weatherMap, /return \{ initialize, whenReady, setMode, prepareWarningData, setTheme, setTerrainLayer,/);
assert.match(app, /const TERRAIN_LAYER_SETTINGS_STORAGE_KEY = "meteoscope-terrain-layer-settings-v1"/);
assert.match(app, /const TERRAIN_LAYER_SETTINGS_SESSION_KEY = "meteoscope-terrain-layer-settings-session-v1"/);
assert.match(app, /visible: false, opacity: 0\.48/);
assert.match(app, /weatherMap\.setTerrainLayer\(terrainLayerSettings\)/);
assert.match(app, /sessionStorage\.setItem\(TERRAIN_LAYER_SETTINGS_SESSION_KEY, serialized\)/);
assert.match(app, /initialMapReady\.then\(\(ready\) => \{[\s\S]*?weatherMap\?\.setTerrainLayer\(terrainLayerSettings\);/);
assert.match(app, /onTerrainLayerChange: setTerrainLayerSettings/);
assert.match(app, /function setupMapTerrainToggle\(\)/);
assert.match(settingsModal, /function renderSettingsTerrain\(\)/);
assert.match(index, /class="settings-group settings-terrain-group"/);
assert.match(index, /id="clock"[\s\S]*?id="map-terrain-toggle"/);
assert.doesNotMatch(index, /id="settings-terrain-toggle"/);
assert.match(index, /data-settings-terrain-opacity="0\.32"/);
assert.match(index, /data-settings-terrain-opacity="0\.48"/);
assert.match(index, /data-settings-terrain-opacity="0\.64"/);
assert.match(styles, /\.map-terrain-toggle\s*\{[\s\S]*?box-shadow:\s*none;/);
assert.match(styles, /html\[data-theme="light"\] \.map-terrain-toggle\s*\{[\s\S]*?background:\s*rgba\(247, 251, 255, 0\.88\);/);
assert.match(styles, /html\[data-theme="light"\] \.map-terrain-toggle\.is-enabled\s*\{[\s\S]*?background:\s*rgba\(20, 125, 191, 0\.94\);/);

console.log("Terrain layer settings: OK");
