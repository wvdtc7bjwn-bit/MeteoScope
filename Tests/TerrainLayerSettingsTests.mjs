import { readStylesheet } from "./helpers/readStylesheet.mjs";
import assert from "node:assert/strict";
import vm from "node:vm";
import { JAPAN_TERRAIN_BOUNDS, getGlobalTerrainPaint, getTerrainBoundaryPaint, terrainTileTemplate } from "../src/map/terrainTiles.js";
import { normalizeTerrainCoverage, normalizeTerrainLayerOpacity, normalizeTerrainLayerColorMode } from "../src/preferences/mapPreferences.js";
import { readFile } from "node:fs/promises";

const [storage, app, config, weatherMap, settingsModal, index, styles] = await Promise.all([
  readFile(new URL("../src/preferences/mapPreferences.js", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/config.js", import.meta.url), "utf8"),
  readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/settingsModal.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readStylesheet(new URL("../src/style.css", import.meta.url))
]);

assert.match(config, /gsiReliefTiles: "https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/relief\/\{z\}\/\{x\}\/\{y\}\.png"/);
assert.match(config, /gsiHillshadeTiles: "https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/hillshademap\/\{z\}\/\{x\}\/\{y\}\.png"/);
assert.match(weatherMap, /function setTerrainLayer\(\{ visible, opacity, colorMode, coverage = terrainCoverage \} = \{\}\)/);
assert.match(weatherMap, /function ensureTerrainLayers\(\)/);
assert.match(weatherMap, /map\.getLayer\(WARNING_OVERLAY_LAYER_ID\)[\s\S]*?WARNING_OVERLAY_LAYER_ID/);
assert.match(weatherMap, /tiles: \[terrainTileTemplate\("relief"\)\]/);
assert.match(weatherMap, /tiles: \[terrainTileTemplate\("hillshademap"\)\]/);
assert.match(weatherMap, /minzoom: 5,[\s\S]*?maxzoom: 15/);
assert.match(weatherMap, /minzoom: 2,[\s\S]*?maxzoom: 16/);
assert.match(weatherMap, /map\.once\("idle", \(\) => \{[\s\S]*?syncTerrainLayer\(\);/);
assert.match(weatherMap, /return \{ initialize, whenReady, setMode, prepareWarningData, setTheme, setTerrainLayer,/);
assert.match(storage, /const TERRAIN_LAYER_SETTINGS_STORAGE_KEY = "meteoscope-terrain-layer-settings-v1"/);
assert.match(storage, /const TERRAIN_LAYER_SETTINGS_SESSION_KEY = "meteoscope-terrain-layer-settings-session-v1"/);
assert.match(storage, /visible: false, opacity: 0\.48/);
assert.match(app, /weatherMap\.setTerrainLayer\(terrainLayerSettings\)/);
assert.match(storage, /sessionStorage\.setItem\(TERRAIN_LAYER_SETTINGS_SESSION_KEY, serialized\)/);
assert.match(app, /initialMapReady\.then\(\(ready\) => \{[\s\S]*?weatherMap\?\.setTerrainLayer\(terrainLayerSettings\);/);
assert.match(app, /onTerrainLayerChange: setTerrainLayerSettings/);
assert.match(app, /function setupMapTerrainToggle\(\)/);
assert.match(settingsModal, /function renderSettingsTerrain\(\)/);
assert.match(index, /class="settings-group settings-terrain-group"/);
assert.match(index, /id="map-layer-toggle-choices"[\s\S]*?id="map-terrain-toggle"/);
assert.equal((index.match(/data-map-terrain-toggle/g) ?? []).length, 4);
assert.match(app, /querySelectorAll\("\[data-map-terrain-toggle\]"\)/);
assert.doesNotMatch(index, /id="settings-terrain-toggle"/);
assert.match(index, /data-settings-terrain-opacity="0\.32"/);
assert.match(index, /data-settings-terrain-opacity="0\.48"/);
assert.match(index, /data-settings-terrain-opacity="0\.64"/);
assert.match(styles, /#map-layer-toggle .weather-distribution-toggle-choices/);
assert.match(styles, /html\[data-theme="light"\] #map-layer-toggle/);

// Exercise the actual renderer, including deferred style readiness and recreation.
const layers = new Map(), sources = new Map(), writes = [], insertions = [];
const pending = [];
let ready = true;
const map = {
  isStyleLoaded: () => ready,
  once: (event, callback) => pending.push(callback),
  getLayer: id => layers.get(id) ?? (id === "world-country-line" ? {id} : undefined), getSource: id => sources.get(id),
  addSource: (id, value) => sources.set(id, value),
  addLayer: (layer,before) => { layers.set(layer.id, layer); insertions.push({id:layer.id,before}); },
  setLayoutProperty: (id, key, value) => { layers.get(id).layout[key] = value; },
  setPaintProperty: (id, key, value) => { layers.get(id).paint[key] = value; writes.push({id,key,value}); }
};
const terrainMethods = weatherMap.slice(weatherMap.indexOf("  function setTerrainLayer("), weatherMap.indexOf("  function scheduleWorldGeometryLoad("));
const context = vm.createContext({
  map, normalizeTerrainCoverage, normalizeTerrainLayerColorMode, terrainTileTemplate, JAPAN_TERRAIN_BOUNDS, getGlobalTerrainPaint, getTerrainBoundaryPaint,
  MAP_THEME_COLORS:{dark:{municipalityLine:"original-line"}},
  activeTheme:"dark", VECTOR_BASE_MAP_ENABLED:false, baseMapSourceLayer:()=>({}), PREFECTURE_SOURCE_ID:"prefecture",
  MUNICIPALITY_SOURCE_ID:"municipality", MUNICIPALITY_LINE_LAYER_ID:"municipality-line",
  terrainTileLoader: {cancelPrefetch() {}}, MUNICIPALITY_FILL_LAYER_ID: "japan-fill", MUNICIPALITY_FIX_FILL_LAYER_ID:"japan-fix",
  normalizeTerrainOpacity: normalizeTerrainLayerOpacity,
  MAP_DATA_ENDPOINTS: {gsiReliefTiles:"relief",gsiHillshadeTiles:"hillshade"},
  GSI_RELIEF_SOURCE_ID:"relief-source", GSI_HILLSHADE_SOURCE_ID:"hillshade-source",
  GSI_RELIEF_OVERVIEW_SOURCE_ID:"overview-source", GSI_RELIEF_OVERVIEW_LAYER_ID:"overview",
  GSI_RELIEF_LAYER_ID:"relief", GSI_HILLSHADE_LAYER_ID:"hillshade",
  GSI_EARTH_HILLSHADE_SOURCE_ID:"global-source", GSI_EARTH_HILLSHADE_LAYER_ID:"global",
  WARNING_OVERLAY_LAYER_ID:"warning", RELIEF_LAYER_IDS:["relief","overview"], TERRAIN_LAYER_IDS:["relief","overview","hillshade","global"]
});
vm.runInContext(`let terrainLayerVisible = false, terrainLayerOpacity = 0.48, terrainLayerColorMode = "color", terrainCoverage = "auto", terrainSyncPending = false;${terrainMethods}`,context);
const setTerrain = settings => context.setTerrainLayer(settings);
setTerrain({visible:false,opacity:0.48,colorMode:"grayscale"});
assert.equal(sources.size,0,"choosing a color while disabled does not download terrain");
setTerrain({visible:true,opacity:0.48,colorMode:"grayscale"});
assert.equal(layers.get("relief").paint["raster-saturation"],-1);
assert.equal(sources.size,4);
assert.equal(sources.get("global-source").maxzoom,8,"global terrain never requests unavailable detail zooms");
assert.equal(layers.get("global").paint["raster-brightness-min"],0.5);
assert.equal(layers.get("global").paint["raster-brightness-max"],0.7);
assert.equal(insertions.find(item=>item.id==="global").before,"world-country-line","global shade stays below country borders and Japan's opaque fills");
assert.deepEqual(sources.get("relief-source").bounds,JAPAN_TERRAIN_BOUNDS,"Japan retains its existing data within the original overview coverage");
assert.equal(sources.get("overview-source").minzoom,5,"overview requests existing native tiles only");
assert.equal(sources.get("overview-source").maxzoom,5);
assert.equal(sources.get("overview-source").tileSize,128);
assert.equal(layers.get("overview").maxzoom,layers.get("relief").minzoom,"LOD ranges meet without double painting");
assert.equal(layers.get("overview").paint["raster-saturation"],-1);
setTerrain({visible:true,opacity:0.64,colorMode:"color"});
assert.equal(layers.get("relief").paint["raster-saturation"],-0.08);
assert.equal(layers.get("relief").paint["raster-opacity"],0.64);
assert.equal(layers.get("global").paint["raster-opacity"],getGlobalTerrainPaint(0.64)["raster-opacity"],"global density follows the combined Japanese terrain opacity");
assert.equal(sources.size,4,"switching colors reuses the same tiles");
layers.set("japan-prefecture-line",{paint:{}});
layers.set("japan-fill",{paint:{}}); layers.set("japan-fix",{paint:{}});
setTerrain({visible:true,opacity:0.48,colorMode:"grayscale",coverage:"global"});
assert.equal(layers.get("relief").layout.visibility,"none");
assert.equal(layers.get("hillshade").layout.visibility,"none");
assert.equal(layers.get("global").layout.visibility,"visible");
assert.equal(layers.get("japan-fill").paint["fill-opacity"],0,"global terrain is visible inside Japan too");
setTerrain({visible:true,opacity:0.48,colorMode:"grayscale",coverage:"japan"});
assert.equal(layers.get("global").layout.visibility,"none");
assert.equal(layers.get("relief").layout.visibility,"visible");
assert.equal(layers.get("japan-fill").paint["fill-opacity"],1,"Japan mode restores the original opaque basemap");
assert.equal(layers.get("japan-prefecture-line").paint["line-color"],"#303c49");
assert.equal(layers.get("japan-prefecture-line").paint["line-width"].at(-1),1.4,"terrain coast and prefecture outlines are thin and defined");
setTerrain({visible:true,opacity:0.48,colorMode:"grayscale",coverage:"auto"});
ready=false;
setTerrain({visible:true,opacity:0.32,colorMode:"color"});
setTerrain({visible:true,opacity:0.32,colorMode:"grayscale"});
assert.equal(pending.length,1,"style readiness is coalesced");
ready=true; pending.pop()();
assert.equal(layers.get("relief").paint["raster-saturation"],-1);
layers.clear(); sources.clear(); context.syncTerrainLayer();
assert.equal(layers.get("relief").paint["raster-saturation"],-1,"recreated layers retain grayscale");
setTerrain({visible:false,opacity:0.32,colorMode:"grayscale"});
assert.equal(layers.get("relief").layout.visibility,"none");
assert.equal(layers.get("overview").layout.visibility,"none");
assert.equal(layers.get("global").layout.visibility,"none");
assert(writes.every(write => ["relief","overview","hillshade","global","japan-prefecture-line","japan-fill","japan-fix"].includes(write.id)),"operational overlays keep their colors");

// App updates must merge settings: existing ON/OFF controls omit colorMode.
const saved = [], rendered = [];
const appContext = vm.createContext({
  normalizeTerrainCoverage, normalizeTerrainLayerOpacity, normalizeTerrainLayerColorMode,
  saveTerrainLayerSettings: settings => saved.push(settings),
  weatherMap: {setTerrainLayer: settings => rendered.push(settings)},
  renderMapTerrainToggle() {}, refreshSettingsModalView() {}
});
const updateSettings = app.slice(app.indexOf("  function setTerrainLayerSettings("),app.indexOf("  function setupMapTerrainToggle("));
vm.runInContext(`let terrainLayerSettings = {visible:true,opacity:0.48,colorMode:"color"};${updateSettings}`,appContext);
appContext.setTerrainLayerSettings({visible:true,colorMode:"grayscale"});
appContext.setTerrainLayerSettings({visible:false,opacity:0.48});
assert.equal(saved.at(-1).colorMode,"grayscale");
appContext.setTerrainLayerSettings({visible:true,opacity:0.64});
assert.equal(rendered.at(-1).colorMode,"grayscale");
assert.equal(rendered.at(-1).opacity,0.64);
console.log("Terrain settings: persistence, color switching, lazy layers, style recovery and preserved overlays OK");
