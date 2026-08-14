let weatherDistributionToggleInitialized = false;
let updateWeatherDistributionToggle = () => {};
let toggleWeatherDistributionToggle = () => {};

export function setupWeatherDistributionToggle({ onChange }) {
  if (weatherDistributionToggleInitialized) return;

  const root = document.getElementById("weather-distribution-toggle");
  const toggle = document.getElementById("weather-distribution-toggle-button");
  const choices = document.getElementById("weather-distribution-toggle-choices");
  if (!root || !toggle || !choices) return;
  weatherDistributionToggleInitialized = true;

  const collapseDurationMs = 220;
  let collapseTimer = 0;
  let isCollapsed = true;

  const finishCollapse = () => {
    if (!isCollapsed) return;
    choices.hidden = true;
    root.classList.remove("is-collapsing");
  };

  const syncDockPickerState = () => {
    document.querySelector("[data-weather-distribution-picker]")
      ?.setAttribute("aria-expanded", String(!isCollapsed));
  };

  const setCollapsed = (collapsed) => {
    window.clearTimeout(collapseTimer);
    isCollapsed = Boolean(collapsed);
    root.classList.toggle("collapsed", isCollapsed);
    root.classList.toggle("is-open", !isCollapsed);
    root.classList.toggle("is-collapsing", isCollapsed);
    toggle.setAttribute("aria-expanded", String(!isCollapsed));
    toggle.setAttribute("aria-label", isCollapsed ? "天気分布予報の種類を選択" : "天気分布予報の種類を閉じる");
    toggle.title = isCollapsed ? "天気分布予報の種類を選択" : "天気分布予報の種類を閉じる";
    choices.setAttribute("aria-hidden", String(isCollapsed));
    choices.inert = isCollapsed;
    syncDockPickerState();

    if (isCollapsed) {
      collapseTimer = window.setTimeout(finishCollapse, collapseDurationMs);
    } else {
      choices.hidden = false;
      void root.offsetWidth;
    }
  };

  toggle.addEventListener("click", () => setCollapsed(!isCollapsed));
  toggleWeatherDistributionToggle = () => {
    if (!root.hidden) setCollapsed(!isCollapsed);
  };
  const selectMode = (choice) => {
    if (choice.getAttribute("aria-pressed") === "true") return;
    onChange?.(choice.dataset.weatherDistributionMode);
  };
  for (const choice of choices.querySelectorAll("[data-weather-distribution-mode]")) {
    choice.addEventListener("pointerdown", (event) => event.stopPropagation());
    choice.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectMode(choice);
    });
  }

  updateWeatherDistributionToggle = ({ visible = false, activeMode = null } = {}) => {
    root.hidden = !visible;
    if (!visible) setCollapsed(true);
    for (const choice of choices.querySelectorAll("[data-weather-distribution-mode]")) {
      const selected = choice.dataset.weatherDistributionMode === activeMode;
      choice.classList.toggle("active", selected);
      choice.setAttribute("aria-pressed", String(selected));
    }
    syncDockPickerState();
  };

  setCollapsed(true);
}

export function syncWeatherDistributionToggle(options) {
  updateWeatherDistributionToggle(options);
}

export function toggleWeatherDistributionPicker() {
  toggleWeatherDistributionToggle();
}
