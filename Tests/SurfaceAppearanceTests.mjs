import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadCustomization, saveCustomization, normalizeCustomization, applySurfaceAppearance, CUSTOMIZATION_KEY } from "../src/preferences/customization.js";
import { setupCustomizationSettings } from "../src/ui/customizationSettings.js";

const createRoot = () => {
  const properties = new Map();
  return { dataset: {}, properties, style: { setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key) } };
};

let stored = null;
const storage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
assert.equal(loadCustomization(storage).appearance.surfaces, "default", "old settings retain their current appearance");
const initial = normalizeCustomization({ startup: { tab: "earthquake" } });
for (const mode of ["default", "translucent", "opaque"]) {
  const value = saveCustomization({ ...initial, appearance: { surfaces: mode } }, storage);
  assert.equal(loadCustomization(storage).appearance.surfaces, mode);
  assert.equal(value.startup.tab, "earthquake", "changing surfaces preserves unrelated settings");
  const root = { dataset: {} };
  applySurfaceAppearance(mode, root); assert.equal(root.dataset.surfaceAppearance, mode);
}
assert.equal(normalizeCustomization({ appearance: { surfaces: "invalid" } }).appearance.surfaces, "default");
assert.doesNotThrow(() => applySurfaceAppearance("opaque", null));
const tuned = saveCustomization({ appearance: { surfaces: "translucent", opacity: 65, blur: 20 } }, storage);
assert.deepEqual(loadCustomization(storage).appearance, tuned.appearance);
assert.deepEqual(normalizeCustomization({ appearance: { opacity: 200, blur: -1 } }).appearance, { surfaces: "default", opacity: 100, blur: 0 });
assert.deepEqual(normalizeCustomization({ appearance: { opacity: "60", blur: Infinity } }).appearance, { surfaces: "default", opacity: null, blur: 12 });
const tunedRoot = createRoot();
applySurfaceAppearance(tuned.appearance, tunedRoot);
assert.equal(tunedRoot.properties.get("--ui-custom-surface-alpha"), "0.65");
assert.equal(tunedRoot.properties.get("--ui-custom-surface-filter"), "blur(20px) saturate(115%)");
applySurfaceAppearance({ surfaces: "translucent", opacity: null, blur: 0 }, tunedRoot);
assert.equal(tunedRoot.properties.has("--ui-custom-surface-alpha"), false);
assert.equal(tunedRoot.properties.get("--ui-custom-surface-filter"), "none");

// Execute the real early theme bootstrap: malformed/blocked storage must not
// break the theme, and a saved material must be applied before application JS.
const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const bootstrap = page.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
for (const [raw, expected] of [[null, "default"], ['{"appearance":{"surfaces":"translucent"}}', "translucent"],
  ['{"appearance":{"surfaces":"opaque"}}', "opaque"], ['{"appearance":{"surfaces":"wrong"}}', "default"], ["invalid-json", "default"]]) {
  const root = createRoot();
  vm.runInNewContext(bootstrap, { document: { documentElement: root }, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: key => key === CUSTOMIZATION_KEY ? raw : "light" } });
  assert.equal(root.dataset.surfaceAppearance, expected);
  assert.equal(root.dataset.theme, "light", "invalid material data must not discard a valid theme");
}
const blockedRoot = { dataset: {} };
vm.runInNewContext(bootstrap, { document: { documentElement: blockedRoot }, localStorage: { getItem() { throw Error(); } } });
assert.equal(blockedRoot.dataset.surfaceAppearance, "default");
for (const appearance of [{ surfaces: "translucent", opacity: 65, blur: 20 }, { surfaces: "translucent", opacity: 0, blur: 99 }, { opacity: "60", blur: null }]) {
  const early = createRoot(), runtime = createRoot();
  vm.runInNewContext(bootstrap, { document: { documentElement: early }, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: key => key === CUSTOMIZATION_KEY ? JSON.stringify({ appearance }) : "light" } });
  applySurfaceAppearance(appearance, runtime);
  assert.deepEqual(early.properties, runtime.properties, "early paint and runtime must use identical validated settings");
}

let state = normalizeCustomization();
const callbacks = new Map(), inserted = [];
const radios = ["default", "translucent", "opaque"].map(value => ({ dataset: { surfaceChoice: value }, attributes: new Map(),
  setAttribute(key, text) { this.attributes.set(key, text); }, hasAttribute: () => false, focus() {} }));
const ranges = ["opacity", "blur"].map(key => ({ dataset: { surfaceAdjustment: key, surfaceUnit: key === "opacity" ? "%" : "px" },
  value: "", attributes: new Map(), setAttribute(key, text) { this.attributes.set(key, text); }, matches: () => false }));
const adjustments = {}, outputs = { opacity: {}, blur: {} }, status = {};
const modal = { querySelector: selector => selector.startsWith(".settings-theme-group") ? { insertAdjacentHTML: (_position, html) => inserted.push(html) }
    : selector === "[data-surface-adjustments]" ? adjustments
    : selector.startsWith("[data-surface-output") ? outputs[selector.includes("opacity") ? "opacity" : "blur"] : status,
  querySelectorAll: selector => selector === "[data-surface-choice]" ? radios : selector === "[data-surface-adjustment]" ? ranges : [],
  addEventListener: (name, fn) => callbacks.set(name, fn) };
const previousDocument = globalThis.document;
try {
  const root = createRoot(); root.dataset.theme = "dark";
  globalThis.document = { querySelectorAll: () => [], documentElement: root };
  const ui = setupCustomizationSettings(modal, { getState: () => ({ customization: state }),
    onChange: (group, patch) => {
      state = saveCustomization({ ...state, [group]: { ...state[group], ...patch } }, storage);
      applySurfaceAppearance(state.appearance, root);
    } });
  ui.render();
  assert.equal(adjustments.hidden, true);
  callbacks.get("click")({ target: { closest: () => radios[1] } });
  assert.equal(root.dataset.surfaceAppearance, "translucent");
  assert.equal(loadCustomization(storage).appearance.surfaces, "translucent");
  assert.equal(adjustments.hidden, false);
  assert.equal(radios[1].attributes.get("aria-checked"), "true");
  const beforePreview = stored;
  ranges[0].value = "65";
  callbacks.get("input")({ target: ranges[0] });
  assert.equal(root.properties.get("--ui-custom-surface-alpha"), "0.65");
  assert.equal(stored, beforePreview, "dragging previews without synchronous storage writes");
  callbacks.get("change")({ target: ranges[0] });
  assert.equal(loadCustomization(storage).appearance.opacity, 65);
  ranges[1].value = "0";
  callbacks.get("input")({ target: ranges[1] });
  callbacks.get("change")({ target: ranges[1] });
  assert.equal(root.properties.get("--ui-custom-surface-filter"), "none");
  assert.equal(outputs.blur.textContent, "0px");
  callbacks.get("keydown")({ target: { closest: () => radios[1] }, key: "ArrowDown", preventDefault() {} });
  assert.equal(state.appearance.surfaces, "opaque");
  const reset = { dataset: { customizationReset: "appearance" }, hasAttribute: () => false };
  callbacks.get("click")({ target: { closest: () => reset } });
  assert.equal(root.dataset.surfaceAppearance, "default");
  assert.equal(state.appearance.opacity, null);
  assert.equal(state.appearance.blur, 12);
  assert.equal(root.properties.has("--ui-custom-surface-alpha"), false);
  assert.ok(inserted.some(html => html.includes('data-surface-choice="translucent"')));
} finally { globalThis.document = previousDocument; }
console.log("Surface appearance: preference migration, persistence, early bootstrap, settings change and reset passed");
