import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { yieldAfterPaint } from "../src/scheduling.js";

const keys = ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout", "document"];
const originals = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
try {
  let nextId = 1;
  const frames = new Map();
  const timers = new Map();
  globalThis.requestAnimationFrame = (callback) => { const id = nextId++; frames.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  globalThis.setTimeout = (callback, delay) => { const id = nextId++; timers.set(id, { callback, delay }); return id; };
  globalThis.clearTimeout = (id) => timers.delete(id);
  Object.defineProperty(globalThis, "document", { configurable: true, value: { hidden: false } });
  const runTimer = (delay) => {
    const [id, timer] = [...timers].find(([, value]) => value.delay === delay);
    timers.delete(id);
    timer.callback();
  };
  let resolved = false;
  const work = yieldAfterPaint().then(() => { resolved = true; });
  assert.equal(resolved, false);
  [...frames.values()][0]();
  await Promise.resolve();
  assert.equal(resolved, false, "heavy work must not run inside the paint callback");
  runTimer(0);
  await work;
  assert.equal(frames.size + timers.size, 0);

  const stalled = yieldAfterPaint();
  runTimer(100);
  await stalled;
  assert.equal(frames.size + timers.size, 0, "suspended rAF must release timers");
  globalThis.document.hidden = true;
  const hidden = yieldAfterPaint();
  assert.equal(frames.size, 0);
  runTimer(0);
  await hidden;
} finally {
  keys.forEach((key, index) => {
    if (originals[index]) Object.defineProperty(globalThis, key, originals[index]);
    else delete globalThis[key];
  });
}

// Execute the actual navigation prelude, including its generation guard.
const source = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const start = source.indexOf("  async function selectTab(tabId) {");
const end = source.indexOf("    const cachedData =", start);
const pending = [];
const modes = [];
const noop = () => {};
const context = vm.createContext({
  performance, console, TABS: [{ id: "radar" }, { id: "earthquake" }, { id: "amedas" }],
  activeTab: "radar", tabAutoFocusGeneration: 0, activeLoadRequestId: 0,
  warningDetailsRequest: null, communityReportsVisible: false,
  earthquakeArchiveAreaDrawing: true,
  cancelEarthquakeArchiveAreaDrawing: () => { context.earthquakeArchiveAreaDrawing = false; },
  yieldAfterPaint: () => new Promise((resolve) => pending.push(resolve)),
  weatherMap: { setMode: (mode) => modes.push(mode), setCommunityReportsVisible: noop },
  tabControls: { setActiveButton: noop },
  isRainRadarActive: () => false,
  ...Object.fromEntries(["syncTyphoonRadarOverlayButton", "renderCommunityReportLayerToggle",
    "syncEarlyWarningRefreshTimer", "invalidateScheduledMapRender", "invalidateScheduledPanelRender",
    "syncActiveTabToUrl", "stopRadarPlayback", "stopLightningPlayback", "stopWeatherChartPlayback",
    "stopWeatherDistributionPlayback", "refreshCommunityReports"].map((key) => [key, noop]))
});
vm.runInContext(`${source.slice(start, end)} return requestId; }`, context);
const first = context.selectTab("earthquake");
assert.equal(context.earthquakeArchiveAreaDrawing, false, "tab changes cancel the active history drawing");
const second = context.selectTab("amedas");
assert.deepEqual(modes, [], "map preparation must yield before running");
pending.shift()();
await first;
assert.deepEqual(modes, [], "superseded navigation must not prepare its map");
pending.shift()();
await second;
assert.deepEqual(modes, ["amedas"]);
assert.match(source, /function updateCurrentView\(tab, data, options = \{\}\) \{[\s\S]*?if \(!tab \|\| tab.id !== activeTab\) return;/);
console.log("Tab responsiveness tests passed");

// Run real map scheduling with a controlled paint boundary. A rapid tab change
// or a newer report must invalidate the deferred earthquake render.
const frames2 = [];
const paints2 = [];
const renders2 = [];
const ctx2 = vm.createContext({
  mapRenderGeneration: 0, scheduledMapRenderFrame: 0, activeTab: "earthquake",
  window: { requestAnimationFrame: cb => { frames2.push(cb); return frames2.length; }, cancelAnimationFrame: () => {} },
  yieldAfterPaint: () => new Promise(resolve => paints2.push(resolve)),
  weatherMap: { renderData: (tab, data) => renders2.push([tab, data]) }
});
const mapStart = source.indexOf("  function scheduleMapRender(tabId, displayData) {");
const mapEnd = source.indexOf("  function invalidateScheduledPanelRender()", mapStart);
vm.runInContext(source.slice(mapStart, mapEnd), ctx2);
ctx2.scheduleMapRender("earthquake", "old");
const oldRender = frames2.shift()();
assert.equal(renders2.length, 0, "summary gets a paint before map work");
ctx2.scheduleMapRender("earthquake", "new");
paints2.shift()(); await oldRender;
assert.equal(renders2.length, 0, "older report cannot overwrite new data");
const newRender = frames2.shift()();
paints2.shift()(); await newRender;
assert.deepEqual(renders2, [["earthquake", "new"]]);
ctx2.scheduleMapRender("earthquake", "abandoned");
const abandoned = frames2.shift()();
ctx2.activeTab = "radar";
paints2.shift()(); await abandoned;
assert.equal(renders2.length, 1, "leaving the tab cancels pending earthquake map work");
ctx2.scheduleMapRender("radar", "radar");
await frames2.shift()();
assert.deepEqual(renders2.at(-1), ["radar", "radar"]);

const mapSource = readFileSync(new URL("../src/map/weatherMap.js", import.meta.url), "utf8");
const anchorStart = mapSource.indexOf("const earthquakeAreaAnchorCache =");
const anchorEnd = mapSource.indexOf("function getStationIntensityKey", anchorStart);
const anchorCtx = vm.createContext({});
vm.runInContext(mapSource.slice(anchorStart, anchorEnd), anchorCtx);
let scans = 0;
const geometry = { type: "Polygon", get coordinates() { scans++; return [[[0,0],[2,0],[2,2],[0,2],[0,0]]]; } };
const anchor = anchorCtx.getEarthquakeAreaIntensityAnchor(geometry);
assert.equal(JSON.stringify(anchor.coordinates), "[1,1]");
assert.equal(anchorCtx.getEarthquakeAreaIntensityAnchor(geometry), anchor);
assert.equal(scans, 1, "unchanged area geometry must be scanned only once");
assert.equal(anchorCtx.getEarthquakeAreaIntensityAnchor(null), null);
assert.equal(anchorCtx.getEarthquakeAreaIntensityAnchor({type:"Polygon",coordinates:[]}), null);
assert.notEqual(anchorCtx.getEarthquakeAreaIntensityAnchor({type:"Polygon",coordinates:geometry.coordinates}), anchor,
  "replacement geometry must get a fresh calculation");
console.log("Earthquake paint ordering and geometry cache tests passed");

// Returning from overlays must retain the worker's earthquake source. Updates,
// selections and AMeDAS still replace it; EEW visibility remains independent.
let generated = 0, transferred = 0, shapesTransferred = 0;
const sampleSource = { setData() { transferred++; } };
const shapeSource = { setData() { shapesTransferred++; } };
const sourceCache = new WeakMap();
const visibility = [];
const renderCtx = vm.createContext({
  map: { getSource: id => id === "shapes" ? shapeSource : sampleSource, getLayer: () => true, setLayoutProperty: (...args) => visibility.push(args) },
  EARTHQUAKE_SHAPE_SOURCE_ID: 'shapes', EARTHQUAKE_SHAPE_LAYERS: new Set(['sample-fill']),
  SAMPLE_SOURCE_ID: 'samples', SAMPLE_LAYERS: ['sample-fill'],
  HYPOCENTER_AREA_FILL_LAYER_ID: 'area-fill', HYPOCENTER_AREA_LINE_LAYER_ID: 'area-line',
  EMPTY_GEOJSON: { type: 'FeatureCollection', features: [] },
  hypocenterAreaPolygon: [],
  setHypocenterAreaSelection: polygon => { renderCtx.hypocenterAreaPolygon = polygon; },
  activeEews: [], activeMode: 'earthquake', sampleDataMode: null, recentEarthquakeCollectionCache: null,
  lastRenderedMode: null, lastRenderedData: null, buildEarthquakePopup: event => event.id,
  getEarthquakeMapView: data => data.earthquakeMapView ?? 'recent',
  createSampleFeatureCollection: () => { generated++; return { type: 'FeatureCollection', features: [] }; },
  setGeoJsonSourceData: (target, data) => { if (sourceCache.get(target) !== data) { target.setData(data); sourceCache.set(target, data); } },
  ...Object.fromEntries(['hideMapInfo','syncTsunamiBlink','updateHypocenter3D','updateTyphoonLayers',
    'updateWarningAreaLookup','updateRadarLayer','updateWeatherDistributionLayer','updateLightningLayer',
    'updateLightningObservationLayer','updateWeatherChartSatelliteLayer','updateWeatherChartLayer',
    'setRadarOverlayZoomLimit','updateKikikuruLayer','updateEstimatedIntensityLayer','updateRiverFloodLayer',
    'updateWarningMunicipalityPaint'].map(key => [key, noop]))
});
const splitStart = mapSource.indexOf("const earthquakeCollectionPartsCache =");
const splitEnd = mapSource.indexOf("\nconst ", mapSource.indexOf("function splitEarthquakeCollection", splitStart));
vm.runInContext(mapSource.slice(splitStart, splitEnd), renderCtx);
vm.runInContext(mapSource.slice(mapSource.indexOf('  function renderData(mode, data) {'), mapSource.indexOf('  function syncTsunamiBlink(')), renderCtx);
vm.runInContext(mapSource.slice(mapSource.indexOf('  function syncSampleVisibility() {'), mapSource.indexOf('  function syncEewVisibility() {')), renderCtx);
const event = { id: '1' }, recent = { selectedEarthquake: event };
renderCtx.renderData('earthquake', recent);
for (const mode of ['radar', 'typhoon', 'warnings']) {
  renderCtx.activeMode = mode; renderCtx.renderData(mode, {});
  assert.equal(visibility.at(-1)[2], 'none');
  renderCtx.activeMode = 'earthquake'; renderCtx.renderData('earthquake', { ...recent });
  assert.equal(visibility.at(-1)[2], 'visible');
}
assert.equal(generated, 1); assert.equal(transferred, 1);
renderCtx.renderData('earthquake', { selectedEarthquake: { id: '2' } });
assert.equal(transferred, 2, 'new event must update source');
renderCtx.activeEews = [{}]; renderCtx.syncSampleVisibility();
assert.equal(visibility.at(-1)[2], 'none', 'EEW must still suppress observed intensity');
renderCtx.activeEews = [];
renderCtx.activeMode = 'amedas'; renderCtx.renderData('amedas', {});
renderCtx.activeMode = 'earthquake'; renderCtx.renderData('earthquake', recent);
assert.equal(transferred, 4, 'AMeDAS source must be replaced when returning');
assert.equal(shapesTransferred, 3);
renderCtx.activeMode = 'amedas'; renderCtx.renderData('amedas', {});
renderCtx.activeMode = 'earthquake'; renderCtx.renderData('earthquake', recent);
assert.equal(shapesTransferred, 3, 'AMeDAS must not clear or resend earthquake polygons');
console.log('Earthquake source retention and invalidation tests passed');

const partsCtx = vm.createContext({});
const partsStart = mapSource.indexOf("const earthquakeCollectionPartsCache =");
const partsEnd = mapSource.indexOf("\nconst ", mapSource.indexOf("function splitEarthquakeCollection", partsStart));
vm.runInContext(mapSource.slice(partsStart, partsEnd), partsCtx);
const mixed = {type:"FeatureCollection",features:[{geometry:{type:"Point"}},{geometry:{type:"Polygon"}},{geometry:{type:"LineString"}}]};
const parts = partsCtx.splitEarthquakeCollection(mixed);
assert.equal(parts.points.features.length,1);
assert.equal(parts.shapes.features.length,2);
assert.equal(partsCtx.splitEarthquakeCollection(mixed),parts);
console.log("Earthquake shape and point separation tests passed");

// Returning after XML's refresh interval: focus owns the transition, while
// ordinary reconciliation waits. Explicit refreshes and realtime are separate.
let settleFocus;
let refreshCalls = 0;
const refreshCtx = vm.createContext({
  tabAutoFocusSettled: new Promise(resolve => { settleFocus = resolve; }),
  activeTab: 'earthquake', document: { hidden: false },
  earthquakeRefreshRequest: null, lastEarthquakeRefreshStartedAt: 0,
  EARTHQUAKE_REFRESH_INTERVAL_MS: 15000, latestDataByTab: { earthquake: { earthquakes: [] } },
  activeEarthquakeId: '', TABS: [{id:'earthquake'}], console,
  loadTabData: async () => { refreshCalls++; return { earthquakes: [{id:'new'}] }; },
  updateCurrentView: noop
});
const refreshStart = source.indexOf('  async function refreshEarthquakeData(');
const refreshEnd = source.indexOf('  async function locateCurrentPosition()', refreshStart);
vm.runInContext(source.slice(refreshStart, refreshEnd), refreshCtx);
const refreshWaiting = refreshCtx.refreshEarthquakeData();
assert.equal(refreshCalls, 0, 'expired XML refresh must wait until camera movement ends');
settleFocus(); await refreshWaiting;
assert.equal(refreshCalls, 1);
refreshCtx.tabAutoFocusSettled = new Promise(() => {});
await refreshCtx.refreshEarthquakeData({force:true});
assert.equal(refreshCalls, 2, 'explicit refresh remains available');
refreshCtx.tabAutoFocusSettled = Promise.resolve();
refreshCtx.activeTab = 'radar';
await refreshCtx.refreshEarthquakeData();
assert.equal(refreshCalls, 2, 'leaving during the wait cancels background reconciliation');

const focusPaints = [];
const focused = [];
let releaseCamera;
const focusCtx = vm.createContext({
  tabAutoFocusSettled: Promise.resolve(), tabAutoFocusGeneration: 1, activeTab: 'earthquake',
  earthquakeContentMode: 'earthquake', console,
  yieldAfterPaint: () => new Promise(resolve => focusPaints.push(resolve)),
  focusSelectedEarthquake: () => focused.push('earthquake'),
  focusSelectedTyphoon: () => focused.push('typhoon'),
  weatherMap: { whenCameraIdle: () => new Promise(resolve => { releaseCamera = resolve; }) }
});
vm.runInContext(source.slice(source.indexOf('  function scheduleTabAutoFocus('), source.indexOf('  function findAmedasStation(')), focusCtx);
focusCtx.scheduleTabAutoFocus('earthquake', 1);
focusPaints.shift()(); await new Promise(setImmediate);
assert.deepEqual(focused, []);
focusPaints.shift()(); await new Promise(setImmediate);
assert.deepEqual(focused, ['earthquake']);
let settled = false;
focusCtx.tabAutoFocusSettled.then(() => { settled = true; });
await Promise.resolve(); assert.equal(settled, false);
releaseCamera(); await focusCtx.tabAutoFocusSettled;
assert.equal(settled, true);
focusCtx.scheduleTabAutoFocus('earthquake', 1);
focusCtx.tabAutoFocusGeneration = 2; focusCtx.activeTab = 'radar';
focusPaints.shift()(); await new Promise(setImmediate);
focusPaints.shift()(); await focusCtx.tabAutoFocusSettled;
assert.equal(focused.length, 1, 'cancelled navigation cannot move the camera');

const cameraListeners = new Map();
const cameraCtx = vm.createContext({map: {
  isMoving: () => true,
  on: (name, callback) => cameraListeners.set(name, callback),
  off: name => cameraListeners.delete(name)
}});
vm.runInContext(mapSource.slice(mapSource.indexOf('  function whenCameraIdle()'), mapSource.indexOf('  function flyToLocation(')), cameraCtx);
const cameraWait = cameraCtx.whenCameraIdle();
assert.equal(cameraListeners.size, 2);
cameraListeners.get('moveend')(); await cameraWait;
assert.equal(cameraListeners.size, 0, 'movement listeners are released');
const removeWait = cameraCtx.whenCameraIdle();
cameraListeners.get('remove')(); await removeWait;
assert.equal(cameraListeners.size, 0, 'map disposal also releases waiters');
console.log('Delayed tab return and camera lifecycle tests passed');

const polygon = [[139,34],[141,34],[141,36],[139,36]];
renderCtx.renderData("earthquake", {earthquakeMapView:"history",earthquakeArchiveFilters:{areaPolygon:polygon}});
assert.deepEqual(renderCtx.hypocenterAreaPolygon, polygon);
renderCtx.renderData("earthquake", {earthquakeMapView:"distribution",distributionFilters:{areaPolygon:[]}});
assert.equal(renderCtx.hypocenterAreaPolygon.length, 0, "history polygon must not leak into distribution");
renderCtx.renderData("earthquake", {earthquakeMapView:"history",earthquakeArchiveFilters:{areaPolygon:polygon}});
assert.deepEqual(renderCtx.hypocenterAreaPolygon, polygon, "returning to history restores its boundary");
