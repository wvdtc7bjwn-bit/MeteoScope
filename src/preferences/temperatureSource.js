import { loadTemperatureEstimationEnabled } from "../location/temperatureEstimationPolicy.js";

const KEY = "meteoscope.temperatureSource.v1";
export const TEMPERATURE_SOURCES = Object.freeze(["nearest", "meteoscope", "auto", "jma"]);
export function usesTemperatureEstimation(source) {
  return source === "meteoscope" || source === "auto";
}
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
export function canUseTemperatureEstimation(state) {
  return state?.earlyAccessEnabled === true && state?.temperatureEstimationAllowed === true;
}
export function effectiveTemperatureSource(source, allowed) {
  return usesTemperatureEstimation(source) && allowed !== true ? "nearest" : normalizeTemperatureSource(source);
}

// Changing to another source while consent is pending invalidates that consent action.
export function createTemperatureSourceSelector({ getState, onChange, confirm }) {
  let generation = 0, pending = false;
  return async value => {
    if (!TEMPERATURE_SOURCES.includes(value)) return false;
    const state = getState();
    if (usesTemperatureEstimation(value) && pending) return false;
    const token = ++generation;
    if (usesTemperatureEstimation(value)) {
      if (!canUseTemperatureEstimation(state)) return false;
      if (!state.temperatureEstimationEnabled) {
        pending = true;
        try {
          if (!await confirm() || token !== generation || !canUseTemperatureEstimation(getState())) return false;
        } finally { pending = false; }
      }
    }
    onChange(value);
    return true;
  };
}
