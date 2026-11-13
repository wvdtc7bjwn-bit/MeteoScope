import { DEFAULT_AMEDAS_PRECIPITATION_PERIOD, normalizeAmedasPrecipitationPeriod } from "../amedasPrecipitationPeriod.js";

// Storage keys and legacy decoding are compatibility contracts. Keep defaults
// unchanged when adding new preferences; denied storage must remain non-fatal.
const EARTHQUAKE_LAYER_VISIBILITY_STORAGE_KEYS = {
  activeFault: "meteoscope-earthquake-active-fault-visible-v1",
  plateBoundary: "meteoscope-earthquake-plate-boundary-visible-v1",
  plateDepthContours: "meteoscope-earthquake-plate-depth-contours-visible-v1",
  estimatedIntensity: "meteoscope-earthquake-estimated-intensity-visible-v1"
};
const EARTHQUAKE_DISTRIBUTION_RECENT_XML_STORAGE_KEY = "meteoscope-earthquake-distribution-recent-xml-v1";
const AMEDAS_PRECIPITATION_PERIOD_STORAGE_KEY = "meteoscope-amedas-precipitation-period-v1";
const TERRAIN_LAYER_SETTINGS_STORAGE_KEY = "meteoscope-terrain-layer-settings-v1";
const TERRAIN_LAYER_SETTINGS_SESSION_KEY = "meteoscope-terrain-layer-settings-session-v1";
const OPTIONAL_LAYER_VISIBILITY_STORAGE_PREFIX = "meteoscope-layer-visible-v1:";
const TERRAIN_LAYER_OPACITY_OPTIONS = [0.32, 0.48, 0.64];
const DEFAULT_TERRAIN_LAYER_SETTINGS = Object.freeze({ visible: false, opacity: 0.48 });

export function loadAmedasPrecipitationPeriod() {
  try {
    return normalizeAmedasPrecipitationPeriod(
      localStorage.getItem(AMEDAS_PRECIPITATION_PERIOD_STORAGE_KEY)
    );
  } catch {
    return DEFAULT_AMEDAS_PRECIPITATION_PERIOD;
  }
}

export function saveAmedasPrecipitationPeriod(periodId) {
  try {
    localStorage.setItem(AMEDAS_PRECIPITATION_PERIOD_STORAGE_KEY, periodId);
  } catch {
    // Storage can be unavailable in privacy-restricted environments.
  }
}

export function normalizeTerrainLayerOpacity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_TERRAIN_LAYER_SETTINGS.opacity;
  return TERRAIN_LAYER_OPACITY_OPTIONS.reduce((closest, option) => (
    Math.abs(option - numeric) < Math.abs(closest - numeric) ? option : closest
  ), TERRAIN_LAYER_OPACITY_OPTIONS[0]);
}

export function loadTerrainLayerSettings() {
  const stored = parseTerrainLayerSettings(readTerrainLayerSettingsValue());
  return {
    visible: stored?.visible === true,
    opacity: normalizeTerrainLayerOpacity(stored?.opacity)
  };
}

function readTerrainLayerSettingsValue() {
  try {
    const persistent = localStorage.getItem(TERRAIN_LAYER_SETTINGS_STORAGE_KEY);
    if (persistent !== null) return persistent;
  } catch {
    // Fall through to the same-tab reload fallback.
  }
  try {
    return sessionStorage.getItem(TERRAIN_LAYER_SETTINGS_SESSION_KEY);
  } catch {
    return null;
  }
}

function parseTerrainLayerSettings(value) {
  if (value === "1" || value === "true") return { visible: true };
  if (value === "0" || value === "false") return { visible: false };
  try {
    const parsed = JSON.parse(value || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveTerrainLayerSettings(settings) {
  try {
    const serialized = JSON.stringify({
      visible: settings.visible === true,
      opacity: normalizeTerrainLayerOpacity(settings.opacity)
    });
    localStorage.setItem(TERRAIN_LAYER_SETTINGS_STORAGE_KEY, serialized);
    sessionStorage.setItem(TERRAIN_LAYER_SETTINGS_SESSION_KEY, serialized);
  } catch {
    try {
      sessionStorage.setItem(TERRAIN_LAYER_SETTINGS_SESSION_KEY, JSON.stringify({
        visible: settings.visible === true,
        opacity: normalizeTerrainLayerOpacity(settings.opacity)
      }));
    } catch {
      // Storage can be unavailable in privacy-restricted environments.
    }
  }
}

export function loadEarthquakeLayerVisibility(layerId) {
  try {
    return localStorage.getItem(EARTHQUAKE_LAYER_VISIBILITY_STORAGE_KEYS[layerId]) !== "0";
  } catch {
    return true;
  }
}

export function saveEarthquakeLayerVisibility(layerId, visible) {
  try {
    localStorage.setItem(EARTHQUAKE_LAYER_VISIBILITY_STORAGE_KEYS[layerId], visible ? "1" : "0");
  } catch {
    // Storage can be unavailable in privacy-restricted environments.
  }
}

export function loadOptionalLayerVisibility(layerId, defaultVisible = false) {
  try {
    const stored = localStorage.getItem(`${OPTIONAL_LAYER_VISIBILITY_STORAGE_PREFIX}${layerId}`);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch {
    // Keep the default when storage is unavailable.
  }
  return defaultVisible;
}

export function saveOptionalLayerVisibility(layerId, visible) {
  try {
    localStorage.setItem(`${OPTIONAL_LAYER_VISIBILITY_STORAGE_PREFIX}${layerId}`, visible ? "1" : "0");
  } catch {
    // The layer still works for the current session.
  }
}

export function loadEarthquakeDistributionRecentXmlVisibility() {
  try {
    return localStorage.getItem(EARTHQUAKE_DISTRIBUTION_RECENT_XML_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveEarthquakeDistributionRecentXmlVisibility(visible) {
  try {
    localStorage.setItem(EARTHQUAKE_DISTRIBUTION_RECENT_XML_STORAGE_KEY, visible ? "1" : "0");
  } catch {
    // Storage can be unavailable in privacy-restricted environments.
  }
}

