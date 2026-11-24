import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../src/map/weatherMap.js', import.meta.url), 'utf8');
const start = source.indexOf('  function startHypocenterAreaSelection(');
const end = source.indexOf('  function setEmergencyEarthquakeWarnings(', start);
let overlay, result;
let panEnabled = true;
let canvasParentAppends = 0;
const context = vm.createContext({
  hypocenterAreaOverlay: null, hypocenterAreaCleanup: null,
  document: { createElementNS() {
    const element = { handlers: {}, classList: { add() {} }, append(child) { this.child = child; }, setAttribute(name,value) { (this.attributes ??= {})[name] = value; },
      addEventListener(name, fn, options) { this.handlers[name] = fn; (this.listenerOptions ??= {})[name] = options; },
      setPointerCapture() {}, releasePointerCapture() {}, remove() { this.removed = true; },
      getBoundingClientRect() { return { left: 10, top: 20 }; }
    };
    if (!overlay) overlay = element;
    return element;
  } },
  map: { getCanvasContainer: () => ({ append() { canvasParentAppends++; } }),
    getContainer() { throw new Error("drawing overlay must share the native zoom event target"); },
    dragPan: { isEnabled: () => panEnabled, enable() { panEnabled = true; }, disable() { panEnabled = false; } },
    unproject: ([x,y]) => ({ lng: x, lat: y }) },
  simplifyScreenPolygon: points => points,
  setHypocenterAreaSelection() {}
});
vm.runInContext(source.slice(start,end), context);
function begin() {
  overlay = null; result = undefined;
  context.startHypocenterAreaSelection(value => { result = JSON.parse(JSON.stringify(value)); });
}
function send(type, id, x=20, y=30, button=0, pointerType="mouse") {
  overlay.handlers[type]({ pointerId:id, pointerType, clientX:x, clientY:y, offsetX:999, offsetY:999, button, preventDefault() {} });
}
begin();
send('pointerdown',1); send('pointermove',1,40,30);
send('pointerdown',2,90,90); send('pointermove',2,95,95); send('pointercancel',2);
assert.equal(overlay.removed,undefined); assert.equal(panEnabled,false);
send('pointermove',1,40,50); send('pointerup',2);
assert.equal(result,undefined);
send('pointerup',1);
assert.deepEqual(result,[[10,10],[30,10],[30,30]]);
assert.equal(panEnabled,true);
begin(); send('pointerdown',1,20,30,2); send('pointerup',1);
assert.equal(result,undefined); assert.equal(panEnabled,true);
send('pointerdown',1); send('pointercancel',1);
assert.deepEqual(result,[]); assert.equal(overlay.removed,true); assert.equal(panEnabled,true);
begin(); send('pointerdown',1); context.cancelHypocenterAreaDrawing();
assert.equal(overlay.removed,true); assert.equal(panEnabled,true);
send('pointerup',1); send('pointercancel',1);
assert.equal(result,undefined, 'late pointer events after cancellation must not submit a search');
console.log('Area selection: multi-touch, coordinates, right click, cancellation and cleanup passed.');
assert.ok(canvasParentAppends > 0);
begin();
assert.equal(overlay.listenerOptions.wheel.passive,true,'wheel must reach the map native handler without being cancelled');
overlay.handlers.wheel({preventDefault(){throw new Error('wheel zoom must not be prevented');}});
assert.equal(result,undefined);assert.equal(overlay.removed,undefined);
send('pointerdown',10,20,30,0,'touch');send('pointermove',10,40,30,0,'touch');
send('pointerdown',11,80,80,0,'touch');
assert.equal(overlay.child.attributes.points,'','pinching clears the partial freehand stroke');
assert.equal(panEnabled,true,'native two-finger map gestures stay enabled');
send('pointermove',10,60,50,0,'touch');send('pointerup',10,60,50,0,'touch');send('pointerup',11,80,80,0,'touch');
assert.equal(result,undefined,'ending a pinch must not start a search');assert.equal(overlay.removed,undefined);
send('pointerdown',12,20,30,0,'touch');send('pointermove',12,40,30,0,'touch');send('pointermove',12,40,50,0,'touch');send('pointerup',12,40,50,0,'touch');
assert.deepEqual(result,[[10,10],[30,10],[30,30]],'single-finger drawing works after pinching');
begin();send('pointerdown',1);send('pointermove',1,40,30);
overlay.handlers.wheel({});send('pointermove',1,40,50);send('pointerup',1);
assert.equal(result,undefined,'wheel during drawing must not submit coordinates from the previous zoom');
assert.equal(overlay.removed,undefined);assert.equal(panEnabled,true);
send('pointerdown',2);send('pointermove',2,40,30);send('pointermove',2,40,50);send('pointerup',2);
assert.deepEqual(result,[[10,10],[30,10],[30,30]],'drawing works again after wheel zoom');
begin();send('pointerdown',20,20,30,0,'touch');send('pointerdown',21,80,80,0,'touch');
send('pointercancel',20,20,30,0,'touch');send('pointercancel',21,80,80,0,'touch');
assert.equal(result,undefined);context.cancelHypocenterAreaDrawing();assert.equal(overlay.removed,true);
panEnabled=false;begin();send('pointerdown',1);context.cancelHypocenterAreaDrawing();
assert.equal(panEnabled,false,'cleanup restores the original pan state instead of enabling it unconditionally');
panEnabled=true;
console.log('Area selection: native zoom event routing, pinch interruption, wheel interruption, post-zoom drawing and pan restoration passed.');

// Search bounds remain a filter, but must not cover the selected event detail.
const areaVisibilityStart = source.indexOf('    const areaVisible =');
const areaVisibilityEnd = source.indexOf('    let collection =', areaVisibilityStart);
const areaLayers = new Map();
const areaFilter = [[130,30],[131,30],[131,31]];
const visibility = vm.createContext({
  mode: 'earthquake', activeEews: [], hypocenterAreaPolygon: areaFilter,
  data: { earthquakeMapView: 'history', earthquakeArchiveFilters: { areaPolygon: areaFilter } },
  HYPOCENTER_AREA_FILL_LAYER_ID: 'fill', HYPOCENTER_AREA_LINE_LAYER_ID: 'line',
  map: { getLayer: () => true, setLayoutProperty(id, property, value) { areaLayers.set(id,value); } },
  setHypocenterAreaSelection(value) { visibility.hypocenterAreaPolygon = value; }
});
const renderAreaVisibility = () => vm.runInContext(`{${source.slice(areaVisibilityStart,areaVisibilityEnd)}}`,visibility);
renderAreaVisibility();
assert.deepEqual([...areaLayers.values()], ['visible','visible']);
visibility.data.historicalEarthquakeDetailVisible = true;
for (const status of ['loading','ok','error']) {
  visibility.data.historicalEarthquakeDetail = { status };
  renderAreaVisibility();
  assert.deepEqual([...areaLayers.values()], ['none','none'],`hide both bounds layers while event detail is ${status}`);
  assert.deepEqual(visibility.hypocenterAreaPolygon,areaFilter,'keep the search bounds for returning to results');
}
visibility.data.historicalEarthquakeDetailVisible = false;
renderAreaVisibility();
assert.deepEqual([...areaLayers.values()], ['visible','visible'],'restore bounds on return to the filtered results');
visibility.data.earthquakeMapView = 'distribution';
visibility.data.distributionFilters = { areaPolygon: areaFilter };
visibility.data.historicalEarthquakeDetailVisible = true;
renderAreaVisibility();
assert.deepEqual([...areaLayers.values()], ['visible','visible'],'distribution bounds remain visible after leaving historical detail');
visibility.activeEews = [{}];
renderAreaVisibility();
assert.deepEqual([...areaLayers.values()], ['none','none'],'EEW continues to take precedence over search bounds');
console.log('Area selection: hide bounds during event loading, detail and errors; restore on return without losing the filter.');


// Exercise the actual distribution controller, including drawer transitions.
const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const controllerStart = appSource.indexOf('  function startEarthquakeDistributionAreaSearch()');
const controllerEnd = appSource.indexOf('  function clearEarthquakeDistributionAreaSearch()', controllerStart);
let complete;
const drawerStates = [];
const searches = [];
const controller = vm.createContext({
  activeTab: 'earthquake', earthquakeView: 'distribution',
  earthquakeDistributionAreaDrawing: false, earthquakeDistribution3DEnabled: true,
  weatherMap: {
    startHypocenterAreaSelection(callback) { complete = callback; return true; },
    cancelHypocenterAreaDrawing() { complete = undefined; }
  },
  saveOptionalLayerVisibility() {}, updateCurrentView() {},
  updateEarthquakeDistributionFilters(filters) { searches.push(filters); },
  TABS: [{ id: 'earthquake' }], latestDataByTab: {},
  CustomEvent: class { constructor(type, options) { this.detail = options.detail; } },
  window: { dispatchEvent(event) { drawerStates.push(event.detail); } }
});
vm.runInContext(appSource.slice(controllerStart, controllerEnd), controller);
controller.startEarthquakeDistributionAreaSearch();
assert.deepEqual(drawerStates, ['peek']);
assert.equal(controller.earthquakeDistribution3DEnabled, false);
complete([[130, 30], [131, 30], [131, 31]]);
assert.deepEqual(drawerStates, ['peek', 'full']);
assert.equal(searches.length, 1);
assert.equal(controller.earthquakeDistributionAreaDrawing, false);
controller.startEarthquakeDistributionAreaSearch();
complete([]);
assert.equal(drawerStates.at(-1), 'full');
assert.equal(searches.length, 1, 'invalid selection must not replace the previous filter');
controller.startEarthquakeDistributionAreaSearch();
controller.earthquakeView = 'history';
const transitionCount = drawerStates.length;
complete([[130, 30], [131, 30], [131, 31]]);
assert.equal(searches.length, 1);
assert.equal(drawerStates.length, transitionCount, 'late completion must not reopen another view');
console.log('Distribution area search: drawer transitions, invalid selection and stale completion passed.');
