export const CUSTOMIZATION_KEY = "meteoscope.customization.v1";
export const LAST_VIEW_KEY = "meteoscope.lastView.v1";
export const LAST_TAB_KEY = "meteoscope.lastTab.v1";
export const CUSTOMIZATION_DEFAULTS = Object.freeze({
  startup: Object.freeze({ tab: "radar", viewport: "default", savedView: null }),
  menu: Object.freeze({ hidden: [], pinned: [] }),
  controls: Object.freeze({ earthquakeFocus: true, earthquakeZoom: 7.4, cameraSpeed: "standard" }),
  information: Object.freeze({ stationNames: true, stationValues: true, markerScale: 1, boundaries: true, boundaryOpacity: 1 })
});
const TABS = ["amedas", "warnings", "radar", "typhoon", "earthquake"];
const choose = (value, values, fallback) => values.includes(value) ? value : fallback;
const flag = (value, fallback) => typeof value === "boolean" ? value : fallback;
const ids = value => Array.isArray(value) ? [...new Set(value.filter(id => typeof id === "string" && /^[a-z][a-z0-9-]{0,79}$/.test(id)))].slice(0, 40) : [];
export function normalizeMapView(view) {
  if (!Array.isArray(view?.center) || view.center.length !== 2 || !view.center.every(Number.isFinite)
    || Math.abs(view.center[1]) > 85 || !Number.isFinite(view.zoom) || view.zoom < 1 || view.zoom > 18) return null;
  return { center: [((view.center[0] + 180) % 360 + 360) % 360 - 180, view.center[1]], zoom: view.zoom,
    bearing: Number.isFinite(view.bearing) ? ((view.bearing % 360) + 360) % 360 : 0,
    pitch: Number.isFinite(view.pitch) ? Math.max(0, Math.min(60, view.pitch)) : 0 };
}
export function normalizeCustomization(value = {}) {
  const { startup = {}, menu = {}, controls = {}, information = {} } = value ?? {};
  return {
    startup: { tab: choose(startup?.tab, [...TABS, "previous"], "radar"),
      viewport: choose(startup?.viewport, ["default", "saved", "previous"], "default"), savedView: normalizeMapView(startup?.savedView) },
    menu: { hidden: ids(menu?.hidden).filter(id => id !== "settings-button"), pinned: ids(menu?.pinned) },
    controls: { earthquakeFocus: flag(controls?.earthquakeFocus, true),
      earthquakeZoom: choose(controls?.earthquakeZoom, [6, 7.4, 9], 7.4),
      cameraSpeed: choose(controls?.cameraSpeed, ["slow", "standard", "fast", "instant"], "standard") },
    information: { stationNames: flag(information?.stationNames, true), stationValues: flag(information?.stationValues, true),
      markerScale: choose(information?.markerScale, [0.85, 1, 1.2], 1), boundaries: flag(information?.boundaries, true),
      boundaryOpacity: choose(information?.boundaryOpacity, [0.45, 0.7, 1], 1) }
  };
}
function read(key, storage) {
  try { return JSON.parse((storage ?? globalThis.localStorage)?.getItem(key) ?? "null"); } catch { return null; }
}
export function storeCustomizationValue(key, value, storage) {
  try { (storage ?? globalThis.localStorage)?.setItem(key, JSON.stringify(value)); } catch { /* Keep the change in memory. */ }
}
export const loadCustomization = storage => normalizeCustomization(read(CUSTOMIZATION_KEY, storage));
export function saveCustomization(value, storage) {
  const normalized = normalizeCustomization(value);
  storeCustomizationValue(CUSTOMIZATION_KEY, normalized, storage);
  return normalized;
}
export function resolveStartup(customization, explicitTab, storage) {
  const { startup } = normalizeCustomization(customization);
  const previousTab = read(LAST_TAB_KEY, storage);
  return { initialTab: TABS.includes(explicitTab) ? explicitTab : startup.tab === "previous"
    ? choose(previousTab, TABS, "radar") : startup.tab,
    initialView: startup.viewport === "saved" ? startup.savedView
      : startup.viewport === "previous" ? normalizeMapView(read(LAST_VIEW_KEY, storage)) : null };
}
export function cameraDuration(speed, duration = 850, reducedMotion = false) {
  if (reducedMotion || speed === "instant") return 0;
  return Math.round(duration * ({ slow: 1.6, fast: 0.5 }[speed] ?? 1));
}
