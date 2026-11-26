import { loadTemperatureEstimationEnabled } from "../location/temperatureEstimationPolicy.js";

const KEY = "meteoscope.temperatureSource.v1";
export const TEMPERATURE_SOURCES = Object.freeze(["nearest", "meteoscope", "jma"]);
export function normalizeTemperatureSource(value) {
  return TEMPERATURE_SOURCES.includes(value) ? value : "nearest";
}
export function loadTemperatureSource(storage) {
  try {
    storage ??= globalThis.localStorage;
    const value = storage?.getItem(KEY);
    if (value !== null && value !== undefined) return normalizeTemperatureSource(value);
  } catch { return "nearest"; }
  return loadTemperatureEstimationEnabled(storage) ? "meteoscope" : "nearest";
}
export function saveTemperatureSource(value, storage) {
  const source = normalizeTemperatureSource(value);
  try { (storage ?? globalThis.localStorage)?.setItem(KEY, source); } catch { /* Storage may be unavailable. */ }
  return source;
}
export function effectiveTemperatureSource(source, earlyAccessEnabled) {
  return source === "meteoscope" && !earlyAccessEnabled ? "nearest" : normalizeTemperatureSource(source);
}

// Changing to another source while consent is pending invalidates that consent action.
export function createTemperatureSourceSelector({ getState, onChange, confirm }) {
  let generation = 0, pending = false;
  return async value => {
    if (!TEMPERATURE_SOURCES.includes(value)) return false;
    const state = getState();
    if (value === "meteoscope" && pending) return false;
    const token = ++generation;
    if (value === "meteoscope") {
      if (!state.earlyAccessEnabled) return false;
      if (!state.temperatureEstimationEnabled) {
        pending = true;
        try {
          if (!await confirm() || token !== generation || !getState().earlyAccessEnabled) return false;
        } finally { pending = false; }
      }
    }
    onChange(value);
    return true;
  };
}
