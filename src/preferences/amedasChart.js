const STORAGE_KEY = "meteoscope.amedasChartDisplay.v1";

export const normalizeAmedasChartDisplay = value => value === "daily" ? "daily" : "continuous";

export function loadAmedasChartDisplay(storage) {
  try { return normalizeAmedasChartDisplay((storage ?? globalThis.localStorage)?.getItem(STORAGE_KEY)); }
  catch { return "continuous"; }
}

export function saveAmedasChartDisplay(value, storage) {
  const mode = normalizeAmedasChartDisplay(value);
  try { (storage ?? globalThis.localStorage)?.setItem(STORAGE_KEY, mode); } catch { /* Storage may be unavailable. */ }
  return mode;
}
