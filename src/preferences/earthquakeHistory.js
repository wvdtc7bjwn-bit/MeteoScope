const STORAGE_KEY = "meteoscope.earthquakeHistoryRecent.v1";

export function loadEarthquakeHistoryRecentEnabled(storage) {
  try { return (storage ?? globalThis.localStorage)?.getItem(STORAGE_KEY) !== "false"; }
  catch { return true; }
}

export function saveEarthquakeHistoryRecentEnabled(enabled, storage) {
  const value = Boolean(enabled);
  try { (storage ?? globalThis.localStorage)?.setItem(STORAGE_KEY, String(value)); } catch { /* Keep the current session usable. */ }
  return value;
}
