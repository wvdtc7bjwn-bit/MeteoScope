const THEME_STORAGE_KEY = "meteoscope-theme";
const THEME_VALUES = new Set(["system", "dark", "light"]);

let preference = readThemePreference();
let initialized = false;
let mediaQuery = null;
const listeners = new Set();

export function setupTheme() {
  if (!initialized) {
    initialized = true;
    mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    mediaQuery.addEventListener?.("change", handleSystemThemeChange);
  }
  applyTheme();
  return {
    getPreference: () => preference,
    getResolvedTheme: resolveTheme,
    setPreference: setThemePreference,
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

function setThemePreference(value) {
  preference = normalizeThemePreference(value);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Keep the selected theme for this session when storage is unavailable.
  }
  applyTheme();
  notifyThemeChange();
  return preference;
}

function handleSystemThemeChange() {
  if (preference !== "system") return;
  applyTheme();
  notifyThemeChange();
}

function applyTheme() {
  const resolvedTheme = resolveTheme();
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themePreference = preference;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    resolvedTheme === "light" ? "#eaf1f8" : "#050914"
  );
}

function notifyThemeChange() {
  const state = { preference, resolvedTheme: resolveTheme() };
  listeners.forEach((listener) => listener(state));
  window.dispatchEvent(new CustomEvent("meteoscope-theme-change", { detail: state }));
}

function resolveTheme() {
  if (preference === "light" || preference === "dark") return preference;
  return (mediaQuery ?? window.matchMedia("(prefers-color-scheme: light)")).matches ? "light" : "dark";
}

function readThemePreference() {
  try {
    return normalizeThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

function normalizeThemePreference(value) {
  return THEME_VALUES.has(value) ? value : "system";
}
