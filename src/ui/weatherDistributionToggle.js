const layerToggleControllers = new Map();

let updateWeatherDistributionToggle = () => {};
let toggleWeatherDistributionToggle = () => {};
let updateSatelliteLayerToggle = () => {};

function setupLayerChoiceToggle({
  key,
  rootId,
  toggleId,
  choicesId,
  choiceSelector,
  dockPickerSelector = "",
  closedLabel,
  openLabel,
  onChoice
}) {
  const existing = layerToggleControllers.get(key);
  if (existing) return existing;

  const root = document.getElementById(rootId);
  const toggle = document.getElementById(toggleId);
  const choices = document.getElementById(choicesId);
  if (!root || !toggle || !choices) return null;

  const collapseDurationMs = 220;
  let collapseTimer = 0;
  let isCollapsed = true;
  const choiceButtons = [...choices.querySelectorAll(choiceSelector)];

  const finishCollapse = () => {
    if (!isCollapsed) return;
    choices.hidden = true;
    root.classList.remove("is-collapsing");
  };

  const syncDockPickerState = () => {
    if (!dockPickerSelector) return;
    document.querySelector(dockPickerSelector)?.setAttribute("aria-expanded", String(!isCollapsed));
  };

  const setCollapsed = (collapsed) => {
    window.clearTimeout(collapseTimer);
    isCollapsed = Boolean(collapsed);
    root.classList.toggle("collapsed", isCollapsed);
    root.classList.toggle("is-open", !isCollapsed);
    root.classList.toggle("is-collapsing", isCollapsed);
    toggle.setAttribute("aria-expanded", String(!isCollapsed));
    toggle.setAttribute("aria-label", isCollapsed ? closedLabel : openLabel);
    toggle.title = isCollapsed ? closedLabel : openLabel;
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
  choiceButtons.forEach((choice) => {
    choice.addEventListener("pointerdown", (event) => event.stopPropagation());
    choice.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onChoice?.(choice);
    });
  });

  const controller = {
    toggle: () => {
      if (!root.hidden) setCollapsed(!isCollapsed);
    },
    update: ({ visible = false, isSelected = () => false } = {}) => {
      root.hidden = !visible;
      if (!visible) setCollapsed(true);
      choiceButtons.forEach((choice) => {
        const selected = Boolean(isSelected(choice));
        choice.classList.toggle("active", selected);
        choice.setAttribute("aria-pressed", String(selected));
      });
      syncDockPickerState();
    }
  };
  layerToggleControllers.set(key, controller);
  setCollapsed(true);
  return controller;
}

export function setupWeatherDistributionToggle({ onChange }) {
  const controller = setupLayerChoiceToggle({
    key: "weather-distribution",
    rootId: "weather-distribution-toggle",
    toggleId: "weather-distribution-toggle-button",
    choicesId: "weather-distribution-toggle-choices",
    choiceSelector: "[data-weather-distribution-mode]",
    dockPickerSelector: "[data-weather-distribution-picker]",
    closedLabel: "天気分布予報の種類を選択",
    openLabel: "天気分布予報の種類を閉じる",
    onChoice: (choice) => {
      if (choice.getAttribute("aria-pressed") !== "true") onChange?.(choice.dataset.weatherDistributionMode);
    }
  });
  if (!controller) return;
  updateWeatherDistributionToggle = ({ visible = false, activeMode = null } = {}) => controller.update({
    visible,
    isSelected: (choice) => choice.dataset.weatherDistributionMode === activeMode
  });
  toggleWeatherDistributionToggle = controller.toggle;
}

export function syncWeatherDistributionToggle(options) {
  updateWeatherDistributionToggle(options);
}

export function toggleWeatherDistributionPicker() {
  toggleWeatherDistributionToggle();
}

export function setupSatelliteLayerToggle({ onChange }) {
  const controller = setupLayerChoiceToggle({
    key: "satellite-layer",
    rootId: "satellite-layer-toggle",
    toggleId: "satellite-layer-toggle-button",
    choicesId: "satellite-layer-toggle-choices",
    choiceSelector: "[data-satellite-layer]",
    closedLabel: "雲画像に重ねるレイヤーを選択",
    openLabel: "雲画像に重ねるレイヤーを閉じる",
    onChoice: (choice) => onChange?.(choice.dataset.satelliteLayer)
  });
  if (!controller) return;
  updateSatelliteLayerToggle = ({ visible = false, weatherChartEnabled = false, radarEnabled = false } = {}) => controller.update({
    visible,
    isSelected: (choice) => (
      choice.dataset.satelliteLayer === "weather-chart"
        ? weatherChartEnabled
        : radarEnabled
    )
  });
}

export function syncSatelliteLayerToggle(options) {
  updateSatelliteLayerToggle(options);
}
