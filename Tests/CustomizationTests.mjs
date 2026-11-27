import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildEarthquakeFocusCoordinates } from "../src/app/focusCoordinates.js";
import { CUSTOMIZATION_DEFAULTS, CUSTOMIZATION_KEY, LAST_TAB_KEY, LAST_VIEW_KEY, normalizeCustomization,
  normalizeMapView, loadCustomization, saveCustomization, resolveStartup, cameraDuration } from "../src/preferences/customization.js";
import { scaleStyleValue, createMapInformationController } from "../src/map/mapInformation.js";
import { customizationSettingsMarkup, setupCustomizationSettings } from "../src/ui/customizationSettings.js";
import { SETTINGS_CATEGORIES } from "../src/ui/settingsNavigation.js";

const values = new Map();
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
assert.deepEqual(loadCustomization(storage), CUSTOMIZATION_DEFAULTS);
values.set(CUSTOMIZATION_KEY, "broken json");
assert.deepEqual(loadCustomization(storage), CUSTOMIZATION_DEFAULTS);
const invalid = normalizeCustomization({ startup: null, controls: { earthquakeFocus: "false", earthquakeZoom: Infinity },
  information: { markerScale: -4 }, menu: { hidden: ["settings-button", "x", "x", "<invalid>"] } });
assert.equal(invalid.controls.earthquakeFocus, true);
assert.equal(invalid.information.markerScale, 1);
assert.deepEqual(invalid.menu.hidden, ["x"]);
assert.equal(normalizeMapView({ center: [135, null], zoom: 7 }), null);
assert.equal(normalizeMapView({ center: [135, 90], zoom: 7 }), null);
const view = { center: [138, 36], zoom: 7.5, bearing: 20, pitch: 0 };
const preferences = saveCustomization({ ...CUSTOMIZATION_DEFAULTS, startup: { tab: "amedas", viewport: "saved", savedView: view } }, storage);
assert.deepEqual(loadCustomization(storage), preferences);
assert.deepEqual(resolveStartup(preferences, null, storage), { initialTab: "amedas", initialView: view });
assert.equal(resolveStartup(preferences, "earthquake", storage).initialTab, "earthquake", "deep links take priority");
values.set(LAST_TAB_KEY, JSON.stringify("typhoon")); values.set(LAST_VIEW_KEY, JSON.stringify(view));
assert.deepEqual(resolveStartup({ startup: { tab: "previous", viewport: "previous" } }, null, storage), { initialTab: "typhoon", initialView: view });
const blocked = { getItem() { throw Error(); }, setItem() { throw Error(); } };
assert.doesNotThrow(() => saveCustomization(preferences, blocked));
assert.equal(resolveStartup({ startup: { tab: "previous", viewport: "previous" } }, null, blocked).initialTab, "radar");
assert.deepEqual(resolveStartup(null, "unknown", storage), { initialTab: "radar", initialView: null });
assert.equal(cameraDuration("instant"), 0);
assert.equal(cameraDuration("slow", 850, true), 0, "system reduced motion always wins");
assert.equal(cameraDuration("fast", 320), 160);

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const focusCalls = [];
const focus = vm.createContext({ customization: normalizeCustomization({ controls: { earthquakeFocus: false } }),
  latestDataByTab: { earthquake: { earthquakes: [{ id: "sample", coordinates: [140, 35], intensityStations: [{ coordinates: [141, 36] }] }] } },
  activeEarthquakeId: "sample", buildEarthquakeFocusCoordinates,
  weatherMap: { fitToCoordinates: (points, options) => focusCalls.push({ points, options }), flyToLocation: () => assert.fail("unexpected single-point focus") } });
vm.runInContext(appSource.slice(appSource.indexOf("  function focusSelectedEarthquake()"), appSource.indexOf("  function scheduleTabAutoFocus(")), focus);
focus.focusSelectedEarthquake();
assert.equal(focusCalls.length, 0, "disabled automatic focus must preserve the camera");
focus.customization = normalizeCustomization({ controls: { earthquakeZoom: 9 } });
focus.focusSelectedEarthquake();
assert.equal(focusCalls[0].options.maxZoom, 9);
assert.equal(focusCalls[0].points.length, 2, "zoom preferences still retain actual observations");

const expression = ["interpolate", ["linear"], ["zoom"], 4, 0.5, 8, 1];
assert.deepEqual(scaleStyleValue(expression, 0.5), ["interpolate", ["linear"], ["zoom"], 4, 0.25, 8, 0.5]);
assert.equal(expression[4], 0.5, "scaling must not mutate shared styles");
const paint = new Map([["japan-prefecture-line:line-opacity", expression], ["world-country-line:line-opacity", 0.4]]);
const layout = new Map();
const map = { getLayer: () => true, getPaintProperty: (id, name) => paint.get(`${id}:${name}`),
  setPaintProperty: (id, name, value) => paint.set(`${id}:${name}`, value),
  setLayoutProperty: (id, name, value) => layout.set(`${id}:${name}`, value) };
const controller = createMapInformationController();
const information = { ...CUSTOMIZATION_DEFAULTS.information, boundaries: false, boundaryOpacity: 0.45, markerScale: 1.2 };
controller.apply(map, information, "amedas", expression);
controller.apply(map, information, "amedas", expression);
assert.equal(paint.get("world-country-line:line-opacity"), 0.4 * 0.45, "repeated application must not compound opacity");
assert.equal(layout.get("jma-municipality-line:visibility"), "none");
assert.equal(layout.get("sample-amedas-value:icon-size"), 1.2);
controller.apply(map, CUSTOMIZATION_DEFAULTS.information, "earthquake", 0.95);
assert.equal(layout.get("jma-municipality-line:visibility"), "visible");
assert.equal(paint.get("world-country-line:line-opacity"), 0.4);
assert.equal(paint.get("japan-prefecture-line:line-opacity"), 0.95, "terrain baseline is preserved");
assert.equal(layout.get("sample-label:text-size")[4], 10, "AMeDAS size does not affect other modes");

const markup = readFileSync(new URL("../index.html", import.meta.url), "utf8") + customizationSettingsMarkup();
const groups = [...markup.matchAll(/<section\s+class="(settings-group(?: [^"]+)?)"([^>]*)>/g)];
assert.equal(groups.length, 24);
for (const [, classes, attributes] of groups) {
  const categories = SETTINGS_CATEGORIES.filter(category => category.selector.split(", ").some(selector =>
    selector.startsWith(".") ? classes.split(" ").includes(selector.slice(1)) : attributes.includes('data-settings-section="support"')));
  assert.equal(categories.length, 1, `${classes} must have one settings category`);
}
console.log("Customization: validated storage, startup precedence, camera motion, idempotent map styles and settings coverage passed");

// Run the real settings click/render path: the saved boolean, ARIA state and
// switch thumb's visual class must agree before/after a click and restoration.
let uiState = normalizeCustomization();
const attributes = new Map(), classes = new Set(), listeners = new Map();
const button = { dataset: { customizationGroup: "information", customizationToggle: "stationNames" },
  classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } },
  setAttribute: (name, value) => attributes.set(name, value), hasAttribute: () => false };
const modal = { querySelector: selector => selector.startsWith(".settings-theme-group") ? { insertAdjacentHTML() {} } : {},
  querySelectorAll: selector => selector === "[data-customization-toggle]" ? [button] : [],
  addEventListener: (name, listener) => listeners.set(name, listener) };
const previousDocument = globalThis.document;
try {
  globalThis.document = { querySelectorAll: () => [] };
  const ui = setupCustomizationSettings(modal, { getState: () => ({ customization: uiState }),
    onChange: (group, patch) => { uiState = saveCustomization({ ...uiState, [group]: { ...uiState[group], ...patch } }, storage); } });
  ui.render();
  assert.equal(attributes.get("aria-checked"), "true"); assert.ok(classes.has("is-enabled"));
  listeners.get("click")({ target: { closest: () => button } });
  assert.equal(uiState.information.stationNames, false);
  assert.equal(attributes.get("aria-checked"), "false"); assert.equal(classes.has("is-enabled"), false);
  uiState = loadCustomization(storage); ui.render();
  assert.equal(classes.has("is-enabled"), false, "restored switches must reflect their saved state");
  listeners.get("click")({ target: { closest: () => button } });
  assert.equal(uiState.information.stationNames, true); assert.ok(classes.has("is-enabled"));
} finally { globalThis.document = previousDocument; }
console.log("Customization switches: actual click handler, persisted boolean, ARIA and thumb styling passed");
