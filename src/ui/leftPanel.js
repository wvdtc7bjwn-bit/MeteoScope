import {
  AMEDAS_METRICS,
  AMEDAS_PRECIPITATION_LEVELS,
  AMEDAS_SNOW_LEVELS,
  AMEDAS_TEMPERATURE_LEVELS,
  AMEDAS_WIND_LEVELS,
  EARTHQUAKE_INTENSITY_LEVELS,
  getAmedasObservationColor,
  getEarthquakeIntensityColor,
  getEarthquakeIntensityTextClass,
  KIKIKURU_LAYER_OPTIONS,
  KIKIKURU_LEVELS
} from "../config.js";
import { formatEarthquakeDepthText } from "../earthquakeFormat.js";
import { NO_TYPHOON_MESSAGE } from "../jma/typhoon.js";

let selectedWarningAreaCode = "";
let amedasRankingOrder = "top";
let amedasTemperatureRankingView = "current";
let amedasWindRankingView = "current";
let amedasWindRankingKind = "average";
let activeWarningAreasByCode = new Map();
let activeWarningDetailsLoaded = false;
let warningAreaSelectionOptions = {};
let mobileRadarDockSliding = false;

const AMEDAS_RANKING_LIMIT = 20;

const legendsByTab = {
  amedas: [["観測地点", "legend-amedas"]],
  warnings: [
    ["特別警報", "legend-emergency"],
    ["危険警報", "legend-danger"],
    ["警報", "legend-warning"],
    ["注意報", "legend-advisory"]
  ],
  typhoon: [
    ["強風域 (15m/s以上)", "legend-typhoon-strong"],
    ["暴風域 (25m/s以上)", "legend-typhoon-storm"],
    ["暴風警戒域", "legend-typhoon-warning-area"],
    ["予報円", "legend-typhoon-forecast-circle"],
    ["予想進路中心線", "legend-typhoon-forecast-route"],
    ["過去の経路", "legend-typhoon-track"],
    ["中心位置", "legend-typhoon-center"]
  ],
  earthquake: [["震源", "legend-earthquake-center"]]
};

export function updateLeftPanel(tab, state = {}) {
  const amedasMetric = getAmedasMetric(state.amedasMetric ?? state.data?.activeMetric);
  const warningView = state.warningView ?? state.data?.activeWarningView ?? "status";
  const activeKikikuruLayer = state.activeKikikuruLayer ?? state.data?.activeKikikuruLayer ?? KIKIKURU_LAYER_OPTIONS[0]?.id;
  setText("mode-label", tab.id === "radar" && state.weatherChartEnabled ? "天気図" : tab.label);
  setText("panel-title", buildPanelTitle(tab, state));
  setPanelTitleVisible(false);
  setText("panel-description", buildDescription(tab, state));
  setText("panel-time", buildTimeText(state));
  setPanelTimeVisible(tab.id !== "radar" && tab.id !== "typhoon" && tab.id !== "earthquake");
  renderCurrentLocationCard(tab, state.currentLocation);
  renderRadarOverlayTabs(tab, state.weatherChartEnabled, state.weatherChartStatus, state.weatherChart ?? state.data?.weatherChart);
  renderKikikuruLayerTabs(tab, warningView, activeKikikuruLayer);
  renderAmedasSubTabs(tab, amedasMetric.id);
  renderRadarControls(tab, state);
  renderWeatherChartControls(tab, state.weatherChartEnabled, state.weatherChartStatus, state.weatherChart ?? state.data?.weatherChart);
  renderLocationInsights(tab, state.locationInsights, state.myAreas);
  renderWarningDetails(tab, state, warningView);
  renderTyphoonSelector(tab, state);
  renderTyphoonDetails(tab, state);
  renderEarthquakeList(tab, state);
  renderEarthquakeDetails(tab, state);
  renderAmedasDailyChart(tab, state, amedasMetric);
  renderAmedasRanking(tab, state, amedasMetric);
  renderMobileContextDock(tab, state, { amedasMetric, warningView });
  renderLegend(tab.id, amedasMetric.id, warningView);
}

export function setupAmedasSubTabs({ onChange }) {
  const buttons = [...document.querySelectorAll(".amedas-sub-button")];
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const metricId = button.dataset.amedasMetric;
      buttons.forEach((item) => item.classList.toggle("active", item === button));
      onChange?.(metricId);
    });
  });

  document.getElementById("mobile-context-dock")?.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-mobile-amedas-metric]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    onChange?.(button.dataset.mobileAmedasMetric);
  });
}

export function setupAmedasRankingToggle({ onChange, onSelectStation } = {}) {
  const root = document.getElementById("amedas-ranking");
  if (!root) return;
  let dragState = null;
  let suppressClickUntil = 0;

  const getSliderButtons = (slider) => [...slider.querySelectorAll("button")];
  const getSliderButtonAtPoint = (slider, clientX) => {
    const buttons = getSliderButtons(slider);
    if (!buttons.length) return null;
    const rect = slider.getBoundingClientRect();
    const ratio = (clientX - rect.left) / Math.max(1, rect.width);
    const index = Math.min(buttons.length - 1, Math.max(0, Math.floor(ratio * buttons.length)));
    return buttons[index] ?? null;
  };
  const resetRankingSlider = (slider) => {
    slider.classList.remove("is-dragging");
    slider.style.setProperty("--ranking-drag-x", "0px");
  };

  root.addEventListener("click", (event) => {
    if (Date.now() < suppressClickUntil) return;
    if (!(event.target instanceof Element)) return;
    const temperaturePeriodButton = event.target.closest("[data-amedas-temperature-ranking-period]");
    if (temperaturePeriodButton) {
      const period = temperaturePeriodButton.dataset.amedasTemperatureRankingPeriod;
      if (period !== "current" && period !== "daily") return;
      amedasTemperatureRankingView = period === "current" ? "current" : "maximum";
      onChange?.();
      return;
    }
    const viewButton = event.target.closest("[data-amedas-ranking-view]");
    if (viewButton) {
      const view = viewButton.dataset.amedasRankingView;
      if (!new Set(["current", "maximum", "minimum"]).has(view)) return;
      amedasTemperatureRankingView = view;
      onChange?.();
      return;
    }
    const windViewButton = event.target.closest("[data-amedas-wind-ranking-view]");
    if (windViewButton) {
      const view = windViewButton.dataset.amedasWindRankingView;
      if (view !== "current" && view !== "daily") return;
      amedasWindRankingView = view;
      if (view === "current") amedasWindRankingKind = "average";
      onChange?.();
      return;
    }
    const windKindButton = event.target.closest("[data-amedas-wind-ranking-kind]");
    if (windKindButton) {
      const kind = windKindButton.dataset.amedasWindRankingKind;
      if (kind !== "average" && kind !== "gust") return;
      if (kind === "gust" && amedasWindRankingView === "current") return;
      amedasWindRankingKind = kind;
      onChange?.();
      return;
    }
    const button = event.target.closest("[data-amedas-ranking-order]");
    if (button) {
      const order = button.dataset.amedasRankingOrder;
      if (order !== "top" && order !== "bottom") return;
      amedasRankingOrder = order;
      onChange?.();
      return;
    }

    const stationButton = event.target.closest("[data-amedas-station-id]");
    if (!stationButton) return;
    onSelectStation?.(stationButton.dataset.amedasStationId);
  });

  root.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof Element)) return;
    const slider = event.target.closest(".amedas-ranking-slider");
    if (!slider || !root.contains(slider)) return;
    const activeButton = getSliderButtons(slider).find((button) => button.classList.contains("active"));
    dragState = {
      pointerId: event.pointerId,
      slider,
      startX: event.clientX,
      moved: false,
      activeLeft: activeButton?.offsetLeft ?? 0
    };
    slider.classList.add("is-dragging");
    slider.setPointerCapture?.(event.pointerId);
  });

  root.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const delta = event.clientX - dragState.startX;
    if (Math.abs(delta) > 6) dragState.moved = true;
    if (!dragState.moved) return;
    event.preventDefault();
    const buttons = getSliderButtons(dragState.slider);
    const activeButton = buttons.find((button) => button.classList.contains("active"));
    const indicatorWidth = activeButton?.offsetWidth ?? 0;
    const firstButton = buttons[0];
    const lastButton = buttons.at(-1);
    const trackStart = firstButton?.offsetLeft ?? 0;
    const trackEnd = (lastButton?.offsetLeft ?? 0) + (lastButton?.offsetWidth ?? 0);
    const minDelta = trackStart - dragState.activeLeft;
    const maxDelta = Math.max(minDelta, trackEnd - indicatorWidth - dragState.activeLeft);
    dragState.slider.style.setProperty("--ranking-drag-x", `${Math.min(maxDelta, Math.max(minDelta, delta))}px`);
  });

  const finishRankingSliderDrag = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const { slider, moved } = dragState;
    slider.releasePointerCapture?.(event.pointerId);
    dragState = null;
    if (moved) {
      const targetButton = getSliderButtonAtPoint(slider, event.clientX);
      resetRankingSlider(slider);
      if (targetButton && !targetButton.disabled) targetButton.click();
      suppressClickUntil = Date.now() + 250;
      return;
    }
    resetRankingSlider(slider);
  };

  root.addEventListener("pointerup", finishRankingSliderDrag);
  root.addEventListener("pointercancel", finishRankingSliderDrag);
}

export function setupMobileDockSegmentedControls() {
  const root = document.getElementById("mobile-context-dock");
  if (!root) return;
  let dragState = null;
  let suppressClickUntil = 0;
  let pendingFrame = 0;
  let pendingOffset = 0;

  const getButtons = (segment) => [...segment.querySelectorAll("button")];
  const setDragOffset = (segment, offset) => {
    segment.style.setProperty("--mobile-dock-drag-x", `${offset}px`);
  };
  const getButtonAtPoint = (segment, clientX) => {
    const buttons = getButtons(segment);
    return buttons.reduce((nearest, button) => {
      const rect = button.getBoundingClientRect();
      const distance = Math.abs(clientX - (rect.left + rect.width / 2));
      return !nearest || distance < nearest.distance ? { button, distance } : nearest;
    }, null)?.button ?? null;
  };

  root.addEventListener("click", (event) => {
    if (Date.now() >= suppressClickUntil) return;
    if (!(event.target instanceof Element) || !event.target.closest(".mobile-dock-segmented")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  root.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof Element)) return;
    const segment = event.target.closest(".mobile-dock-segmented");
    if (!segment || !root.contains(segment)) return;
    const buttons = getButtons(segment);
    const activeButton = buttons.find((button) => button.classList.contains("active")) ?? buttons[0];
    if (!activeButton) return;
    syncMobileDockSegmentIndicator(segment);
    dragState = {
      pointerId: event.pointerId,
      segment,
      startX: event.clientX,
      activeLeft: activeButton.offsetLeft,
      activeWidth: activeButton.offsetWidth,
      moved: false
    };
    segment.classList.add("is-dragging");
    segment.setPointerCapture?.(event.pointerId);
  });

  root.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const delta = event.clientX - dragState.startX;
    if (Math.abs(delta) > 6) dragState.moved = true;
    if (!dragState.moved) return;
    event.preventDefault();
    event.stopPropagation();
    const buttons = getButtons(dragState.segment);
    const firstButton = buttons[0];
    const lastButton = buttons.at(-1);
    const minOffset = (firstButton?.offsetLeft ?? dragState.activeLeft) - dragState.activeLeft;
    const maxOffset = Math.max(
      minOffset,
      (lastButton?.offsetLeft ?? dragState.activeLeft) + (lastButton?.offsetWidth ?? dragState.activeWidth)
        - dragState.activeWidth - dragState.activeLeft
    );
    const nextOffset = Math.min(maxOffset, Math.max(minOffset, delta));
    const segment = dragState.segment;
    pendingOffset = nextOffset;
    if (pendingFrame) return;
    pendingFrame = window.requestAnimationFrame(() => {
      setDragOffset(segment, pendingOffset);
      pendingFrame = 0;
    });
  });

  const finishDrag = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const { segment, moved } = dragState;
    if (pendingFrame) {
      window.cancelAnimationFrame(pendingFrame);
      pendingFrame = 0;
      setDragOffset(segment, pendingOffset);
    }
    segment.releasePointerCapture?.(event.pointerId);
    segment.classList.remove("is-dragging");
    dragState = null;
    if (moved) {
      event.preventDefault();
      event.stopPropagation();
      const targetButton = getButtonAtPoint(segment, event.clientX);
      if (targetButton && !targetButton.disabled) targetButton.click();
      suppressClickUntil = Date.now() + 250;
    }
    window.requestAnimationFrame(() => syncMobileDockSegmentIndicators(root));
  };

  root.addEventListener("pointerup", finishDrag);
  root.addEventListener("pointercancel", finishDrag);
  window.addEventListener("resize", () => window.requestAnimationFrame(() => syncMobileDockSegmentIndicators(root)));
  syncMobileDockSegmentIndicators(root);
}

export function setupKikikuruLayerToggles({ onChange }) {
  const handleClick = (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-kikikuru-layer]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onChange?.(button.dataset.kikikuruLayer);
  };

  document.getElementById("kikikuru-layer-tabs")?.addEventListener("click", handleClick);
  document.getElementById("mobile-context-dock")?.addEventListener("click", handleClick);
}
export function setupRadarControls({ onSeek, onStep, onTogglePlay, onGoLatest }) {
  document.getElementById("radar-time-slider")?.addEventListener("input", (event) => {
    onSeek?.(Number(event.currentTarget.value));
  });
  document.getElementById("radar-prev")?.addEventListener("click", () => onStep?.(-1));
  document.getElementById("radar-next")?.addEventListener("click", () => onStep?.(1));
  document.getElementById("radar-play")?.addEventListener("click", () => onTogglePlay?.());
  document.getElementById("radar-now")?.addEventListener("click", () => onGoLatest?.());

  const mobileDock = document.getElementById("mobile-context-dock");
  let activeMobileSlider = null;
  let activeMobileSliderValue = null;
  const previewMobileSlider = (slider, clientX) => {
    const rect = slider.getBoundingClientRect();
    if (!rect.width) return null;
    const min = Number(slider.min) || 0;
    const max = Number(slider.max) || 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const value = Math.round(min + (max - min) * ratio);
    slider.value = String(value);
    updateMobileRadarSliderProgress(slider);
    updateMobileRadarSliderLabel(slider, value);
    activeMobileSliderValue = value;
    onSeek?.(value);
    return value;
  };

  mobileDock?.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (!event.target.matches("[data-mobile-radar-slider]")) return;
    activeMobileSlider = event.target;
    activeMobileSliderValue = Number(activeMobileSlider.value) || 0;
    mobileRadarDockSliding = true;
    event.preventDefault();
    event.stopPropagation();
    activeMobileSlider.setPointerCapture?.(event.pointerId);
    previewMobileSlider(activeMobileSlider, event.clientX);
  });

  mobileDock?.addEventListener("pointermove", (event) => {
    if (!activeMobileSlider) return;
    event.preventDefault();
    event.stopPropagation();
    previewMobileSlider(activeMobileSlider, event.clientX);
  });

  const finishMobileSlider = (event) => {
    if (!activeMobileSlider) return;
    event.preventDefault();
    event.stopPropagation();
    const value = activeMobileSliderValue;
    activeMobileSlider.releasePointerCapture?.(event.pointerId);
    activeMobileSlider = null;
    activeMobileSliderValue = null;
    mobileRadarDockSliding = false;
    if (Number.isFinite(value)) onSeek?.(value);
  };

  mobileDock?.addEventListener("pointerup", finishMobileSlider);
  mobileDock?.addEventListener("pointercancel", finishMobileSlider);

  mobileDock?.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (!event.target.matches("[data-mobile-radar-slider]")) return;
    updateMobileRadarSliderProgress(event.target);
    updateMobileRadarSliderLabel(event.target, Number(event.target.value));
    onSeek?.(Number(event.target.value));
  });
}

export function setupRadarOverlayToggle({ onChange }) {
  const handleClick = (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-radar-overlay]");
    if (!button) return;
    event.stopPropagation();
    onChange?.(button.dataset.radarOverlay);
  };

  document.getElementById("radar-overlay-tabs")?.addEventListener("click", handleClick);
  document.getElementById("mobile-context-dock")?.addEventListener("click", handleClick);
}
export function setupWeatherChartControls({ onSeek, onPreview, onStep, onGoLatest }) {
  const root = document.getElementById("weather-chart-controls");
  if (!root) return;

  const mobileDock = document.getElementById("mobile-context-dock");
  const sliderRoots = [root, mobileDock].filter(Boolean);
  let draggingSlider = null;
  let previewedSliderValue = null;
  const isWeatherChartSlider = (slider) => slider?.id === "weather-chart-time-slider" || slider?.matches?.("[data-mobile-weather-chart-slider]");
  const commitSlider = (slider) => {
    if (!isWeatherChartSlider(slider)) return;
    onSeek?.(Number(slider.value));
  };
  const previewSlider = (slider) => {
    if (!isWeatherChartSlider(slider)) return;
    const value = Number(slider.value);
    if (previewedSliderValue === value) return;
    previewedSliderValue = value;
    if (slider.matches?.("[data-mobile-weather-chart-slider]")) updateMobileWeatherChartSliderPreview(slider);
    else updateWeatherChartSliderPreview(slider);
    onPreview?.(value);
  };
  const updateSliderFromPointer = (slider, event) => {
    const rect = slider.getBoundingClientRect();
    if (!rect.width) return;
    const min = Number(slider.min) || 0;
    const max = Number(slider.max) || 0;
    const step = Number(slider.step) || 1;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const rawValue = min + (max - min) * ratio;
    const steppedValue = Math.round((rawValue - min) / step) * step + min;
    slider.value = String(Math.max(min, Math.min(max, steppedValue)));
  };

  const handlePointerDown = (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (!isWeatherChartSlider(event.target)) return;
    draggingSlider = event.target;
    previewedSliderValue = null;
    updateSliderFromPointer(event.target, event);
    previewSlider(event.target);
    event.target.setPointerCapture?.(event.pointerId);
  };

  const handleInput = (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (!isWeatherChartSlider(event.target)) return;
    previewSlider(event.target);
    if (draggingSlider !== event.target) commitSlider(event.target);
  };

  const handlePointerMove = (event) => {
    if (!draggingSlider) return;
    updateSliderFromPointer(draggingSlider, event);
    previewSlider(draggingSlider);
  };

  const handleChange = (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    commitSlider(event.target);
  };

  const handlePointerUp = () => {
    previewSlider(draggingSlider);
    commitSlider(draggingSlider);
    draggingSlider = null;
    previewedSliderValue = null;
  };

  const handlePointerCancel = () => {
    draggingSlider = null;
    previewedSliderValue = null;
  };

  sliderRoots.forEach((element) => {
    element.addEventListener("pointerdown", handlePointerDown);
    element.addEventListener("input", handleInput);
    element.addEventListener("pointermove", handlePointerMove);
    element.addEventListener("change", handleChange);
    element.addEventListener("pointerup", handlePointerUp);
    element.addEventListener("pointercancel", handlePointerCancel);
  });

  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-weather-chart-action]");
    if (!button) return;
    const action = button.dataset.weatherChartAction;
    if (action === "prev") onStep?.(-1);
    if (action === "next") onStep?.(1);
    if (action === "latest") onGoLatest?.();
  });
}
export function setupTyphoonSelector({ onChange }) {
  const handleClick = (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-typhoon-id]");
    if (!button) return;
    event.stopPropagation();
    onChange?.(button.dataset.typhoonId);
  };

  document.getElementById("typhoon-selector")?.addEventListener("click", handleClick);
  document.getElementById("mobile-context-dock")?.addEventListener("click", handleClick);
}

export function setupEarthquakeSelector({ onChange }) {
  const root = document.getElementById("earthquake-list");
  if (!root) return;

  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-earthquake-id]");
    if (!button) return;
    onChange?.(button.dataset.earthquakeId);
  });
}

function buildDescription(tab, state) {
  if (tab.id === "amedas") {
    const metric = getAmedasMetric(state.amedasMetric ?? state.data?.activeMetric);
    if (state.status === "loading") return `${metric.label}データを取得中です。`;
    if (state.status === "error") return `${metric.label}データを取得できませんでした。`;
    const count = countAmedasPoints(state.data, metric.id);
    return `アメダス観測地点の${metric.label}を表示しています。${count > 0 ? `\n表示地点: ${count}地点` : ""}`;
  }
  if (tab.id === "warnings") {
    if (state.status === "loading") return "市区町村ごとの警報・注意報を取得中です。";
    if (state.status === "error") return "警報・注意報データを取得できませんでした。";
    if (state.data?.activeWarningView === "kikikuru") {
      if (state.data?.kikikuru?.deferred) return "キキクルのタイルを取得中です。";
      if (state.data?.kikikuru?.unavailable) return "キキクルのタイルを取得できませんでした。";
      const layerLabel = KIKIKURU_LAYER_OPTIONS.find((element) => element.id === state.data?.activeKikikuruLayer)?.label ?? "キキクル";
      return `${layerLabel}を地図上に重ねて表示しています。`;
    }
    if (state.data?.activeWarningView === "early") {
      return "早期注意情報（警報級の可能性）を発表区域ごとに表示しています。";
    }
    return "都道府県ごとに、市区町村の注意報・警報・危険警報・特別警報を表示しています。";
  }
  if (tab.id === "typhoon") {
    if (state.status === "loading") return "台風データを取得中です。";
    if (state.status === "error") return "台風データを取得できませんでした。";
    if (state.data?.isPastTelegram) return "提供された過去実電文の台風解析・予報情報を表示しています。";
    if (state.data?.hasTyphoon === false) return "";
    if (state.data?.unavailable) return "台風データを取得できませんでした。詳細項目は未取得として表示しています。";
    return "台風の解析値を表示しています。";
  }
  if (tab.id === "earthquake") {
    if (state.status === "loading") return "気象庁XMLの地震情報を取得中です。";
    if (state.status === "error") return "地震情報を取得できませんでした。";
    const count = state.data?.earthquakes?.length ?? 0;
    return count > 0 ? "" : "直近の地震情報はありません。";
  }
  if (tab.id === "radar" && state.weatherChartEnabled) {
    if (state.weatherChartStatus === "loading") return "天気図データを取得中です。";
    if (state.weatherChartStatus === "error") return "天気図データを取得できませんでした。";
    return "気象庁の天気図を地図上に重ねています。";
  }
  if (state.status === "loading") return `${tab.description}\nデータを取得中です。`;
  if (state.status === "error") return `${tab.description}\n取得に失敗しました。CORSまたはURL変更の可能性があります。`;
  return tab.description;
}

function buildPanelTitle(tab, state) {
  if (tab.id !== "typhoon") return tab.title;
  if (state.status === "loading") return "台風データ取得中";
  const name = state.data?.details?.name;
  return name && name !== "未取得" ? name : "台風名 未取得";
}

function buildTimeText(state) {
  if (state.status === "loading") return "更新時刻を取得中...";
  if (state.status === "error") return "更新時刻: 取得失敗";
  if (state.data?.hasTyphoon === false) return "更新時刻: --";
  if (state.data?.activeWarningView === "kikikuru") {
    const value = state.data?.kikikuru?.latestTime;
    return value ? `更新時刻: ${value}` : "更新時刻: 未取得";
  }
  if (state.data?.activeWarningView === "early") {
    const value = state.data?.earlyWarnings?.latestTime ?? state.data?.earlyWarnings?.updatedAt;
    return value ? `更新時刻: ${value}` : "更新時刻: 未取得";
  }
  const value = state.data?.latestTime ?? state.data?.updatedAt ?? state.data?.summary;
  return value ? `更新時刻: ${value}` : "更新時刻: 未取得";
}

function renderLocationInsights(tab, insights, myAreas = []) {
  const radarRoot = document.getElementById("radar-location-insight-panel");
  const warningRoot = document.getElementById("warning-location-insight-panel");
  hideLocationInsight(radarRoot);
  hideLocationInsight(warningRoot);

  if (!insights || !["radar", "warnings"].includes(tab.id)) {
    return;
  }

  if (tab.id === "radar") {
    renderRadarLocationInsight(radarRoot, insights);
    return;
  }

  renderMyAreaWarningInsight(warningRoot, insights, myAreas);
}

function hideLocationInsight(root) {
  if (!root) return;
  root.hidden = true;
  root.innerHTML = "";
}

function renderRadarLocationInsight(root, insights) {
  const current = insights.currentLocation;
  const timeline = insights.timeline ?? {};
  if (!current && timeline.status !== "loading") {
    root.hidden = true;
    root.innerHTML = "";
    return;
  }

  root.hidden = false;
  root.className = "location-insight-panel location-insight-radar";

  if (timeline.status === "loading") {
    root.innerHTML = `
      <div class="location-insight-head">
        <span>現在地の雨雲</span>
        <strong>読み取り中</strong>
      </div>
      <p>${escapeHtml(timeline.message ?? "現在地直下の雨雲を読み取っています。")}</p>
    `;
    return;
  }

  if (timeline.status !== "ready" || !timeline.points?.length) {
    root.innerHTML = `
      <div class="location-insight-head">
        <span>現在地の雨雲</span>
        <strong>未取得</strong>
      </div>
      <p>${escapeHtml(timeline.message ?? "現在地の雨雲時系列を表示できません。")}</p>
    `;
    return;
  }

  const message = timeline.message ? `<p>${escapeHtml(timeline.message)}</p>` : "";
  root.innerHTML = `
    <div class="location-radar-timeline" aria-label="現在地の雨雲時系列">
      ${timeline.points.map((point) => `
        <span
          class="location-radar-point${point.isForecast ? " forecast" : ""}${point.intensity > 0 ? " rainy" : ""}"
          title="${escapeHtml([point.label, point.levelLabel || "降水なし"].filter(Boolean).join(" "))}"
          style="--point-color: ${escapeHtml(point.color || "rgba(255,255,255,0.18)")};"
        ></span>
      `).join("")}
    </div>
    ${message}
  `;
}

function renderMyAreaWarningInsight(root, insights, myAreas = []) {
  const areas = insights.areas ?? [];
  const activeAreas = areas.filter((area) => area.hasWarnings);
  if (!myAreas.length || !activeAreas.length) {
    root.hidden = true;
    root.innerHTML = "";
    return;
  }

  root.hidden = false;
  root.className = "location-insight-panel location-insight-my-areas";
  root.innerHTML = `
    <div class="location-insight-head">
      <span>マイエリア</span>
      <strong>${activeAreas.length}件</strong>
    </div>
    <div class="location-my-area-list">
      ${activeAreas.map((area) => `
        <article class="location-my-area-item">
          <div>
            <strong>${escapeHtml(area.areaName)}</strong>
            <span>${escapeHtml(area.prefecture ?? "")}</span>
          </div>
          <div class="location-my-area-badges">
            ${(area.warnings ?? []).slice(0, 4).map((warning) =>
              `<span class="warning-badge warning-badge-${escapeHtml(warning.level)}">${escapeHtml(warning.label)}</span>`
            ).join("")}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderLegend(tabId, amedasMetricId, warningView = "status") {
  const root = document.getElementById("legend-list");
  if (!root) return;
  const items = buildLegendItems(tabId, amedasMetricId, warningView);

  root.innerHTML = items
    .map(([label, className, color]) => {
      const swatchStyle = color ? ` style="background:${escapeHtml(color)}"` : "";
      return `<div class="legend-item"><span class="legend-swatch ${className}"${swatchStyle}></span>${escapeHtml(label)}</div>`;
    })
    .join("");

  if (tabId === "typhoon") {
    root.insertAdjacentHTML("beforeend", `
      <div class="legend-note">
        ※白い点線は予報円と予想進路中心線、白い×は中心位置
      </div>
    `);
  }
}

function buildLegendItems(tabId, amedasMetricId, warningView = "status") {
  if (tabId === "radar") {
    return AMEDAS_PRECIPITATION_LEVELS.map((level) => [level.label, "", level.color]);
  }
  if (tabId === "amedas") {
    return getAmedasLevels(amedasMetricId).map((level) => [level.label, "", level.color]);
  }
  if (tabId === "warnings" && warningView === "kikikuru") {
    return KIKIKURU_LEVELS.map((level) => [level.label, "", level.color]);
  }
  if (tabId === "warnings" && warningView === "early") {
    return [
      ["高", "legend-early-high"],
      ["中", "legend-early-middle"]
    ];
  }
  if (tabId === "earthquake") {
    return [
      ...legendsByTab.earthquake,
      ...EARTHQUAKE_INTENSITY_LEVELS.map((level) => [level.label, "", level.color])
    ];
  }
  return legendsByTab[tabId] ?? [];
}

function renderKikikuruLayerTabs() {
  const root = document.getElementById("kikikuru-layer-tabs");
  if (!root) return;
  root.hidden = true;
  root.innerHTML = "";
}

function renderRadarOverlayTabs() {
  const root = document.getElementById("radar-overlay-tabs");
  if (!root) return;
  root.hidden = true;
  root.innerHTML = "";
}
function renderAmedasSubTabs(tab, activeMetricId) {
  const root = document.getElementById("amedas-sub-tabs");
  if (!root) return;

  const isAmedas = tab.id === "amedas";
  root.hidden = !isAmedas;
  if (!isAmedas) return;

  [...root.querySelectorAll(".amedas-sub-button")].forEach((button) => {
    button.classList.toggle("active", button.dataset.amedasMetric === activeMetricId);
  });
}

function renderRadarControls(tab, state) {
  const root = document.getElementById("radar-time-controls");
  const slider = document.getElementById("radar-time-slider");
  const label = document.getElementById("radar-time-label");
  const kind = document.getElementById("radar-time-kind");
  if (!root || !slider || !label || !kind) return;

  const isRadar = tab.id === "radar";
  root.hidden = !isRadar;
  root.classList.toggle("weather-chart-active", isRadar && Boolean(state.weatherChartEnabled));
  if (!isRadar) return;
  if (state.weatherChartEnabled) return;

  const frames = state.data?.frames ?? [];
  const activeIndex = Number(state.data?.activeFrameIndex ?? 0);
  const activeFrame = frames[activeIndex] ?? null;

  slider.max = String(Math.max(0, frames.length - 1));
  slider.value = String(Math.min(activeIndex, Math.max(0, frames.length - 1)));
  slider.disabled = frames.length <= 1 || state.status === "loading" || state.status === "error";
  slider.style.background = buildSliderBackground(activeIndex, frames.length);

  label.textContent = activeFrame?.label
    ? `更新時刻: ${activeFrame.label}`
    : (state.status === "loading" ? "更新時刻: 取得中" : "更新時刻: --");
  kind.textContent = activeFrame?.isForecast ? "予測" : "観測";
  kind.classList.toggle("forecast", Boolean(activeFrame?.isForecast));

  document.getElementById("radar-play")?.classList.toggle("playing", Boolean(state.radarPlaying));
  const playButton = document.getElementById("radar-play");
  if (playButton) playButton.textContent = state.radarPlaying ? "停止" : "再生";
}

function renderWeatherChartControls(tab, enabled = false, status = "idle", weatherChart = null) {
  const root = document.getElementById("weather-chart-controls");
  if (!root) return;

  const shouldShow = tab.id === "radar" && enabled;
  root.hidden = !shouldShow;
  if (!shouldShow) {
    root.innerHTML = "";
    return;
  }

  const frames = Array.isArray(weatherChart?.frames)
    ? weatherChart.frames
    : (weatherChart?.featureCount > 0 ? [weatherChart] : []);
  const activeIndex = clampIndex(weatherChart?.activeFrameIndex ?? 0, frames.length);
  const activeFrame = frames[activeIndex] ?? weatherChart?.activeFrame ?? weatherChart;

  if (status === "loading" && !frames.length) {
    root.innerHTML = `
      <div class="weather-chart-status">
        <span class="weather-chart-kind">天気図</span>
        <strong>取得中</strong>
      </div>
    `;
    return;
  }

  if (status === "error" && !frames.length) {
    root.innerHTML = `
      <div class="weather-chart-status weather-chart-status-error">
        <span class="weather-chart-kind">天気図</span>
        <strong>取得失敗</strong>
      </div>
    `;
    return;
  }

  if (!frames.length) {
    root.innerHTML = `
      <div class="weather-chart-status">
        <span class="weather-chart-kind">天気図</span>
        <strong>未取得</strong>
      </div>
    `;
    return;
  }

  const timeText = activeFrame?.latestTime ? formatWarningTime(activeFrame.latestTime) : "--";
  const kindText = getWeatherChartFrameKindLabel(activeFrame);
  const frameMeta = frames.map((frame) => ({
    timeText: frame?.latestTime ? formatWarningTime(frame.latestTime) : "--",
    kindText: getWeatherChartFrameKindLabel(frame),
    isForecast: frame?.chartKind === "forecast"
  }));

  root.innerHTML = `
    <div class="weather-chart-head">
      <span class="weather-chart-kind${activeFrame?.chartKind === "forecast" ? " forecast" : ""}">${escapeHtml(kindText)}</span>
      <strong>${escapeHtml(timeText)}</strong>
    </div>
    <input
      id="weather-chart-time-slider"
      class="radar-time-slider weather-chart-time-slider"
      type="range"
      min="0"
      max="${Math.max(0, frames.length - 1)}"
      value="${activeIndex}"
      ${frames.length <= 1 ? "disabled" : ""}
      data-frame-count="${frames.length}"
      data-frame-meta="${escapeHtml(JSON.stringify(frameMeta))}"
      style="background:${escapeHtml(buildSliderBackground(activeIndex, frames.length))};"
      aria-label="天気図の時刻を選択"
    />
    <div class="weather-chart-actions">
      <button class="radar-action-button" type="button" data-weather-chart-action="prev"${activeIndex <= 0 ? " disabled" : ""}>前</button>
      <button class="radar-action-button" type="button" data-weather-chart-action="latest">最新</button>
      <button class="radar-action-button" type="button" data-weather-chart-action="next"${activeIndex >= frames.length - 1 ? " disabled" : ""}>次</button>
    </div>
  `;
}

function renderTyphoonSelector(tab, state) {
  const root = document.getElementById("typhoon-selector");
  if (!root) return;

  const typhoons = state.data?.typhoons ?? [];
  const shouldShow = tab.id === "typhoon" && state.status === "ok" && typhoons.length > 0;
  root.hidden = !shouldShow;
  if (!shouldShow) {
    root.innerHTML = "";
    return;
  }

  const { activeIndex, activeTyphoon } = getActiveTyphoonSelection(typhoons, state.data?.selectedTyphoonId);
  const nextIndex = typhoons.length > 1 ? (activeIndex + 1) % typhoons.length : activeIndex;
  const nextTyphoon = typhoons[nextIndex] ?? activeTyphoon;
  const nextId = String(nextTyphoon?.id ?? `typhoon-${nextIndex}`);
  const name = activeTyphoon.details?.name ?? activeTyphoon.name ?? `台風 ${activeIndex + 1}`;
  const time = activeTyphoon.updatedAt ? `<span>${escapeHtml(activeTyphoon.updatedAt)}</span>` : "";
  const count = typhoons.length > 1 ? `<em>${activeIndex + 1}/${typhoons.length}</em>` : "";
  const nextName = nextTyphoon?.details?.name ?? nextTyphoon?.name ?? `台風 ${nextIndex + 1}`;
  root.innerHTML = `
    <button
      type="button"
      class="typhoon-select-button active typhoon-select-button-cycle"
      data-typhoon-id="${escapeHtml(nextId)}"
      aria-label="${escapeHtml(typhoons.length > 1 ? `次の台風 ${nextName} に切り替え` : `${name} を表示`)}"
    >
      <div class="typhoon-select-text">
        <strong>${escapeHtml(name)}</strong>
        ${time}
      </div>
      ${count}
    </button>
  `;
}

export function setupWarningAreaSelection(options = {}) {
  warningAreaSelectionOptions = options;
  const root = document.getElementById("warning-detail-list");
  if (!root) return;

  document.getElementById("sidebar")?.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-current-location-area-code]");
    if (!button?.dataset.currentLocationAreaCode) return;
    selectWarningArea(button.dataset.currentLocationAreaCode, { scroll: true, openModal: true });
  });

  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const row = event.target.closest(".warning-area-row");
    if (!row?.dataset.warningAreaCode) return;
    selectWarningArea(row.dataset.warningAreaCode, { scroll: false, openModal: true });
  });

  window.addEventListener("weather-warning-area-select", (event) => {
    const areaCode = event.detail?.areaCode;
    if (areaCode) selectWarningArea(areaCode, { scroll: true, openModal: true });
  });

  document.getElementById("warning-modal")?.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-warning-modal-close]")) closeWarningModal();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeWarningModal();
  });
}

function selectWarningArea(areaCode, { scroll, openModal } = {}) {
  selectedWarningAreaCode = String(areaCode);
  const root = document.getElementById("warning-detail-list");
  if (!root || root.hidden) return;

  root.querySelectorAll(".warning-area-row.selected").forEach((row) => {
    row.classList.remove("selected");
  });

  const row = root.querySelector(`[data-warning-area-code="${cssEscape(selectedWarningAreaCode)}"]`);
  if (!row) {
    if (openModal && activeWarningAreasByCode.has(selectedWarningAreaCode)) {
      warningAreaSelectionOptions.onDetailRequest?.(selectedWarningAreaCode);
      openWarningModal(selectedWarningAreaCode);
    }
    return;
  }

  row.classList.add("selected");
  if (openModal) {
    warningAreaSelectionOptions.onDetailRequest?.(selectedWarningAreaCode);
    openWarningModal(selectedWarningAreaCode);
  }
  if (!scroll) return;

  const rootRect = root.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  root.scrollBy({
    top: rowRect.top - rootRect.top - root.clientHeight * 0.38,
    behavior: "smooth"
  });
}

function renderMobileContextDock(tab, state, context = {}) {
  const root = document.getElementById("mobile-context-dock");
  if (!root) return;

  root.hidden = false;
  if (mobileRadarDockSliding && tab.id === "radar" && root.dataset.tab === "radar") return;
  root.dataset.tab = tab.id;
  root.innerHTML = buildMobileContextDockContent(tab, state, context);
  initializeMobileDockSegmentIndicators(root);
}

function initializeMobileDockSegmentIndicators(root) {
  const segments = [...root.querySelectorAll(".mobile-dock-segmented")];
  segments.forEach((segment) => segment.classList.add("is-initializing"));
  syncMobileDockSegmentIndicators(root);
  window.requestAnimationFrame(() => {
    segments.forEach((segment) => segment.classList.remove("is-initializing"));
  });
}

function syncMobileDockSegmentIndicators(root) {
  root.querySelectorAll(".mobile-dock-segmented").forEach(syncMobileDockSegmentIndicator);
}

function syncMobileDockSegmentIndicator(segment) {
  const buttons = [...segment.querySelectorAll("button")];
  const activeButton = buttons.find((button) => button.classList.contains("active")) ?? buttons[0];
  if (!activeButton) return;
  segment.style.setProperty("--mobile-dock-indicator-x", `${activeButton.offsetLeft}px`);
  segment.style.setProperty("--mobile-dock-indicator-width", `${activeButton.offsetWidth}px`);
  segment.style.setProperty("--mobile-dock-drag-x", "0px");
}

function buildMobileContextDockContent(tab, state, { amedasMetric, warningView } = {}) {
  if (tab.id === "radar") {
    const frames = state.data?.frames ?? [];
    const index = clampIndex(Number(state.data?.activeFrameIndex ?? 0), frames.length);
    const frame = frames[index] ?? null;
    return buildRadarMobileContextMarkup(frames, index, state.status, state);
  }
  if (tab.id === "amedas") {
    const metric = amedasMetric ?? getAmedasMetric(state.amedasMetric ?? state.data?.activeMetric);
    const nearest = findNearestAmedasPoint(state.data, state.currentLocation, metric.id);
    const nearestText = nearest
      ? `${nearest.name} ${formatAmedasRankingValue(nearest.value, metric)}`
      : getAmedasNearestFallbackText(state.currentLocation);
    return `
      <div class="mobile-dock-content mobile-dock-amedas">
        <div class="mobile-dock-amedas-head">
          <span class="mobile-dock-kicker">アメダス</span>
          <span class="mobile-dock-amedas-nearest${nearest ? "" : " is-muted"}" title="${escapeHtml(nearestText)}">${escapeHtml(nearestText)}</span>
        </div>
        <div class="mobile-dock-chip-grid mobile-dock-amedas-grid mobile-dock-segmented">
          ${AMEDAS_METRICS.map((item) => `
            <button type="button" class="mobile-dock-chip${item.id === metric.id ? " active" : ""}" data-mobile-dock-control data-mobile-amedas-metric="${escapeHtml(item.id)}" aria-pressed="${item.id === metric.id ? "true" : "false"}">${escapeHtml(item.label)}</button>
          `).join("")}
        </div>
      </div>
    `;
  }
  if (tab.id === "warnings") {
    const info = state.currentLocation;
    const warnings = warningView === "early" ? (info?.earlyWarnings ?? []) : (info?.warnings ?? []);
    const area = [info?.prefecture, info?.areaName].filter(Boolean).join(" ") || "現在地の発表状況";
    return buildWarningMobileContextMarkup({
      activeKikikuruLayer: state.data?.activeKikikuruLayer,
      area,
      isLoading: info?.status === "loading",
      warningView,
      warnings
    });
  }
  if (tab.id === "typhoon") {
    const typhoons = state.data?.typhoons ?? [];
    if (!typhoons.length || state.data?.hasTyphoon === false) return buildMobileContextMarkup("台風", NO_TYPHOON_MESSAGE, "発表なし");
    return buildTyphoonMobileContextMarkup(typhoons, state.data?.selectedTyphoonId);
  }
  if (tab.id === "earthquake") {
    const earthquakes = state.data?.earthquakes ?? [];
    const earthquake = state.data?.selectedEarthquake ?? earthquakes[0];
    if (!earthquake) return buildMobileContextMarkup("地震", "直近の地震情報はありません", "発表なし");
    return buildEarthquakeMobileContextMarkup(earthquake);
  }
  return buildMobileContextMarkup(tab.label ?? "情報", "詳細情報", "開く");
}

function buildTyphoonMobileContextMarkup(typhoons = [], selectedTyphoonId = "") {
  const { activeIndex, activeTyphoon } = getActiveTyphoonSelection(typhoons, selectedTyphoonId);
  const nextIndex = typhoons.length > 1 ? (activeIndex + 1) % typhoons.length : activeIndex;
  const nextTyphoon = typhoons[nextIndex] ?? activeTyphoon;
  const name = activeTyphoon?.details?.name ?? activeTyphoon?.name ?? `台風 ${activeIndex + 1}`;
  const nextName = nextTyphoon?.details?.name ?? nextTyphoon?.name ?? `台風 ${nextIndex + 1}`;
  const nextId = String(nextTyphoon?.id ?? `typhoon-${nextIndex}`);
  const pressure = normalizeSummaryValue(activeTyphoon?.details?.pressure);
  const maxGust = normalizeSummaryValue(activeTyphoon?.details?.maxGust);
  const count = typhoons.length > 1 ? `${activeIndex + 1}/${typhoons.length}` : "選択中";
  const switchButton = typhoons.length > 1
    ? `<button type="button" class="mobile-dock-typhoon-switch" data-mobile-dock-control data-typhoon-id="${escapeHtml(nextId)}" aria-label="${escapeHtml(`次の台風 ${nextName} に切り替え`)}">${escapeHtml(count)}</button>`
    : `<span class="mobile-dock-typhoon-switch is-static">${escapeHtml(count)}</span>`;

  return `
    <div class="mobile-dock-content mobile-dock-typhoon">
      <div class="mobile-dock-typhoon-head">
        <span class="mobile-dock-kicker">台風情報</span>
        ${switchButton}
      </div>
      <div class="mobile-dock-typhoon-main">
        <strong>${escapeHtml(name)}</strong>
        <div class="mobile-dock-typhoon-values" aria-label="台風の解析値">
          <span><em>気圧</em>${escapeHtml(pressure)}</span>
          <span><em>最大瞬間</em>${escapeHtml(maxGust)}</span>
        </div>
      </div>
    </div>
  `;
}

function normalizeSummaryValue(value) {
  const text = String(value ?? "").trim();
  return text && text !== "--" && text !== "-" ? text : "-";
}

function buildEarthquakeMobileContextMarkup(earthquake) {
  const intensityColor = getEarthquakeIntensityColor(earthquake.maxIntensity);
  const intensityTextClass = getEarthquakeIntensityTextClass(earthquake.maxIntensity);
  const intensity = earthquake.maxIntensityShort ?? earthquake.maxIntensityLabel ?? "--";
  const magnitude = formatEarthquakeMagnitude(earthquake.magnitude, { prefix: true });
  const depth = formatEarthquakeDepthText(earthquake.depth, { compact: true });
  const time = formatMobileEarthquakeTime(earthquake.eventTime ?? earthquake.reportTime);

  return `
    <div class="mobile-dock-content mobile-dock-earthquake" style="--mobile-earthquake-intensity-bg: ${escapeHtml(intensityColor)};">
      <div class="mobile-dock-earthquake-head">
        <span class="mobile-dock-kicker">最新地震</span>
        <span class="mobile-dock-earthquake-time">${escapeHtml(time)}</span>
      </div>
      <div class="mobile-dock-earthquake-main">
        <div class="mobile-dock-earthquake-text">
          <strong>${escapeHtml(earthquake.hypocenterName ?? "震源調査中")}</strong>
          <span>${escapeHtml([magnitude, `深さ ${depth}`].filter((item) => item && item !== "--").join(" / ") || "詳細確認中")}</span>
        </div>
        <em class="mobile-dock-earthquake-intensity ${intensityTextClass}">${escapeHtml(intensity)}</em>
      </div>
    </div>
  `;
}

function formatMobileEarthquakeTime(value) {
  const text = String(value ?? "").trim().replace(/頃$/u, "");
  if (!text || text === "--") return "--";
  const match = text.match(/(?:\d{4}\/)?(\d{1,2}\/\d{1,2})\s+(\d{1,2}:\d{2})/u);
  return match ? `${match[1]} ${match[2]}` : text;
}
function buildWarningMobileContextMarkup({ activeKikikuruLayer, area, isLoading, warningView, warnings }) {
  const topWarning = getPrimaryMobileWarning(warnings);
  const summaryText = isLoading ? "" : buildMobileWarningSummary(warnings);
  const statusText = isLoading ? "取得中" : (topWarning?.label ?? "発表なし");
  const level = topWarning?.level ?? "none";
  return `
    <div class="mobile-dock-content mobile-dock-warning">
      <div class="mobile-dock-warning-head">
        ${buildWarningMobileActionRow(warningView)}
      </div>
      ${warningView === "kikikuru"
        ? buildKikikuruMobileLayerRow(activeKikikuruLayer)
        : `<div class="mobile-dock-warning-main">
            <div class="mobile-dock-warning-text">
              <strong>${escapeHtml(isLoading ? "現在地を確認中" : area)}</strong>
              ${summaryText ? `<span>${escapeHtml(summaryText)}</span>` : ""}
            </div>
            <span class="mobile-dock-warning-badge mobile-dock-warning-badge-${escapeHtml(level)}">${escapeHtml(statusText)}</span>
          </div>`}
    </div>
  `;
}

function getPrimaryMobileWarning(warnings = []) {
  const rank = { emergency: 4, danger: 3, high: 3, warning: 2, middle: 2, advisory: 1 };
  return [...warnings].sort((a, b) => (rank[b?.level] ?? 0) - (rank[a?.level] ?? 0))[0] ?? null;
}
function buildWarningMobileActionRow(warningView) {
  const options = [
    { id: "status", label: "発表", active: warningView === "status" },
    { id: "early", label: "早期", active: warningView === "early" },
    { id: "kikikuru", label: "キキクル", active: warningView === "kikikuru" }
  ];
  return `
    <div class="mobile-dock-action-row mobile-dock-warning-actions mobile-dock-segmented">
      ${options.map((option) => `
        <button type="button" class="mobile-dock-action${option.active ? " active" : ""}" data-mobile-dock-control data-kikikuru-layer="${escapeHtml(option.id)}" aria-pressed="${option.active ? "true" : "false"}"${option.active ? " disabled" : ""}>${escapeHtml(option.label)}</button>
      `).join("")}
    </div>
  `;
}

function buildKikikuruMobileLayerRow(activeKikikuruLayer) {
  const options = KIKIKURU_LAYER_OPTIONS.map((option) => ({
    ...option,
    active: option.id === activeKikikuruLayer,
    shortLabel: option.label.replace("キキクル", "")
  }));
  return `
    <div class="mobile-dock-kikikuru-layers">
      <span class="mobile-dock-kikikuru-label">表示レイヤー</span>
      <div class="mobile-dock-action-row mobile-dock-kikikuru-actions mobile-dock-segmented">
        ${options.map((option) => `
          <button type="button" class="mobile-dock-action${option.active ? " active" : ""}" data-mobile-dock-control data-kikikuru-layer="${escapeHtml(option.id)}" aria-pressed="${option.active ? "true" : "false"}"${option.active ? " disabled" : ""}>${escapeHtml(option.shortLabel)}</button>
        `).join("")}
      </div>
    </div>
  `;
}
function buildMobileWarningSummary(warnings = []) {
  const labels = warnings
    .map((warning) => simplifyMobileWarningLabel(warning?.label))
    .filter(Boolean);
  const uniqueLabels = [...new Set(labels)];
  if (!uniqueLabels.length) return "";
  const visible = uniqueLabels.slice(0, 2).join("・");
  return uniqueLabels.length > 2 ? `${visible} 他${uniqueLabels.length - 2}` : visible;
}

function simplifyMobileWarningLabel(label = "") {
  return String(label)
    .replace(/^レベル\d+\s*/, "")
    .replace(/(特別警報|危険警報|警報|注意報)$/u, "")
    .trim();
}

function buildRadarMobileContextMarkup(frames, index, status, state = {}) {
  const weatherChartEnabled = Boolean(state.weatherChartEnabled);
  const weatherChartLoading = weatherChartEnabled && state.weatherChartStatus === "loading";
  const weatherChart = state.weatherChart ?? state.data?.weatherChart;
  const chartFrames = Array.isArray(weatherChart?.frames)
    ? weatherChart.frames
    : (weatherChart?.featureCount > 0 ? [weatherChart] : []);
  const chartIndex = clampIndex(weatherChart?.activeFrameIndex ?? 0, chartFrames.length);
  const chartFrame = chartFrames[chartIndex] ?? weatherChart?.activeFrame ?? weatherChart;

  const radarLength = frames.length;
  const radarFrame = frames[index] ?? null;
  const radarFrameMeta = frames.map((item) => ({
    title: item?.label ?? "--",
    meta: item?.isForecast ? "予測" : "観測"
  }));

  const chartFrameMeta = chartFrames.map((item) => ({
    title: item?.latestTime ? formatWarningTime(item.latestTime) : "--",
    meta: getWeatherChartFrameKindLabel(item)
  }));

  const isChartMode = weatherChartEnabled;
  const length = isChartMode ? chartFrames.length : radarLength;
  const activeIndex = isChartMode ? chartIndex : index;
  const title = isChartMode
    ? (chartFrame?.latestTime ? formatWarningTime(chartFrame.latestTime) : (weatherChartLoading ? "取得中" : "--"))
    : (radarFrame?.label ?? (status === "loading" ? "取得中" : "--"));
  const meta = isChartMode
    ? (chartFrame ? getWeatherChartFrameKindLabel(chartFrame) : "天気図")
    : (radarFrame?.isForecast ? "予測" : "観測");
  const frameMeta = isChartMode ? chartFrameMeta : radarFrameMeta;
  const progress = buildProgressPercent(activeIndex, length);
  const range = length > 1
    ? `<input type="range" class="mobile-dock-range mobile-dock-range-input" min="0" max="${length - 1}" value="${activeIndex}" data-mobile-dock-control ${isChartMode ? "data-mobile-weather-chart-slider" : "data-mobile-radar-slider"} data-frame-meta="${escapeHtml(JSON.stringify(frameMeta))}" aria-label="${isChartMode ? "天気図" : "雨雲レーダー"}時刻" style="--mobile-dock-progress:${escapeHtml(progress)}">`
    : `<div class="mobile-dock-range mobile-dock-range-placeholder" style="--mobile-dock-progress:${escapeHtml(progress)}"><span></span></div>`;

  return `
    <div class="mobile-dock-content mobile-dock-radar">
      <div class="mobile-dock-action-row mobile-dock-mode-switch mobile-dock-segmented">
        <button type="button" class="mobile-dock-action${weatherChartEnabled ? "" : " active"}" data-mobile-dock-control data-radar-overlay="weather-chart" aria-pressed="${weatherChartEnabled ? "false" : "true"}"${weatherChartEnabled ? "" : " disabled"}>雨雲レーダー</button>
        <button type="button" class="mobile-dock-action${weatherChartEnabled ? " active" : ""}${weatherChartLoading ? " loading" : ""}" data-mobile-dock-control data-radar-overlay="weather-chart" aria-pressed="${weatherChartEnabled ? "true" : "false"}"${weatherChartEnabled ? " disabled" : ""}>${escapeHtml(weatherChartLoading ? "取得中" : "天気図")}</button>
      </div>
      <div class="mobile-dock-row">
        <strong data-mobile-radar-title>${escapeHtml(title)}</strong>
        <span data-mobile-radar-meta>${escapeHtml(meta)}</span>
      </div>
      ${range}
    </div>
  `;
}
function updateMobileRadarSliderProgress(slider) {
  const min = Number(slider.min) || 0;
  const max = Number(slider.max) || 0;
  const value = Number(slider.value) || 0;
  const percent = max > min ? `${((value - min) / (max - min)) * 100}%` : "0%";
  slider.style.setProperty("--mobile-dock-progress", percent);
}

function updateMobileWeatherChartSliderPreview(slider) {
  updateMobileRadarSliderProgress(slider);
  const root = slider.closest("#mobile-context-dock");
  const title = root?.querySelector("[data-mobile-radar-title]");
  const meta = root?.querySelector("[data-mobile-radar-meta]");
  const frames = parseWeatherChartFrameMeta(slider.dataset.frameMeta);
  const frame = frames[clampIndex(Number(slider.value), frames.length)];
  if (!frame) return;
  if (title) title.textContent = frame.title || "--";
  if (meta) meta.textContent = frame.meta || "天気図";
}

function updateMobileRadarSliderLabel(slider, value) {
  const root = slider.closest("#mobile-context-dock");
  const title = root?.querySelector("[data-mobile-radar-title]");
  const meta = root?.querySelector("[data-mobile-radar-meta]");
  const frames = parseWeatherChartFrameMeta(slider.dataset.frameMeta);
  const frame = frames[clampIndex(value, frames.length)];
  if (!frame) return;
  if (title) title.textContent = frame.title || "--";
  if (meta) meta.textContent = frame.meta || "観測";
}
function buildMobileContextMarkup(kicker, title, meta = "", progress = "") {
  return `
    <div class="mobile-dock-content">
      <span class="mobile-dock-kicker">${escapeHtml(kicker)}</span>
      <div class="mobile-dock-row">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(meta)}</span>
      </div>
      ${progress ? `<div class="mobile-dock-range" style="--mobile-dock-progress:${escapeHtml(progress)}"><span></span></div>` : ""}
    </div>
  `;
}

function getActiveTyphoonSelection(typhoons = [], selectedTyphoonId = "") {
  const activeId = String(selectedTyphoonId ?? typhoons[0]?.id ?? "");
  const activeIndex = Math.max(0, typhoons.findIndex((typhoon, index) => {
    const id = String(typhoon.id ?? `typhoon-${index}`);
    return id === activeId;
  }));
  return {
    activeIndex,
    activeTyphoon: typhoons[activeIndex] ?? typhoons[0]
  };
}

function getAmedasMetric(metricId) {
  return AMEDAS_METRICS.find((item) => item.id === metricId) ?? AMEDAS_METRICS[0];
}

function countAmedasPoints(data = {}, metricId) {
  return (data.points ?? []).filter((point) => {
    const value = point.values?.[metricId];
    return shouldIncludeAmedasValue(metricId, value);
  }).length;
}

function findNearestAmedasPoint(data = {}, currentLocation, metricId) {
  const origin = normalizeCoordinatePair(currentLocation?.coordinates);
  if (!origin) return null;

  return (data.points ?? []).reduce((nearest, point) => {
    const coordinates = normalizeCoordinatePair(point.coordinates);
    const value = point.values?.[metricId];
    if (!coordinates || !Number.isFinite(value)) return nearest;

    const distanceKm = getDistanceKm(origin, coordinates);
    if (!Number.isFinite(distanceKm) || (nearest && nearest.distanceKm <= distanceKm)) return nearest;
    return {
      id: point.id,
      name: point.name ?? point.id ?? "観測点",
      value,
      distanceKm
    };
  }, null);
}

function getAmedasNearestFallbackText(currentLocation) {
  if (currentLocation?.status === "loading") return "現在地取得中";
  if (currentLocation?.status && currentLocation.status !== "found") return "現在地未取得";
  return "最寄り観測点なし";
}

function normalizeCoordinatePair(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return [longitude, latitude];
}

function getDistanceKm(from, to) {
  const toRadians = (value) => value * Math.PI / 180;
  const [fromLng, fromLat] = from;
  const [toLng, toLat] = to;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findLatestWeatherChartAnalysisIndex(frames) {
  const now = Date.now() + 5 * 60 * 1000;
  return frames.reduce((latestIndex, frame, index) => {
    const time = new Date(frame?.latestTime ?? frame?.targetTime ?? frame?.reportTime ?? "").getTime();
    if (frame?.chartKind === "forecast" || !Number.isFinite(time) || time > now) return latestIndex;
    return index;
  }, -1);
}

function getWeatherChartFrameKindLabel(frame) {
  if (frame?.chartKind === "forecast") {
    const hours = Number(frame.forecastHours);
    if (Number.isFinite(hours) && hours > 0) return `${hours}時間予想`;
    return "予想";
  }
  return "実況";
}

function clampIndex(index, length) {
  if (!length) return 0;
  return Math.max(0, Math.min(length - 1, Number(index) || 0));
}

function buildProgressPercent(index, length) {
  if (!length || length <= 1 || index < 0) return "0%";
  return `${Math.max(0, Math.min(100, (index / (length - 1)) * 100))}%`;
}

function updateWeatherChartSliderPreview(slider) {
  const activeIndex = Number(slider.value);
  const length = Number(slider.dataset.frameCount) || Number(slider.max) + 1;
  slider.style.background = buildSliderBackground(activeIndex, length);

  const meta = parseWeatherChartFrameMeta(slider.dataset.frameMeta);
  const activeMeta = meta[clampIndex(activeIndex, meta.length)];
  if (!activeMeta) return;

  const root = slider.closest("#weather-chart-controls");
  const kind = root?.querySelector(".weather-chart-head .weather-chart-kind");
  const time = root?.querySelector(".weather-chart-head strong");
  if (kind) {
    kind.textContent = activeMeta.kindText || "天気図";
    kind.classList.toggle("forecast", Boolean(activeMeta.isForecast));
  }
  if (time) time.textContent = activeMeta.timeText || "--";
}

function parseWeatherChartFrameMeta(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildSliderBackground(activeIndex, length) {
  const active = buildProgressPercent(activeIndex, length);
  const trackSize = "center / 100% 6px no-repeat";
  return `linear-gradient(to right,
    #51c2ff 0%, #65e0a7 ${active},
    rgba(255,255,255,0.16) ${active}, rgba(255,255,255,0.16) 100%) ${trackSize}`;
}

function renderCurrentLocationCard(tab, info) {
  const root = document.getElementById("current-location-card");
  if (!root) return;

  if (tab.id !== "warnings" || !info || info.status === "idle") {
    root.hidden = true;
    root.innerHTML = "";
    return;
  }

  root.hidden = false;
  root.className = `current-location-card current-location-card-${escapeHtml(info.status)}`;

  if (info.status === "loading") {
    root.innerHTML = `
      <span>現在地</span>
      <strong>${escapeHtml(info.message ?? "現在地を取得中です...")}</strong>
    `;
    return;
  }

  if (info.status === "error") {
    root.innerHTML = `
      <span>現在地</span>
      <strong>${escapeHtml(info.message ?? "現在地を取得できませんでした。")}</strong>
    `;
    return;
  }

  const warnings = info.warnings ?? [];
  const detailButton = info.areaCode && warnings.length > 0
    ? `<button type="button" data-current-location-area-code="${escapeHtml(info.areaCode)}">詳細</button>`
    : "";

  root.innerHTML = `
    <div class="current-location-head">
      <span>現在地</span>
      ${detailButton}
    </div>
    <strong>${escapeHtml([info.prefecture, info.areaName].filter(Boolean).join(" ")) || "現在地"}</strong>
    <p>${escapeHtml(info.message ?? "")}</p>
    ${info.updatedAt ? `<small>更新時刻: ${escapeHtml(formatWarningTime(info.updatedAt))}</small>` : ""}
    ${warnings.length > 0 ? `
      <div class="current-location-warnings">
        ${warnings.map((warning) => `
          <span class="warning-badge warning-badge-${escapeHtml(warning.level)}">${escapeHtml(warning.label)}</span>
        `).join("")}
      </div>
    ` : ""}
  `;
}

function renderWarningDetails(tab, state, warningView = "status") {
  const root = document.getElementById("warning-detail-list");
  if (!root) return;

  const isWarnings = tab.id === "warnings" && (warningView === "status" || warningView === "early");
  root.hidden = !isWarnings;
  if (!isWarnings) {
    root.innerHTML = "";
    activeWarningAreasByCode = new Map();
    activeWarningDetailsLoaded = false;
    closeWarningModal();
    return;
  }

  if (state.status === "loading") {
    root.innerHTML = `<div class="warning-empty">取得中...</div>`;
    activeWarningAreasByCode = new Map();
    activeWarningDetailsLoaded = false;
    return;
  }

  if (state.status === "error") {
    root.innerHTML = `<div class="warning-empty">取得失敗</div>`;
    activeWarningAreasByCode = new Map();
    activeWarningDetailsLoaded = false;
    return;
  }

  if (warningView === "early") {
    activeWarningDetailsLoaded = Boolean(state.data?.detailsLoaded);
    renderEarlyWarningDetails(root, state);
    return;
  }

  activeWarningDetailsLoaded = Boolean(state.data?.detailsLoaded);
  const groups = state.data?.groups ?? [];
  const outlookAreas = state.data?.outlookAreas ?? [];
  const activeAreaEntries = groups.flatMap((group) => group.areas.map((area) => [String(area.areaCode), area]));
  activeWarningAreasByCode = new Map([
    ...outlookAreas.map((area) => [String(area.areaCode), area]),
    ...activeAreaEntries
  ]);

  if (groups.length === 0) {
    root.innerHTML = `<div class="warning-empty">発表中の警報・注意報はありません</div>`;
    refreshOpenWarningModal();
    return;
  }

  root.innerHTML = groups.map((group) => `
    <div class="warning-prefecture-label">${escapeHtml(group.prefecture)}<span>${escapeHtml(group.count ?? group.areas.length)}件</span></div>
    ${group.areas.map((area) => `
      <article class="warning-area-row${String(area.areaCode) === selectedWarningAreaCode ? " selected" : ""}" data-warning-area-code="${escapeHtml(area.areaCode)}">
        <strong>${escapeHtml(area.areaName)}</strong>
        <div class="warning-badges">
          ${area.warnings.map((warning) => `
            <span class="warning-badge warning-badge-${escapeHtml(warning.level)}">${escapeHtml(warning.label)}</span>
          `).join("")}
        </div>
      </article>
    `).join("")}
  `).join("");
  refreshOpenWarningModal();
}

function renderEarlyWarningDetails(root, state) {
  const groups = state.data?.earlyWarnings?.groups ?? [];
  const areas = state.data?.earlyWarnings?.areas ?? [];
  const municipalityAreas = state.data?.earlyWarnings?.municipalityAreas ?? [];

  if (!state.data?.detailsLoaded) {
    root.innerHTML = `<div class="warning-empty">取得中...</div>`;
    activeWarningAreasByCode = new Map();
    activeWarningDetailsLoaded = false;
    return;
  }

  if (groups.length === 0) {
    root.innerHTML = `<div class="warning-empty">早期注意情報は発表されていません</div>`;
    activeWarningAreasByCode = new Map();
    refreshOpenWarningModal();
    return;
  }

  activeWarningAreasByCode = new Map([
    ...areas.map((area) => [String(area.areaCode), area]),
    ...municipalityAreas.map((area) => [String(area.areaCode), area])
  ]);

  root.innerHTML = groups.map((group) => `
    <div class="warning-prefecture-label">${escapeHtml(group.prefecture)}<span>${escapeHtml(group.count ?? group.areas.length)}件</span></div>
    ${group.areas.map((area) => `
      <article class="warning-area-row early-warning-row${String(area.areaCode) === selectedWarningAreaCode ? " selected" : ""}" data-warning-area-code="${escapeHtml(area.areaCode)}">
        <strong>${escapeHtml(area.areaName)}</strong>
        <div class="warning-badges">
          ${area.probabilities.map((probability) => `
            <span class="warning-badge early-warning-badge early-warning-badge-${escapeHtml(probability.level)}">${escapeHtml(formatEarlyProbabilityBadge(probability))}</span>
          `).join("")}
        </div>
      </article>
    `).join("")}
  `).join("");
  refreshOpenWarningModal();
}

function openWarningModal(areaCode) {
  const area = activeWarningAreasByCode.get(String(areaCode));
  const modal = document.getElementById("warning-modal");
  const content = document.getElementById("warning-modal-content");
  if (!area || !modal || !content) return;
  if (area.kind === "early") {
    openEarlyWarningModal(area, modal, content);
    return;
  }

  const warnings = area.warnings ?? [];
  const outlookRows = area.outlook ?? [];
  content.innerHTML = `
    <header class="warning-modal-head">
      <span>${escapeHtml(area.prefecture ?? "")}</span>
      <h2 id="warning-modal-title">${escapeHtml(area.areaName)}</h2>
      <p>更新時刻: ${escapeHtml(formatWarningTime(area.updatedAt))}</p>
    </header>
    <section class="warning-modal-section">
      <h3>発表中の警報・注意報</h3>
      <div class="warning-modal-warning-list">
        ${warnings.length === 0 ? `<p class="warning-modal-empty">発表中の警報・注意報はありません。</p>` : warnings.map((warning) => `
          <article class="warning-modal-warning">
            <span class="warning-badge warning-badge-${escapeHtml(warning.level)}">${escapeHtml(warning.label)}</span>
            <dl>
              <div><dt>更新時刻</dt><dd>${escapeHtml(formatWarningTime(warning.updatedAt))}</dd></div>
              ${warning.status ? `<div><dt>状態</dt><dd>${escapeHtml(warning.status)}</dd></div>` : ""}
            </dl>
          </article>
        `).join("")}
      </div>
    </section>
    <section class="warning-modal-section">
      <h3>今後の見通し</h3>
      ${buildWarningOutlookTable(outlookRows, { loading: !activeWarningDetailsLoaded })}
    </section>
  `;
  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function openEarlyWarningModal(area, modal, content) {
  content.innerHTML = `
    <header class="warning-modal-head">
      <span>${escapeHtml(area.prefecture ?? "")}</span>
      <h2 id="warning-modal-title">${escapeHtml(area.displayAreaName ?? area.areaName)}</h2>
      <p>更新時刻: ${escapeHtml(formatWarningTime(area.updatedAt))}</p>
    </header>
    <section class="warning-modal-section">
      <h3>早期注意情報（警報級の可能性）</h3>
      <div class="warning-modal-warning-list">
        <article class="warning-modal-warning">
          <div class="warning-badges">
            ${(area.probabilities ?? []).map((probability) => `
              <span class="warning-badge early-warning-badge early-warning-badge-${escapeHtml(probability.level)}">${escapeHtml(formatEarlyProbabilityBadge(probability))}</span>
            `).join("")}
          </div>
        </article>
      </div>
    </section>
    <section class="warning-modal-section">
      <h3>期間別の可能性</h3>
      ${buildWarningOutlookTable(area.rows ?? [])}
    </section>
  `;
  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function buildWarningOutlookTable(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<p class="warning-modal-empty">${options.loading ? "今後の見通しを取得中です。" : "今後の見通しはありません。"}</p>`;
  }

  const times = collectOutlookTableSlots(rows);
  return `
    <div class="warning-outlook-scroll">
      <table class="warning-outlook-table">
        <thead>
          <tr>
            <th>種別</th>
            ${times.map((slot) => `<th>${escapeHtml(formatOutlookTime(slot))}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <th>${escapeHtml(formatOutlookTypeLabel(row.type))}${row.localName ? `<span>${escapeHtml(row.localName)}</span>` : ""}</th>
              ${times.map((timeSlot) => findMatchingOutlookSlot(row.slots, timeSlot)).map((slot) => `
                <td class="warning-outlook-level-${escapeHtml(slot.level ?? 0)}">${escapeHtml(formatOutlookCellLabel(slot))}</td>
              `).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function formatOutlookTypeLabel(type) {
  return type === "暴風" ? "強風" : type;
}

function collectOutlookTableSlots(rows) {
  const slotsByKey = new Map();
  rows.forEach((row) => {
    (row.slots ?? []).forEach((slot) => {
      if (!slotsByKey.has(outlookSlotKey(slot))) slotsByKey.set(outlookSlotKey(slot), slot);
    });
  });
  return [...slotsByKey.values()].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

function findMatchingOutlookSlot(slots = [], referenceSlot) {
  return slots.find((slot) => outlookSlotKey(slot) === outlookSlotKey(referenceSlot)) ?? {
    ...referenceSlot,
    label: "",
    level: 0
  };
}

function outlookSlotKey(slot) {
  return `${slot?.time ?? ""}|${slot?.duration ?? ""}`;
}

function formatOutlookCellLabel(slot) {
  if (slot?.available === false) return "";
  if (slot?.label) return slot.label;
  if (typeof slot?.level === "number" && slot.level >= 2) return "";
  return "-";
}

function formatEarlyProbabilityBadge(probability) {
  return [probability?.type, probability?.label]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function refreshOpenWarningModal() {
  const modal = document.getElementById("warning-modal");
  if (!modal || modal.hidden || !selectedWarningAreaCode) return;
  openWarningModal(selectedWarningAreaCode);
}

function closeWarningModal() {
  const modal = document.getElementById("warning-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
}

function renderAmedasRanking(tab, state, metric) {
  const root = document.getElementById("amedas-ranking");
  if (!root) return;

  const isAmedas = tab.id === "amedas";
  root.hidden = !isAmedas;
  if (!isAmedas) {
    root.innerHTML = "";
    return;
  }

  if (state.status === "loading") {
    root.innerHTML = `<div class="amedas-ranking-empty">ランキング取得中...</div>`;
    return;
  }

  if (state.status === "error") {
    root.innerHTML = `<div class="amedas-ranking-empty">ランキングを表示できません</div>`;
    return;
  }

  const rankingView = metric.id === "temperature"
    ? amedasTemperatureRankingView
    : (metric.id === "wind" ? amedasWindRankingView : "current");
  const windKind = metric.id === "wind" ? amedasWindRankingKind : "average";
  const order = rankingView === "minimum" ? "bottom" : (rankingView === "maximum" ? "top" : (metric.id === "temperature" ? amedasRankingOrder : "top"));
  const items = buildAmedasRankingItems(state.data, metric, order, rankingView, windKind).slice(0, AMEDAS_RANKING_LIMIT);
  const orderLabel = getAmedasRankingLabel(metric.id, rankingView, windKind, order);
  const temperatureControls = metric.id === "temperature" ? `
    <div class="amedas-ranking-toggle amedas-ranking-slider" aria-label="気温ランキング集計期間" style="${getAmedasRankingSliderStyle(rankingView === "current" ? 0 : 1, 2)}">
      <button type="button" data-amedas-temperature-ranking-period="current" class="${rankingView === "current" ? "active" : ""}">実況</button>
      <button type="button" data-amedas-temperature-ranking-period="daily" class="${rankingView !== "current" ? "active" : ""}">今日ここまで</button>
    </div>
    ${rankingView !== "current" ? `
      <div class="amedas-ranking-toggle amedas-ranking-slider" aria-label="気温ランキング種別" style="${getAmedasRankingSliderStyle(rankingView === "maximum" ? 0 : 1, 2)}">
        <button type="button" data-amedas-ranking-view="maximum" class="${rankingView === "maximum" ? "active" : ""}">最高</button>
        <button type="button" data-amedas-ranking-view="minimum" class="${rankingView === "minimum" ? "active" : ""}">最低</button>
      </div>
    ` : ""}
  ` : "";
  const windControls = metric.id === "wind" ? `
    <div class="amedas-ranking-toggle amedas-ranking-slider" aria-label="風速ランキング集計期間" style="${getAmedasRankingSliderStyle(rankingView === "current" ? 0 : 1, 2)}">
      <button type="button" data-amedas-wind-ranking-view="current" class="${rankingView === "current" ? "active" : ""}">実況</button>
      <button type="button" data-amedas-wind-ranking-view="daily" class="${rankingView === "daily" ? "active" : ""}">今日ここまで</button>
    </div>
    <div class="amedas-ranking-toggle amedas-ranking-slider" aria-label="風速ランキング種別" style="${getAmedasRankingSliderStyle(windKind === "average" ? 0 : 1, 2)}">
      <button type="button" data-amedas-wind-ranking-kind="average" class="${windKind === "average" ? "active" : ""}">平均風速</button>
      <button type="button" data-amedas-wind-ranking-kind="gust" class="${windKind === "gust" ? "active" : ""}" ${rankingView === "current" ? 'disabled title="実況の全国一括データは提供されていません"' : ""}>最大瞬間風速</button>
    </div>
  ` : "";
  const orderControls = metric.id === "temperature" && rankingView === "current" ? `
    <div class="amedas-ranking-toggle amedas-ranking-slider" aria-label="気温ランキング切替" style="${getAmedasRankingSliderStyle(order === "top" ? 0 : 1, 2)}">
      <button type="button" data-amedas-ranking-order="top" class="${order === "top" ? "active" : ""}">高い順</button>
      <button type="button" data-amedas-ranking-order="bottom" class="${order === "bottom" ? "active" : ""}">低い順</button>
    </div>
  ` : "";

  root.innerHTML = `
    <div class="amedas-ranking-head">
      <span>${escapeHtml(metric.label)}ランキング</span>
      <small>${orderLabel}${items.length}地点</small>
    </div>
    ${temperatureControls}
    ${windControls}
    ${orderControls}
    ${items.length ? `<div class="amedas-ranking-list">
      ${items.map((item, index) => `
        <button type="button" class="amedas-ranking-row" data-amedas-station-id="${escapeHtml(item.id)}">
          <span class="amedas-ranking-rank">${index + 1}</span>
          <span class="amedas-ranking-name">${escapeHtml(item.name)}</span>
          <strong class="amedas-ranking-value" style="--rank-color:${escapeHtml(item.color)}">${escapeHtml(formatAmedasRankingValue(item.value, metric))}</strong>
        </button>
      `).join("")}
    </div>` : `<div class="amedas-ranking-empty">${getAmedasRankingEmptyMessage(metric.id, rankingView)}</div>`}
  `;
}

function getAmedasRankingSliderStyle(index, count) {
  const safeIndex = Math.max(0, Math.min(count - 1, Number(index) || 0));
  return `--ranking-index-offset:${safeIndex * 100}%;--ranking-gap-offset:${safeIndex * 3}px;--ranking-count:${count}`;
}

function getAmedasRankingLabel(metricId, rankingView, windKind, order) {
  if (metricId === "wind") {
    const period = rankingView === "daily" ? "今日" : "実況";
    return `${period}${windKind === "gust" ? "瞬間" : "平均"}`;
  }
  if (rankingView === "maximum") return "日最高";
  if (rankingView === "minimum") return "日最低";
  return order === "bottom" ? "下位" : "上位";
}

function getAmedasRankingEmptyMessage(metricId, rankingView) {
  if (rankingView === "current") return "表示できる観測値がありません";
  if (metricId === "wind") return "今日の風速ランキングを取得できません";
  return "日最高・日最低ランキングを取得できません";
}

function renderAmedasDailyChart(tab, state, metric) {
  const root = document.getElementById("amedas-daily-chart");
  if (!root) return;

  const shouldShow = tab.id === "amedas";
  root.hidden = !shouldShow;
  if (!shouldShow) {
    root.innerHTML = "";
    return;
  }

  const chart = state.amedasDailyChart ?? { status: "idle" };
  if (!state.selectedAmedasStationId || chart.status === "idle" || chart.metricId !== metric.id) {
    root.innerHTML = `<p class="amedas-temperature-chart-empty">地図上の観測点をタップすると、${escapeHtml(getAmedasDailySeriesTitle(metric.id))}を表示します。</p>`;
    return;
  }
  if (chart.status === "loading") {
    root.innerHTML = `<p class="amedas-temperature-chart-empty">${escapeHtml(chart.stationName || "観測点")}の${escapeHtml(getAmedasDailySeriesTitle(metric.id))}を読み込んでいます...</p>`;
    return;
  }
  if (chart.status === "error") {
    root.innerHTML = `<p class="amedas-temperature-chart-empty">${escapeHtml(getAmedasDailySeriesTitle(metric.id))}を取得できませんでした。</p>`;
    return;
  }

  const points = chart.data?.points ?? [];
  if (!points.length) {
    root.innerHTML = `<p class="amedas-temperature-chart-empty">この観測点では${escapeHtml(getAmedasDailySeriesTitle(metric.id))}を観測していません。</p>`;
    return;
  }

  const latest = chart.data?.latest;
  root.style.setProperty("--amedas-series-color", metric.color);
  root.style.setProperty("--amedas-gust-color", metric.color);
  root.innerHTML = `
    <div class="amedas-temperature-chart-head">
      <div>
        <span>${escapeHtml(getAmedasDailySeriesTitle(metric.id))}</span>
        <strong>${escapeHtml(chart.stationName || "観測点")}</strong>
      </div>
      <div class="amedas-temperature-chart-current">
        ${formatAmedasDailyColoredValue(latest?.value, metric)}
        <span>${escapeHtml(latest?.label ?? "--:--")}</span>
      </div>
    </div>
    ${metric.id === "wind" ? `
      <div class="amedas-temperature-chart-key" aria-label="グラフの凡例">
        <span>平均風速</span>
        <span class="gust">最大瞬間風速</span>
      </div>
    ` : ""}
    ${buildAmedasDailyChartSvg(points, chart.data?.min, chart.data?.max, metric)}
    <div class="amedas-temperature-chart-range${metric.id === "wind" ? " is-wind" : ""}">
      <span>${escapeHtml(getAmedasDailyMinLabel(metric.id))} ${formatAmedasDailyColoredValue(chart.data?.min, metric)}</span>
      <span>${escapeHtml(getAmedasDailyMaxLabel(metric.id))} ${formatAmedasDailyColoredValue(chart.data?.max, metric)}</span>
      ${metric.id === "wind" && Number.isFinite(chart.data?.maxGust) ? `<span>最大瞬間 ${formatAmedasDailyColoredValue(chart.data.maxGust, metric)}${chart.data.maxGustLabel ? ` (${escapeHtml(chart.data.maxGustLabel)})` : ""}</span>` : ""}
    </div>
  `;
}

function buildAmedasDailyChartSvg(points, minValue, maxValue, metric) {
  const width = 320;
  const height = 142;
  const inset = { top: 10, right: 8, bottom: 23, left: 34 };
  const plotWidth = width - inset.left - inset.right;
  const plotHeight = height - inset.top - inset.bottom;
  const isPrecipitation = metric.id === "precipitation";
  const min = isPrecipitation ? 0 : (Number.isFinite(minValue) ? Math.floor(minValue - 1) : 0);
  const gustMax = metric.id === "wind"
    ? Math.max(...points.map((point) => point.gust).filter(Number.isFinite), Number.NEGATIVE_INFINITY)
    : Number.NEGATIVE_INFINITY;
  const max = getAmedasDailyAxisMax(Math.max(Number(maxValue) || 0, gustMax), metric.id);
  const span = Math.max(1, max - min);
  const xFor = (minute) => inset.left + (Math.max(0, Math.min(1440, minute)) / 1440) * plotWidth;
  const yFor = (value) => inset.top + ((max - value) / span) * plotHeight;

  const buildSegments = (valueKey) => {
    const segments = [];
    let segment = [];
    let previousMinute = null;
    points.forEach((point) => {
      const value = point[valueKey];
      if (!Number.isFinite(value)) return;
      if (previousMinute !== null && point.minute - previousMinute > 20 && segment.length) {
        segments.push(segment);
        segment = [];
      }
      segment.push(`${xFor(point.minute).toFixed(1)},${yFor(value).toFixed(1)}`);
      previousMinute = point.minute;
    });
    if (segment.length) segments.push(segment);
    return segments;
  };
  const segments = buildSegments("value");

  const grids = [min, min + span / 2, max].map((value) => {
    const y = yFor(value).toFixed(1);
    return `<g><line x1="${inset.left}" x2="${width - inset.right}" y1="${y}" y2="${y}"/><text x="0" y="${Number(y) + 4}">${formatAmedasDailyAxis(value, metric)}</text></g>`;
  }).join("");
  const times = [0, 360, 720, 1080, 1440].map((minute) => {
    const x = xFor(minute).toFixed(1);
    const label = minute === 1440 ? "24" : String(minute / 60).padStart(2, "0");
    return `<text x="${x}" y="${height - 5}" text-anchor="middle">${label}</text>`;
  }).join("");
  const shapes = isPrecipitation
    ? points.map((point) => {
      const x = xFor(point.minute) - 1.1;
      const y = yFor(point.value);
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="2.2" height="${Math.max(1, inset.top + plotHeight - y).toFixed(1)}" rx="1.1"/>`;
    }).join("")
    : segments.map((items) => `<polyline points="${items.join(" ")}"/>`).join("");
  const gustPaths = metric.id === "wind"
    ? buildSegments("gust").map((items) => `<polyline points="${items.join(" ")}"/>`).join("")
    : "";

  return `
    <svg class="amedas-temperature-chart-plot" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(getAmedasDailySeriesTitle(metric.id))}">
      <g class="amedas-temperature-chart-grid">${grids}</g>
      <g class="amedas-temperature-chart-axis">${times}</g>
      <g class="amedas-temperature-chart-line${isPrecipitation ? " is-bar" : ""}">${shapes}</g>
      ${gustPaths ? `<g class="amedas-temperature-chart-line-gust">${gustPaths}</g>` : ""}
    </svg>
  `;
}

function getAmedasDailyAxisMax(value, metricId) {
  const numeric = Number.isFinite(value) ? value : 0;
  if (metricId === "precipitation") return Math.max(1, Math.ceil(numeric));
  return Math.max(1, Math.ceil(numeric + 1));
}

function formatAmedasDailyAxis(value, metric) {
  const digits = metric.id === "snow" || Number.isInteger(value) ? 0 : 1;
  return `${value.toFixed(digits)}${metric.id === "temperature" ? "°" : ""}`;
}

function formatAmedasDailyValue(value, metric) {
  if (!Number.isFinite(value)) return "--";
  const digits = metric.id === "snow" || Number.isInteger(value) ? 0 : 1;
  return `${value.toFixed(digits)}${metric.unit}`;
}

function formatAmedasDailyColoredValue(value, metric) {
  const color = getAmedasObservationColor(metric.id, value);
  return `<b class="amedas-temperature-chart-value" style="--amedas-value-color:${escapeHtml(color)}">${escapeHtml(formatAmedasDailyValue(value, metric))}</b>`;
}

function getAmedasDailySeriesTitle(metricId) {
  if (metricId === "precipitation") return "今日の1時間降水量";
  if (metricId === "wind") return "今日の風速";
  if (metricId === "snow") return "今日の積雪深";
  return "今日の気温";
}

function getAmedasDailyMinLabel(metricId) {
  if (metricId === "precipitation") return "最小";
  if (metricId === "wind") return "最小風速";
  if (metricId === "snow") return "最小積雪深";
  return "最低";
}

function getAmedasDailyMaxLabel(metricId) {
  if (metricId === "precipitation") return "最大";
  if (metricId === "wind") return "最大風速";
  if (metricId === "snow") return "最大積雪深";
  return "最高";
}

function buildAmedasRankingItems(data = {}, metric, order = "top", rankingView = "current", windKind = "average") {
  const pointsById = new Map((data.points ?? []).map((point) => [String(point.id), point]));
  const usesDailyTemperature = metric.id === "temperature" && rankingView !== "current";
  const usesDailyWind = metric.id === "wind" && rankingView === "daily";
  const source = usesDailyTemperature
    ? (data.temperatureRankings?.[rankingView] ?? [])
    : (usesDailyWind ? (data.windRankings?.[windKind === "gust" ? "gust" : "maximum"] ?? []) : (data.points ?? []));
  return source
    .map((point) => ({
      id: point.id,
      name: point.name,
      coordinates: point.coordinates ?? pointsById.get(String(point.id))?.coordinates,
      value: usesDailyTemperature || usesDailyWind
        ? point.value
        : point.values?.[metric.id === "wind" && windKind === "gust" ? "gust" : metric.id]
    }))
    .map((item) => ({ ...item, color: getAmedasLevelColor(metric.id, item.value) }))
    .filter((item) => shouldIncludeAmedasValue(metric.id, item.value))
    .sort((a, b) => order === "bottom" ? a.value - b.value : b.value - a.value);
}

function shouldIncludeAmedasValue(metricId, value) {
  if (!Number.isFinite(value)) return false;
  if (metricId === "precipitation") return value >= 0.1;
  if (metricId === "snow") return value >= 1;
  return true;
}

function formatAmedasRankingValue(value, metric) {
  const fractionDigits = Number.isInteger(value) ? 0 : 1;
  return `${value.toFixed(fractionDigits)}${metric.unit}`;
}

function getAmedasLevelColor(metricId, value) {
  const levels = getAmedasLevels(metricId);
  return levels.find((level) => value >= level.min)?.color ?? "#d8e6f7";
}

function getAmedasLevels(metricId) {
  if (metricId === "temperature") return AMEDAS_TEMPERATURE_LEVELS;
  if (metricId === "precipitation") return AMEDAS_PRECIPITATION_LEVELS;
  if (metricId === "wind") return AMEDAS_WIND_LEVELS;
  if (metricId === "snow") return AMEDAS_SNOW_LEVELS;
  return [];
}

function renderTyphoonDetails(tab, state) {
  const root = document.getElementById("typhoon-detail-grid");
  if (!root) return;

  const isTyphoon = tab.id === "typhoon";
  root.hidden = !isTyphoon;
  if (!isTyphoon) {
    root.innerHTML = "";
    return;
  }

  if (state.data?.hasTyphoon === false) {
    root.innerHTML = `
      <div class="typhoon-empty">
        <strong>${escapeHtml(NO_TYPHOON_MESSAGE)}</strong>
      </div>
    `;
    return;
  }

  const details = getTyphoonDetails(state);
  root.innerHTML = [
    ["大きさ", details.size],
    ["強さ", details.strength],
    ["中心気圧", details.pressure],
    ["最大瞬間風速", details.maxGust],
    ["最大風速", details.maxWind],
    ["移動", formatTyphoonMovement(details.direction, details.speed)]
  ].map(([label, value]) => `
    <div class="typhoon-detail-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");
}

function renderEarthquakeList(tab, state) {
  const root = document.getElementById("earthquake-list");
  if (!root) return;

  const isEarthquake = tab.id === "earthquake";
  root.hidden = !isEarthquake;
  if (!isEarthquake) {
    root.innerHTML = "";
    return;
  }

  if (state.status === "loading") {
    root.innerHTML = `<div class="earthquake-empty">地震XMLを取得中です。</div>`;
    return;
  }

  if (state.status === "error") {
    root.innerHTML = `<div class="earthquake-empty">地震XMLを取得できませんでした。</div>`;
    return;
  }

  const earthquakes = state.data?.earthquakes ?? [];
  if (!earthquakes.length) {
    root.innerHTML = `<div class="earthquake-empty">直近の地震情報はありません。</div>`;
    return;
  }

  const selectedId = String(state.data?.selectedEarthquakeId ?? earthquakes[0]?.id ?? "");
  root.innerHTML = earthquakes.map((earthquake) => {
    const isActive = String(earthquake.id) === selectedId;
    const intensityColor = getEarthquakeIntensityColor(earthquake.maxIntensity);
    const intensityTextClass = getEarthquakeIntensityTextClass(earthquake.maxIntensity);
    const magnitude = formatEarthquakeMagnitude(earthquake.magnitude, { prefix: true });
    const depthText = formatEarthquakeDepthText(earthquake.depth, { compact: true });
    return `
      <button
        type="button"
        class="earthquake-select-button${isActive ? " active" : ""}"
        data-earthquake-id="${escapeHtml(earthquake.id)}"
        aria-pressed="${isActive ? "true" : "false"}"
      >
        <strong>${escapeHtml(earthquake.hypocenterName ?? "震源調査中")}</strong>
        <span>${escapeHtml(earthquake.eventTime ?? earthquake.reportTime ?? "--")}</span>
        <div class="earthquake-item-meta">
          <em class="${intensityTextClass}" style="--earthquake-item-intensity-bg: ${escapeHtml(intensityColor)};">${escapeHtml(earthquake.maxIntensityLabel ?? "震度不明")}</em>
          <small>${escapeHtml(magnitude)}</small>
          <small>深さ ${escapeHtml(depthText)}</small>
        </div>
      </button>
    `;
  }).join("");
}

function renderEarthquakeDetails(tab, state) {
  const root = document.getElementById("earthquake-detail-grid");
  if (!root) return;

  const isEarthquake = tab.id === "earthquake";
  root.hidden = !isEarthquake;
  if (!isEarthquake) {
    root.innerHTML = "";
    return;
  }

  const earthquake = state.data?.selectedEarthquake;
  if (!earthquake) {
    root.innerHTML = "";
    return;
  }

  const intensityColor = getEarthquakeIntensityColor(earthquake.maxIntensity);
  const intensityTextClass = getEarthquakeIntensityTextClass(earthquake.maxIntensity);
  root.innerHTML = `
    <section class="earthquake-summary-card" aria-label="選択中の地震情報" style="--earthquake-intensity-bg: ${escapeHtml(intensityColor)};">
      <div class="earthquake-main-head">
        <div class="earthquake-hypocenter">
          <span>震源地</span>
          <strong>${escapeHtml(earthquake.hypocenterName ?? "震源調査中")}</strong>
        </div>
        <p>発生時刻: ${escapeHtml(formatEarthquakeEventTime(earthquake.eventTime))}</p>
      </div>

      <div class="earthquake-intensity-panel ${intensityTextClass}">
        <div class="earthquake-intensity-label">
          <span>最大震度</span>
          <small>Max Intensity</small>
        </div>
        <strong>${escapeHtml(earthquake.maxIntensityShort ?? "--")}</strong>
      </div>

      <div class="earthquake-detail-box">
        <div class="earthquake-detail-row">
          <span>
            <span>マグニチュード</span>
            <small>Magnitude</small>
          </span>
          <strong>${escapeHtml(formatEarthquakeMagnitude(earthquake.magnitude, { prefix: true }))}</strong>
        </div>
        <div class="earthquake-detail-row">
          <span>
            <span>深さ</span>
            <small>Depth</small>
          </span>
          <strong>${escapeHtml(formatEarthquakeDepthText(earthquake.depth))}</strong>
        </div>
      </div>
    </section>
  `;
}

function formatEarthquakeMagnitude(value, options = {}) {
  const text = String(value ?? "").trim();
  if (!text || text === "--") return "--";
  const magnitude = text.replace(/^M\s*/i, "");
  return options.prefix ? `M ${magnitude}` : magnitude;
}

function formatEarthquakeEventTime(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "--") return "--";
  return text.endsWith("頃") ? text : `${text}頃`;
}

function getTyphoonDetails(state) {
  if (state.status === "loading") {
    return buildEmptyTyphoonDetails("取得中");
  }
  if (state.status === "error") {
    return buildEmptyTyphoonDetails("未取得");
  }

  return state.data?.details ?? buildEmptyTyphoonDetails("未取得");
}

function formatTyphoonMovement(direction, speed) {
  const hasDirection = direction && direction !== "未取得" && direction !== "取得中";
  const hasSpeed = speed && speed !== "未取得" && speed !== "取得中";
  if (hasDirection && hasSpeed) return `${direction} ${speed}`;
  if (hasDirection) return direction;
  if (hasSpeed) return speed;
  return direction || speed || "未取得";
}

function buildEmptyTyphoonDetails(value) {
  return {
    size: value,
    strength: value,
    pressure: value,
    maxWind: value,
    maxGust: value,
    direction: value,
    speed: value,
    position: value
  };
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setPanelTitleVisible(isVisible) {
  const element = document.getElementById("panel-title");
  if (element) element.hidden = !isVisible;
}

function setPanelTimeVisible(isVisible) {
  const element = document.getElementById("panel-time");
  if (element) element.hidden = !isVisible;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[char]));
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

function formatWarningTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Tokyo"
  }).formatToParts(date);
  const getPart = (type) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${getPart("month")}/${getPart("day")} ${getPart("hour")}:${getPart("minute")}`;
}

function formatOutlookTime(slot) {
  if (slot?.displayLabel) return slot.displayLabel;
  const start = new Date(slot?.time ?? "");
  if (Number.isNaN(start.getTime())) return "--";
  const end = new Date(start.getTime() + parseDurationHours(slot?.duration) * 60 * 60 * 1000);
  const startHour = formatHour(start);
  const endHour = Number.isNaN(end.getTime()) ? "" : formatHour(end);
  return endHour ? `${startHour}-${endHour}` : startHour;
}

function parseDurationHours(value) {
  const match = String(value ?? "").match(/PT(\d+)H/);
  return match ? Number(match[1]) : 0;
}

function formatHour(date) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Tokyo"
  }).format(date);
}
