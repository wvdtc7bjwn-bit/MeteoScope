import assert from "node:assert/strict";
import * as preferences from "../src/preferences/mapPreferences.js";

const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), clear: () => values.clear() };
};
const local = memoryStorage();
const session = memoryStorage();
const originalLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
try {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: local });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: session });
  const terrainKey = "meteoscope-terrain-layer-settings-v1";
  const sessionKey = "meteoscope-terrain-layer-settings-session-v1";
  assert.deepEqual(preferences.loadTerrainLayerSettings(), { visible: false, opacity: 0.48, colorMode: "color" });
  for (const value of ["1", "true", "0", "false", "invalid", '{"visible":true,"opacity":0.63}']) {
    local.setItem(terrainKey, value);
    const result = preferences.loadTerrainLayerSettings();
    assert.equal(result.visible, ["1", "true"].includes(value) || value.startsWith("{"));
    assert.equal(result.opacity, value.startsWith("{") ? 0.64 : 0.48);
  }
  preferences.saveTerrainLayerSettings({ visible: true, opacity: 0.49 });
  assert.equal(local.getItem(terrainKey), session.getItem(sessionKey));
  local.clear();
  assert.deepEqual(preferences.loadTerrainLayerSettings(), { visible: true, opacity: 0.48, colorMode: "color" }, "same-tab fallback");
  preferences.saveTerrainLayerSettings({ visible: true, opacity: 0.64, colorMode: "grayscale" });
  assert.deepEqual(preferences.loadTerrainLayerSettings(), { visible: true, opacity: 0.64, colorMode: "grayscale" });
  local.clear();
  assert.equal(preferences.loadTerrainLayerSettings().colorMode, "grayscale", "session fallback preserves the color choice");
  local.setItem(terrainKey, '{"visible":true,"opacity":0.48,"colorMode":"invalid"}');
  assert.equal(preferences.loadTerrainLayerSettings().colorMode, "color");
  for (const layer of ["activeFault", "plateBoundary", "plateDepthContours", "estimatedIntensity"]) {
    assert.equal(preferences.loadEarthquakeLayerVisibility(layer), true);
    preferences.saveEarthquakeLayerVisibility(layer, false);
    assert.equal(preferences.loadEarthquakeLayerVisibility(layer), false);
  }
  assert.equal(preferences.loadOptionalLayerVisibility("community"), false);
  assert.equal(preferences.loadOptionalLayerVisibility("community", true), true);
  preferences.saveOptionalLayerVisibility("community", false);
  assert.equal(preferences.loadOptionalLayerVisibility("community", true), false);
  assert.equal(preferences.loadEarthquakeDistributionRecentXmlVisibility(), true);
  preferences.saveEarthquakeDistributionRecentXmlVisibility(false);
  assert.equal(preferences.loadEarthquakeDistributionRecentXmlVisibility(), false);
  const defaultPeriod = preferences.loadAmedasPrecipitationPeriod();
  preferences.saveAmedasPrecipitationPeriod("invalid");
  assert.equal(preferences.loadAmedasPrecipitationPeriod(), defaultPeriod);
  // Some browsers throw on accessing storage itself, not only getItem/setItem.
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw Error("denied"); } });
  preferences.saveTerrainLayerSettings({ visible: false, opacity: 0.32, colorMode: "color" });
  assert.deepEqual(preferences.loadTerrainLayerSettings(), { visible: false, opacity: 0.32, colorMode: "color" });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get() { throw Error("denied"); } });
  assert.deepEqual(preferences.loadTerrainLayerSettings(), { visible: false, opacity: 0.48, colorMode: "color" });
  assert.equal(preferences.loadEarthquakeLayerVisibility("activeFault"), true);
  assert.equal(preferences.loadOptionalLayerVisibility("community"), false);
  assert.equal(preferences.loadEarthquakeDistributionRecentXmlVisibility(), true);
  assert.equal(preferences.loadAmedasPrecipitationPeriod(), defaultPeriod);
  assert.doesNotThrow(() => {
    preferences.saveAmedasPrecipitationPeriod(defaultPeriod);
    preferences.saveEarthquakeLayerVisibility("activeFault", false);
    preferences.saveOptionalLayerVisibility("community", true);
    preferences.saveEarthquakeDistributionRecentXmlVisibility(false);
    preferences.saveTerrainLayerSettings({ visible: true, opacity: 0.64 });
  });
} finally {
  if (originalLocal) Object.defineProperty(globalThis, "localStorage", originalLocal);
  else delete globalThis.localStorage;
  if (originalSession) Object.defineProperty(globalThis, "sessionStorage", originalSession);
  else delete globalThis.sessionStorage;
}
console.log("Map preferences: defaults, legacy values, persistence, fallback and denied storage passed");
