import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadCustomization, saveCustomization, normalizeCustomization, applySurfaceAppearance, CUSTOMIZATION_KEY } from "../src/preferences/customization.js";
import { setupCustomizationSettings } from "../src/ui/customizationSettings.js";

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

// Execute the real early theme bootstrap: malformed/blocked storage must not
// break the theme, and a saved material must be applied before application JS.
const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const bootstrap = page.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
for (const [raw, expected] of [[null, "default"], ['{"appearance":{"surfaces":"translucent"}}', "translucent"],
  ['{"appearance":{"surfaces":"opaque"}}', "opaque"], ['{"appearance":{"surfaces":"wrong"}}', "default"], ["invalid-json", "default"]]) {
  const root = { dataset: {} };
  vm.runInNewContext(bootstrap, { document: { documentElement: root }, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: key => key === CUSTOMIZATION_KEY ? raw : "light" } });
  assert.equal(root.dataset.surfaceAppearance, expected);
  assert.equal(root.dataset.theme, "light", "invalid material data must not discard a valid theme");
}
const blockedRoot = { dataset: {} };
vm.runInNewContext(bootstrap, { document: { documentElement: blockedRoot }, localStorage: { getItem() { throw Error(); } } });
assert.equal(blockedRoot.dataset.surfaceAppearance, "default");

let state = normalizeCustomization();
const callbacks = new Map(), inserted = [];
const select = { dataset: { customizationGroup: "appearance", customizationKey: "surfaces" }, value: "default", matches: () => true };
const modal = { querySelector: selector => selector.startsWith(".settings-theme-group") ? { insertAdjacentHTML: (_position, html) => inserted.push(html) } : {},
  querySelectorAll: selector => selector === "[data-customization-key]" ? [select] : [],
  addEventListener: (name, fn) => callbacks.set(name, fn) };
const previousDocument = globalThis.document;
try {
  globalThis.document = { querySelectorAll: () => [] };
  const root = { dataset: {} };
  const ui = setupCustomizationSettings(modal, { getState: () => ({ customization: state }),
    onChange: (group, patch) => {
      state = saveCustomization({ ...state, [group]: { ...state[group], ...patch } }, storage);
      applySurfaceAppearance(state.appearance.surfaces, root);
    } });
  ui.render(); select.value = "translucent";
  callbacks.get("change")({ target: select });
  assert.equal(root.dataset.surfaceAppearance, "translucent");
  assert.equal(loadCustomization(storage).appearance.surfaces, "translucent");
  const reset = { dataset: { customizationReset: "appearance" }, hasAttribute: () => false };
  callbacks.get("click")({ target: { closest: () => reset } });
  assert.equal(root.dataset.surfaceAppearance, "default"); assert.equal(select.value, "default");
  assert.ok(inserted.some(html => html.includes('data-customization-key="surfaces"')));
} finally { globalThis.document = previousDocument; }
console.log("Surface appearance: preference migration, persistence, early bootstrap, settings change and reset passed");
