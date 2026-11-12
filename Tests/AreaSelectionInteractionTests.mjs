import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../src/map/weatherMap.js', import.meta.url), 'utf8');
const start = source.indexOf('  function startHypocenterAreaSelection(');
const end = source.indexOf('  function setEmergencyEarthquakeWarnings(', start);
let overlay, result;
let panEnabled = true;
const context = vm.createContext({
  hypocenterAreaOverlay: null,
  document: { createElementNS() {
    const element = { handlers: {}, classList: { add() {} }, append() {}, setAttribute() {},
      addEventListener(name, fn) { this.handlers[name] = fn; },
      setPointerCapture() {}, releasePointerCapture() {}, remove() { this.removed = true; },
      getBoundingClientRect() { return { left: 10, top: 20 }; }
    };
    if (!overlay) overlay = element;
    return element;
  } },
  map: { getContainer: () => ({ append() {} }),
    dragPan: { enable() { panEnabled = true; }, disable() { panEnabled = false; } },
    unproject: ([x,y]) => ({ lng: x, lat: y }) },
  simplifyScreenPolygon: points => points,
  setHypocenterAreaSelection() {}
});
vm.runInContext(source.slice(start,end), context);
function begin() {
  overlay = null; result = undefined;
  context.startHypocenterAreaSelection(value => { result = JSON.parse(JSON.stringify(value)); });
}
function send(type, id, x=20, y=30, button=0) {
  overlay.handlers[type]({ pointerId:id, clientX:x, clientY:y, offsetX:999, offsetY:999, button, preventDefault() {} });
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
