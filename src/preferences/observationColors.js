const STORAGE_KEY = "meteoscope-observation-colors-v1";
const KEYS = ["amedas", "intensity", "longPeriod"];
export const OBSERVATION_COLOR_SCHEMES = Object.freeze(["meteoscope", "jma"]);
const normalizeScheme = value => OBSERVATION_COLOR_SCHEMES.includes(value) ? value : "meteoscope";

export function normalizeObservationColors(value) {
  return Object.fromEntries(KEYS.map(key => [key, normalizeScheme(value?.[key])]));
}

export function loadObservationColors(storage) {
  try { return normalizeObservationColors(JSON.parse((storage ?? globalThis.localStorage)?.getItem(STORAGE_KEY) ?? "null")); }
  catch { return normalizeObservationColors(null); }
}

// All presentation helpers share this small state. Scientific values are unchanged.
let preferences = loadObservationColors();
export const getObservationColors = () => ({ ...preferences });
export const getObservationColorScheme = key => preferences[key] ?? "meteoscope";

export function setObservationColors(next, storage) {
  preferences = normalizeObservationColors({ ...preferences, ...next });
  try { (storage ?? globalThis.localStorage)?.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch { /* Private browsing may deny storage. */ }
  return getObservationColors();
}
