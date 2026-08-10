import {
  AMEDAS_LEVELS_BY_METRIC,
  AMEDAS_METRICS,
  AMEDAS_PRECIPITATION_LEVELS,
  EARTHQUAKE_INTENSITY_LEVELS,
  getAmedasObservationColor,
  getEarthquakeIntensityColor,
  getEarthquakeIntensityTextClass,
  KIKIKURU_LAYER_OPTIONS,
  KIKIKURU_LEVELS
} from "../config.js";
import {
  AMEDAS_PRECIPITATION_PERIODS,
  getAmedasPrecipitationLevels,
  getAmedasPrecipitationPeriod
} from "../amedasPrecipitationPeriod.js";
import { getDistanceKm } from "../location/distance.js";
import {
  classifyEarthquakeTsunamiComment,
  getTsunamiLevelColor,
  getTsunamiLevelLabel,
  getTsunamiObservationStyle
} from "../tsunami.js";
import {
  formatEarthquakeDepthText,
  formatEarthquakeHypocenterText,
  formatEarthquakeMagnitude,
  getEarthquakeUnknownText
} from "../earthquakeFormat.js";
import {
  buildEarthquakeObservationRows,
  groupEarthquakeObservationRowsByMunicipality
} from "../earthquakeDetails.js";
import { formatTyphoonSummaryName, NO_TYPHOON_MESSAGE } from "../jma/typhoon.js";
import {
  HYPOCENTER_DISTRIBUTION_DAY_COUNT,
  HYPOCENTER_DISTRIBUTION_DEPTH_OPTIONS,
  HYPOCENTER_DISTRIBUTION_MAGNITUDE_OPTIONS,
  HYPOCENTER_DISTRIBUTION_MAX_RANGE_DAYS,
  HYPOCENTER_DISTRIBUTION_RANGE_TOO_LONG_MESSAGE,
  isHypocenterDistributionRangeWithinLimit
} from "../jma/hypocenterDistribution.js";
import {
  HYPOCENTER_DEPTH_STOPS,
  HYPOCENTER_UNKNOWN_DEPTH_COLOR,
  getHypocenterDepthStopPercentage
} from "../map/hypocenterDepthStyle.js";
import { createHypocenterDateWheel } from "./hypocenterDateWheel.js";
import { getVolcanoLevelColor } from "../volcanoLevels.js";
import {
  getAvailableVolcanoAshForecasts,
  getHighestPriorityVolcanoReport,
  getLatestVolcanoReportsByType,
  getVolcanoWarningDetailReport,
  parseVolcanoSeismicCountTable
} from "../jma/volcanoXml.js";
import {
  getVolcanoAshfallLegendItems,
  VOLCANO_SMALL_CINDERS_STYLE
} from "../volcanoAshfall.js";
import { findLatestRadarObservationIndex } from "../jma/radar.js";
import { assignAmedasCompetitionRanks } from "../amedasRanking.js";
import { setSocialSharePayload } from "../socialShareState.js";
import { mergeRiverFloodWarningsIntoGroups } from "../warningRiverMerge.js";
import {
  formatWarningOutlookTime,
  getWarningOutlookStartDateDisplay,
  getWarningOutlookTimeDisplay,
  splitWarningOutlookRows
} from "../warningOutlookTime.js";
import { getCurrentLanguage, localizeText, localizeVolcanoText } from "./locale.js";
import { buildModalLoadingState } from "./modalLoadingState.js";

let selectedWarningAreaCode = "";
const amedasRankingOrderByMetric = {
  temperature: "top",
  humidity: "top",
  pressure: "top"
};
let amedasTemperatureRankingView = "current";
let amedasWindRankingView = "current";
let amedasWindRankingKind = "average";
let amedasPressureRankingView = "current";
let activeWarningAreasByCode = new Map();
let activeWarningDetailsLoaded = false;
let activeRiverFloodReportsById = new Map();
let warningAreaSelectionOptions = {};
let mobileRadarDockSliding = false;
let mobileVolcanoAshSliderDragging = false;
let mobileEarthquakeSummaryPage = "earthquake";
let lastMobileTideStationCode = "";

function consumeCompatibilityClick(event, isSuppressed, clearSuppression, selector) {
  if (!isSuppressed || !(event.target instanceof Element) || !event.target.closest(selector)) return false;
  clearSuppression();
  event.preventDefault();
  event.stopImmediatePropagation();
  return true;
}
let mobileEarthquakeSummarySwipeInitialized = false;
let mobileEarthquakeSummaryCommitTimer = 0;
let mobileTsunamiTickerGroupTimer = 0;
let mobileTsunamiTickerTransitionTimer = 0;
let lastWarningDetailsData = null;
let lastWarningDetailsView = "";
let lastWarningDetailsStatus = "";
let lastWarningDetailsAreaCode = "";
let lastWarningDetailsLayer = "";
let activeWarningGroupsByKey = new Map();
let warningGroupKeyByAreaCode = new Map();
let expandedWarningGroupKey = "";

const AMEDAS_RANKING_LIMIT = 100;
const MOBILE_WEATHER_TIMELINE_TAP_DELAY_MS = 360;
const MOBILE_WEATHER_TIMELINE_TAP_MAX_DURATION_MS = 500;
const MOBILE_WEATHER_TIMELINE_TAP_MOVE_THRESHOLD_PX = 8;
const TIDE_RANGE_OPTIONS = [
  [1, "1時間"],
  [6, "6時間"],
  [12, "12時間"],
  [24, "1日"]
];
const TIDE_WARNING_CRITERIA = [
  { type: "level5", label: "レベル5特別警報基準", stationKey: "level5" },
  { type: "level4", label: "レベル4危険警報基準", stationKey: "level4" }
];

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
  const modeLabel = tab.id === "warnings"
    ? localizeWarningDisplayText(getWarningViewTitle(warningView))
    : (tab.id === "earthquake" && state.earthquakeContentMode === "volcano"
      ? "火山情報"
      : (tab.id === "radar" && state.weatherChartEnabled
        ? "天気図"
        : (tab.id === "radar" && state.lightningEnabled
          ? "雷"
          : (tab.id === "typhoon" && state.data?.worldForecastMode ? "各国予想" : tab.label))));
  setText("mode-label", modeLabel);
  document.getElementById("mode-label")?.classList.toggle("mode-label-warning", tab.id === "warnings");
  setText("panel-title", buildPanelTitle(tab, state));
  setPanelTitleVisible(false);
  setText("panel-description", buildDescription(tab, state));
  setText("panel-time", buildTimeText(state));
  setPanelTimeVisible(tab.id !== "radar" && tab.id !== "typhoon" && tab.id !== "earthquake");
  renderCurrentLocationCard(tab, state.currentLocation, { warningView, activeKikikuruLayer, data: state.data });
  setWarningSocialSharePayload(tab, state, warningView);
  renderRadarOverlayTabs(tab, state.weatherChartEnabled, state.weatherChartStatus, state.weatherChart ?? state.data?.weatherChart);
  renderKikikuruLayerTabs(tab, warningView, activeKikikuruLayer);
  renderWarningViewTabs(tab, warningView);
  renderAmedasSubTabs(tab, amedasMetric.id);
  renderAmedasPrecipitationPeriods(tab, amedasMetric.id, state.amedasPrecipitationPeriod ?? state.data?.precipitationPeriod);
  renderRadarControls(tab, state);
  renderWeatherChartControls(tab, state.weatherChartEnabled, state.weatherChartStatus, state.weatherChart ?? state.data?.weatherChart);
  renderLocationInsights(tab, state.locationInsights, state.myAreas);
  renderWarningDetails(tab, state, warningView);
  renderTyphoonSelector(tab, state);
  renderTyphoonDetails(tab, state);
  renderEarthquakeList(tab, state);
  renderAmedasDailyChart(tab, state, amedasMetric);
  renderAmedasRanking(tab, state, amedasMetric);
  renderMobileContextDock(tab, state, { amedasMetric, warningView });
  renderLegend(tab.id, amedasMetric.id, warningView, state.data);
}

export function setupAmedasSubTabs({ onChange }) {
  setupSegmentedControls(document.getElementById("amedas-sub-tabs"));
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

export function setupAmedasDailyChartToggle({ onChange } = {}) {
  const root = document.getElementById("amedas-daily-chart");
  if (!root) return;
  let dragState = null;
  let suppressCompatibilityClick = false;

  const resetSlider = (slider) => {
    slider.classList.remove("is-dragging");
    slider.style.setProperty("--amedas-chart-period-drag-x", "0px");
  };
  const renderSliderButton = (slider, button, { sync = true } = {}) => {
    const buttons = [...slider.querySelectorAll("button")];
    const index = Math.max(0, buttons.indexOf(button));
    buttons.forEach((item) => item.classList.toggle("active", item === button));
    if (!sync) return;
    slider.style.setProperty("--amedas-chart-period-index", String(index));
  };

  root?.addEventListener("click", (event) => {
    if (consumeCompatibilityClick(
      event,
      suppressCompatibilityClick,
      () => { suppressCompatibilityClick = false; },
      ".amedas-chart-period-toggle"
    )) return;
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-amedas-chart-day]");
    if (!button) return;
    const dayOffset = Number(button.dataset.amedasChartDay);
    if (dayOffset !== 0 && dayOffset !== 1) return;
    onChange?.(dayOffset);
  });

  root.addEventListener("pointerdown", (event) => {
    if (event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (!(event.target instanceof Element)) return;
    suppressCompatibilityClick = false;
    const slider = event.target.closest(".amedas-chart-period-toggle");
    if (!slider || !root.contains(slider)) return;
    const buttons = [...slider.querySelectorAll("button")];
    const activeButton = buttons.find((button) => button.classList.contains("active")) ?? buttons[0];
    const pointerButton = event.target.closest("button");
    const previewButton = pointerButton && slider.contains(pointerButton) ? pointerButton : activeButton;
    if (!activeButton || !previewButton) return;
    dragState = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      slider,
      startX: event.clientX,
      lastX: event.clientX,
      committedButton: activeButton,
      previewButton,
      activeLeft: previewButton.offsetLeft,
      moved: false
    };
    if (previewButton !== activeButton) renderSliderButton(slider, previewButton);
    event.stopPropagation();
  });

  root.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragState.lastX = event.clientX;
    const delta = event.clientX - dragState.startX;
    if (!dragState.moved && Math.abs(delta) > 6) {
      dragState.moved = true;
      dragState.slider.classList.add("is-dragging");
      if (dragState.pointerType !== "touch") {
        dragState.slider.setPointerCapture?.(event.pointerId);
      }
    }
    if (!dragState.moved) return;
    event.preventDefault();
    event.stopPropagation();
    const buttons = [...dragState.slider.querySelectorAll("button")];
    const firstButton = buttons[0];
    const lastButton = buttons.at(-1);
    const activeButton = buttons.find((button) => button.classList.contains("active"));
    const indicatorWidth = activeButton?.offsetWidth ?? 0;
    const minDelta = (firstButton?.offsetLeft ?? 0) - dragState.activeLeft;
    const maxDelta = (lastButton?.offsetLeft ?? 0) + (lastButton?.offsetWidth ?? 0)
      - indicatorWidth - dragState.activeLeft;
    const offset = Math.min(maxDelta, Math.max(minDelta, delta));
    dragState.slider.style.setProperty("--amedas-chart-period-drag-x", `${offset}px`);
  });

  const finishDrag = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const state = dragState;
    const { slider, moved, lastX } = state;
    dragState = null;
    const isCommit = event.type === "pointerup";
    let targetButton = isCommit ? state.previewButton : null;
    if (isCommit && moved) {
      const rect = slider.getBoundingClientRect();
      const releaseX = Number.isFinite(event.clientX) ? event.clientX : lastX;
      const buttons = [...slider.querySelectorAll("button")];
      targetButton = releaseX < rect.left + rect.width / 2 ? buttons[0] : buttons[1];
    }
    if (slider.hasPointerCapture?.(event.pointerId)) {
      slider.releasePointerCapture(event.pointerId);
    }
    if (isCommit && targetButton && !targetButton.disabled) {
      // Keep the in-flight glass position until the next frame. Resetting the
      // offset in this event makes a reverse slide flash before it settles.
      if (targetButton !== state.previewButton) renderSliderButton(slider, targetButton, { sync: false });
      targetButton.click();
      slider.classList.remove("is-dragging");
      window.requestAnimationFrame(() => {
        renderSliderButton(slider, targetButton);
        resetSlider(slider);
      });
      // Suppress only the browser's compatibility click, never a later tap.
      suppressCompatibilityClick = true;
    } else {
      renderSliderButton(slider, state.committedButton, { sync: false });
      slider.classList.remove("is-dragging");
      window.requestAnimationFrame(() => {
        renderSliderButton(slider, state.committedButton);
        resetSlider(slider);
      });
    }
  };

  root.addEventListener("pointerup", finishDrag);
  root.addEventListener("pointercancel", finishDrag);
  root.addEventListener("lostpointercapture", finishDrag);
  const cancelActiveDrag = () => {
    if (!dragState) return;
    const state = dragState;
    dragState = null;
    resetSlider(state.slider);
    renderSliderButton(state.slider, state.committedButton);
  };
  window.addEventListener("blur", cancelActiveDrag);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelActiveDrag();
  });
}

export function setupAmedasRankingToggle({ onChange, onSelectStation } = {}) {
  const root = document.getElementById("amedas-ranking");
  if (!root) return;
  let dragState = null;
  let suppressCompatibilityClick = false;

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
  const renderRankingSliderButton = (slider, button, { sync = true } = {}) => {
    const buttons = getSliderButtons(slider);
    const index = Math.max(0, buttons.indexOf(button));
    buttons.forEach((item) => item.classList.toggle("active", item === button));
    if (!sync) return;
    slider.style.setProperty("--ranking-index-offset", `${index * 100}%`);
    slider.style.setProperty("--ranking-gap-offset", `${index * 3}px`);
  };

  root.addEventListener("click", (event) => {
    if (consumeCompatibilityClick(
      event,
      suppressCompatibilityClick,
      () => { suppressCompatibilityClick = false; },
      ".amedas-ranking-slider"
    )) return;
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
    const pressurePeriodButton = event.target.closest("[data-amedas-pressure-ranking-period]");
    if (pressurePeriodButton) {
      const period = pressurePeriodButton.dataset.amedasPressureRankingPeriod;
      if (period !== "current" && period !== "daily") return;
      amedasPressureRankingView = period;
      onChange?.();
      return;
    }
    const button = event.target.closest("[data-amedas-ranking-order]");
    if (button) {
      const order = button.dataset.amedasRankingOrder;
      if (order !== "top" && order !== "bottom") return;
      const metricId = button.dataset.amedasRankingOrderMetric ?? "temperature";
      if (Object.hasOwn(amedasRankingOrderByMetric, metricId)) {
        amedasRankingOrderByMetric[metricId] = order;
      }
      onChange?.();
      return;
    }

    const stationButton = event.target.closest("[data-amedas-station-id]");
    if (!stationButton) return;
    onSelectStation?.(stationButton.dataset.amedasStationId);
  });

  root.addEventListener("pointerdown", (event) => {
    if (event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (!(event.target instanceof Element)) return;
    suppressCompatibilityClick = false;
    const slider = event.target.closest(".amedas-ranking-slider");
    if (!slider || !root.contains(slider)) return;
    const buttons = getSliderButtons(slider);
    const activeButton = buttons.find((button) => button.classList.contains("active")) ?? buttons[0];
    const pointerButton = event.target.closest("button");
    const previewButton = pointerButton && slider.contains(pointerButton) ? pointerButton : activeButton;
    if (!activeButton || !previewButton || previewButton.disabled) return;
    dragState = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      slider,
      startX: event.clientX,
      moved: false,
      committedButton: activeButton,
      previewButton,
      activeLeft: previewButton.offsetLeft
    };
    if (previewButton !== activeButton) renderRankingSliderButton(slider, previewButton);
  });

  root.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const delta = event.clientX - dragState.startX;
    if (!dragState.moved && Math.abs(delta) > 6) {
      dragState.moved = true;
      dragState.slider.classList.add("is-dragging");
      if (dragState.pointerType !== "touch") {
        dragState.slider.setPointerCapture?.(event.pointerId);
      }
    }
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
    const state = dragState;
    const { slider, moved } = state;
    dragState = null;
    const targetButton = event.type === "pointerup"
      ? (moved ? getSliderButtonAtPoint(slider, event.clientX) : state.previewButton)
      : null;
    if (slider.hasPointerCapture?.(event.pointerId)) {
      slider.releasePointerCapture(event.pointerId);
    }
    if (targetButton && !targetButton.disabled) {
      // Keep the in-flight glass position through this frame so reverse
      // slides settle exactly like the persistent bottom tab slider.
      if (targetButton !== state.previewButton) renderRankingSliderButton(slider, targetButton, { sync: false });
      targetButton.click();
      slider.classList.remove("is-dragging");
      window.requestAnimationFrame(() => {
        renderRankingSliderButton(slider, targetButton);
        resetRankingSlider(slider);
      });
      // Suppress only the browser's compatibility click, never a later tap.
      suppressCompatibilityClick = true;
    } else {
      renderRankingSliderButton(slider, state.committedButton, { sync: false });
      slider.classList.remove("is-dragging");
      window.requestAnimationFrame(() => {
        renderRankingSliderButton(slider, state.committedButton);
        resetRankingSlider(slider);
      });
    }
  };

  root.addEventListener("pointerup", finishRankingSliderDrag);
  root.addEventListener("pointercancel", finishRankingSliderDrag);
  root.addEventListener("lostpointercapture", finishRankingSliderDrag);
  const cancelActiveDrag = () => {
    if (!dragState) return;
    const state = dragState;
    dragState = null;
    resetRankingSlider(state.slider);
    renderRankingSliderButton(state.slider, state.committedButton);
  };
  window.addEventListener("blur", cancelActiveDrag);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelActiveDrag();
  });
}

function setupSegmentedControls(root) {
  if (!root || root.dataset.segmentedControlsReady === "true") return;
  root.dataset.segmentedControlsReady = "true";
  let dragState = null;
  let pendingFrame = 0;
  let pendingOffset = 0;
  // The dock can be synchronously rebuilt by a segment's click handler. Keep
  // the compatibility-click guard tied to the original pressed button rather
  // than a boolean, so a detached old dock can never swallow the next gesture.
  let suppressedCompatibilitySource = null;

  const getButtons = (segment) => [...segment.querySelectorAll("button")];
  const captureButtonPresentation = (segment) => getButtons(segment).map((button) => ({
    button,
    active: button.classList.contains("active"),
    ariaPressed: button.getAttribute("aria-pressed"),
    ariaSelected: button.getAttribute("aria-selected")
  }));
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
  const renderPreview = (segment, button, { sync = true } = {}) => {
    if (!button) return;
    getButtons(segment).forEach((item) => {
      const isActive = item === button;
      item.classList.toggle("active", isActive);
      if (item.hasAttribute("aria-pressed")) item.setAttribute("aria-pressed", String(isActive));
      if (item.hasAttribute("aria-selected")) item.setAttribute("aria-selected", String(isActive));
    });
    if (sync) syncMobileDockSegmentIndicator(segment);
  };
  const restoreCommittedButton = (state, { sync = true } = {}) => {
    if (!state?.buttonPresentation) return;
    state.buttonPresentation.forEach(({ button, active, ariaPressed, ariaSelected }) => {
      button.classList.toggle("active", active);
      if (ariaPressed === null) button.removeAttribute("aria-pressed");
      else button.setAttribute("aria-pressed", ariaPressed);
      if (ariaSelected === null) button.removeAttribute("aria-selected");
      else button.setAttribute("aria-selected", ariaSelected);
    });
    if (sync) syncMobileDockSegmentIndicator(state.segment);
  };
  const clearDragPresentation = (segment, { resetOffset = true } = {}) => {
    if (!segment) return;
    segment.classList.remove("is-dragging");
    if (resetOffset) setDragOffset(segment, 0);
  };

  root.addEventListener("click", (event) => {
    if (!suppressedCompatibilitySource || event.isTrusted === false) return;
    if (!(event.target instanceof Element)) return;
    const sourceButton = event.target.closest(".mobile-dock-segmented button");
    if (sourceButton !== suppressedCompatibilitySource) return;
    suppressedCompatibilitySource = null;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  root.addEventListener("pointerdown", (event) => {
    if (event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (!(event.target instanceof Element)) return;
    // Mirror the bottom tab slider: a new gesture clears only the previous
    // gesture's compatibility click, never a later intentional tap.
    suppressedCompatibilitySource = null;
    const segment = event.target.closest(".mobile-dock-segmented");
    if (!segment || !root.contains(segment)) return;
    const buttons = getButtons(segment);
    const activeButton = buttons.find(isSegmentButtonActive) ?? buttons[0];
    if (!activeButton) return;
    syncMobileDockSegmentIndicator(segment);
    const pointerButton = event.target.closest("button");
    const previewButton = pointerButton && segment.contains(pointerButton) ? pointerButton : activeButton;
    dragState = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      segment,
      startX: event.clientX,
      committedButton: activeButton,
      previewButton,
      targetButton: previewButton,
      sourceButton: pointerButton && segment.contains(pointerButton) ? pointerButton : null,
      buttonPresentation: captureButtonPresentation(segment),
      activeLeft: previewButton.offsetLeft,
      activeWidth: previewButton.offsetWidth,
      moved: false
    };
    if (previewButton !== activeButton) renderPreview(segment, previewButton);
  });

  root.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const delta = event.clientX - dragState.startX;
    if (!dragState.moved && Math.abs(delta) > 6) {
      dragState.moved = true;
      dragState.segment.classList.add("is-dragging");
      if (dragState.pointerType !== "touch") {
        dragState.segment.setPointerCapture?.(event.pointerId);
      }
    }
    if (!dragState.moved) return;
    event.preventDefault();
    dragState.targetButton = getButtonAtPoint(dragState.segment, event.clientX) ?? dragState.targetButton;
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
    const state = dragState;
    const { segment, moved } = state;
    if (pendingFrame) {
      window.cancelAnimationFrame(pendingFrame);
      pendingFrame = 0;
      setDragOffset(segment, pendingOffset);
    }
    dragState = null;
    const isCommit = event.type === "pointerup";
    const targetButton = isCommit
      ? (moved ? getButtonAtPoint(segment, event.clientX) ?? state.targetButton : state.previewButton)
      : null;
    if (segment.hasPointerCapture?.(event.pointerId)) {
      segment.releasePointerCapture(event.pointerId);
    }
    if (isCommit && targetButton) {
      // Like the bottom tab slider, keep the in-flight glass position through
      // this frame, then settle the base indicator on the committed button.
      if (targetButton !== state.previewButton) renderPreview(segment, targetButton, { sync: false });
      // Ignore the browser click generated for the button initially pressed by
      // this gesture, even if release lands on the active disabled button.
      // Otherwise a slide back to the committed segment is followed by a
      // compatibility click on the first unselected button and jumps back.
      suppressedCompatibilitySource = state.sourceButton;
      // Existing per-panel handlers own application state. The currently
      // active segment is disabled, so there is nothing to commit when the
      // gesture returns to it; still keep the compatibility-click guard above.
      if (!targetButton.disabled) targetButton.click();
      clearDragPresentation(segment, { resetOffset: false });
    } else {
      restoreCommittedButton(state, { sync: false });
      clearDragPresentation(segment, { resetOffset: false });
    }
    window.requestAnimationFrame(() => syncMobileDockSegmentIndicators(root));
  };

  root.addEventListener("pointerup", finishDrag);
  root.addEventListener("pointercancel", finishDrag);
  root.addEventListener("lostpointercapture", finishDrag);
  window.addEventListener("blur", () => {
    if (!dragState) return;
    const state = dragState;
    dragState = null;
    restoreCommittedButton(state);
    clearDragPresentation(state.segment);
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden || !dragState) return;
    const state = dragState;
    dragState = null;
    restoreCommittedButton(state);
    clearDragPresentation(state.segment);
  });
  window.addEventListener("resize", () => window.requestAnimationFrame(() => syncMobileDockSegmentIndicators(root)));
  syncMobileDockSegmentIndicators(root);
}

export function setupMobileDockSegmentedControls() {
  setupSegmentedControls(document.getElementById("mobile-context-dock"));
}
export function setupAmedasPrecipitationPeriods({ onChange } = {}) {
  setupSegmentedControls(document.getElementById("amedas-precipitation-periods"));
  const handlePeriodClick = (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-amedas-precipitation-period]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    onChange?.(button.dataset.amedasPrecipitationPeriod);
  };

  document.getElementById("amedas-precipitation-periods")?.addEventListener("click", handlePeriodClick);
  document.getElementById("mobile-context-dock")?.addEventListener("click", handlePeriodClick);
}

export function setupMobileEarthquakeSummarySwipe({ onChange } = {}) {
  if (mobileEarthquakeSummarySwipeInitialized) return;
  const root = document.getElementById("mobile-context-dock");
  if (!root) return;
  mobileEarthquakeSummarySwipeInitialized = true;
  const pages = ["earthquake", "tsunami", "tide"];
  const selectPage = (page) => {
    if (!pages.includes(page)) return;
    const changed = mobileEarthquakeSummaryPage !== page;
    mobileEarthquakeSummaryPage = page;
    applyMobileEarthquakeSummaryPage(root);
    if (!changed) return;
    window.clearTimeout(mobileEarthquakeSummaryCommitTimer);
    mobileEarthquakeSummaryCommitTimer = window.setTimeout(() => {
      mobileEarthquakeSummaryCommitTimer = 0;
      if (mobileEarthquakeSummaryPage === page) onChange?.(page);
    }, 380);
  };

  root.addEventListener("mobile-dock-horizontal-swipe", (event) => {
    if (!(event instanceof CustomEvent) || root.dataset.tab !== "earthquake") return;
    if (!root.querySelector(".mobile-dock-earthquake-summary-track")) return;
    const deltaX = Number(event.detail?.deltaX) || 0;
    const velocityX = Number(event.detail?.velocityX) || 0;
    if (Math.abs(deltaX) < 36 && Math.abs(velocityX) < 0.35) {
      applyMobileEarthquakeSummaryPage(root);
      return;
    }
    const currentIndex = Math.max(0, pages.indexOf(mobileEarthquakeSummaryPage));
    const directionSource = Math.abs(velocityX) >= 0.35 ? velocityX : deltaX;
    const direction = directionSource < 0 ? 1 : -1;
    selectPage(pages[Math.max(0, Math.min(pages.length - 1, currentIndex + direction))]);
  });

  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element) || root.dataset.tab !== "earthquake") return;
    const pageButton = event.target.closest("[data-mobile-earthquake-summary-target]");
    if (!pageButton) return;
    const targetPage = pageButton.dataset.mobileEarthquakeSummaryTarget;
    if (!pages.includes(targetPage)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selectPage(targetPage);
  });

  root.addEventListener("keydown", (event) => {
    if (root.dataset.tab !== "earthquake" || !root.querySelector(".mobile-dock-earthquake-summary-track")) return;
    if (event.target instanceof Element && event.target.closest("[data-mobile-dock-control]")) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const currentIndex = Math.max(0, pages.indexOf(mobileEarthquakeSummaryPage));
    const direction = event.key === "ArrowRight" ? 1 : -1;
    selectPage(pages[Math.max(0, Math.min(pages.length - 1, currentIndex + direction))]);
  });

  window.addEventListener("tide-station-select", () => {
    selectPage("tide");
  });
  window.addEventListener("resize", () => {
    window.requestAnimationFrame(() => syncMobileTsunamiAreaTickers(root));
  });
}

export function setupTideObservationControls({ onRangeChange, onClose } = {}) {
  ["mobile-context-dock", "earthquake-list"].forEach((rootId) => {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const rangeButton = event.target.closest("[data-tide-range-hours]");
      if (rangeButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        onRangeChange?.(Number(rangeButton.dataset.tideRangeHours));
        return;
      }
      const closeButton = event.target.closest("[data-tide-observation-close]");
      if (!closeButton) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose?.();
    });
  });
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

  const warningViewTabs = document.getElementById("warning-view-tabs");
  const warningDetailList = document.getElementById("warning-detail-list");
  setupSegmentedControls(warningViewTabs);
  setupSegmentedControls(warningDetailList);
  document.getElementById("kikikuru-layer-tabs")?.addEventListener("click", handleClick);
  warningViewTabs?.addEventListener("click", handleClick);
  warningDetailList?.addEventListener("click", handleClick);
  document.getElementById("mobile-context-dock")?.addEventListener("click", handleClick);
}
export function setupRadarControls({ onSeek, onStep, onTogglePlay, onGoLatest }) {
  document.getElementById("radar-prev")?.addEventListener("click", () => onStep?.(-1));
  document.getElementById("radar-next")?.addEventListener("click", () => onStep?.(1));
  document.getElementById("radar-play")?.addEventListener("click", () => onTogglePlay?.());
  document.getElementById("radar-now")?.addEventListener("click", () => onGoLatest?.());

  const detailRoot = document.getElementById("radar-time-controls");
  const mobileDock = document.getElementById("mobile-context-dock");
  const sliderRoots = [detailRoot, mobileDock].filter(Boolean);
  const isRadarSlider = (slider) => (
    slider?.id === "radar-time-slider"
    || slider?.matches?.("[data-mobile-radar-slider]")
    || slider?.matches?.("[data-mobile-lightning-slider]")
  );
  const preventTimelineSelection = (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest(".weather-time-timeline")) event.preventDefault();
  };
  let activeSlider = null;
  let activeSliderValue = null;
  let activeSliderStartX = null;
  let activeSliderStartValue = null;
  const isMobileRadarSlider = (slider) => slider?.matches?.(
    "[data-mobile-radar-slider], [data-mobile-lightning-slider]"
  );
  const updateRadarSliderPresentation = (slider, value) => {
    if (!isMobileRadarSlider(slider)) return;
    updateMobileRadarSliderProgress(slider);
    updateMobileWeatherDate(slider, value);
  };
  const previewSlider = (slider, clientX) => {
    const previousValue = activeSliderValue;
    const value = updateSliderFromTimelineDrag(
      slider,
      activeSliderStartX,
      activeSliderStartValue,
      clientX,
    );
    if (!Number.isFinite(value)) return null;
    updateRadarSliderPresentation(slider, value);
    activeSliderValue = value;
    if (value !== previousValue) onSeek?.(value);
    updateWeatherTimelineDragPosition(
      slider,
      activeSliderStartX,
      activeSliderStartValue,
      clientX,
    );
    return value;
  };

  const handlePointerDown = (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (!isRadarSlider(event.target)) return;
    activeSlider = event.target;
    activeSliderValue = Number(activeSlider.value) || 0;
    activeSliderStartX = event.clientX;
    activeSliderStartValue = activeSliderValue;
    if (isMobileRadarSlider(activeSlider)) mobileRadarDockSliding = true;
    event.preventDefault();
    event.stopPropagation();
    activeSlider.setPointerCapture?.(event.pointerId);
    beginWeatherTimelineDrag(activeSlider);
  };

  const handlePointerMove = (event) => {
    if (!activeSlider) return;
    event.preventDefault();
    event.stopPropagation();
    previewSlider(activeSlider, event.clientX);
  };

  const finishSlider = (event, { updateFromPointer = true } = {}) => {
    if (!activeSlider) return;
    event.preventDefault();
    event.stopPropagation();
    if (updateFromPointer) previewSlider(activeSlider, event.clientX);
    const finishedSlider = activeSlider;
    const value = activeSliderValue;
    finishWeatherTimelineDrag(finishedSlider, value);
    finishedSlider.releasePointerCapture?.(event.pointerId);
    if (isMobileRadarSlider(finishedSlider)) mobileRadarDockSliding = false;
    activeSlider = null;
    activeSliderValue = null;
    activeSliderStartX = null;
    activeSliderStartValue = null;
    if (Number.isFinite(value)) onSeek?.(value);
  };

  const handleInput = (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (!isRadarSlider(event.target)) return;
    const value = Number(event.target.value);
    updateRadarSliderPresentation(event.target, value);
    if (event.target !== activeSlider) onSeek?.(value);
  };

  sliderRoots.forEach((root) => {
    root.addEventListener("selectstart", preventTimelineSelection);
    root.addEventListener("dragstart", preventTimelineSelection);
    root.addEventListener("pointerdown", handlePointerDown);
    root.addEventListener("pointermove", handlePointerMove);
    root.addEventListener("pointerup", finishSlider);
    root.addEventListener("pointercancel", (event) => finishSlider(event, { updateFromPointer: false }));
    root.addEventListener("input", handleInput);
  });
}

export function setupMobileWeatherTimelineTapControls({
  onRadarPlay,
  onRadarStop,
  onRadarGoLatest,
  onLightningPlay,
  onLightningStop,
  onLightningGoLatest,
  onWeatherChartPlay,
  onWeatherChartStop,
  onWeatherChartGoLatest
}) {
  const mobileDock = document.getElementById("mobile-context-dock");
  if (!mobileDock) return;

  let activePointer = null;
  let tapCount = 0;
  let tapMode = "";
  let tapTimer = null;

  const getTapMode = (target) => {
    if (!(target instanceof HTMLInputElement)) return "";
    if (target.matches("[data-mobile-radar-slider]")) return "radar";
    if (target.matches("[data-mobile-lightning-slider]")) return "lightning";
    if (target.matches("[data-mobile-weather-chart-slider]")) return "weather-chart";
    return "";
  };
  const clearTapTimer = () => {
    if (tapTimer === null) return;
    window.clearTimeout(tapTimer);
    tapTimer = null;
  };
  const resetTapSequence = () => {
    clearTapTimer();
    tapCount = 0;
    tapMode = "";
  };
  const runTapAction = (mode, count) => {
    const actions = mode === "weather-chart"
      ? [onWeatherChartPlay, onWeatherChartStop, onWeatherChartGoLatest]
      : (mode === "lightning"
        ? [onLightningPlay, onLightningStop, onLightningGoLatest]
        : [onRadarPlay, onRadarStop, onRadarGoLatest]);
    actions[count - 1]?.();
  };
  const commitTapSequence = () => {
    const mode = tapMode;
    const count = tapCount;
    resetTapSequence();
    if (mode && count >= 1 && count <= 3) runTapAction(mode, count);
  };

  mobileDock.addEventListener("pointerdown", (event) => {
    const mode = getTapMode(event.target);
    if (!mode || event.button !== 0) return;

    clearTapTimer();
    if (tapMode && tapMode !== mode) {
      tapCount = 0;
    }
    tapMode = mode;
    activePointer = {
      id: event.pointerId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: Date.now()
    };
  });

  mobileDock.addEventListener("pointerup", (event) => {
    const pointer = activePointer;
    activePointer = null;
    if (!pointer || pointer.id !== event.pointerId) return;

    const moveDistance = Math.hypot(
      event.clientX - pointer.startX,
      event.clientY - pointer.startY
    );
    const duration = Date.now() - pointer.startedAt;
    if (
      pointer.mode !== tapMode
      || moveDistance > MOBILE_WEATHER_TIMELINE_TAP_MOVE_THRESHOLD_PX
      || duration > MOBILE_WEATHER_TIMELINE_TAP_MAX_DURATION_MS
    ) {
      resetTapSequence();
      return;
    }

    tapCount = Math.min(3, tapCount + 1);
    if (tapCount === 3) {
      commitTapSequence();
      return;
    }
    tapTimer = window.setTimeout(commitTapSequence, MOBILE_WEATHER_TIMELINE_TAP_DELAY_MS);
  });

  mobileDock.addEventListener("pointercancel", () => {
    activePointer = null;
    resetTapSequence();
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
  let draggingSliderStartX = null;
  let draggingSliderStartValue = null;
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

  const handlePointerDown = (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (!isWeatherChartSlider(event.target)) return;
    draggingSlider = event.target;
    draggingSliderStartX = event.clientX;
    draggingSliderStartValue = Number(event.target.value) || 0;
    previewedSliderValue = null;
    if (event.target.matches("[data-mobile-weather-chart-slider]")) mobileRadarDockSliding = true;
    beginWeatherTimelineDrag(event.target);
    previewSlider(event.target);
    event.preventDefault();
    event.stopPropagation();
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
    updateSliderFromTimelineDrag(
      draggingSlider,
      draggingSliderStartX,
      draggingSliderStartValue,
      event.clientX,
    );
    previewSlider(draggingSlider);
    updateWeatherTimelineDragPosition(
      draggingSlider,
      draggingSliderStartX,
      draggingSliderStartValue,
      event.clientX,
    );
    event.preventDefault();
    event.stopPropagation();
  };

  const handleChange = (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    commitSlider(event.target);
  };

  const handlePointerUp = (event) => {
    if (!draggingSlider) return;
    const finishedSlider = draggingSlider;
    updateSliderFromTimelineDrag(
      finishedSlider,
      draggingSliderStartX,
      draggingSliderStartValue,
      event.clientX,
    );
    previewSlider(draggingSlider);
    commitSlider(draggingSlider);
    finishWeatherTimelineDrag(finishedSlider, Number(finishedSlider?.value));
    finishedSlider.releasePointerCapture?.(event.pointerId);
    if (finishedSlider?.matches?.("[data-mobile-weather-chart-slider]")) mobileRadarDockSliding = false;
    draggingSlider = null;
    draggingSliderStartX = null;
    draggingSliderStartValue = null;
    previewedSliderValue = null;
    event.preventDefault();
    event.stopPropagation();
  };

  const handlePointerCancel = (event) => {
    if (!draggingSlider) return;
    const cancelledSlider = draggingSlider;
    finishWeatherTimelineDrag(cancelledSlider, Number(cancelledSlider?.value));
    cancelledSlider.releasePointerCapture?.(event.pointerId);
    if (cancelledSlider?.matches?.("[data-mobile-weather-chart-slider]")) mobileRadarDockSliding = false;
    draggingSlider = null;
    draggingSliderStartX = null;
    draggingSliderStartValue = null;
    previewedSliderValue = null;
    event.preventDefault();
    event.stopPropagation();
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

export function setupTyphoonForecastModeControls({ onChange, onModelToggle, onTimeChange }) {
  const root = document.getElementById("mobile-context-dock");
  if (!root) return;
  const selectMode = (mode) => {
    if (!["jma", "world"].includes(mode)) return;
    onChange?.(mode);
  };
  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const modelToggle = event.target.closest("[data-world-typhoon-model-toggle]");
    if (modelToggle) {
      event.stopPropagation();
      onModelToggle?.(modelToggle.dataset.worldTyphoonModelToggle);
      return;
    }
    const button = event.target.closest("[data-typhoon-forecast-mode]");
    if (!button) return;
    event.stopPropagation();
    selectMode(button.dataset.typhoonForecastMode);
  });
  root.addEventListener("mobile-dock-horizontal-swipe", (event) => {
    if (root.dataset.tab !== "typhoon") return;
    const deltaX = Number(event.detail?.deltaX) || 0;
    const velocityX = Number(event.detail?.velocityX) || 0;
    if (Math.abs(deltaX) < 36 && Math.abs(velocityX) < 0.35) return;
    const direction = Math.abs(velocityX) >= 0.35 ? velocityX : deltaX;
    const buttons = [...root.querySelectorAll("[data-typhoon-forecast-mode]")];
    const activeIndex = Math.max(0, buttons.findIndex((button) => button.getAttribute("aria-pressed") === "true"));
    const nextIndex = direction < 0
      ? Math.min(buttons.length - 1, activeIndex + 1)
      : Math.max(0, activeIndex - 1);
    const nextButton = buttons[nextIndex];
    if (!nextButton || nextIndex === activeIndex) return;
    selectMode(nextButton.dataset.typhoonForecastMode);
  });
  let activeTimeSlider = null;
  let activeTimeValue = null;
  let activeTimeStartX = null;
  let activeTimeStartValue = null;
  let activeTimePointerX = null;
  let activeTimePreviewFrame = 0;
  const isWorldTimeSlider = (target) => (
    target instanceof HTMLInputElement
    && target.matches("[data-world-typhoon-time-slider]")
  );
  const updateTimePresentation = (slider, value, { updateTimeline = true } = {}) => {
    const times = parseJsonArray(slider.dataset.worldTyphoonTimes);
    const index = clampIndex(value, times.length);
    const validTime = times[index];
    if (!validTime) return "";
    const timeline = slider.closest(".weather-time-timeline");
    if (updateTimeline) updateWeatherTimelinePosition(timeline, index);
    syncWeatherTimelineActiveTick(timeline, index);
    const dateElement = slider.closest(".mobile-dock-world-time-control")
      ?.querySelector("[data-world-typhoon-time-date]");
    if (dateElement) {
      dateElement.dateTime = validTime;
      dateElement.textContent = compactWeatherDateLabel(formatWorldForecastTime(validTime));
    }
    slider.setAttribute("aria-valuetext", formatWorldForecastTime(validTime));
    return validTime;
  };
  const previewTimeSlider = (slider, clientX) => {
    const fractionalIndex = getWeatherTimelineDragIndex(
      slider,
      activeTimeStartX,
      activeTimeStartValue,
      clientX
    );
    if (!Number.isFinite(fractionalIndex)) return;
    const value = Math.round(fractionalIndex);
    slider.value = String(value);
    if (value !== activeTimeValue) {
      updateTimePresentation(slider, value, { updateTimeline: false });
    }
    activeTimeValue = value;
    updateWeatherTimelineFractionalPosition(slider, fractionalIndex);
    const previewTime = interpolateWeatherTimelineTime(
      parseJsonArray(slider.dataset.worldTyphoonTimes),
      fractionalIndex
    );
    if (previewTime) onTimeChange?.(previewTime);
  };
  const scheduleTimeSliderPreview = (slider, clientX) => {
    activeTimePointerX = clientX;
    if (activeTimePreviewFrame) return;
    activeTimePreviewFrame = requestAnimationFrame(() => {
      activeTimePreviewFrame = 0;
      if (!activeTimeSlider || activeTimeSlider !== slider) return;
      previewTimeSlider(slider, activeTimePointerX);
    });
  };
  root.addEventListener("selectstart", (event) => {
    if (event.target instanceof Element && event.target.closest(".mobile-dock-world-time-control")) {
      event.preventDefault();
    }
  });
  root.addEventListener("pointerdown", (event) => {
    if (!isWorldTimeSlider(event.target)) return;
    activeTimeSlider = event.target;
    activeTimeValue = Number(activeTimeSlider.value) || 0;
    activeTimeStartX = event.clientX;
    activeTimeStartValue = activeTimeValue;
    activeTimePointerX = event.clientX;
    event.preventDefault();
    event.stopPropagation();
    activeTimeSlider.setPointerCapture?.(event.pointerId);
    beginWeatherTimelineDrag(activeTimeSlider);
  });
  root.addEventListener("pointermove", (event) => {
    if (!activeTimeSlider) return;
    event.preventDefault();
    event.stopPropagation();
    scheduleTimeSliderPreview(activeTimeSlider, event.clientX);
  });
  const finishTimeSlider = (event, updateFromPointer = true) => {
    if (!activeTimeSlider) return;
    event.preventDefault();
    event.stopPropagation();
    if (activeTimePreviewFrame) {
      cancelAnimationFrame(activeTimePreviewFrame);
      activeTimePreviewFrame = 0;
    }
    if (updateFromPointer) previewTimeSlider(activeTimeSlider, event.clientX);
    const slider = activeTimeSlider;
    const value = activeTimeValue;
    const validTime = updateTimePresentation(slider, value);
    finishWeatherTimelineDrag(slider, value);
    slider.releasePointerCapture?.(event.pointerId);
    activeTimeSlider = null;
    activeTimeValue = null;
    activeTimeStartX = null;
    activeTimeStartValue = null;
    activeTimePointerX = null;
    if (validTime) onTimeChange?.(validTime);
  };
  root.addEventListener("pointerup", (event) => finishTimeSlider(event));
  root.addEventListener("pointercancel", (event) => finishTimeSlider(event, false));
  root.addEventListener("input", (event) => {
    if (!isWorldTimeSlider(event.target) || event.target === activeTimeSlider) return;
    const validTime = updateTimePresentation(event.target, Number(event.target.value));
    if (validTime) onTimeChange?.(validTime);
  });
}

export function setupEarthquakeSelector({
  onChange,
  onHistoryLoadMore,
  onVolcanoClear,
  onVolcanoBulletinSelect,
  onVolcanoBulletinBack,
  onVolcanoAshForecastChange,
  onViewChange,
  onDistributionPresentationChange,
  onDistributionFilterChange,
  onDistributionRangeModeChange,
  onDistributionAreaSearch,
  onDistributionAreaClear,
  onDistributionRetry,
  getDistributionDates
}) {
  const root = document.getElementById("earthquake-list");
  const mobileDock = document.getElementById("mobile-context-dock");
  if (!root) return;
  setupSegmentedControls(root);
  const dateWheel = createHypocenterDateWheel({
    onSelect: ({ dayOffset }) => onDistributionFilterChange?.({ dayOffset })
  });

  const handleClick = (event) => {
    if (!(event.target instanceof Element)) return;
    const volcanoClearButton = event.target.closest("[data-volcano-clear-selection]");
    if (volcanoClearButton) {
      event.preventDefault();
      event.stopPropagation();
      onVolcanoClear?.();
      return;
    }
    const volcanoBulletinButton = event.target.closest("[data-volcano-bulletin-id]");
    if (volcanoBulletinButton) {
      event.preventDefault();
      event.stopPropagation();
      onVolcanoBulletinSelect?.(volcanoBulletinButton.dataset.volcanoBulletinId);
      return;
    }
    const volcanoBulletinBackButton = event.target.closest("[data-volcano-bulletin-back]");
    if (volcanoBulletinBackButton) {
      event.preventDefault();
      event.stopPropagation();
      onVolcanoBulletinBack?.();
      return;
    }
    const dateButton = event.target.closest("[data-earthquake-distribution-date-open]");
    if (dateButton) {
      event.preventDefault();
      event.stopPropagation();
      dateWheel.open({
        availableDates: getDistributionDates?.() ?? [],
        currentDate: dateButton.dataset.selectedDate,
        source: dateButton
      });
      return;
    }
    const dateStepButton = event.target.closest("[data-earthquake-distribution-date-step]");
    if (dateStepButton) {
      event.preventDefault();
      event.stopPropagation();
      const currentOffset = Number(dateStepButton.dataset.currentDayOffset);
      const step = Number(dateStepButton.dataset.earthquakeDistributionDateStep);
      if (Number.isInteger(currentOffset) && Number.isInteger(step)) {
        onDistributionFilterChange?.({ dayOffset: currentOffset + step });
      }
      return;
    }
    const viewButton = event.target.closest("[data-earthquake-view]");
    if (viewButton) {
      onViewChange?.(viewButton.dataset.earthquakeView);
      return;
    }
    const presentationButton = event.target.closest("[data-earthquake-distribution-presentation]");
    if (presentationButton) {
      onDistributionPresentationChange?.(presentationButton.dataset.earthquakeDistributionPresentation);
      return;
    }
    const retryButton = event.target.closest("[data-earthquake-distribution-retry]");
    if (retryButton) {
      onDistributionRetry?.();
      return;
    }
    const rangeModeButton = event.target.closest("[data-earthquake-distribution-range-mode]");
    if (rangeModeButton) {
      onDistributionRangeModeChange?.(
        rangeModeButton.dataset.earthquakeDistributionRangeMode === "range"
      );
      return;
    }
    const rangePresetButton = event.target.closest("[data-earthquake-distribution-range-preset]");
    if (rangePresetButton) {
      event.preventDefault();
      const controls = rangePresetButton.closest(".earthquake-distribution-range-controls");
      const startInput = controls?.querySelector('[data-earthquake-distribution-range-date="startDate"]');
      const endInput = controls?.querySelector('[data-earthquake-distribution-range-date="endDate"]');
      if (startInput instanceof HTMLInputElement) {
        startInput.value = rangePresetButton.dataset.rangeStartDate ?? "";
      }
      if (endInput instanceof HTMLInputElement) {
        endInput.value = rangePresetButton.dataset.rangeEndDate ?? "";
      }
      controls?.querySelectorAll("[data-earthquake-distribution-range-preset]").forEach((button) => {
        const active = button === rangePresetButton;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      validateDistributionRangeDraft(controls);
      return;
    }
    const rangeSearchButton = event.target.closest("[data-earthquake-distribution-range-search]");
    if (rangeSearchButton) {
      event.preventDefault();
      const draft = validateDistributionRangeDraft(
        rangeSearchButton.closest(".earthquake-distribution-range-controls")
      );
      if (!draft.valid) return;
      onDistributionFilterChange?.({
        rangeEnabled: true,
        startDate: draft.startDate,
        endDate: draft.endDate
      });
      return;
    }
    const areaSearchButton = event.target.closest("[data-earthquake-distribution-area-search]");
    if (areaSearchButton) {
      onDistributionAreaSearch?.();
      return;
    }
    const areaClearButton = event.target.closest("[data-earthquake-distribution-area-clear]");
    if (areaClearButton) {
      onDistributionAreaClear?.();
      return;
    }
    const historyLoadMoreButton = event.target.closest("[data-earthquake-history-load-more]");
    if (historyLoadMoreButton) {
      event.preventDefault();
      onHistoryLoadMore?.();
      return;
    }
    const button = event.target.closest("[data-earthquake-id]");
    if (!button) return;
    onChange?.(button.dataset.earthquakeId);
  };
  root.addEventListener("click", handleClick);
  mobileDock?.addEventListener("click", handleClick);

  const handleFilterChange = (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset.volcanoAshForecastIndex !== undefined) {
      mobileVolcanoAshSliderDragging = false;
      onVolcanoAshForecastChange?.(Number(target.value));
      return;
    }
    if (target instanceof HTMLInputElement && target.dataset.earthquakeDistributionRangeDate) {
      const controls = target.closest(".earthquake-distribution-range-controls");
      controls?.querySelectorAll("[data-earthquake-distribution-range-preset]").forEach((button) => {
        button.classList.remove("active");
        button.setAttribute("aria-pressed", "false");
      });
      validateDistributionRangeDraft(controls);
      return;
    }
    if (!(target instanceof HTMLSelectElement) || !target.dataset.earthquakeDistributionFilter) return;
    onDistributionFilterChange?.({ [target.dataset.earthquakeDistributionFilter]: target.value });
  };
  root.addEventListener("change", handleFilterChange);
  mobileDock?.addEventListener("change", handleFilterChange);

  const previewVolcanoAshForecast = (slider) => {
    const index = Number(slider.value);
    const forecastTimes = parseJsonArray(slider.dataset.volcanoAshForecastTimes);
    const forecastTime = forecastTimes[index] ?? "";
    const label = slider.closest(".mobile-dock-volcano-forecast")?.querySelector("strong");
    if (label && forecastTime) label.textContent = forecastTime;
    if (forecastTime) slider.setAttribute("aria-valuetext", forecastTime);
    onVolcanoAshForecastChange?.(index);
  };

  let activeVolcanoAshSlider = null;
  const updateVolcanoAshSliderFromPointer = (slider, clientX) => {
    const rect = slider.getBoundingClientRect();
    const thumbWidth = Math.min(44, rect.width);
    const trackStart = rect.left + thumbWidth / 2;
    const trackWidth = Math.max(1, rect.width - thumbWidth);
    const ratio = Math.min(1, Math.max(0, (clientX - trackStart) / trackWidth));
    const min = Number(slider.min) || 0;
    const max = Number(slider.max) || min;
    const nextValue = Math.round(min + ratio * (max - min));
    if (Number(slider.value) === nextValue) return;
    slider.value = String(nextValue);
    previewVolcanoAshForecast(slider);
  };

  mobileDock?.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.volcanoAshForecastIndex === undefined) return;
    activeVolcanoAshSlider = target;
    mobileVolcanoAshSliderDragging = true;
    target.setPointerCapture?.(event.pointerId);
    updateVolcanoAshSliderFromPointer(target, event.clientX);
    event.preventDefault();
    event.stopPropagation();
  });
  mobileDock?.addEventListener("pointermove", (event) => {
    if (!activeVolcanoAshSlider) return;
    updateVolcanoAshSliderFromPointer(activeVolcanoAshSlider, event.clientX);
    event.preventDefault();
    event.stopPropagation();
  });
  mobileDock?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.volcanoAshForecastIndex === undefined) return;
    previewVolcanoAshForecast(target);
  });
  const finishVolcanoAshForecastDrag = (event) => {
    if (!activeVolcanoAshSlider) return;
    const slider = activeVolcanoAshSlider;
    if (event.type === "pointerup") updateVolcanoAshSliderFromPointer(slider, event.clientX);
    slider.releasePointerCapture?.(event.pointerId);
    activeVolcanoAshSlider = null;
    mobileVolcanoAshSliderDragging = false;
    onVolcanoAshForecastChange?.(Number(slider.value));
    event.preventDefault();
    event.stopPropagation();
  };
  mobileDock?.addEventListener("pointerup", finishVolcanoAshForecastDrag);
  mobileDock?.addEventListener("pointercancel", finishVolcanoAshForecastDrag);
}

export function setupEarthquakeMapLayerToggles({ onChange }) {
  const handleClick = (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-earthquake-map-layer]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onChange?.(
      button.dataset.earthquakeMapLayer,
      button.dataset.earthquakeLayerVisible === "on"
    );
  };

  document.getElementById("mobile-context-dock")?.addEventListener("click", handleClick);
  document.getElementById("earthquake-list")?.addEventListener("click", handleClick);
}

function buildDescription(tab, state) {
  if (tab.id === "amedas") {
    const metric = getAmedasMetric(state.amedasMetric ?? state.data?.activeMetric);
    if (state.status === "loading") return `${metric.label}データを取得中です。`;
    if (state.status === "error") return `${metric.label}データを取得できませんでした。`;
    const count = countAmedasPoints(state.data, metric.id);
    const metricLabel = metric.id === "precipitation"
      ? getAmedasPrecipitationDisplayLabel(state.amedasPrecipitationPeriod ?? state.data?.precipitationPeriod)
      : (getCurrentLanguage() === "en" ? metric.primary : metric.label);
    if (getCurrentLanguage() === "en") {
      return `Showing ${metricLabel} at AMeDAS stations.${count > 0 ? `\nStations shown: ${count}` : ""}`;
    }
    return `アメダス観測地点の${metricLabel}を表示しています。${count > 0 ? `\n表示地点: ${count}地点` : ""}`;
  }
  if (tab.id === "warnings") {
    if (state.status === "loading") return localizeText("市区町村ごとの警報・注意報を取得中です。");
    if (state.status === "error") return localizeText("警報・注意報データを取得できませんでした。");
    if (state.data?.activeWarningView === "kikikuru") {
      if (state.data?.kikikuru?.deferred) return localizeText("キキクルのタイルを取得中です。");
      if (state.data?.kikikuru?.unavailable) return localizeText("キキクルのタイルを取得できませんでした。");
      const layerLabel = KIKIKURU_LAYER_OPTIONS.find((element) => element.id === state.data?.activeKikikuruLayer)?.label ?? "キキクル";
      return getCurrentLanguage() === "en"
        ? `Showing ${localizeWarningDisplayText(layerLabel)} on the map.`
        : `${layerLabel}を地図上に重ねて表示しています。`;
    }
    if (state.data?.activeWarningView === "early") {
      return localizeText("早期注意情報（警報級の可能性）を発表区域ごとに表示しています。");
    }
    if (state.data?.activeWarningView === "river") {
      if (state.data?.riverFlood?.status === "loading") return localizeText("指定河川洪水予報を取得中です。");
      if (state.data?.riverFlood?.status === "error") return localizeText("指定河川洪水予報を取得できませんでした。");
      return localizeText("発表中の指定河川洪水予報を河川区間ごとに表示しています。");
    }
    return localizeText("都道府県ごとに、市区町村の注意報・警報・危険警報・特別警報を表示しています。");
  }
  if (tab.id === "typhoon") {
    if (state.data?.worldForecastMode) {
      const enabledLabels = (state.data?.worldForecastLayers ?? [])
        .map((layer) => layer.modelInfo?.shortLabel)
        .filter(Boolean);
      const modelLabel = enabledLabels.join("・") || "各国予想";
      const isEnglish = getCurrentLanguage() === "en";
      if (["idle", "loading"].includes(state.data?.worldForecastStatus)) {
        return isEnglish
          ? `Loading ${modelLabel} forecasts.`
          : `${modelLabel}の予想を取得中です。`;
      }
      if (state.data?.worldForecastStatus === "error") {
        return isEnglish
          ? `${modelLabel} forecasts could not be loaded.`
          : `${modelLabel}の予想を取得できませんでした。`;
      }
      return isEnglish
        ? `${modelLabel} track distributions and tropical-disturbance candidates that may develop into typhoons. This is not an official JMA typhoon track forecast.`
        : `${modelLabel}の進路分布と、台風に発達する可能性がある熱帯擾乱候補です。気象庁の公式な台風進路予報ではありません。`;
    }
    if (state.status === "loading") return "台風データを取得中です。";
    if (state.status === "error") return "台風データを取得できませんでした。";
    if (state.data?.isPastTelegram) return "提供された過去実電文の台風解析・予報情報を表示しています。";
    if (state.data?.hasTyphoon === false) return "";
    if (state.data?.unavailable) return "台風データを取得できませんでした。詳細項目は未取得として表示しています。";
    return "台風の解析値を表示しています。";
  }
  if (tab.id === "earthquake") {
    if (state.earthquakeContentMode === "volcano" || state.data?.earthquakeContentMode === "volcano") {
      if (state.status === "loading") return "気象庁防災情報XMLから火山情報を取得中です。";
      if (state.status === "error") return "火山情報を取得できませんでした。前回取得した情報の最新性を確認できていません。";
      return "気象庁発表の噴火警報・予報、解説情報、観測報、降灰予報を表示しています。";
    }
    if (state.status === "loading") {
      return localizeText("気象庁防災情報XMLから地震情報を取得中です。");
    }
    if (state.status === "error") {
      return localizeText("地震情報を取得できませんでした。");
    }
    const count = state.data?.earthquakes?.length ?? 0;
    return count > 0 ? "" : localizeText("直近の地震情報はありません。");
  }
  if (tab.id === "radar" && state.weatherChartEnabled) {
    if (state.weatherChartStatus === "loading") return "天気図データを取得中です。";
    if (state.weatherChartStatus === "error") return "天気図データを取得できませんでした。";
    return "気象庁の天気図を地図上に重ねています。";
  }
  if (tab.id === "radar" && state.lightningEnabled) {
    if (state.lightningStatus === "loading") return "雷活動度と雷放電の観測データを取得中です。";
    if (state.lightningStatus === "error") return "雷活動度と雷放電の観測データを取得できませんでした。";
    return "気象庁の雷活動度と、直前5分間の落雷・雲放電を地図上に重ねています。観測位置には誤差や未検知が生じる場合があります。";
  }
  if (state.status === "loading") return `${tab.description}\nデータを取得中です。`;
  if (state.status === "error") return `${tab.description}\n取得に失敗しました。CORSまたはURL変更の可能性があります。`;
  return tab.description;
}

function buildPanelTitle(tab, state) {
  if (tab.id !== "typhoon") return tab.title;
  if (state.data?.worldForecastMode) return "各国予想";
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
  if (state.data?.activeWarningView === "river") {
    const value = state.data?.riverFlood?.latestTime ?? state.data?.riverFlood?.updatedAt;
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
    root.hidden = true;
    root.innerHTML = "";
    return;
  }

  if (timeline.status !== "ready" || !timeline.points?.length) {
    root.hidden = true;
    root.innerHTML = "";
    return;
  }

  root.setAttribute("aria-label", timeline.message || "現在地の雨雲時系列");
  root.setAttribute("title", timeline.message || "現在地の雨雲時系列");
  root.innerHTML = `
    <div class="location-radar-timeline" aria-hidden="true">
      ${timeline.points.map((point, pointIndex) => `
        <span
          class="location-radar-point${point.isForecast ? " forecast" : ""}${point.intensity > 0 ? " rainy" : ""}"
          title="${escapeHtml([point.label, point.levelLabel || "降水なし"].filter(Boolean).join(" "))}"
          style="--weather-time-index: ${pointIndex}; --point-color: ${escapeHtml(point.color || "rgba(255,255,255,0.18)")};"
        ></span>
      `).join("")}
    </div>
  `;
}

function renderMyAreaWarningInsight(root, insights, myAreas = []) {
  const areas = insights.areas ?? [];
  const warningView = insights.warningView ?? "status";
  if (!myAreas.length || !["status", "early"].includes(warningView)) {
    root.hidden = true;
    root.innerHTML = "";
    return;
  }
  const visibleAreas = warningView === "early"
    ? areas
    : areas.filter((area) => area.hasWarnings);
  if (!visibleAreas.length) {
    root.hidden = true;
    root.innerHTML = "";
    return;
  }

  root.hidden = false;
  root.className = `location-insight-panel location-insight-my-areas${warningView === "early" ? " is-early" : ""}`;
  root.innerHTML = `
    <div class="location-insight-head">
      <span>${escapeHtml(localizeText("マイエリア"))}</span>
      <strong>${visibleAreas.length}${escapeHtml(localizeText("件"))}</strong>
    </div>
    <div class="location-my-area-list">
      ${visibleAreas.map((area) => `
        <article class="location-my-area-item">
          <div>
            <strong>${escapeHtml(localizeWarningDisplayText(area.areaName))}</strong>
            <span>${escapeHtml(localizeWarningDisplayText(area.prefecture ?? ""))}</span>
          </div>
          <div class="location-my-area-badges">
            ${warningView === "early"
              ? buildMyAreaEarlyWarningBadges(area, insights.loading)
              : buildWarningBadgesMarkup((area.warnings ?? []).slice(0, 4))}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function buildMyAreaEarlyWarningBadges(area, loading = false) {
  if (loading) {
    return `<span class="warning-badge early-warning-badge early-warning-badge-none">${escapeHtml(localizeText("取得中..."))}</span>`;
  }
  const probabilities = area.probabilities ?? [];
  if (!probabilities.length) {
    return `<span class="warning-badge early-warning-badge early-warning-badge-none">${escapeHtml(localizeText("発表なし"))}</span>`;
  }
  return probabilities.slice(0, 4).map((probability) => `
    <span class="warning-badge early-warning-badge early-warning-badge-${escapeHtml(probability.level)}">${escapeHtml(localizeWarningDisplayText(formatEarlyProbabilityBadge(probability)))}</span>
  `).join("");
}

function renderLegend(tabId, amedasMetricId, warningView = "status", data = null) {
  const root = document.getElementById("legend-list");
  if (!root) return;
  const items = buildLegendItems(tabId, amedasMetricId, warningView, data);
  const isCountryForecast = tabId === "typhoon" && data?.worldForecastMode;
  const isWeatherChart = tabId === "radar" && data?.weatherChartEnabled;
  const title = document.querySelector("#legend-toggle span");
  if (title) {
    title.textContent = isCountryForecast
      ? localizeText("各国予想の凡例")
      : (isWeatherChart ? localizeText("天気図の凡例") : localizeText("凡例"));
  }

  if (tabId === "amedas" && amedasMetricId === "precipitation") {
    root.innerHTML = buildAmedasPrecipitationLegend(data?.precipitationPeriod);
    return;
  }

  const unit = getMapLegendUnit(tabId, amedasMetricId, data);

  root.innerHTML = `${isCountryForecast
    ? '<p class="legend-world-typhoon-note">線と点の色は各モデルボタンの色に対応します</p>'
    : ""}${items
    .map(([label, className, color]) => {
      const swatchStyle = color ? ` style="background:${escapeHtml(color)}"` : "";
      const visibleLabel = formatLegendLabelWithUnit(localizeText(label), unit);
      return `<div class="legend-item"><span class="legend-swatch ${className}"${swatchStyle}></span>${escapeHtml(visibleLabel)}</div>`;
    })
    .join("")}`;

}

export function getMapLegendUnit(tabId, amedasMetricId, data = null) {
  if (tabId === "radar" && !data?.lightningEnabled && !data?.weatherChartEnabled) {
    return "mm/h";
  }
  if (tabId !== "amedas" || amedasMetricId === "precipitation") return "";
  return AMEDAS_METRICS.find((item) => item.id === amedasMetricId)?.unit ?? "";
}

export function formatLegendLabelWithUnit(label, unit) {
  const text = String(label ?? "");
  if (!unit) return text;
  if (unit === "mm/h") {
    return text.includes("mm/h") ? text : text.replace(/mm(?!\/h)/gu, "mm/h");
  }
  if (text.includes(unit)) return text;
  const matches = [...text.matchAll(/-?\d+(?:\.\d+)?/gu)];
  const lastMatch = matches.at(-1);
  if (!lastMatch || lastMatch.index === undefined) return `${text} ${unit}`.trim();
  const insertAt = lastMatch.index + lastMatch[0].length;
  return `${text.slice(0, insertAt)}${unit}${text.slice(insertAt)}`;
}

export function getWeatherChartLegendItems() {
  return [
    ["等圧線", "legend-weather-chart-isobar"],
    ["高気圧", "legend-weather-chart-high"],
    ["低気圧・熱帯低気圧・温帯低気圧", "legend-weather-chart-low"],
    ["台風", "legend-weather-chart-typhoon"],
    ["寒冷前線", "legend-weather-chart-cold-front"],
    ["温暖前線", "legend-weather-chart-warm-front"],
    ["停滞前線", "legend-weather-chart-stationary-front"],
    ["閉塞前線", "legend-weather-chart-occluded-front"]
  ];
}

function buildLegendItems(tabId, amedasMetricId, warningView = "status", data = null) {
  if (tabId === "radar") {
    if (data?.weatherChartEnabled) {
      return getWeatherChartLegendItems();
    }
    if (data?.lightningEnabled) {
      return [
        ["× 対地放電（落雷）", "", "#faf500"],
        ["○ 雲放電", "", "#faf500"],
        ["活動度1", "", "#fff100"],
        ["活動度2", "", "#ff9d00"],
        ["活動度3", "", "#f04444"],
        ["活動度4", "", "#b530d5"]
      ];
    }
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
  if (tabId === "warnings" && warningView === "river") {
    return [
      ["レベル5 氾濫特別警報・発生情報", "", "#111111"],
      ["レベル4 氾濫危険警報", "", "#a900d6"],
      ["レベル3 氾濫警報", "", "#ef3340"],
      ["レベル2 氾濫注意報", "", "#f4d000"]
    ];
  }
  if (tabId === "typhoon" && data?.worldForecastMode) {
    return [
      ["選択時刻の予想位置", "legend-world-typhoon-time"],
      ["基準メンバーの進路", "legend-world-typhoon-control"],
      ["各予想メンバーの進路", "legend-world-typhoon-member"],
      ["台風に発達する可能性のある候補", "legend-world-typhoon-genesis"],
      ["予報開始時の解析位置", "legend-world-typhoon-center"]
    ];
  }
  if (tabId === "earthquake") {
    if (data?.earthquakeContentMode === "volcano") {
      const reports = data?.mapVolcanoes ?? data?.reports ?? [];
      const selected = reports.find((report) =>
        String(report?.volcanoCode ?? report?.code ?? "") === String(data?.selectedVolcanoCode ?? "")
      ) ?? getHighestPriorityVolcanoReport(reports);
      const forecasts = getAvailableVolcanoAshForecasts(selected);
      const forecastIndex = Math.max(0, Math.min(forecasts.length - 1, Number(data?.selectedVolcanoAshForecastIndex) || 0));
      const ashForecast = forecasts[forecastIndex];
      const ashLegend = ashForecast ? [
        ...getVolcanoAshfallLegendItems(ashForecast),
        ...(ashForecast.areas.some((area) => area.category === "small-cinders")
          ? [[VOLCANO_SMALL_CINDERS_STYLE.label, "", VOLCANO_SMALL_CINDERS_STYLE.color]]
          : [])
      ] : [];
      return [
        ...ashLegend,
        ["噴火警戒レベル5", "", getVolcanoLevelColor(5)],
        ["噴火警戒レベル4", "", getVolcanoLevelColor(4)],
        ["噴火警戒レベル3", "", getVolcanoLevelColor(3)],
        ["噴火警戒レベル2", "", getVolcanoLevelColor(2)],
        ["噴火警戒レベル1", "", getVolcanoLevelColor(1)]
      ];
    }
    const isHypocenterDistribution = data?.earthquakeView === "distribution";
    const tsunamiLevels = [...new Set((data?.tsunami?.areas ?? [])
      .map((area) => area.level)
      .filter((level) => level && level !== "none"))];
    const tsunamiLegend = tsunamiLevels.map((level) => [
      getTsunamiLevelLabel(level),
      "",
      getTsunamiLevelColor(level)
    ]);
    const coastalObservationStyle = getTsunamiObservationStyle(false);
    const offshoreObservationStyle = getTsunamiObservationStyle(true);
    const tsunamiObservationLegend = data?.tideStationsVisible === true ? [] : [
      ...(data?.tsunami?.observations ?? []).some((observation) => Array.isArray(observation?.coordinates))
        ? [[coastalObservationStyle.label, "legend-tsunami-coastal", coastalObservationStyle.color]]
        : [],
      ...(data?.tsunami?.offshoreObservations ?? []).some((observation) => Array.isArray(observation?.coordinates))
        ? [[offshoreObservationStyle.label, "legend-tsunami-offshore", offshoreObservationStyle.color]]
        : []
    ];
    const tideStationLegend = data?.tideStationsVisible === true && (data?.tideStations ?? []).some((station) =>
      Array.isArray(station?.coordinates)
    )
      ? [["潮位観測点", "legend-tide-station", "#5e93ad"]]
      : [];
    const mapLayerLegend = [
      ...(data?.selectedEarthquake?.estimatedIntensity && data?.estimatedIntensityVisible !== false
        ? [["推計震度分布（250mメッシュ）", "legend-estimated-intensity"]]
        : []),
      ...(data?.activeFaultVisible !== false ? [["主要活断層帯", "legend-active-fault"]] : []),
      ...(data?.plateBoundaryVisible !== false ? [
        ["収束境界", "legend-plate-convergent"],
        ["横ずれ境界", "legend-plate-transform"],
        ["その他の境界", "legend-plate-other"]
      ] : []),
      ...(data?.plateDepthContoursVisible !== false
        ? [[data?.distribution3DEnabled === true
          ? "プレート面・等深線（浅い → 深い）"
          : "プレート等深線（浅い → 深い）", "legend-plate-depth"]]
        : [])
    ];
    if (isHypocenterDistribution) {
      const depthLegend = HYPOCENTER_DEPTH_STOPS.map((stop, index) => [
        index === 0
          ? `震源の深さ：浅い・${stop.depthKm}km`
          : index === HYPOCENTER_DEPTH_STOPS.length - 1
            ? `${stop.depthKm}km・深い`
            : `${stop.depthKm}km`,
        "legend-hypocenter-depth",
        stop.color
      ]);
      return [
        ...depthLegend,
        ["深さ不明", "legend-hypocenter-depth", HYPOCENTER_UNKNOWN_DEPTH_COLOR],
        ...mapLayerLegend
      ];
    }
    return [
      ...tsunamiLegend,
      ...tsunamiObservationLegend,
      ...tideStationLegend,
      ...legendsByTab.earthquake,
      ...mapLayerLegend,
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
  window.requestAnimationFrame(() => syncMobileDockSegmentIndicator(root));
}

function buildAmedasPrecipitationLegend(periodId) {
  const period = getAmedasPrecipitationPeriod(periodId);
  const levels = getAmedasPrecipitationLevels(period.id);
  const isEnglish = getCurrentLanguage() === "en";
  const periodLabel = isEnglish ? period.primary : period.label;
  const title = isEnglish ? `${periodLabel} precipitation` : `${periodLabel}降水量`;

  return `<section class="amedas-precipitation-legend" aria-label="${escapeHtml(title)}">${levels.map((level) => `
    <div class="legend-item">
      <span class="legend-swatch" style="background:${escapeHtml(level.color)}"></span>
      ${escapeHtml(formatLegendLabelWithUnit(localizeText(level.label), "mm"))}
    </div>
  `).join("")}</section>`;
}

function renderWarningViewTabs(tab, warningView) {
  const root = document.getElementById("warning-view-tabs");
  if (!root) return;
  const isWarnings = tab.id === "warnings";
  root.hidden = !isWarnings;
  if (!isWarnings) {
    root.innerHTML = "";
    return;
  }

  const options = getWarningViewOptions(warningView);
  const currentButtons = [...root.querySelectorAll("[data-kikikuru-layer]")];
  const canReuseButtons = currentButtons.length === options.length
    && currentButtons.every((button, index) => button.dataset.kikikuruLayer === options[index]?.id);

  if (canReuseButtons) {
    currentButtons.forEach((button, index) => {
      const option = options[index];
      button.classList.toggle("active", option.active);
      button.setAttribute("aria-selected", option.active ? "true" : "false");
      button.disabled = option.active;
      button.textContent = localizeWarningDisplayText(option.label);
    });
    syncMobileDockSegmentIndicator(root);
    return;
  }

  root.innerHTML = options.map((option) => `
    <button type="button" role="tab" class="mobile-dock-action${option.active ? " active" : ""}" data-kikikuru-layer="${escapeHtml(option.id)}" aria-selected="${option.active ? "true" : "false"}"${option.active ? " disabled" : ""}>${escapeHtml(localizeWarningDisplayText(option.label))}</button>
  `).join("");
  root.classList.add("is-initializing");
  syncMobileDockSegmentIndicator(root);
  window.requestAnimationFrame(() => root.classList.remove("is-initializing"));
}

function renderAmedasPrecipitationPeriods(tab, activeMetricId, activePeriodId) {
  const root = document.getElementById("amedas-precipitation-periods");
  if (!root) return;

  const shouldShow = tab.id === "amedas" && activeMetricId === "precipitation";
  root.hidden = !shouldShow;
  if (!shouldShow) {
    root.innerHTML = "";
    return;
  }

  const activePeriod = getAmedasPrecipitationPeriod(activePeriodId);
  const isEnglish = getCurrentLanguage() === "en";
  root.innerHTML = AMEDAS_PRECIPITATION_PERIODS.map((period) => `
    <button
      type="button"
      class="amedas-precipitation-period-button${period.id === activePeriod.id ? " active" : ""}"
      data-amedas-precipitation-period="${escapeHtml(period.id)}"
      aria-pressed="${period.id === activePeriod.id ? "true" : "false"}"
    >${escapeHtml(isEnglish ? period.primary : period.label)}</button>
  `).join("");
  window.requestAnimationFrame(() => syncMobileDockSegmentIndicator(root));
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
  root.classList.toggle("lightning-active", isRadar && Boolean(state.lightningEnabled));
  if (!isRadar) return;
  if (state.weatherChartEnabled) return;

  const isLightning = Boolean(state.lightningEnabled);
  const timelineData = isLightning ? (state.lightning ?? state.data?.lightning) : state.data;
  const frames = timelineData?.frames ?? [];
  const activeIndex = Number(timelineData?.activeFrameIndex ?? 0);
  const activeFrame = frames[activeIndex] ?? null;
  const currentIndex = findLatestRadarObservationIndex(frames);
  const timelineFrames = frames.map((frame, frameIndex) => ({
    ...frame,
    isCurrent: frameIndex === currentIndex
  }));

  slider.max = String(Math.max(0, frames.length - 1));
  slider.value = String(Math.min(activeIndex, Math.max(0, frames.length - 1)));
  slider.setAttribute("aria-label", isLightning ? "雷の時刻を選択" : "雨雲レーダーの時刻を選択");
  const timelineStatus = isLightning ? state.lightningStatus : state.status;
  slider.disabled = frames.length <= 1 || timelineStatus === "loading" || timelineStatus === "error";
  renderWeatherTimeTimeline(
    document.getElementById("radar-time-timeline"),
    timelineFrames,
    activeIndex,
    (frame) => compactWeatherTimeLabel(frame?.label)
  );

  const timeLabelPrefix = isLightning ? "表示時刻" : "更新時刻";
  label.textContent = activeFrame?.label
    ? `${timeLabelPrefix}: ${activeFrame.label}`
    : (timelineStatus === "loading" ? `${timeLabelPrefix}: 取得中` : `${timeLabelPrefix}: --`);
  kind.textContent = activeFrame?.isForecast ? "予測" : "観測";
  kind.classList.toggle("forecast", Boolean(activeFrame?.isForecast));

  const radarPlaying = isLightning ? Boolean(state.lightningPlaying) : Boolean(state.radarPlaying);
  document.getElementById("radar-play")?.classList.toggle("playing", radarPlaying);
  const playButton = document.getElementById("radar-play");
  if (playButton) {
    const label = radarPlaying ? "停止" : "再生";
    playButton.setAttribute("aria-label", label);
    playButton.setAttribute("title", label);
    playButton.setAttribute("aria-pressed", String(radarPlaying));
  }
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
  const currentIndex = findLatestWeatherChartAnalysisIndex(frames);
  const frameMeta = frames.map((frame, frameIndex) => ({
    timeText: frame?.latestTime ? formatWarningTime(frame.latestTime) : "--",
    kindText: getWeatherChartFrameKindLabel(frame),
    isForecast: frame?.chartKind === "forecast",
    isCurrent: frameIndex === currentIndex,
    timelineLabel: compactWeatherTimeLabel(frame?.latestTime ? formatWarningTime(frame.latestTime) : "--")
  }));
  const timelineMarkup = buildWeatherTimeTimelineMarkup(
    frameMeta,
    activeIndex,
    (frame) => frame.timelineLabel,
    `
      <input
        id="weather-chart-time-slider"
        class="weather-time-range"
        type="range"
        min="0"
        max="${Math.max(0, frames.length - 1)}"
        value="${activeIndex}"
        ${frames.length <= 1 ? "disabled" : ""}
        data-frame-count="${frames.length}"
        data-frame-meta="${escapeHtml(JSON.stringify(frameMeta))}"
        aria-label="天気図の時刻を選択"
      />
    `
  );

  root.innerHTML = `
    <div class="weather-chart-head">
      <span class="weather-chart-kind${activeFrame?.chartKind === "forecast" ? " forecast" : ""}">${escapeHtml(kindText)}</span>
      <strong>${escapeHtml(timeText)}</strong>
    </div>
    ${timelineMarkup}
    <div class="weather-chart-actions">
      <button class="radar-action-button" type="button" data-weather-chart-action="prev" aria-label="前" title="前"${activeIndex <= 0 ? " disabled" : ""}></button>
      <button class="radar-action-button" type="button" data-weather-chart-action="latest" aria-label="最新" title="最新"></button>
      <button class="radar-action-button" type="button" data-weather-chart-action="next" aria-label="次" title="次"${activeIndex >= frames.length - 1 ? " disabled" : ""}></button>
    </div>
  `;
}

function renderTyphoonSelector(tab, state) {
  const root = document.getElementById("typhoon-selector");
  if (!root) return;

  const typhoons = state.data?.typhoons ?? [];
  const shouldShow = tab.id === "typhoon"
    && state.status === "ok"
    && state.data?.forecastMode !== "world"
    && typhoons.length > 0;
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
  const time = activeTyphoon.updatedAt
    ? `<span class="typhoon-select-updated">発表 ${escapeHtml(activeTyphoon.updatedAt)}</span>`
    : "";
  const count = typhoons.length > 1
    ? `<em class="typhoon-select-count" aria-hidden="true">${activeIndex + 1}/${typhoons.length}</em>`
    : "";
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
    const groupToggle = event.target.closest("[data-warning-group-toggle]");
    if (groupToggle?.dataset.warningGroupToggle) {
      toggleWarningGroup(root, groupToggle.dataset.warningGroupToggle);
      return;
    }
    const riverRow = event.target.closest("[data-river-flood-id]");
    if (riverRow?.dataset.riverFloodId) {
      openRiverFloodModal(riverRow.dataset.riverFloodId);
      return;
    }
    const row = event.target.closest(".warning-area-row");
    if (!row?.dataset.warningAreaCode) return;
    selectWarningArea(row.dataset.warningAreaCode, { scroll: false, openModal: true });
  });

window.addEventListener("weather-warning-area-select", (event) => {
    const areaCode = event.detail?.areaCode;
    if (areaCode) selectWarningArea(areaCode, { scroll: true, openModal: true });
  });

  window.addEventListener("river-flood-select", (event) => {
    openRiverFloodModal(event.detail?.reportId, event.detail);
  });

  document.getElementById("warning-modal")?.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-warning-modal-close]")) closeWarningModal();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeWarningModal();
  });
}

function setWarningGroupExpanded(root, groupKey, expanded, { focus = false } = {}) {
  const group = root.querySelector(`[data-warning-group="${cssEscape(groupKey)}"]`);
  const button = group?.querySelector("[data-warning-group-toggle]");
  const body = group?.querySelector(".warning-prefecture-body");
  if (!group || !button || !body) return;

  if (expanded && !body.firstElementChild) {
    const entry = activeWarningGroupsByKey.get(groupKey);
    if (entry) body.innerHTML = `<div class="warning-prefecture-body-inner">${buildWarningAreaRowsMarkup(entry.group, entry.warningView)}</div>`;
  }

  group.classList.toggle("is-open", expanded);
  button.setAttribute("aria-expanded", expanded ? "true" : "false");
  body.setAttribute("aria-hidden", expanded ? "false" : "true");
  if (expanded) expandedWarningGroupKey = groupKey;
  if (focus) button.focus({ preventScroll: true });
}

function toggleWarningGroup(root, groupKey) {
  const group = root.querySelector(`[data-warning-group="${cssEscape(groupKey)}"]`);
  const shouldOpen = !group?.classList.contains("is-open");
  root.querySelectorAll(".warning-prefecture-group.is-open").forEach((openGroup) => {
    if (openGroup.dataset.warningGroup !== groupKey) {
      setWarningGroupExpanded(root, openGroup.dataset.warningGroup, false);
    }
  });
  setWarningGroupExpanded(root, groupKey, shouldOpen);
  if (!shouldOpen && expandedWarningGroupKey === groupKey) expandedWarningGroupKey = "";
}

function ensureWarningAreaGroupOpen(root, areaCode) {
  const groupKey = warningGroupKeyByAreaCode.get(String(areaCode));
  if (!groupKey) return;
  root.querySelectorAll(".warning-prefecture-group.is-open").forEach((openGroup) => {
    if (openGroup.dataset.warningGroup !== groupKey) {
      setWarningGroupExpanded(root, openGroup.dataset.warningGroup, false);
    }
  });
  setWarningGroupExpanded(root, groupKey, true);
}

function selectWarningArea(areaCode, { scroll, openModal } = {}) {
  selectedWarningAreaCode = String(areaCode);
  const root = document.getElementById("warning-detail-list");
  if (!root || root.hidden) return;

  root.querySelectorAll(".warning-area-row.selected").forEach((row) => {
    row.classList.remove("selected");
  });

  ensureWarningAreaGroupOpen(root, selectedWarningAreaCode);
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

  const communityReportButton = document.getElementById("community-report-map-open");
  if (communityReportButton) communityReportButton.hidden = tab.id !== "radar";
  root.hidden = false;
  if (mobileRadarDockSliding && tab.id === "radar" && root.dataset.tab === "radar") return;
  if (
    mobileVolcanoAshSliderDragging
    && tab.id === "earthquake"
    && state.earthquakeContentMode === "volcano"
    && root.dataset.tab === "earthquake"
  ) return;
  const tideStationCode = tab.id === "earthquake"
    ? String(state.data?.tideObservation?.station?.code ?? "")
    : "";
  if (tideStationCode && tideStationCode !== lastMobileTideStationCode) {
    mobileEarthquakeSummaryPage = "tide";
  }
  lastMobileTideStationCode = tideStationCode;
  root.dataset.tab = tab.id;
  root.innerHTML = buildMobileContextDockContent(tab, state, context);
  if (root.querySelector(".mobile-dock-earthquake-summary-track")) {
    applyMobileEarthquakeSummaryPage(root, { animate: false });
    window.requestAnimationFrame(() => syncMobileTsunamiAreaTickers(root));
  } else {
    delete root.dataset.mobileEarthquakeSummaryPage;
    root.style.removeProperty("--mobile-summary-drag-x");
  }
  initializeMobileDockSegmentIndicators(root);
}

function initializeMobileDockSegmentIndicators(root) {
  const segments = getMobileDockSegmentedControls(root);
  segments.forEach((segment) => segment.classList.add("is-initializing"));
  syncMobileDockSegmentIndicators(root);
  window.requestAnimationFrame(() => {
    segments.forEach((segment) => segment.classList.remove("is-initializing"));
  });
}

function syncMobileDockSegmentIndicators(root) {
  getMobileDockSegmentedControls(root).forEach(syncMobileDockSegmentIndicator);
}

function getMobileDockSegmentedControls(root) {
  if (!root) return [];
  const controls = [...root.querySelectorAll(".mobile-dock-segmented")];
  return root.matches(".mobile-dock-segmented") ? [root, ...controls] : controls;
}

function syncMobileDockSegmentIndicator(segment) {
  const buttons = [...segment.querySelectorAll("button")];
  const activeButton = buttons.find(isSegmentButtonActive) ?? buttons[0];
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
    const precipitationPeriod = getAmedasPrecipitationPeriod(
      state.amedasPrecipitationPeriod ?? state.data?.precipitationPeriod
    );
    const precipitationPeriodIndex = AMEDAS_PRECIPITATION_PERIODS.findIndex(
      (period) => period.id === precipitationPeriod.id
    );
    const nextPrecipitationPeriod = AMEDAS_PRECIPITATION_PERIODS[
      (precipitationPeriodIndex + 1) % AMEDAS_PRECIPITATION_PERIODS.length
    ];
    const isPrecipitation = metric.id === "precipitation";
    const isEnglish = getCurrentLanguage() === "en";
    const nearest = findNearestAmedasPoint(state.data, state.currentLocation, metric.id);
    const nearestText = nearest
      ? `${nearest.name} ${formatAmedasRankingValue(nearest.value, metric)}`
      : getAmedasNearestFallbackText(state.currentLocation);
    const amedasLoadingLabel = state.status === "loading"
      ? "AMeDAS観測値を読み込み中"
      : (!nearest && state.currentLocation?.status === "loading" ? "現在地を読み込み中" : "");
    const nearestMarkup = amedasLoadingLabel
      ? buildMobileDockLoadingStatus(amedasLoadingLabel)
      : `<span class="mobile-dock-amedas-nearest${nearest ? "" : " is-muted"}" title="${escapeHtml(nearestText)}">${escapeHtml(nearestText)}</span>`;
    return `
      <div class="mobile-dock-content mobile-dock-amedas${isPrecipitation ? " has-precipitation-period" : ""}" aria-busy="${Boolean(amedasLoadingLabel)}">
        <div class="mobile-dock-amedas-head">
          <span class="mobile-dock-kicker">アメダス</span>
          ${isPrecipitation ? `
            <button
              type="button"
              class="mobile-dock-amedas-period-cycle"
              data-mobile-dock-control
              data-amedas-precipitation-period="${escapeHtml(nextPrecipitationPeriod.id)}"
              aria-label="${escapeHtml(isEnglish
                ? `Rainfall period: ${precipitationPeriod.primary}. Change to ${nextPrecipitationPeriod.primary}`
                : `降水量の集計時間は${precipitationPeriod.label}。押すと${nextPrecipitationPeriod.label}に切り替え`)}"
            >${escapeHtml(isEnglish ? precipitationPeriod.primary : precipitationPeriod.label)}</button>
            ${nearestMarkup}
          ` : nearestMarkup}
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
    const warningLoading = state.status === "loading"
      || info?.status === "loading"
      || (warningView === "kikikuru" && Boolean(state.data?.kikikuru?.deferred))
      || (warningView === "river" && (!state.data?.riverFlood?.status || state.data.riverFlood.status === "loading"));
    const warningLoadingLabel = warningLoading
      ? ({
          early: "早期注意情報を読み込み中",
          kikikuru: "キキクルを読み込み中",
          river: "指定河川洪水予報を読み込み中",
          status: "警報・注意報を読み込み中"
        }[warningView] ?? "警報・注意報を読み込み中")
      : "";
    return buildWarningMobileContextMarkup({
      activeKikikuruLayer: state.data?.activeKikikuruLayer,
      area,
      currentLocation: info,
      loadingLabel: warningLoadingLabel,
      warningView,
      warnings,
      riverFlood: state.data?.riverFlood
    });
  }
  if (tab.id === "typhoon") {
    return buildTyphoonMobileContextMarkup(state.data ?? {}, state.status);
  }
  if (tab.id === "earthquake") {
    if (state.earthquakeContentMode === "volcano" || state.data?.earthquakeContentMode === "volcano") {
      return buildVolcanoMobileContextMarkup(state);
    }
    if (state.data?.earthquakeView === "distribution") {
      return buildEarthquakeDistributionMobileContextMarkup(state.data);
    }
    const earthquakes = state.data?.earthquakes ?? [];
    const earthquake = state.data?.selectedEarthquake ?? earthquakes[0];
    const activeFaultVisible = state.earthquakeActiveFaultVisible ?? state.data?.activeFaultVisible ?? true;
    const plateBoundaryVisible = state.earthquakePlateBoundaryVisible ?? state.data?.plateBoundaryVisible ?? true;
    const plateDepthContoursVisible = state.earthquakePlateDepthContoursVisible ?? state.data?.plateDepthContoursVisible ?? true;
    const estimatedIntensityVisible = state.earthquakeEstimatedIntensityVisible
      ?? state.data?.estimatedIntensityVisible
      ?? true;
    return buildEarthquakeMobileContextMarkup(
      earthquake,
      activeFaultVisible,
      plateBoundaryVisible,
      plateDepthContoursVisible,
      estimatedIntensityVisible,
      state.data?.tsunami,
      state.data?.tsunamiStatus,
      state.data?.tideObservation,
      state.status
    );
  }
  return buildMobileContextMarkup(tab.label ?? "情報", "詳細情報", "開く");
}

function isSegmentButtonActive(button) {
  return button?.classList.contains("active")
    || button?.getAttribute("aria-selected") === "true"
    || button?.getAttribute("aria-pressed") === "true";
}

function buildTideObservationMobileContextMarkup(tideObservation = {}) {
  const station = tideObservation.station;
  if (!station) {
    return `
      <div class="mobile-tide-empty-heading">潮位観測</div>
      <div class="mobile-tide-empty">
        <strong>観測点を選択</strong>
        <span>地図上の潮位観測点をタップしてください</span>
      </div>
    `;
  }
  const rangeHours = [1, 6, 12, 24].includes(Number(tideObservation.rangeHours))
    ? Number(tideObservation.rangeHours)
    : 24;
  const rangeIndex = TIDE_RANGE_OPTIONS.findIndex(([hours]) => hours === rangeHours);
  const [, rangeLabel] = TIDE_RANGE_OPTIONS[rangeIndex];
  const [nextRangeHours, nextRangeLabel] = TIDE_RANGE_OPTIONS[(rangeIndex + 1) % TIDE_RANGE_OPTIONS.length];
  const latest = tideObservation.latest;
  const latestTime = formatTideObservationTime(latest?.time);
  const observed = Number.isFinite(latest?.observed) ? `${formatTideValue(latest.observed)}cm` : "--";
  const deviation = Number.isFinite(latest?.deviation)
    ? `偏差 ${latest.deviation >= 0 ? "+" : ""}${formatTideValue(latest.deviation)}cm`
    : "偏差 --";
  const graph = tideObservation.status === "ok"
    ? buildTideObservationGraph(tideObservation, rangeHours)
    : `<div class="mobile-tide-graph-status">${escapeHtml(
      tideObservation.status === "error" ? tideObservation.error : "潮位を取得中"
    )}</div>`;

  return `
      <div class="mobile-tide-head">
        <div class="mobile-tide-station">
          <span>潮位観測</span>
          <strong>${escapeHtml(station.name)}</strong>
          <small>${escapeHtml([station.agency, latestTime].filter(Boolean).join(" / "))}</small>
        </div>
        <button
          type="button"
          class="mobile-tide-period"
          data-mobile-dock-control
          data-tide-range-hours="${nextRangeHours}"
          aria-label="表示期間 ${escapeHtml(rangeLabel)}。タップで${escapeHtml(nextRangeLabel)}に変更"
        >${escapeHtml(rangeLabel)}</button>
        <div class="mobile-tide-latest">
          <strong>${escapeHtml(observed)}</strong>
          <span>${escapeHtml(deviation)}</span>
        </div>
        <button type="button" class="mobile-tide-close" data-mobile-dock-control data-tide-observation-close aria-label="潮位グラフを閉じる"></button>
      </div>
      <div class="mobile-tide-body">
        ${graph}
      </div>
  `;
}

function buildTideObservationGraph(tideObservation, rangeHours) {
  const graph = createTideGraphGeometry(tideObservation, rangeHours, {
    width: 320,
    height: 72,
    includeReferencesInScale: false
  });
  if (!graph) {
    return '<div class="mobile-tide-graph-status">表示できる観測値がありません</div>';
  }

  const referenceLines = graph.references.map((reference) => `
    <line class="mobile-tide-reference ${reference.type}" x1="0" y1="${reference.y}" x2="${graph.width}" y2="${reference.y}"></line>
  `).join("");
  const includeDate = rangeHours >= 12;
  const startLabel = formatTideAxisTime(graph.points[0].time, includeDate);
  const endLabel = formatTideAxisTime(graph.points.at(-1).time, includeDate);

  return `
    <div class="mobile-tide-chart">
      <svg viewBox="0 0 ${graph.width} ${graph.height}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(`${stationGraphLabel(tideObservation.station)}の潮位グラフ`)}">
        ${[0.25, 0.5, 0.75].map((ratio) => `
          <line class="mobile-tide-grid" x1="0" y1="${(graph.height * ratio).toFixed(1)}" x2="${graph.width}" y2="${(graph.height * ratio).toFixed(1)}"></line>
        `).join("")}
        ${referenceLines}
        <polyline class="mobile-tide-astronomical" points="${graph.astronomicalPoints}"></polyline>
        <polyline class="mobile-tide-observed" points="${graph.observedPoints}"></polyline>
      </svg>
      <span class="mobile-tide-axis-start">${escapeHtml(startLabel)}</span>
      <span class="mobile-tide-axis-end">${escapeHtml(endLabel)}</span>
      <div class="mobile-tide-legend" aria-hidden="true"><span class="observed">実測</span><span class="astronomical">天文</span></div>
    </div>
  `;
}

function createTideGraphGeometry(
  tideObservation,
  rangeHours,
  { width, height, includeReferencesInScale }
) {
  const points = getTideObservationRangePoints(tideObservation, rangeHours);
  if (points.length < 2) return null;

  const allReferences = [
    ...TIDE_WARNING_CRITERIA.map((criterion) => ({
      type: criterion.type,
      label: criterion.label,
      value: tideObservation.station?.[criterion.stationKey]
    })),
    { type: "historical", label: "過去最高潮位", value: tideObservation.station?.historicalMaximum }
  ].filter((reference) => Number.isFinite(reference.value));
  const geometry = createTideSeriesGeometry(points, ["observed", "astronomical"], {
    width,
    height,
    extraValues: includeReferencesInScale
      ? allReferences.map((reference) => reference.value)
      : [],
    minimumPadding: 5
  });
  const references = allReferences
    .filter((reference) =>
      includeReferencesInScale
      || (reference.value >= geometry.minValue && reference.value <= geometry.maxValue)
    )
    .map((reference) => ({
      ...reference,
      y: geometry.y(reference.value).toFixed(1)
    }));

  return {
    ...geometry,
    references,
    observedPoints: geometry.polylines.observed,
    astronomicalPoints: geometry.polylines.astronomical
  };
}

function createTideDeviationGraphGeometry(tideObservation, rangeHours, { width, height }) {
  const points = getTideObservationRangePoints(tideObservation, rangeHours)
    .filter((point) => Number.isFinite(point.deviation));
  if (points.length < 2) return null;
  const geometry = createTideSeriesGeometry(points, ["deviation"], {
    width,
    height,
    extraValues: [0],
    minimumPadding: 2
  });
  return {
    ...geometry,
    deviationPoints: geometry.polylines.deviation,
    zeroY: geometry.y(0).toFixed(1)
  };
}

function getTideObservationRangePoints(tideObservation, rangeHours) {
  const latestMs = Date.parse(tideObservation.latest?.time ?? "");
  return (tideObservation.points ?? []).filter((point) => {
    const timeMs = Date.parse(point.time);
    return Number.isFinite(latestMs)
      && Number.isFinite(timeMs)
      && timeMs >= latestMs - rangeHours * 60 * 60 * 1000;
  });
}

function createTideSeriesGeometry(
  points,
  keys,
  { width, height, extraValues = [], minimumPadding = 1 }
) {
  const values = points.flatMap((point) => keys.map((key) => point[key]))
    .filter(Number.isFinite)
    .concat(extraValues.filter(Number.isFinite));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max(minimumPadding, (rawMax - rawMin) * 0.12);
  const minValue = rawMin - padding;
  const maxValue = rawMax + padding;
  const startMs = Date.parse(points[0].time);
  const endMs = Date.parse(points.at(-1).time);
  const x = (time) => ((Date.parse(time) - startMs) / Math.max(1, endMs - startMs)) * width;
  const y = (value) => height - ((value - minValue) / Math.max(1, maxValue - minValue)) * height;
  const polylines = Object.fromEntries(keys.map((key) => [
    key,
    points
      .filter((point) => Number.isFinite(point[key]))
      .map((point) => `${x(point.time).toFixed(1)},${y(point[key]).toFixed(1)}`)
      .join(" ")
  ]));
  return { points, polylines, width, height, minValue, maxValue, x, y };
}

function buildTideObservationDedicatedDetailMarkup(tideObservation = {}) {
  const station = tideObservation.station;
  if (!station) {
    return `
      <section class="tide-dedicated-panel tide-dedicated-empty">
        <span>潮位観測</span>
        <h2>観測点を選択してください</h2>
        <p>地図上の潮位観測点をタップすると、実測潮位と警報基準を表示します。</p>
      </section>
    `;
  }

  const rangeHours = [1, 6, 12, 24].includes(Number(tideObservation.rangeHours))
    ? Number(tideObservation.rangeHours)
    : 24;
  const graph = tideObservation.status === "ok"
    ? createTideGraphGeometry(tideObservation, rangeHours, {
      width: 520,
      height: 232,
      includeReferencesInScale: true
    })
    : null;
  const deviationGraph = tideObservation.status === "ok"
    ? createTideDeviationGraphGeometry(tideObservation, rangeHours, {
      width: 520,
      height: 112
    })
    : null;
  const latest = tideObservation.latest;
  const latestValue = Number.isFinite(latest?.observed)
    ? `${formatTideValue(latest.observed)}cm`
    : "--";
  const latestDeviation = Number.isFinite(latest?.deviation)
    ? `${latest.deviation >= 0 ? "+" : ""}${formatTideValue(latest.deviation)}cm`
    : "--";
  const criteria = TIDE_WARNING_CRITERIA.map((criterion) => [
    criterion.type,
    criterion.label,
    station[criterion.stationKey]
  ]);
  const graphMarkup = graph ? `
    <div class="tide-dedicated-chart">
      <svg viewBox="0 0 600 290" role="img" aria-label="${escapeHtml(`${station.name}の潮位と警報基準`)}">
        <g transform="translate(62 18)">
          ${[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const value = graph.maxValue - (graph.maxValue - graph.minValue) * ratio;
            const y = graph.height * ratio;
            return `
              <line class="tide-detail-grid" x1="0" y1="${y.toFixed(1)}" x2="${graph.width}" y2="${y.toFixed(1)}"></line>
              <text class="tide-detail-axis-label" x="-9" y="${(y + 4).toFixed(1)}" text-anchor="end">${escapeHtml(formatTideValue(value))}</text>
            `;
          }).join("")}
          ${graph.references.map((reference) => {
            const labelY = Number(reference.y) < 15
              ? Number(reference.y) + 14
              : Number(reference.y) - 5;
            return `
              <line class="tide-detail-reference ${reference.type}" x1="0" y1="${reference.y}" x2="${graph.width}" y2="${reference.y}"></line>
              <text class="tide-detail-reference-label ${reference.type}" x="${graph.width - 5}" y="${labelY.toFixed(1)}" text-anchor="end">${escapeHtml(`${reference.label} ${formatTideValue(reference.value)}cm`)}</text>
            `;
          }).join("")}
          <polyline class="tide-detail-astronomical" points="${graph.astronomicalPoints}"></polyline>
          <polyline class="tide-detail-observed" points="${graph.observedPoints}"></polyline>
          <text class="tide-detail-axis-time" x="0" y="${graph.height + 20}">${escapeHtml(formatTideAxisTime(graph.points[0].time, rangeHours >= 12))}</text>
          <text class="tide-detail-axis-time" x="${graph.width}" y="${graph.height + 20}" text-anchor="end">${escapeHtml(formatTideAxisTime(graph.points.at(-1).time, rangeHours >= 12))}</text>
          <text class="tide-detail-axis-unit" x="-9" y="-5" text-anchor="end">cm</text>
        </g>
      </svg>
      <div class="tide-dedicated-legend" aria-hidden="true">
        <span class="observed">実測潮位</span>
        <span class="astronomical">天文潮位</span>
        <span class="level4">レベル4基準</span>
        <span class="level5">レベル5基準</span>
      </div>
    </div>
  ` : `<div class="tide-dedicated-status">${escapeHtml(
    tideObservation.status === "error"
      ? tideObservation.error || "潮位観測値を取得できませんでした"
      : "潮位観測値を取得中です"
  )}</div>`;
  const deviationGraphMarkup = deviationGraph ? `
    <section class="tide-deviation-section">
      <header>
        <div>
          <span>潮位偏差</span>
          <strong>実測潮位 − 天文潮位</strong>
        </div>
        <em>${escapeHtml(latestDeviation)}</em>
      </header>
      <div class="tide-deviation-chart">
        <svg viewBox="0 0 600 166" role="img" aria-label="${escapeHtml(`${station.name}の潮位偏差グラフ`)}">
          <g transform="translate(62 16)">
            ${[0, 0.5, 1].map((ratio) => {
              const value = deviationGraph.maxValue
                - (deviationGraph.maxValue - deviationGraph.minValue) * ratio;
              const y = deviationGraph.height * ratio;
              return `
                <line class="tide-detail-grid" x1="0" y1="${y.toFixed(1)}" x2="${deviationGraph.width}" y2="${y.toFixed(1)}"></line>
                <text class="tide-detail-axis-label" x="-9" y="${(y + 4).toFixed(1)}" text-anchor="end">${escapeHtml(formatSignedTideValue(value))}</text>
              `;
            }).join("")}
            <line class="tide-deviation-zero" x1="0" y1="${deviationGraph.zeroY}" x2="${deviationGraph.width}" y2="${deviationGraph.zeroY}"></line>
            <polyline class="tide-deviation-line" points="${deviationGraph.deviationPoints}"></polyline>
            <text class="tide-detail-axis-time" x="0" y="${deviationGraph.height + 20}">${escapeHtml(formatTideAxisTime(deviationGraph.points[0].time, rangeHours >= 12))}</text>
            <text class="tide-detail-axis-time" x="${deviationGraph.width}" y="${deviationGraph.height + 20}" text-anchor="end">${escapeHtml(formatTideAxisTime(deviationGraph.points.at(-1).time, rangeHours >= 12))}</text>
            <text class="tide-detail-axis-unit" x="-9" y="-4" text-anchor="end">cm</text>
          </g>
        </svg>
      </div>
      <p>プラスは実測潮位が天文潮位より高く、マイナスは低いことを示します。</p>
    </section>
  ` : "";

  return `
    <section class="tide-dedicated-panel">
      <header class="tide-dedicated-header">
        <div>
          <span>気象庁 潮位観測</span>
          <h2>${escapeHtml(station.name)}</h2>
          <small>${escapeHtml([station.agency, formatTideObservationTime(latest?.time)].filter(Boolean).join(" / "))}</small>
        </div>
        <div class="tide-dedicated-latest">
          <strong>${escapeHtml(latestValue)}</strong>
          <span>偏差 ${escapeHtml(latestDeviation)}</span>
        </div>
      </header>
      <div class="tide-dedicated-range" role="group" aria-label="潮位グラフの表示期間">
        ${TIDE_RANGE_OPTIONS.map(([hours, label]) => `
          <button type="button" data-tide-range-hours="${hours}" class="${hours === rangeHours ? "active" : ""}" aria-pressed="${hours === rangeHours}">${label}</button>
        `).join("")}
      </div>
      ${graphMarkup}
      ${deviationGraphMarkup}
      <div class="tide-dedicated-criteria">
        ${criteria.map(([type, label, value]) => `
          <article class="${type}">
            <span>${label}</span>
            <strong>${Number.isFinite(value) ? `${escapeHtml(formatTideValue(value))}cm` : "未公表"}</strong>
          </article>
        `).join("")}
      </div>
      <p class="tide-dedicated-note">観測値は速報値です。機器や通信の状態により異常値を含む場合があります。</p>
      <a class="tide-dedicated-source" href="${escapeHtml(tideObservation.sourceUrl ?? "https://www.jma.go.jp/bosai/tidelevel/")}" target="_blank" rel="noreferrer">気象庁の潮位観測情報を開く</a>
    </section>
  `;
}

function stationGraphLabel(station) {
  return String(station?.name ?? "選択地点");
}

function formatTideValue(value) {
  return Number(value).toFixed(Math.abs(Number(value)) < 10 ? 1 : 0);
}

function formatSignedTideValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return `${number > 0 ? "+" : ""}${formatTideValue(number)}`;
}

function formatTideObservationTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(date);
}

function formatTideAxisTime(value, includeDate = false) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--:--";
  const time = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(date);
  if (!includeDate) return time;
  const day = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric"
  }).format(date);
  return `${day} ${time}`;
}

function buildTyphoonMobileContextMarkup(data = {}, status = "ok") {
  const isEnglish = getCurrentLanguage() === "en";
  const forecastMode = data.forecastMode === "world" ? "world" : "jma";
  const modeSwitch = `
    <div class="mobile-dock-action-row mobile-dock-mode-switch mobile-dock-segmented mobile-dock-typhoon-mode" role="group" aria-label="台風進路の表示">
      <button type="button" class="mobile-dock-action${forecastMode === "jma" ? " active" : ""}" data-mobile-dock-control data-typhoon-forecast-mode="jma" aria-pressed="${forecastMode === "jma"}">気象庁</button>
      <button type="button" class="mobile-dock-action${forecastMode === "world" ? " active" : ""}" data-mobile-dock-control data-typhoon-forecast-mode="world" aria-pressed="${forecastMode === "world"}">各国予想</button>
    </div>
  `;
  if (forecastMode === "world") {
    const worldStatus = data.worldForecastStatus ?? "idle";
    const worldLoading = ["idle", "loading"].includes(worldStatus);
    const modelStates = data.worldForecastModelStates ?? [];
    const enabledModels = modelStates.filter((model) => model.enabled);
    const candidateCount = enabledModels.reduce((total, model) => total + (model.candidates?.length ?? 0), 0);
    const title = enabledModels.length === 0
      ? "表示モデルを選択"
      : (worldLoading
      ? "各国予想を取得中"
      : (worldStatus === "error" ? "各国予想を取得できません" : "各国予想"));
    const modelToggles = modelStates.map((model) => {
      const modelLabel = model.modelInfo?.shortLabel ?? model.id;
      return `
        <button
          type="button"
          class="mobile-dock-world-model-toggle"
          data-mobile-dock-control
          data-world-typhoon-model-toggle="${escapeHtml(model.id)}"
          style="--world-model-color: ${escapeHtml(model.modelInfo?.color ?? "#38bdf8")}"
          aria-pressed="${model.enabled}"
          aria-label="${escapeHtml(isEnglish
            ? `${model.enabled ? "Hide" : "Show"} ${model.modelInfo?.label ?? modelLabel}`
            : `${model.modelInfo?.label ?? modelLabel}を${model.enabled ? "オフ" : "オン"}にする`)}"
        >
          <span>${escapeHtml(modelLabel)}</span>
          <i aria-hidden="true"></i>
        </button>
      `;
    }).join("");
    const forecastTimes = data.worldForecastTimes ?? [];
    const selectedForecastTime = data.worldForecastTime ?? forecastTimes[0] ?? "";
    const selectedForecastIndex = Math.max(0, forecastTimes.indexOf(selectedForecastTime));
    const timelineFrames = forecastTimes.map((time) => ({
      title: formatWorldForecastTime(time),
      isCurrent: time === forecastTimes.reduce((nearest, candidate) => (
        Math.abs(Date.parse(candidate) - Date.now()) < Math.abs(Date.parse(nearest) - Date.now())
          ? candidate
          : nearest
      ), forecastTimes[0] ?? "")
    }));
    const timelineMarkup = forecastTimes.length > 0
      ? buildWeatherTimeTimelineMarkup(
        timelineFrames,
        selectedForecastIndex,
        (item) => compactWeatherTimeLabel(item.title),
        `<input
          type="range"
          class="weather-time-range mobile-dock-range-input"
          min="0"
          max="${Math.max(0, forecastTimes.length - 1)}"
          step="1"
          value="${selectedForecastIndex}"
          data-mobile-dock-control
          data-world-typhoon-time-slider
          data-world-typhoon-times="${escapeHtml(JSON.stringify(forecastTimes))}"
          aria-label="各国予想の予報時刻"
          aria-valuetext="${escapeHtml(formatWorldForecastTime(selectedForecastTime))}"
        >`,
        { compact: true }
      )
      : "";
    const timeControl = forecastTimes.length > 0 ? `
      <div class="mobile-dock-world-time-control">
        <time
          class="mobile-dock-date"
          datetime="${escapeHtml(selectedForecastTime)}"
          data-world-typhoon-time-date
        >${escapeHtml(compactWeatherDateLabel(formatWorldForecastTime(selectedForecastTime)))}</time>
        ${timelineMarkup}
      </div>
    ` : `
      <div class="mobile-dock-world-time-control is-empty" aria-busy="${worldLoading}">
        ${worldLoading
          ? buildMobileDockLoadingStatus("各国予想を読み込み中")
          : `<span>${escapeHtml(localizeText(worldStatus === "error" ? "各国予想を取得できません" : "予報時刻はありません"))}</span>`}
      </div>
    `;
    return `
      <div class="mobile-dock-content mobile-dock-typhoon mobile-dock-typhoon-world" aria-busy="${worldLoading}">
        ${modeSwitch}
        <div class="mobile-dock-world-model-toggles" role="group" aria-label="${escapeHtml(`${title}・${enabledModels.length}モデル・発達候補${candidateCount}件`)}">
          ${modelToggles}
        </div>
        ${timeControl}
      </div>
    `;
  }

  const typhoons = data.typhoons ?? [];
  if (status === "loading") {
    return `<div class="mobile-dock-content mobile-dock-typhoon" aria-busy="true">${modeSwitch}${buildMobileDockLoadingStatus("台風情報を読み込み中")}</div>`;
  }
  if (!typhoons.length || data.hasTyphoon === false) {
    return `<div class="mobile-dock-content mobile-dock-typhoon">${modeSwitch}<div class="mobile-dock-typhoon-empty">${escapeHtml(NO_TYPHOON_MESSAGE)}</div></div>`;
  }
  const selectedTyphoonId = data.selectedTyphoonId ?? "";
  const { activeIndex, activeTyphoon } = getActiveTyphoonSelection(typhoons, selectedTyphoonId);
  const nextIndex = typhoons.length > 1 ? (activeIndex + 1) % typhoons.length : activeIndex;
  const nextTyphoon = typhoons[nextIndex] ?? activeTyphoon;
  const name = activeTyphoon?.details?.name ?? activeTyphoon?.name ?? `台風 ${activeIndex + 1}`;
  const summaryName = formatTyphoonSummaryName(name);
  const nextName = nextTyphoon?.details?.name ?? nextTyphoon?.name ?? `台風 ${nextIndex + 1}`;
  const nextId = String(nextTyphoon?.id ?? `typhoon-${nextIndex}`);
  const pressure = normalizeSummaryValue(activeTyphoon?.details?.pressure);
  const maxGust = normalizeSummaryValue(activeTyphoon?.details?.maxGust);
  const summaryClassificationItems = getTyphoonClassificationItems(activeTyphoon?.details);
  const summaryClassificationMarkup = summaryClassificationItems.length ? `
    <span class="mobile-dock-typhoon-classifications" aria-label="台風の大きさと強さ">
      ${summaryClassificationItems.map(([label, value, kind, toneClass]) => `
        <span class="mobile-dock-typhoon-classification is-${kind}${toneClass}" aria-label="${escapeHtml(label)}: ${escapeHtml(value)}">${escapeHtml(value)}</span>
      `).join("")}
    </span>
  ` : "";
  const count = typhoons.length > 1 ? `${activeIndex + 1}/${typhoons.length}` : "選択中";
  const transitionStatus = activeTyphoon?.transitionStatus ?? activeTyphoon?.details?.transitionStatus ?? "";
  const switchButton = typhoons.length > 1
    ? `<button type="button" class="mobile-dock-typhoon-switch" data-mobile-dock-control data-typhoon-id="${escapeHtml(nextId)}" aria-label="${escapeHtml(`次の台風 ${nextName} に切り替え`)}">${escapeHtml(count)}</button>`
    : `<span class="mobile-dock-typhoon-switch is-static">${escapeHtml(count)}</span>`;

  return `
    <div class="mobile-dock-content mobile-dock-typhoon">
      ${modeSwitch}
      <div class="mobile-dock-typhoon-main">
        <div class="mobile-dock-typhoon-text">
          <div class="mobile-dock-typhoon-title-row">
            <strong>${escapeHtml(summaryName)}</strong>
            ${summaryClassificationMarkup}
          </div>
          ${transitionStatus ? `<span class="mobile-dock-typhoon-status">${escapeHtml(transitionStatus)}</span>` : ""}
        </div>
        <div class="mobile-dock-typhoon-values${typhoons.length > 1 ? " has-switch" : ""}" aria-label="台風の解析値">
          <span><em>気圧</em>${escapeHtml(pressure)}</span>
          <span><em>最大瞬間</em>${escapeHtml(maxGust)}</span>
          ${typhoons.length > 1 ? switchButton : ""}
        </div>
      </div>
    </div>
  `;
}

function formatWorldForecastTime(value, language = getCurrentLanguage()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(date);
}

function getWorldForecastMaxStep(system) {
  return Math.max(
    0,
    ...(system?.controlPoints ?? []).map((point) => Number(point.stepHours) || 0),
    ...(system?.members ?? []).flatMap((member) =>
      (member.points ?? []).map((point) => Number(point.stepHours) || 0)
    )
  );
}

function formatWorldCandidateSupport(candidate, language = getCurrentLanguage()) {
  const probability = Number(candidate?.genesisProbability);
  if (Number.isFinite(probability)) {
    return language === "en"
      ? `Development probability ${Math.round(probability)}%`
      : `発生確率 ${Math.round(probability)}%`;
  }
  return language === "en"
    ? `${candidate?.memberCount ?? 0} members`
    : `${candidate?.memberCount ?? 0}本支持`;
}

function normalizeSummaryValue(value) {
  const text = String(value ?? "").trim();
  return text && !["--", "-", "未取得", "取得中"].includes(text) ? text : "-";
}

function buildEarthquakeMobileContextMarkup(
  earthquake,
  activeFaultVisible,
  plateBoundaryVisible,
  plateDepthContoursVisible,
  estimatedIntensityVisible,
  tsunami,
  tsunamiStatus,
  tideObservation,
  status = "ok"
) {
  if (!earthquake) {
    const isLoading = status === "loading";
    const statusText = status === "error"
        ? localizeText("地震情報を取得できませんでした。")
        : localizeText("直近の地震情報はありません。");
    const primaryMarkup = `
      ${buildEarthquakeMobileViewSwitch("recent")}
      <div class="mobile-dock-earthquake-empty-state${isLoading ? " is-loading" : ""}" role="${status === "error" ? "alert" : "status"}" aria-live="polite" aria-busy="${isLoading}">
        ${isLoading ? buildMobileDockLoadingStatus("地震情報を読み込み中") : escapeHtml(statusText)}
      </div>
    `;
    return buildMobileEarthquakeSummaryCarousel({
      containerClass: "mobile-dock-content mobile-dock-earthquake mobile-dock-earthquake-carousel",
      primaryAriaLabel: localizeText("地震情報要約"),
      primaryDotLabel: localizeText("地震情報"),
      primaryMarkup,
      earthquake: null,
      tsunami,
      tsunamiStatus,
      tideObservation
    });
  }

  const intensityColor = getEarthquakeIntensityColor(earthquake?.maxIntensity);
  const intensityTextClass = getEarthquakeIntensityTextClass(earthquake?.maxIntensity);
  const unknownText = getEarthquakeUnknownText(earthquake);
  const intensity = formatEarthquakeUnknownMetric(
    earthquake?.maxIntensityShort ?? earthquake?.maxIntensityLabel,
    unknownText
  );
  const magnitude = formatEarthquakeMagnitude(earthquake?.magnitude, {
    prefix: true,
    unknownText
  });
  const depth = formatEarthquakeUnknownMetric(
    formatEarthquakeDepthText(earthquake?.depth, { compact: true, unknownText }),
    unknownText
  );
  const time = formatMobileEarthquakeTime(earthquake?.eventTime ?? earthquake?.reportTime);
  const tsunamiMarkup = buildMobileTsunamiStatusMarkup(earthquake, tsunami, tsunamiStatus);
  const primaryMarkup = `
    ${buildEarthquakeMobileViewSwitch("recent")}
    <div class="mobile-dock-earthquake-main">
      <em class="mobile-dock-earthquake-intensity ${intensityTextClass}">
        <small>最大震度</small>
        <span>${escapeHtml(intensity)}</span>
      </em>
      <div class="mobile-dock-earthquake-text">
        <span class="mobile-dock-earthquake-time">最新 ${escapeHtml(time)}</span>
        <strong>${escapeHtml(formatEarthquakeHypocenterText(earthquake))}</strong>
        <div class="mobile-dock-earthquake-facts">
          <span>${escapeHtml([magnitude, `深さ ${depth}`].filter((item) => item && item !== "--").join(" / ") || "詳細確認中")}</span>
          ${tsunamiMarkup}
        </div>
      </div>
      <div class="mobile-dock-earthquake-layer-list${earthquake?.estimatedIntensity ? " has-estimated-intensity" : ""}" aria-label="地震地図の表示項目">
        ${earthquake?.estimatedIntensity
          ? buildMobileEarthquakeLayerButton("estimatedIntensity", "推計震度", estimatedIntensityVisible)
          : ""}
        ${buildMobileEarthquakeLayerButton("activeFault", "活断層", activeFaultVisible)}
        ${buildMobileEarthquakeLayerButton("plateBoundary", "境界", plateBoundaryVisible)}
        ${buildMobileEarthquakeLayerButton("plateDepthContours", "等深線", plateDepthContoursVisible)}
      </div>
    </div>
  `;
  return buildMobileEarthquakeSummaryCarousel({
    containerClass: "mobile-dock-content mobile-dock-earthquake mobile-dock-earthquake-carousel",
    containerStyle: `--mobile-earthquake-intensity-bg: ${escapeHtml(intensityColor)};`,
    primaryAriaLabel: "地震情報要約",
    primaryDotLabel: "地震情報",
    primaryMarkup,
    earthquake,
    tsunami,
    tsunamiStatus,
    tideObservation
  });
}

function getTyphoonClassificationItems(details = {}) {
  const sizeText = String(details?.size ?? "");
  const sizeTone = sizeText.includes("超大型")
    ? "super-large"
    : sizeText.includes("大型")
      ? "large"
      : "neutral";
  const strengthText = String(details?.strength ?? "");
  const strengthTone = strengthText.includes("猛烈")
    ? "violent"
    : strengthText.includes("非常に強")
      ? "very-strong"
      : strengthText.includes("強")
        ? "strong"
        : "neutral";

  return [
    ["大きさ", details?.size, "size", ` is-${sizeTone}`],
    ["強さ", details?.strength, "strength", ` is-${strengthTone}`]
  ].filter(([, value]) => value && value !== "-");
}

function buildMobileEarthquakeSummaryCarousel({
  containerClass,
  containerStyle = "",
  primaryAriaLabel,
  primaryDotLabel,
  primaryMarkup,
  earthquake,
  tsunami,
  tsunamiStatus,
  tideObservation
}) {
  const isEnglish = getCurrentLanguage() === "en";
  const tsunamiSummaryMarkup = buildMobileTsunamiSummaryMarkup(earthquake, tsunami, tsunamiStatus);
  const styleAttribute = containerStyle ? ` style="${containerStyle}"` : "";
  const summaryPages = [
    ["earthquake", primaryDotLabel],
    ["tsunami", isEnglish ? "Tsunami information" : "津波情報"],
    ["tide", isEnglish ? "Tide observations" : "潮位観測"]
  ];
  return `
    <div class="${containerClass}"${styleAttribute}>
      <div class="mobile-dock-earthquake-summary-viewport" role="group" aria-label="${isEnglish ? "Earthquake and tsunami summaries" : "地震・津波情報要約"}" aria-roledescription="${isEnglish ? "carousel" : "カルーセル"}">
        <div class="mobile-dock-earthquake-summary-track">
          <section class="mobile-dock-earthquake-summary-page" data-mobile-earthquake-summary="earthquake" aria-label="${primaryAriaLabel}">
            ${primaryMarkup}
          </section>
          <section class="mobile-dock-earthquake-summary-page" data-mobile-earthquake-summary="tsunami" aria-label="${isEnglish ? "Tsunami summary" : "津波情報要約"}">
            <div class="mobile-dock-tsunami-heading">${isEnglish ? "Tsunami information" : "津波情報"}</div>
            ${tsunamiSummaryMarkup}
          </section>
          <section class="mobile-dock-earthquake-summary-page mobile-dock-tide" data-mobile-earthquake-summary="tide" aria-label="${isEnglish ? "Tide observation summary" : "潮位観測要約"}">
            ${buildTideObservationMobileContextMarkup(tideObservation)}
          </section>
        </div>
        <div class="mobile-dock-earthquake-summary-dots" aria-label="${isEnglish ? "Choose a summary" : "要約表示の切り替え"}">
          ${summaryPages.map(([page, label]) => `
            <button
              type="button"
              data-mobile-dock-control
              data-mobile-earthquake-summary-dot="${page}"
              data-mobile-earthquake-summary-target="${page}"
              aria-label="${isEnglish ? `Show ${localizeText(label, "en")}` : `${label}へ切り替え`}"
            ></button>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function buildMobileTsunamiSummaryMarkup(earthquake, tsunami, tsunamiStatus) {
  const state = getCurrentTsunamiState(earthquake, tsunami, tsunamiStatus);
  const report = state.tsunami;
  const areas = (report?.areas ?? []).filter((area) => area.level !== "none");
  const tickerAreas = [...areas].sort(
    (left, right) => getMobileTsunamiLevelRank(right.level) - getMobileTsunamiLevelRank(left.level)
  );
  const observations = [...(report?.observations ?? []), ...(report?.offshoreObservations ?? [])];
  const primaryArea = areas[0];
  const latestObservation = observations[0];
  const color = ["unknown", "unavailable"].includes(state.level)
    ? "#8594a6"
    : getTsunamiLevelColor(state.level);
  const reportTime = formatMobileEarthquakeTime(report?.reportTime);
  const hasCounts = areas.length > 0 || observations.length > 0;
  const title = primaryArea?.name
    || latestObservation?.stationName
    || (state.level === "none" ? "警報・注意報なし" : state.label || "発表状況を確認中");
  const areaTickerText = tickerAreas
    .map((area) => area.name)
    .filter(Boolean)
    .join("　•　");
  const tickerGroups = tickerAreas
    .filter((area) => area.name)
    .reduce((groups, area) => {
      const current = groups.at(-1);
      if (current?.level === area.level) {
        current.areas.push(area);
      } else {
        groups.push({ level: area.level, areas: [area] });
      }
      return groups;
    }, []);
  const areaTickerGroupsMarkup = tickerGroups
    .map((group, groupIndex) => {
      const groupText = group.areas.map((area) => area.name).join("　•　");
      const duration = Math.max(12, Math.min(28, Math.ceil(groupText.length * 0.55)));
      const areasMarkup = group.areas
        .map((area, index, entries) => `
          <strong data-mobile-tsunami-area-level="${escapeHtml(area.level)}">${escapeHtml(area.name)}${index < entries.length - 1 ? "　•　" : ""}</strong>
        `)
        .join("");
      return `
        <span
          class="mobile-dock-tsunami-area-ticker-sequence"
          data-mobile-tsunami-ticker-level="${escapeHtml(group.level)}"
          data-mobile-tsunami-ticker-duration="${duration}"
          ${groupIndex === 0 ? "" : "hidden"}
        >${areasMarkup}</span>
      `;
    })
    .join("");
  const detailCandidate = primaryArea
    ? ""
    : latestObservation
      ? `${latestObservation.stationName} ${latestObservation.maxHeightCondition || latestObservation.maxHeight || "観測中"}`
      : state.level === "none"
        ? "現在発表中の情報はありません"
        : state.label;
  const detail = detailCandidate && detailCandidate !== title ? detailCandidate : "";

  return `
    <div class="mobile-dock-tsunami-main${hasCounts ? "" : " no-counts"}" style="--mobile-tsunami-color: ${escapeHtml(color)};">
      ${report?.isTestScenario ? '<span class="tsunami-test-badge">LOCAL TEST</span>' : ""}
      <em class="mobile-dock-tsunami-level" data-mobile-tsunami-level-badge>
        <span>${escapeHtml(getMobileTsunamiLevelShortLabel(state.level))}</span>
      </em>
      <div class="mobile-dock-tsunami-text">
        <span class="mobile-dock-earthquake-time">${reportTime !== "--" ? `発表 ${escapeHtml(reportTime)}` : "気象庁発表"}</span>
        ${areaTickerText ? `
          <div
            class="mobile-dock-tsunami-area-ticker"
            aria-label="発表区域 ${escapeHtml(areaTickerText)}"
          >
            <div class="mobile-dock-tsunami-area-ticker-track">
              ${areaTickerGroupsMarkup}
            </div>
          </div>
        ` : `<strong>${escapeHtml(title)}</strong>`}
        ${detail ? `<span>${escapeHtml(detail)}</span>` : ""}
      </div>
      ${hasCounts ? `<div class="mobile-dock-tsunami-values" aria-label="津波情報の件数">
        <span><em>区域</em>${areas.length || "-"}</span>
        <span><em>観測</em>${observations.length || "-"}</span>
      </div>` : ""}
    </div>
  `;
}

function getMobileTsunamiLevelShortLabel(level) {
  if (level === "major-warning") return "大津波";
  if (level === "warning") return "警報";
  if (level === "advisory") return "注意報";
  if (level === "forecast") return "予報";
  if (level === "none") return "なし";
  return "未確認";
}

function getMobileTsunamiLevelRank(level) {
  return {
    "major-warning": 4,
    warning: 3,
    advisory: 2,
    forecast: 1,
    none: 0
  }[level] ?? -1;
}

function syncMobileTsunamiAreaTickers(root) {
  clearMobileTsunamiTickerTimers();
  root?.querySelectorAll(".mobile-dock-tsunami-area-ticker").forEach((ticker) => {
    const track = ticker.querySelector(".mobile-dock-tsunami-area-ticker-track");
    if (!track) return;
    track.querySelectorAll("[data-mobile-tsunami-ticker-duplicate]")
      .forEach((duplicate) => duplicate.remove());
    ticker.classList.remove("is-animated");
    ticker.classList.remove("is-group-changing");
    ticker.dataset.mobileTsunamiTickerGroup = "0";
    activateMobileTsunamiTickerGroup(ticker, 0);
  });
}

function clearMobileTsunamiTickerTimers() {
  if (mobileTsunamiTickerGroupTimer) {
    window.clearTimeout(mobileTsunamiTickerGroupTimer);
    mobileTsunamiTickerGroupTimer = 0;
  }
  if (mobileTsunamiTickerTransitionTimer) {
    window.clearTimeout(mobileTsunamiTickerTransitionTimer);
    mobileTsunamiTickerTransitionTimer = 0;
  }
}

function activateMobileTsunamiTickerGroup(ticker, groupIndex) {
  const track = ticker.querySelector(".mobile-dock-tsunami-area-ticker-track");
  const main = ticker.closest(".mobile-dock-tsunami-main");
  const badge = main?.querySelector("[data-mobile-tsunami-level-badge]");
  const badgeText = badge?.querySelector("span");
  if (!track || !main || !badge || !badgeText) return;

  const groups = [...track.querySelectorAll(
    ".mobile-dock-tsunami-area-ticker-sequence[data-mobile-tsunami-ticker-level]:not([data-mobile-tsunami-ticker-duplicate])"
  )];
  if (!groups.length) return;
  const normalizedIndex = ((groupIndex % groups.length) + groups.length) % groups.length;
  const sequence = groups[normalizedIndex];
  const level = sequence.dataset.mobileTsunamiTickerLevel;
  track.querySelectorAll("[data-mobile-tsunami-ticker-duplicate]")
    .forEach((duplicate) => duplicate.remove());
  groups.forEach((group, index) => {
    group.hidden = index !== normalizedIndex;
  });
  ticker.classList.remove("is-animated");
  ticker.dataset.mobileTsunamiTickerGroup = String(normalizedIndex);
  badge.dataset.mobileTsunamiCurrentLevel = level;
  badgeText.textContent = getMobileTsunamiLevelShortLabel(level);
  main.style.setProperty("--mobile-tsunami-color", getTsunamiLevelColor(level));

  const durationSeconds = Number(sequence.dataset.mobileTsunamiTickerDuration) || 18;
  track.style.setProperty("--mobile-tsunami-ticker-duration", `${durationSeconds}s`);
  void track.offsetWidth;
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const overflows = sequence.scrollWidth > ticker.clientWidth;
  if (overflows && !prefersReducedMotion) {
    const duplicate = sequence.cloneNode(true);
    duplicate.hidden = false;
    duplicate.setAttribute("aria-hidden", "true");
    duplicate.setAttribute("data-mobile-tsunami-ticker-duplicate", "");
    track.append(duplicate);
    ticker.classList.add("is-animated");
  }

  const summaryPage = ticker.closest('[data-mobile-earthquake-summary="tsunami"]');
  const isVisible = summaryPage?.getAttribute("aria-hidden") !== "true";
  if (groups.length > 1 && isVisible) {
    const displayDuration = overflows && !prefersReducedMotion
      ? durationSeconds * 1000
      : 3500;
    mobileTsunamiTickerGroupTimer = window.setTimeout(
      () => switchMobileTsunamiTickerGroup(ticker),
      displayDuration
    );
  }
}

function switchMobileTsunamiTickerGroup(ticker) {
  if (!ticker.isConnected) return;
  const summaryPage = ticker.closest('[data-mobile-earthquake-summary="tsunami"]');
  if (summaryPage?.getAttribute("aria-hidden") === "true") return;
  const currentIndex = Number(ticker.dataset.mobileTsunamiTickerGroup) || 0;
  ticker.classList.add("is-group-changing");
  mobileTsunamiTickerTransitionTimer = window.setTimeout(() => {
    activateMobileTsunamiTickerGroup(ticker, currentIndex + 1);
    window.requestAnimationFrame(() => ticker.classList.remove("is-group-changing"));
  }, 160);
}

function applyMobileEarthquakeSummaryPage(root, { animate = true } = {}) {
  const track = root?.querySelector(".mobile-dock-earthquake-summary-track");
  if (!track) return;
  const pages = ["earthquake", "tsunami", "tide"];
  const page = pages.includes(mobileEarthquakeSummaryPage)
    ? mobileEarthquakeSummaryPage
    : "earthquake";
  const pageIndex = pages.indexOf(page);
  root.dataset.mobileEarthquakeSummaryPage = page;
  root.classList.toggle("is-summary-snapping", animate);
  root.style.setProperty("--mobile-earthquake-summary-position", `${pageIndex * (-100 / pages.length)}%`);
  root.style.setProperty("--mobile-summary-drag-x", "0px");
  root.querySelectorAll("[data-mobile-earthquake-summary]").forEach((item) => {
    const hidden = item.dataset.mobileEarthquakeSummary !== page;
    item.setAttribute("aria-hidden", String(hidden));
    item.toggleAttribute("inert", hidden);
  });
  root.querySelectorAll("[data-mobile-earthquake-summary-dot]").forEach((dot) => {
    dot.classList.toggle("active", dot.dataset.mobileEarthquakeSummaryDot === page);
  });
  window.requestAnimationFrame(() => syncMobileTsunamiAreaTickers(root));
  applyMobileEarthquakeDetailPage(page);
  if (animate) {
    window.setTimeout(() => root.classList.remove("is-summary-snapping"), 400);
  }
}

function applyMobileEarthquakeDetailPage(page) {
  const detailRoot = document.getElementById("earthquake-list");
  const detailPage = ["earthquake", "tsunami", "tide"].includes(page) ? page : "earthquake";
  detailRoot?.querySelectorAll("[data-mobile-earthquake-detail]").forEach((item) => {
    const hidden = item.dataset.mobileEarthquakeDetail !== detailPage;
    item.hidden = hidden;
    item.setAttribute("aria-hidden", String(hidden));
    item.toggleAttribute("inert", hidden);
  });
  const dock = document.getElementById("mobile-context-dock");
  const modeLabel = document.getElementById("mode-label");
  if (
    modeLabel
    && dock?.dataset.tab === "earthquake"
    && detailRoot?.querySelector("[data-mobile-earthquake-detail]")
  ) {
    modeLabel.textContent = page === "tide"
      ? "潮位観測"
      : page === "tsunami" ? "津波情報" : "地震情報";
  }
}

function formatMobileEarthquakeTime(value) {
  const text = String(value ?? "").trim().replace(/頃$/u, "");
  if (!text || text === "--") return "--";
  const match = text.match(/(?:\d{4}\/)?(\d{1,2}\/\d{1,2})\s+(\d{1,2}:\d{2})/u);
  return match ? `${match[1]} ${match[2]}` : text;
}
function buildWarningMobileContextMarkup({ activeKikikuruLayer, area, currentLocation, loadingLabel, riverFlood, warningView, warnings }) {
  if (warningView === "river") return buildRiverFloodMobileContextMarkup(riverFlood, currentLocation, loadingLabel);
  const topWarning = getPrimaryMobileWarning(warnings);
  const warningBadges = warningView === "status" && !loadingLabel
    ? buildWarningBadgesMarkup(warnings)
    : "";
  const statusText = localizeWarningDisplayText(topWarning?.label ?? "発表なし");
  const level = topWarning?.level ?? "none";
  const badgeColorClass = getMobileWarningBadgeColorClass(warningView, level);
  return `
    <div class="mobile-dock-content mobile-dock-warning" aria-busy="${Boolean(loadingLabel)}">
      <div class="mobile-dock-warning-head">
        ${buildWarningMobileActionRow(warningView)}
      </div>
      ${loadingLabel
        ? `<div class="mobile-dock-warning-main is-loading">${buildMobileDockLoadingStatus(loadingLabel)}</div>`
        : warningView === "kikikuru"
        ? buildKikikuruMobileLayerRow(activeKikikuruLayer)
        : `<div class="mobile-dock-warning-main">
            <div class="mobile-dock-warning-text">
              <strong>${escapeHtml(localizeWarningDisplayText(area))}</strong>
            </div>
            ${warningBadges
              ? `<div class="mobile-dock-warning-badges warning-badges">${warningBadges}</div>`
              : `<span class="warning-badge mobile-dock-warning-badge ${escapeHtml(badgeColorClass)}">${escapeHtml(statusText)}</span>`}
          </div>`}
    </div>
  `;
}

function buildRiverFloodMobileContextMarkup(riverFlood = {}, currentLocation = {}, loadingLabel = "") {
  const reports = Array.isArray(riverFlood?.reports) ? riverFlood.reports : [];
  const report = selectRiverFloodSummaryReport(riverFlood, currentLocation);
  const failed = riverFlood?.status === "error";
  const label = localizeWarningDisplayText(failed ? "取得失敗" : (report?.levelLabel ?? "発表なし"));
  const forecastAreaName = getRiverForecastDisplayName(report);
  return `
    <div class="mobile-dock-content mobile-dock-warning mobile-dock-river" aria-busy="${Boolean(loadingLabel)}">
      <div class="mobile-dock-warning-head">${buildWarningMobileActionRow("river")}</div>
      ${loadingLabel
        ? `<div class="mobile-dock-warning-main is-loading">${buildMobileDockLoadingStatus(loadingLabel)}</div>`
        : `<div class="mobile-dock-warning-main">
            <div class="mobile-dock-warning-text">
              <strong>${escapeHtml(forecastAreaName)}</strong>
            </div>
            <span class="river-flood-level river-flood-level-${escapeHtml(report?.level ?? 0)}">${escapeHtml(label)}</span>
          </div>`}
    </div>
  `;
}

function selectRiverFloodSummaryReport(riverFlood = {}, currentLocation = {}) {
  const reports = Array.isArray(riverFlood?.reports) ? riverFlood.reports : [];
  const sortedReports = [...reports].sort((left, right) => Number(right.level ?? 0) - Number(left.level ?? 0));
  if (currentLocation?.status !== "found") return sortedReports[0];

  const currentCode = normalizeRiverAreaCode(currentLocation.areaCode);
  const currentName = String(currentLocation.areaName ?? "").trim();
  const containingReports = sortedReports.filter((report) => (report.affectedAreas ?? []).some((area) => {
    const areaCode = normalizeRiverAreaCode(area.cityCode);
    return (currentCode && areaCode === currentCode) || (currentName && String(area.city ?? "").trim() === currentName);
  }));
  if (containingReports.length) return containingReports[0];

  const origin = normalizeCoordinatePair(currentLocation.coordinates);
  const features = riverFlood?.riverFeatures?.features ?? [];
  if (!origin || !features.length) return sortedReports[0];

  const nearest = features.reduce((result, feature) => {
    const distanceKm = getDistanceToRiverGeometryKm(origin, feature?.geometry);
    if (!Number.isFinite(distanceKm) || (result && result.distanceKm <= distanceKm)) return result;
    return { feature, distanceKm };
  }, null);
  if (!nearest) return sortedReports[0];

  const properties = nearest.feature?.properties ?? {};
  const activeReport = reports.find((report) => String(report.id) === String(properties.reportId ?? ""));
  if (activeReport) return { ...activeReport, level: 0, levelLabel: "予報区域外" };
  return {
    forecastAreaCode: String(properties.FAREACODE ?? ""),
    forecastAreaName: properties.forecastAreaName || properties.RIVERNAME || "最寄りの指定河川",
    level: 0,
    levelLabel: "予報区域外"
  };
}

function normalizeRiverAreaCode(value) {
  return String(value ?? "").replace(/\D/gu, "").replace(/^0+/u, "");
}

function getDistanceToRiverGeometryKm(origin, geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return Number.POSITIVE_INFINITY;
  const lines = geometry.type === "LineString"
    ? [geometry.coordinates]
    : (geometry.type === "MultiLineString" ? geometry.coordinates : []);
  return lines.reduce((nearest, line) => {
    if (!Array.isArray(line) || line.length === 0) return nearest;
    if (line.length === 1) return Math.min(nearest, getDistanceKm(origin, line[0]));
    for (let index = 1; index < line.length; index += 1) {
      nearest = Math.min(nearest, getPointToRiverSegmentDistanceKm(origin, line[index - 1], line[index]));
    }
    return nearest;
  }, Number.POSITIVE_INFINITY);
}

function getPointToRiverSegmentDistanceKm(point, start, end) {
  const normalizedStart = normalizeCoordinatePair(start);
  const normalizedEnd = normalizeCoordinatePair(end);
  if (!normalizedStart || !normalizedEnd) return Number.POSITIVE_INFINITY;
  const latitudeScale = 111.32;
  const longitudeScale = latitudeScale * Math.cos(point[1] * Math.PI / 180);
  const startX = (normalizedStart[0] - point[0]) * longitudeScale;
  const startY = (normalizedStart[1] - point[1]) * latitudeScale;
  const endX = (normalizedEnd[0] - point[0]) * longitudeScale;
  const endY = (normalizedEnd[1] - point[1]) * latitudeScale;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = deltaX ** 2 + deltaY ** 2;
  if (lengthSquared === 0) return Math.hypot(startX, startY);
  const ratio = Math.max(0, Math.min(1, -(startX * deltaX + startY * deltaY) / lengthSquared));
  return Math.hypot(startX + ratio * deltaX, startY + ratio * deltaY);
}
function buildWarningBadgeMarkup(warning = {}) {
  return `<span class="warning-badge warning-badge-${escapeHtml(warning.level ?? "none")}">${escapeHtml(localizeWarningDisplayText(warning.label ?? ""))}</span>`;
}

function buildWarningBadgesMarkup(warnings = []) {
  return warnings.map(buildWarningBadgeMarkup).join("");
}

function localizeWarningDisplayText(value) {
  const language = getCurrentLanguage();
  const source = String(value ?? "").trim();
  if (!source || language !== "en") return source;
  const localized = localizeText(source, language);
  if (!/[\u3040-\u30ff\u3400-\u9fff]/u.test(localized)) return localized;
  return source
    .split(/(\s+|・)/u)
    .map((part) => /[\u3040-\u30ff\u3400-\u9fff]/u.test(part) ? localizeText(part, language) : part)
    .join("");
}

function containsJapaneseWarningText(value) {
  return /[\u3040-\u30ff\u3400-\u9fff]/u.test(String(value ?? ""));
}

function localizeWarningDataText(value, fallback = "") {
  const localized = localizeWarningDisplayText(value);
  if (getCurrentLanguage() !== "en" || !containsJapaneseWarningText(localized)) return localized;
  return localizeWarningDisplayText(fallback);
}

function getRiverForecastDisplayName(report = {}) {
  const code = String(report?.forecastAreaCode ?? "").trim();
  const fallback = code ? `Designated river forecast (${code})` : "Designated river flood forecast";
  return localizeWarningDataText(report?.forecastAreaName ?? "指定河川洪水予報", fallback);
}

function getPrimaryMobileWarning(warnings = []) {
  const rank = { emergency: 4, danger: 3, high: 3, warning: 2, middle: 2, advisory: 1 };
  return [...warnings].sort((a, b) => (rank[b?.level] ?? 0) - (rank[a?.level] ?? 0))[0] ?? null;
}

function getWarningViewOptions(warningView) {
  return [
    { id: "status", label: "発表", active: warningView === "status" },
    { id: "early", label: "早期", active: warningView === "early" },
    { id: "kikikuru", label: "キキクル", active: warningView === "kikikuru" },
    { id: "river", label: "河川", active: warningView === "river" }
  ];
}

function getWarningViewTitle(warningView) {
  const labels = {
    status: "発表中の警報・注意報",
    early: "早期注意情報",
    kikikuru: "キキクル",
    river: "指定河川洪水予報"
  };
  return labels[warningView] ?? labels.status;
}

function buildWarningMobileActionRow(warningView) {
  const options = getWarningViewOptions(warningView);
  return `
    <div class="mobile-dock-action-row mobile-dock-warning-actions mobile-dock-segmented">
      ${options.map((option) => `
        <button type="button" class="mobile-dock-action${option.active ? " active" : ""}" data-mobile-dock-control data-kikikuru-layer="${escapeHtml(option.id)}" aria-pressed="${option.active ? "true" : "false"}"${option.active ? " disabled" : ""}>${escapeHtml(localizeWarningDisplayText(option.label))}</button>
      `).join("")}
    </div>
  `;
}

function buildKikikuruMobileLayerRow(activeKikikuruLayer) {
  const options = KIKIKURU_LAYER_OPTIONS.map((option) => ({
    ...option,
    active: option.id === activeKikikuruLayer,
    shortLabel: localizeWarningDisplayText(option.label.replace("キキクル", ""))
  }));
  return `
    <div class="mobile-dock-kikikuru-layers">
      <span class="mobile-dock-kikikuru-label">${escapeHtml(localizeWarningDisplayText("表示レイヤー"))}</span>
      <div class="mobile-dock-action-row mobile-dock-kikikuru-actions mobile-dock-segmented">
        ${options.map((option) => `
          <button type="button" class="mobile-dock-action${option.active ? " active" : ""}" data-mobile-dock-control data-kikikuru-layer="${escapeHtml(option.id)}" aria-pressed="${option.active ? "true" : "false"}"${option.active ? " disabled" : ""}>${escapeHtml(option.shortLabel)}</button>
        `).join("")}
      </div>
    </div>
  `;
}
function buildRadarMobileContextMarkup(frames, index, status, state = {}) {
  const weatherChartEnabled = Boolean(state.weatherChartEnabled);
  const lightningEnabled = Boolean(state.lightningEnabled);
  const weatherChartLoading = weatherChartEnabled && state.weatherChartStatus === "loading";
  const lightningLoading = lightningEnabled && state.lightningStatus === "loading";
  const radarLoading = !weatherChartEnabled && !lightningEnabled && status === "loading";
  const loadingLabel = weatherChartLoading
    ? "天気図を読み込み中"
    : (lightningLoading ? "雷情報を読み込み中" : (radarLoading ? "雨雲レーダーを読み込み中" : ""));
  const weatherChart = state.weatherChart ?? state.data?.weatherChart;
  const chartFrames = Array.isArray(weatherChart?.frames)
    ? weatherChart.frames
    : (weatherChart?.featureCount > 0 ? [weatherChart] : []);
  const chartIndex = clampIndex(weatherChart?.activeFrameIndex ?? 0, chartFrames.length);
  const chartFrame = chartFrames[chartIndex] ?? weatherChart?.activeFrame ?? weatherChart;

  const radarLength = frames.length;
  const radarFrame = frames[index] ?? null;
  const currentRadarIndex = findLatestRadarObservationIndex(frames);
  const radarFrameMeta = frames.map((item, frameIndex) => ({
    title: item?.label ?? "--",
    meta: item?.isForecast ? "予測" : "観測",
    isCurrent: frameIndex === currentRadarIndex
  }));
  const lightning = state.lightning ?? state.data?.lightning;
  const lightningFrames = lightning?.frames ?? [];
  const lightningIndex = clampIndex(lightning?.activeFrameIndex ?? 0, lightningFrames.length);
  const currentLightningIndex = findLatestRadarObservationIndex(lightningFrames);
  const lightningFrameMeta = lightningFrames.map((item, frameIndex) => ({
    title: item?.label ?? "--",
    meta: item?.isForecast ? "予測" : "解析",
    isCurrent: frameIndex === currentLightningIndex,
    timeLabel: compactWeatherTimeLabel(item?.label)
  }));

  const currentChartIndex = findLatestWeatherChartAnalysisIndex(chartFrames);
  const chartFrameMeta = chartFrames.map((item, frameIndex) => ({
    title: item?.latestTime ? formatWarningTime(item.latestTime) : "--",
    meta: getWeatherChartFrameKindLabel(item),
    isCurrent: frameIndex === currentChartIndex
  }));

  const isChartMode = weatherChartEnabled;
  const isLightningMode = lightningEnabled;
  const length = isChartMode
    ? chartFrames.length
    : (isLightningMode ? lightningFrames.length : radarLength);
  const activeIndex = isChartMode
    ? chartIndex
    : (isLightningMode ? lightningIndex : index);
  const frameMeta = isChartMode
    ? chartFrameMeta
    : (isLightningMode ? lightningFrameMeta : radarFrameMeta);
  const frameDates = frameMeta.map((item) => compactWeatherDateLabel(item?.title));
  const activeDate = frameDates[activeIndex] ?? "--";
  const frameDatesAttribute = `data-mobile-weather-dates="${escapeHtml(JSON.stringify(frameDates))}"`;
  const range = length > 1
    ? buildWeatherTimeTimelineMarkup(
      frameMeta,
      activeIndex,
      (item) => isLightningMode
        ? item?.timeLabel
        : compactWeatherTimeLabel(item?.title),
      `<input type="range" class="weather-time-range mobile-dock-range-input" min="0" max="${length - 1}" value="${activeIndex}" data-mobile-dock-control ${isChartMode ? "data-mobile-weather-chart-slider" : (isLightningMode ? "data-mobile-lightning-slider" : "data-mobile-radar-slider")} ${frameDatesAttribute} aria-label="${isChartMode ? "天気図" : (isLightningMode ? "雷" : "雨雲レーダー")}時刻">`,
      { compact: true }
    )
    : buildWeatherTimeTimelineMarkup(
      frameMeta,
      activeIndex,
      (item) => isLightningMode
        ? item?.timeLabel
        : compactWeatherTimeLabel(item?.title),
      '<span class="weather-time-range-placeholder" aria-hidden="true"></span>',
      { compact: true }
    );

  return `
    <div class="mobile-dock-content mobile-dock-radar" aria-busy="${Boolean(loadingLabel)}">
      <div class="mobile-dock-action-row mobile-dock-mode-switch mobile-dock-segmented">
        <button type="button" class="mobile-dock-action${!weatherChartEnabled && !lightningEnabled ? " active" : ""}" data-mobile-dock-control data-radar-overlay="radar" aria-pressed="${!weatherChartEnabled && !lightningEnabled ? "true" : "false"}"${!weatherChartEnabled && !lightningEnabled ? " disabled" : ""}>雨雲レーダー</button>
        <button type="button" class="mobile-dock-action${weatherChartEnabled ? " active" : ""}" data-mobile-dock-control data-radar-overlay="weather-chart" aria-pressed="${weatherChartEnabled ? "true" : "false"}"${weatherChartEnabled ? " disabled" : ""}>天気図</button>
        <button type="button" class="mobile-dock-action${lightningEnabled ? " active" : ""}" data-mobile-dock-control data-radar-overlay="lightning" aria-pressed="${lightningEnabled ? "true" : "false"}"${lightningEnabled ? " disabled" : ""}>雷</button>
      </div>
      <div class="mobile-dock-weather-timeline${loadingLabel ? " is-loading" : ""}" data-mobile-weather-tap-controls aria-busy="${loadingLabel ? "true" : "false"}">
        ${loadingLabel
          ? buildMobileDockLoadingStatus(loadingLabel)
          : `<time class="mobile-dock-date" data-mobile-weather-date>${escapeHtml(activeDate)}</time>`}
        ${range}
      </div>
    </div>
  `;
}
function updateMobileRadarSliderProgress(slider) {
  const value = Number(slider.value) || 0;
  const timeline = slider.closest(".weather-time-timeline");
  updateWeatherTimelinePosition(timeline, value);
  syncWeatherTimelineActiveTick(timeline, value);
}

function updateMobileWeatherChartSliderPreview(slider) {
  updateMobileRadarSliderProgress(slider);
  updateMobileWeatherDate(slider);
}

function updateMobileWeatherDate(slider, value = Number(slider?.value)) {
  const date = slider?.closest("#mobile-context-dock")?.querySelector("[data-mobile-weather-date]");
  if (!date) return;
  const dates = parseJsonArray(slider.dataset.mobileWeatherDates);
  date.textContent = dates[clampIndex(value, dates.length)] || "--";
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

function buildMobileDockLoadingStatus(label) {
  return `
    <div class="mobile-dock-loading-status" role="status" aria-live="polite">
      <span aria-hidden="true"></span>
      <strong>${escapeHtml(localizeText(label))}</strong>
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

function updateWeatherChartSliderPreview(slider) {
  const activeIndex = Number(slider.value);
  const timeline = slider.closest(".weather-time-timeline");
  if (timeline) {
    updateWeatherTimelinePosition(timeline, activeIndex);
    syncWeatherTimelineActiveTick(timeline, activeIndex);
  }

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
  return parseJsonArray(value);
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildWeatherTimeTimelineMarkup(frames, activeIndex, getLabel, inputMarkup, { compact = false } = {}) {
  const step = compact ? 30 : 40;
  const labelEvery = 2;
  const shift = -(Math.max(0, activeIndex) * step);
  const currentIndex = frames.findIndex((frame) => frame?.isCurrent === true);
  const labelIndexes = new Set(
    frames.map((_, frameIndex) => frameIndex).filter((frameIndex) => frameIndex % labelEvery === 0)
  );
  if (currentIndex >= 0) {
    labelIndexes.add(currentIndex);
    if (currentIndex % labelEvery !== 0) {
      labelIndexes.delete(currentIndex - 1);
      labelIndexes.delete(currentIndex + 1);
    }
  }
  const labels = frames
    .map((frame, frameIndex) => ({ frame, frameIndex }))
    .filter(({ frameIndex }) => labelIndexes.has(frameIndex))
    .map(({ frame, frameIndex }) => `
      <span class="${frame?.isCurrent ? "is-current" : ""}" style="--weather-time-index:${frameIndex}">${escapeHtml(getLabel(frame) || "--")}</span>
    `)
    .join("");
  const ticks = frames.map((_, frameIndex) => `
    <span
      class="${frameIndex % labelEvery === 0 ? "major" : "minor"}${frameIndex === activeIndex ? " active" : ""}"
      data-weather-time-index="${frameIndex}"
      style="--weather-time-index:${frameIndex}"
    ></span>
  `).join("");
  return `
    <div class="weather-time-timeline${compact ? " compact" : ""}" style="--weather-time-step:${step}px;--weather-time-shift:${shift}px">
      <div class="weather-time-labels" aria-hidden="true">${labels}</div>
      <div class="weather-time-ticks" aria-hidden="true">${ticks}</div>
      <span class="weather-time-active-marker" aria-hidden="true"></span>
      ${inputMarkup}
    </div>
  `;
}

function renderWeatherTimeTimeline(root, frames, activeIndex, getLabel) {
  if (!root) return;
  const markup = buildWeatherTimeTimelineMarkup(frames, activeIndex, getLabel, "");
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  const timeline = template.content.firstElementChild;
  const labels = timeline?.querySelector(".weather-time-labels");
  const ticks = timeline?.querySelector(".weather-time-ticks");
  const step = timeline?.style.getPropertyValue("--weather-time-step") || "40px";
  const shift = timeline?.style.getPropertyValue("--weather-time-shift") || "0px";
  root.style.setProperty("--weather-time-step", step);
  root.style.setProperty("--weather-time-shift", shift);
  const targetLabels = root.querySelector(".weather-time-labels");
  const targetTicks = root.querySelector(".weather-time-ticks");
  if (targetLabels && labels) targetLabels.innerHTML = labels.innerHTML;
  if (targetTicks && ticks) targetTicks.innerHTML = ticks.innerHTML;
}

function updateWeatherTimelinePosition(timeline, activeIndex) {
  if (!timeline) return;
  const step = getWeatherTimelineStep(timeline);
  timeline.style.setProperty("--weather-time-step", `${step}px`);
  timeline.style.setProperty("--weather-time-shift", `${-(Math.max(0, activeIndex) * step)}px`);
}

function updateSliderFromTimelineDrag(slider, startX, startValue, clientX) {
  const fractionalIndex = getWeatherTimelineDragIndex(slider, startX, startValue, clientX);
  if (!Number.isFinite(fractionalIndex)) return null;
  const value = Math.round(fractionalIndex);
  slider.value = String(value);
  return value;
}

function getWeatherTimelineDragIndex(slider, startX, startValue, clientX) {
  if (!slider || !Number.isFinite(startX) || !Number.isFinite(startValue) || !Number.isFinite(clientX)) return null;
  const min = Number(slider.min) || 0;
  const max = Number(slider.max) || 0;
  const frameWidth = getWeatherTimelineStep(slider.closest(".weather-time-timeline"));
  return Math.max(min, Math.min(max, startValue + ((startX - clientX) / frameWidth)));
}

function getWeatherTimelineStep(timeline) {
  return timeline?.classList.contains("compact") ? 30 : 40;
}

function beginWeatherTimelineDrag(slider) {
  slider?.closest(".weather-time-timeline")?.classList.add("is-dragging");
}

function updateWeatherTimelineDragPosition(slider, startX, startValue, clientX) {
  const fractionalIndex = getWeatherTimelineDragIndex(slider, startX, startValue, clientX);
  if (!Number.isFinite(fractionalIndex)) return;
  updateWeatherTimelineFractionalPosition(slider, fractionalIndex);
}

function updateWeatherTimelineFractionalPosition(slider, fractionalIndex) {
  const timeline = slider?.closest(".weather-time-timeline");
  if (!timeline || !Number.isFinite(fractionalIndex)) return;
  const frameWidth = getWeatherTimelineStep(timeline);
  timeline.style.setProperty("--weather-time-shift", `${-(fractionalIndex * frameWidth)}px`);
}

function interpolateWeatherTimelineTime(times, fractionalIndex) {
  if (!Array.isArray(times) || !times.length || !Number.isFinite(fractionalIndex)) return "";
  const lowerIndex = Math.max(0, Math.min(times.length - 1, Math.floor(fractionalIndex)));
  const upperIndex = Math.max(0, Math.min(times.length - 1, Math.ceil(fractionalIndex)));
  const lowerTime = Date.parse(times[lowerIndex] ?? "");
  const upperTime = Date.parse(times[upperIndex] ?? "");
  if (!Number.isFinite(lowerTime) || !Number.isFinite(upperTime)) return "";
  const ratio = fractionalIndex - lowerIndex;
  return new Date(lowerTime + (upperTime - lowerTime) * ratio).toISOString();
}

function finishWeatherTimelineDrag(slider, value) {
  const timeline = slider?.closest(".weather-time-timeline");
  if (!timeline) return;
  timeline.classList.remove("is-dragging");
  updateWeatherTimelinePosition(timeline, value);
  syncWeatherTimelineActiveTick(timeline, value);
}

function compactWeatherTimeLabel(value) {
  const text = String(value ?? "--").trim();
  const dateTime = text.match(/(?:\d{4}\/)?(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/u);
  if (dateTime) return `${dateTime[3].padStart(2, "0")}:${dateTime[4]}`;
  const time = text.match(/(\d{1,2}):(\d{2})/u);
  return time ? `${time[1].padStart(2, "0")}:${time[2]}` : text;
}

function compactWeatherDateLabel(value) {
  const text = String(value ?? "").trim();
  const date = text.match(/(?:\d{4}\/)?(\d{1,2})\/(\d{1,2})/u);
  return date ? `${Number(date[1])}/${Number(date[2])}` : "--";
}

function syncWeatherTimelineActiveTick(timeline, activeIndex) {
  timeline.querySelectorAll("[data-weather-time-index]").forEach((tick) => {
    tick.classList.toggle("active", Number(tick.dataset.weatherTimeIndex) === activeIndex);
  });
}

function renderCurrentLocationCard(tab, info, context = {}) {
  const root = document.getElementById("current-location-card");
  if (!root) return;
  const contextLabel = localizeWarningDisplayText(getCurrentLocationCardLabel(context.warningView, context.activeKikikuruLayer));

  if (tab.id !== "warnings" || !info || info.status === "idle") {
    root.hidden = true;
    root.innerHTML = "";
    return;
  }

  root.hidden = false;
  root.className = `current-location-card current-location-card-${escapeHtml(info.status)}`;

  if (info.status === "loading") {
    root.innerHTML = `
      <span>${escapeHtml(contextLabel)}</span>
      <strong>${escapeHtml(localizeWarningDataText(info.message ?? "現在地を取得中です...", "Loading current location..."))}</strong>
    `;
    return;
  }

  if (info.status === "error") {
    root.innerHTML = `
      <span>${escapeHtml(contextLabel)}</span>
      <strong>${escapeHtml(localizeWarningDataText(info.message ?? "現在地を取得できませんでした。", "Could not get your current location."))}</strong>
    `;
    return;
  }

  const card = buildCurrentLocationCardContent(info, context);
  const badgesMarkup = card.badges.length > 0
    ? `<div class="current-location-warnings">${card.badges.join("")}</div>`
    : "";
  const detailButton = card.detailAreaCode && card.badges.length > 0
    ? `<button type="button" data-current-location-area-code="${escapeHtml(card.detailAreaCode)}">${escapeHtml(localizeText("詳細"))}</button>`
    : "";
  const currentPlace = localizeWarningDataText([info.prefecture, info.areaName].filter(Boolean).join(" ") || "現在地", "Current location");

  root.innerHTML = `
    <div class="current-location-head">
      <span>${escapeHtml(card.label)}</span>
      ${detailButton}
    </div>
    <div class="current-location-place-row">
      <strong>${escapeHtml(currentPlace)}</strong>
      ${card.updatedAt ? `<small>${escapeHtml(localizeText("更新時刻"))}: ${escapeHtml(formatWarningTime(card.updatedAt))}</small>` : ""}
    </div>
    ${card.badgesFirst ? badgesMarkup : ""}
    <p>${escapeHtml(card.message)}</p>
    ${card.badgesFirst ? "" : badgesMarkup}
  `;
}

function setWarningSocialSharePayload(tab, state, warningView = "status") {
  const info = state.currentLocation;
  if (
    tab.id !== "warnings"
    || warningView !== "status"
    || info?.status !== "found"
    || !info.areaName
  ) {
    setSocialSharePayload("warning", null);
    return;
  }

  setSocialSharePayload("warning", {
    type: "warning",
    areaCode: info.areaCode ?? "",
    areaName: info.areaName,
    prefecture: info.prefecture ?? "",
    coordinates: info.coordinates ?? info.center ?? null,
    updatedAt: info.updatedAt ?? state.data?.updatedAt ?? state.data?.latestTime ?? "",
    message: info.message ?? "",
    areaWarnings: (state.data?.activeAreas ?? []).map((area) => ({
      areaCode: area.areaCode ?? "",
      warnings: (area.warnings ?? []).map((warning) => ({
        label: warning.label ?? warning.name ?? "警報・注意報",
        level: warning.level ?? "none"
      }))
    })),
    warnings: (info.warnings ?? []).map((warning) => ({
      label: warning.label ?? warning.name ?? "警報・注意報",
      level: warning.level ?? "none",
      status: warning.status ?? "",
      updatedAt: warning.updatedAt ?? ""
    }))
  });
}

function getCurrentLocationCardLabel(warningView = "status", activeKikikuruLayer = "land") {
  if (warningView === "early") return "現在地・早期注意情報";
  if (warningView === "kikikuru") {
    const layerLabel = KIKIKURU_LAYER_OPTIONS.find((item) => item.id === activeKikikuruLayer)?.label ?? "キキクル";
    return `現在地・${layerLabel}`;
  }
  if (warningView === "river") return "現在地・指定河川洪水予報";
  return "現在地・警報注意報";
}

function buildCurrentLocationCardContent(info, { warningView = "status", activeKikikuruLayer = "land", data = {} } = {}) {
  if (warningView === "early") {
    const warnings = info.earlyWarnings ?? [];
    const areaName = localizeWarningDataText(
      info.earlyWarningArea?.displayAreaName || info.earlyWarningArea?.areaName || info.areaName,
      "Current forecast area"
    );
    return {
      label: localizeWarningDisplayText("現在地・早期注意情報"),
      message: getCurrentLanguage() === "en"
        ? (warnings.length ? `Early warning information is in effect for ${areaName}.` : localizeText("現在地に発表中の早期注意情報はありません。"))
        : (warnings.length
          ? `${info.earlyWarningArea?.displayAreaName || info.earlyWarningArea?.areaName || info.areaName}に早期注意情報があります。`
          : "現在地に発表中の早期注意情報はありません。"),
      updatedAt: info.earlyUpdatedAt,
      detailAreaCode: info.areaCode,
      badges: warnings.map((warning) => `<span class="warning-badge early-warning-badge early-warning-badge-${escapeHtml(warning.level)}">${escapeHtml(localizeWarningDisplayText(warning.label))}</span>`)
    };
  }

  if (warningView === "kikikuru") {
    const status = data?.currentKikikuruStatus ?? {};
    const layerLabel = KIKIKURU_LAYER_OPTIONS.find((item) => item.id === activeKikikuruLayer)?.label ?? "キキクル";
    const isLoading = status.status === "loading";
    const isReady = status.status === "ready";
    const statusLabel = localizeWarningDisplayText(isLoading ? "取得中" : (isReady ? status.label : "取得できません"));
    const localizedLayerLabel = localizeWarningDisplayText(layerLabel);
    const localizedRiskLabel = localizeWarningDisplayText(status.label);
    const rank = Number(status.rank ?? 0);
    const textClass = rank === 0 ? " is-neutral" : (rank <= 2 ? " is-dark-text" : "");
    return {
      label: getCurrentLanguage() === "en" ? `Current location · ${localizedLayerLabel}` : `現在地・${layerLabel}`,
      message: getCurrentLanguage() === "en"
        ? (isLoading
          ? localizeText("現在地直下の危険度を確認しています。")
          : (isReady ? `${localizedLayerLabel} at your location: ${localizedRiskLabel}.` : `${localizedLayerLabel} is unavailable at your location.`))
        : (isLoading
          ? "現在地直下の危険度を確認しています。"
          : (isReady ? `現在地直下の${layerLabel}は「${status.label}」です。` : `現在地直下の${layerLabel}を確認できませんでした。`)),
      updatedAt: status.latestTime,
      detailAreaCode: "",
      badgesFirst: true,
      badges: [`<span class="warning-badge current-location-kikikuru-badge${textClass}" style="--current-kikikuru-color:${escapeHtml(status.color || "#7f91a8")}">${escapeHtml(statusLabel)}</span>`]
    };
  }

  if (warningView === "river") {
    const report = selectRiverFloodSummaryReport(data?.riverFlood, info);
    const outsideArea = report?.levelLabel === "予報区域外";
    const forecastAreaName = getRiverForecastDisplayName(report);
    return {
      label: localizeWarningDisplayText("現在地・指定河川洪水予報"),
      message: getCurrentLanguage() === "en"
        ? (report
          ? (outsideArea ? `Outside the forecast area. The nearest designated river is ${forecastAreaName}.` : `Your location is within the ${forecastAreaName} area.`)
          : localizeText("現在地周辺の指定河川情報はありません。"))
        : (report
          ? (outsideArea ? `予報区域外です。最も近い河川は${report.forecastAreaName}です。` : `${report.forecastAreaName}の予報区域に含まれています。`)
          : "現在地周辺の指定河川情報はありません。"),
      updatedAt: outsideArea ? "" : report?.updatedAt,
      detailAreaCode: "",
      badgesFirst: true,
      badges: report ? [
        `<span class="river-flood-current-name">${escapeHtml(forecastAreaName)}</span>`,
        `<span class="river-flood-level river-flood-level-${escapeHtml(report.level ?? 0)}">${escapeHtml(localizeWarningDisplayText(report.levelLabel ?? "発表なし"))}</span>`
      ] : []
    };
  }

  const warnings = info.warnings ?? [];
  return {
    label: "現在地・警報注意報",
    message: info.message ?? "",
    updatedAt: info.updatedAt,
    detailAreaCode: info.areaCode,
    badges: warnings.map(buildWarningBadgeMarkup)
  };
}

function buildMobileEarthquakeLayerButton(layerId, label, visible) {
  return `<button type="button" class="mobile-dock-earthquake-layer${visible ? " active" : ""}" data-mobile-dock-control data-earthquake-map-layer="${escapeHtml(layerId)}" data-earthquake-layer-visible="${visible ? "off" : "on"}" aria-pressed="${visible ? "true" : "false"}">${escapeHtml(label)}</button>`;
}

function getMobileWarningBadgeColorClass(warningView, level) {
  if (warningView === "early") return `early-warning-badge-${level}`;
  if (["advisory", "warning", "danger", "emergency"].includes(level)) return `warning-badge-${level}`;
  return "mobile-dock-warning-badge-none";
}

function getWarningSeverityRank(level) {
  return {
    emergency: 6,
    danger: 5,
    high: 5,
    warning: 4,
    middle: 3,
    advisory: 2,
    low: 1
  }[String(level ?? "")] ?? 0;
}

function getWarningGroupItems(group, warningView) {
  if (warningView === "early") {
    return (group?.areas ?? []).flatMap((area) => (area.probabilities ?? []).map((probability) => ({
      label: formatEarlyProbabilityBadge(probability),
      level: probability.level
    })));
  }
  return (group?.areas ?? []).flatMap((area) => area.warnings ?? []);
}

function getWarningGroupTone(group, warningView) {
  const primary = [...getWarningGroupItems(group, warningView)]
    .sort((left, right) => getWarningSeverityRank(right.level) - getWarningSeverityRank(left.level))[0];
  const level = String(primary?.level ?? "none");
  if (["emergency", "danger", "high", "warning", "middle", "advisory"].includes(level)) return level;
  return "none";
}

function getWarningGroupSummary(group, warningView) {
  const labels = [...new Set(getWarningGroupItems(group, warningView)
    .map((item) => localizeWarningDisplayText(item.label))
    .filter(Boolean))];
  if (!labels.length) return localizeText("発表なし");
  const suffix = labels.length > 2
    ? localizeText(` ほか${labels.length - 2}種類`, getCurrentLanguage())
    : "";
  return `${labels.slice(0, 2).join("・")}${suffix}`;
}

function buildWarningAreaRowsMarkup(group, warningView) {
  return (group?.areas ?? []).map((area) => `
    <article class="warning-area-row${warningView === "early" ? " early-warning-row" : ""}${String(area.areaCode) === selectedWarningAreaCode ? " selected" : ""}" data-warning-area-code="${escapeHtml(area.areaCode)}">
      <strong>${escapeHtml(localizeWarningDisplayText(area.areaName))}</strong>
      <div class="warning-badges">
        ${warningView === "early"
          ? (area.probabilities ?? []).map((probability) => `
            <span class="warning-badge early-warning-badge early-warning-badge-${escapeHtml(probability.level)}">${escapeHtml(localizeWarningDisplayText(formatEarlyProbabilityBadge(probability)))}</span>
          `).join("")
          : buildWarningBadgesMarkup(area.warnings)}
      </div>
    </article>
  `).join("");
}

function buildWarningGroupAccordionMarkup(group, warningView, groupKey, expanded) {
  const count = Number(group?.count ?? group?.areas?.length ?? 0);
  const groupName = localizeWarningDisplayText(group?.prefecture ?? "");
  const summary = getWarningGroupSummary(group, warningView);
  return `
    <section class="warning-prefecture-group warning-prefecture-group-${escapeHtml(getWarningGroupTone(group, warningView))}${expanded ? " is-open" : ""}" data-warning-group="${escapeHtml(groupKey)}">
      <button type="button" class="warning-prefecture-toggle" data-warning-group-toggle="${escapeHtml(groupKey)}" aria-expanded="${expanded ? "true" : "false"}">
        <span class="warning-prefecture-marker" aria-hidden="true"></span>
        <span class="warning-prefecture-copy">
          <strong>${escapeHtml(groupName)}</strong>
          <small>${escapeHtml(summary)}</small>
        </span>
        <span class="warning-prefecture-count">${escapeHtml(localizeText(`${count}地域`, getCurrentLanguage()))}</span>
        <span class="warning-prefecture-chevron" aria-hidden="true"></span>
      </button>
      <div class="warning-prefecture-body" aria-hidden="${expanded ? "false" : "true"}">
        ${expanded ? `<div class="warning-prefecture-body-inner">${buildWarningAreaRowsMarkup(group, warningView)}</div>` : ""}
      </div>
    </section>
  `;
}

function animateWarningDetailContent(root) {
  root.classList.remove("is-entering");
  void root.offsetWidth;
  root.classList.add("is-entering");
  window.setTimeout(() => root.classList.remove("is-entering"), 260);
}

function renderWarningGroupAccordions(root, groups, warningView) {
  activeWarningGroupsByKey = new Map();
  warningGroupKeyByAreaCode = new Map();

  const entries = groups.map((group, index) => {
    const key = `${warningView}-${index}-${group?.prefecture ?? "group"}`;
    const entry = { group, warningView };
    activeWarningGroupsByKey.set(key, entry);
    (group?.areas ?? []).forEach((area) => warningGroupKeyByAreaCode.set(String(area.areaCode), key));
    return { ...entry, key };
  });

  const selectedGroupKey = warningGroupKeyByAreaCode.get(selectedWarningAreaCode);
  const openGroupKey = selectedGroupKey
    ?? (activeWarningGroupsByKey.has(expandedWarningGroupKey) ? expandedWarningGroupKey : "")
    ?? "";
  expandedWarningGroupKey = openGroupKey;
  root.innerHTML = `<div class="warning-prefecture-groups">${entries.map(({ group, key }) => (
    buildWarningGroupAccordionMarkup(group, warningView, key, key === openGroupKey)
  )).join("")}</div>`;
  root.removeAttribute("aria-busy");
  animateWarningDetailContent(root);
  refreshOpenWarningModal();
}

function renderKikikuruWarningDetails(root, state, activeKikikuruLayer) {
  const isLayerRefresh = Boolean(root.querySelector(".warning-kikikuru-panel"));
  const kikikuru = state.data?.kikikuru ?? {};
  const options = KIKIKURU_LAYER_OPTIONS.map((option) => ({
    ...option,
    active: option.id === activeKikikuruLayer
  }));
  const activeOption = options.find((option) => option.active) ?? options[0];
  const latestTime = kikikuru.latestTime && kikikuru.latestTime !== "未取得"
    ? kikikuru.latestTime
    : "";
  const statusText = kikikuru.deferred
    ? localizeText("キキクルのタイルを取得中です。")
    : (kikikuru.unavailable
      ? localizeText("キキクルのタイルを取得できませんでした。")
      : (getCurrentLanguage() === "en"
        ? `Showing ${localizeWarningDisplayText(activeOption?.label ?? "キキクル")} on the map.`
        : `${activeOption?.label ?? "キキクル"}を地図上に重ねて表示しています。`));

  root.innerHTML = `
    <section class="warning-kikikuru-panel">
      <div class="warning-kikikuru-layer-head">
        <strong>${escapeHtml(localizeWarningDisplayText("表示レイヤー"))}</strong>
        ${latestTime ? `<small>${escapeHtml(latestTime)}</small>` : ""}
      </div>
      <div class="warning-kikikuru-layer-switch mobile-dock-segmented" role="group" aria-label="${escapeHtml(localizeWarningDisplayText("表示レイヤー"))}">
        ${options.map((option) => `
          <button type="button" class="mobile-dock-action${option.active ? " active" : ""}" data-kikikuru-layer="${escapeHtml(option.id)}" aria-pressed="${option.active ? "true" : "false"}"${option.active ? " disabled" : ""}>${escapeHtml(localizeWarningDisplayText(option.label))}</button>
        `).join("")}
      </div>
      <p>${escapeHtml(statusText)}</p>
    </section>
  `;
  const layerSwitch = root.querySelector(".warning-kikikuru-layer-switch.mobile-dock-segmented");
  layerSwitch?.classList.add("is-initializing");
  if (layerSwitch) syncMobileDockSegmentIndicator(layerSwitch);
  window.requestAnimationFrame(() => {
    layerSwitch?.classList.remove("is-initializing");
  });
  if (!isLayerRefresh) animateWarningDetailContent(root);
}

function renderWarningDetails(tab, state, warningView = "status") {
  const root = document.getElementById("warning-detail-list");
  if (!root) return;
  root.removeAttribute("aria-busy");

  const activeKikikuruLayer = state.activeKikikuruLayer
    ?? state.data?.activeKikikuruLayer
    ?? KIKIKURU_LAYER_OPTIONS[0]?.id;
  const isWarnings = tab.id === "warnings" && ["status", "early", "kikikuru", "river"].includes(warningView);
  root.hidden = !isWarnings;
  if (!isWarnings) {
    closeWarningModal();
    return;
  }

  const canReuseRenderedDetails =
    state.status === "ok"
    && root.childElementCount > 0
    && lastWarningDetailsData === state.data
    && lastWarningDetailsView === warningView
    && lastWarningDetailsStatus === state.status
    && lastWarningDetailsAreaCode === selectedWarningAreaCode
    && lastWarningDetailsLayer === activeKikikuruLayer;
  if (canReuseRenderedDetails) return;

  lastWarningDetailsData = state.data ?? null;
  lastWarningDetailsView = warningView;
  lastWarningDetailsStatus = state.status ?? "";
  lastWarningDetailsAreaCode = selectedWarningAreaCode;
  lastWarningDetailsLayer = activeKikikuruLayer;

  if (state.status === "loading") {
    root.innerHTML = `
      <div class="warning-empty">${escapeHtml(localizeText("取得中..."))}</div>
    `;
    activeWarningAreasByCode = new Map();
    activeWarningDetailsLoaded = false;
    return;
  }

  if (state.status === "error") {
    root.innerHTML = `
      <div class="warning-empty">${escapeHtml(localizeText("取得失敗"))}</div>
    `;
    activeWarningAreasByCode = new Map();
    activeWarningDetailsLoaded = false;
    return;
  }

  if (warningView === "kikikuru") {
    activeWarningAreasByCode = new Map();
    activeWarningDetailsLoaded = false;
    renderKikikuruWarningDetails(root, state, activeKikikuruLayer);
    return;
  }

  if (warningView === "river") {
    renderRiverFloodDetails(root, state.data?.riverFlood);
    return;
  }

  if (warningView === "early") {
    activeWarningDetailsLoaded = Boolean(state.data?.earlyDetailsLoaded);
    renderEarlyWarningDetails(root, state);
    return;
  }

  activeWarningDetailsLoaded = Boolean(
    selectedWarningAreaCode
    && state.data?.statusDetailAreaCodes?.some((areaCode) => String(areaCode) === selectedWarningAreaCode)
  );
  const groups = mergeRiverFloodWarningsIntoGroups(
    state.data?.groups ?? [],
    getRiverFloodReports(state.data?.riverFlood)
  );
  const outlookAreas = state.data?.outlookAreas ?? [];
  const activeAreaEntries = groups.flatMap((group) => group.areas.map((area) => [String(area.areaCode), area]));
  activeWarningAreasByCode = new Map([
    ...outlookAreas.map((area) => [String(area.areaCode), area]),
    ...activeAreaEntries
  ]);

  if (groups.length === 0) {
    root.innerHTML = `
      <div class="warning-empty">${escapeHtml(localizeText("発表中の警報・注意報はありません"))}</div>
    `;
    refreshOpenWarningModal();
    return;
  }

  renderWarningGroupAccordions(root, groups, "status");
}

function renderRiverFloodDetails(root, riverFlood = {}) {
  const reports = getRiverFloodReports(riverFlood);
  activeRiverFloodReportsById = new Map(reports.map((report) => [String(report.id), report]));
  activeWarningAreasByCode = new Map();
  if (!riverFlood?.status || riverFlood.status === "loading") {
    root.innerHTML = `
      <div class="warning-empty">${escapeHtml(localizeText("指定河川洪水予報を取得中..."))}</div>
    `;
    return;
  }
  if (riverFlood.status === "error") {
    root.innerHTML = `
      <div class="warning-empty">${escapeHtml(localizeText("指定河川洪水予報を取得できませんでした"))}</div>
    `;
    return;
  }
  if (!reports.length) {
    root.innerHTML = `
      <div class="warning-empty">${escapeHtml(localizeText("現在、指定河川洪水予報は発表されていません"))}</div>
    `;
    return;
  }
  root.innerHTML = buildRiverFloodListMarkup(reports);
  animateWarningDetailContent(root);
}

function getRiverFloodReports(riverFlood = {}) {
  if (riverFlood?.status !== "ok" || !Array.isArray(riverFlood.reports)) return [];
  return [...riverFlood.reports].sort((left, right) =>
    Number(right.level ?? 0) - Number(left.level ?? 0)
  );
}

function buildRiverFloodListMarkup(reports = []) {
  if (!reports.length) return "";
  return `<div class="river-flood-list">${reports.map((report) => `
    <button type="button" class="river-flood-row" data-river-flood-id="${escapeHtml(report.id)}">
      <span class="river-flood-row-main">
        <strong>${escapeHtml(getRiverForecastDisplayName(report))}</strong>
        <small>${escapeHtml(localizeText("更新時刻"))}: ${escapeHtml(formatWarningTime(report.updatedAt))}</small>
      </span>
      <span class="river-flood-row-status">
        <span class="river-flood-level river-flood-level-${escapeHtml(report.level)}">${escapeHtml(localizeWarningDisplayText(report.levelLabel))}</span>
      </span>
    </button>`).join("")}</div>`;
}
function renderEarlyWarningDetails(root, state) {
  const groups = state.data?.earlyWarnings?.groups ?? [];
  const areas = state.data?.earlyWarnings?.areas ?? [];
  const municipalityAreas = state.data?.earlyWarnings?.municipalityAreas ?? [];

  if (!state.data?.earlyDetailsLoaded) {
    root.innerHTML = `
      <div class="warning-empty">${escapeHtml(localizeText("取得中..."))}</div>
    `;
    activeWarningAreasByCode = new Map();
    activeWarningDetailsLoaded = false;
    return;
  }

  if (groups.length === 0) {
    root.innerHTML = `
      <div class="warning-empty">${escapeHtml(localizeText("早期注意情報は発表されていません"))}</div>
    `;
    activeWarningAreasByCode = new Map();
    refreshOpenWarningModal();
    return;
  }

  activeWarningAreasByCode = new Map([
    ...areas.map((area) => [String(area.areaCode), area]),
    ...municipalityAreas.map((area) => [String(area.areaCode), area])
  ]);

  renderWarningGroupAccordions(root, groups, "early");
}

function buildRiverBulletinTextMarkup(report = {}) {
  const sourceValues = [report.condition, report.headline, ...(report.warningTexts ?? [])]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (getCurrentLanguage() !== "en") {
    return sourceValues.map((value, index) => `<p class="${index === 0 ? "river-flood-condition" : "river-flood-message"}">${escapeHtml(value)}</p>`).join("");
  }

  const localizedValues = sourceValues
    .map((value) => localizeWarningDataText(value, ""))
    .filter(Boolean);
  const omitted = localizedValues.length < sourceValues.length;
  const statusFallback = Number(report.level ?? 0) > 0
    ? `Level ${report.level} designated river flood forecast is in effect.`
    : "No designated river flood forecast is currently in effect.";
  const statusMarkup = localizedValues.length
    ? localizedValues.map((value, index) => `<p class="${index === 0 ? "river-flood-condition" : "river-flood-message"}">${escapeHtml(value)}</p>`).join("")
    : `<p class="river-flood-condition">${escapeHtml(statusFallback)}</p>`;
  const sourceLink = omitted && report.url
    ? `<p class="river-flood-message"><a href="${escapeHtml(report.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(localizeText("気象庁発表原文を確認"))}</a></p>`
    : "";
  const omittedNote = omitted
    ? `<p class="river-flood-message">${escapeHtml(localizeText("詳細な発表本文は気象庁の原文で確認してください。"))}</p>`
    : "";
  return `${statusMarkup}${omittedNote}${sourceLink}`;
}

function openRiverFloodModal(reportId, fallback = {}) {
  const report = activeRiverFloodReportsById.get(String(reportId)) ?? {
    forecastAreaCode: fallback.forecastAreaCode ?? "",
    forecastAreaName: fallback.forecastAreaName || "指定河川",
    level: 0,
    levelLabel: "発表なし",
    condition: "現在、発表中の指定河川洪水予報はありません。",
    warningTexts: [],
    stations: [],
    rainfall: [],
    affectedAreas: []
  };
  const modal = document.getElementById("warning-modal");
  const content = document.getElementById("warning-modal-content");
  if (!modal || !content) return;
  const forecastAreaName = getRiverForecastDisplayName(report);
  content.innerHTML = `
    <header class="warning-modal-head river-flood-modal-head">
      <span>${escapeHtml(localizeText("指定河川洪水予報"))}</span>
      <h2 id="warning-modal-title">${escapeHtml(forecastAreaName)}</h2>
      ${report.updatedAt ? `<p>${escapeHtml(localizeText("更新時刻"))}: ${escapeHtml(formatWarningTime(report.updatedAt))}</p>` : ""}
    </header>
    <section class="warning-modal-section">
      <h3>${escapeHtml(localizeText("発表状況"))}</h3>
      <span class="river-flood-level river-flood-level-${escapeHtml(report.level)}">${escapeHtml(localizeWarningDisplayText(report.levelLabel))}</span>
      ${buildRiverBulletinTextMarkup(report)}
    </section>
    ${buildRiverStationSection(report.stations)}
    ${buildRiverRainfallSection(report.rainfall)}
    ${buildRiverAffectedAreaSection(report.affectedAreas)}
  `;
  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function buildRiverStationSection(stations = []) {
  if (!stations.length) return "";
  return `<section class="warning-modal-section"><h3>${escapeHtml(localizeText("観測所の水位実況・予測"))}</h3><div class="river-station-list">${stations.map((station, index) => {
    const latest = station.values?.[0];
    const peak = [...(station.values ?? [])].filter((value) => Number.isFinite(value.value)).sort((left, right) => right.value - left.value)[0];
    const stationName = localizeWarningDataText(station.name, `Observation station ${index + 1}`);
    const stationLocation = localizeWarningDataText(station.location, "");
    return `<article class="river-station-card"><div><strong>${escapeHtml(stationName)}</strong>${stationLocation ? `<span>${escapeHtml(stationLocation)}</span>` : ""}</div><dl><div><dt>${escapeHtml(localizeText("現在"))}</dt><dd>${escapeHtml(formatRiverWaterLevel(latest))}</dd></div><div><dt>${escapeHtml(localizeText("予測最大"))}</dt><dd>${escapeHtml(formatRiverWaterLevel(peak))}</dd></div></dl></article>`;
  }).join("")}</div></section>`;
}

function buildRiverRainfallSection(items = []) {
  if (!items.length) return "";
  return `<section class="warning-modal-section"><h3>${escapeHtml(localizeText("流域雨量"))}</h3><div class="river-rainfall-list">${items.map((item, index) => {
    const latest = item.values?.at(-1);
    return `<div><strong>${escapeHtml(localizeWarningDataText(item.areaName, `River basin ${index + 1}`))}</strong><span>${escapeHtml(formatRiverRainfall(latest))}</span></div>`;
  }).join("")}</div></section>`;
}

function formatRiverRainfall(value) {
  if (!value) return "-";
  if (!Number.isFinite(value.value)) return localizeWarningDataText(value.condition || "欠測", "Missing");
  return `${value.value}${value.unit || "mm"}`;
}

function buildRiverAffectedAreaSection(areas = []) {
  if (!areas.length) return "";
  const cities = [...new Set(areas.map((area) => [area.prefecture, area.city].filter(Boolean).join(" ")).filter(Boolean))]
    .map((city, index) => localizeWarningDataText(city, `Affected area ${index + 1}`));
  return `<section class="warning-modal-section"><h3>${escapeHtml(localizeText("氾濫により浸水が想定される地区"))}</h3><div class="river-affected-cities">${cities.map((city) => `<span>${escapeHtml(city)}</span>`).join("")}</div></section>`;
}

function formatRiverWaterLevel(value) {
  if (!value) return "-";
  if (!Number.isFinite(value.value)) return localizeWarningDataText(value.condition || "欠測", "Missing");
  const level = Number.isFinite(value.level) ? ` / ${localizeText(`レベル${value.level}`)}` : "";
  return `${value.value}${value.unit || "m"}${level}`;
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
      <span>${escapeHtml(localizeWarningDisplayText(area.prefecture ?? ""))}</span>
      <h2 id="warning-modal-title">${escapeHtml(localizeWarningDisplayText(area.areaName))}</h2>
      <p>更新時刻: ${escapeHtml(formatWarningTime(area.updatedAt))}</p>
    </header>
    <section class="warning-modal-section">
      <h3>発表中の警報・注意報</h3>
      <div class="warning-modal-warning-list">
        ${warnings.length === 0 ? `<p class="warning-modal-empty">発表中の警報・注意報はありません。</p>` : warnings.map((warning) => `
          <article class="warning-modal-warning">
            ${buildWarningBadgeMarkup(warning)}
            <dl>
              <div><dt>更新時刻</dt><dd>${escapeHtml(formatWarningTime(warning.updatedAt))}</dd></div>
              ${warning.status ? `<div><dt>状態</dt><dd>${escapeHtml(localizeWarningDisplayText(warning.status))}</dd></div>` : ""}
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
      <span>${escapeHtml(localizeWarningDisplayText(area.prefecture ?? ""))}</span>
      <h2 id="warning-modal-title">${escapeHtml(localizeWarningDisplayText(area.displayAreaName ?? area.areaName))}</h2>
      <p>${escapeHtml(localizeText("更新時刻"))}: ${escapeHtml(formatWarningTime(area.updatedAt))}</p>
    </header>
    <section class="warning-modal-section">
      <h3>${escapeHtml(localizeText("早期注意情報（警報級の可能性）"))}</h3>
      <div class="warning-modal-warning-list">
        <article class="warning-modal-warning">
          <div class="warning-badges">
            ${(area.probabilities ?? []).map((probability) => `
              <span class="warning-badge early-warning-badge early-warning-badge-${escapeHtml(probability.level)}">${escapeHtml(localizeWarningDisplayText(formatEarlyProbabilityBadge(probability)))}</span>
            `).join("")}
          </div>
        </article>
      </div>
    </section>
    <section class="warning-modal-section">
      <h3>${escapeHtml(localizeText("期間別の可能性"))}</h3>
      ${buildWarningOutlookTable(area.rows ?? [], { splitLongPeriods: false })}
    </section>
  `;
  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function buildWarningOutlookTable(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return buildWarningOutlookTableSection(rows, options);
  }
  if (options.splitLongPeriods === false) {
    return buildWarningOutlookTableSection(rows, { ...options, kind: "combined" });
  }
  const { hourlyRows, dailyRows } = splitWarningOutlookRows(rows);
  return [
    buildWarningOutlookTableSection(hourlyRows, { ...options, kind: "hourly" }),
    buildWarningOutlookTableSection(dailyRows, { ...options, kind: "daily" })
  ].filter(Boolean).join("");
}

function buildWarningOutlookTableSection(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    if (options.kind) return "";
    if (options.loading) {
      return buildModalLoadingState({
        title: localizeText("今後の見通しを取得中です。"),
        compact: true,
        inline: true
      });
    }
    return `<p class="warning-modal-empty">${escapeHtml(localizeText("今後の見通しはありません。"))}</p>`;
  }

  const isDaily = options.kind === "daily";
  const isEnglish = getCurrentLanguage() === "en";
  const sectionTitle = options.kind === "combined"
    ? (isEnglish ? "Outlook by period" : "期間ごとの見通し")
    : (isDaily
      ? (isEnglish ? "Daily outlook" : "日ごとの見通し")
      : (isEnglish ? "Outlook by time" : "時間帯ごとの見通し"));
  const sectionNote = isDaily
    ? (isEnglish ? "Full-day and long-range periods" : "1日・長時間の見通し")
    : "";
  const times = collectOutlookTableSlots(rows);
  return `
    <div class="warning-outlook-block warning-outlook-block-${isDaily ? "daily" : "hourly"}">
      <div class="warning-outlook-block-heading">
        <strong>${escapeHtml(sectionTitle)}</strong>
        ${sectionNote ? `<span>${escapeHtml(sectionNote)}</span>` : ""}
      </div>
      <div class="warning-outlook-scroll">
        <table class="warning-outlook-table warning-outlook-table-${isDaily ? "daily" : "hourly"}">
          <thead>
            ${buildWarningOutlookTableHead(times, { isDaily })}
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <th>${escapeHtml(localizeText(formatOutlookTypeLabel(row.type)))}${row.localName ? `<span>${escapeHtml(localizeText(row.localName))}</span>` : ""}</th>
                ${times.map((timeSlot) => findMatchingOutlookSlot(row.slots, timeSlot)).map((slot) => `
                  <td class="warning-outlook-level-${escapeHtml(slot.level ?? 0)}">${escapeHtml(localizeWarningDisplayText(formatOutlookCellLabel(slot)))}</td>
                `).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function buildWarningOutlookTableHead(times, { isDaily = false } = {}) {
  if (isDaily) {
    return `
      <tr>
        <th>${escapeHtml(localizeText("種別"))}</th>
        ${times.map(buildDailyWarningOutlookTimeHeading).join("")}
      </tr>
    `;
  }

  const language = getCurrentLanguage();
  const dateGroups = [];
  times.forEach((slot) => {
    const date = getWarningOutlookStartDateDisplay(slot, { language });
    const current = dateGroups.at(-1);
    if (current?.key === date.key) {
      current.count += 1;
      return;
    }
    dateGroups.push({ ...date, count: 1 });
  });

  return `
    <tr class="warning-outlook-date-row">
      <th rowspan="2">${escapeHtml(localizeText("種別"))}</th>
      ${dateGroups.map((group) => `
        <th colspan="${group.count}">${escapeHtml(group.label)}</th>
      `).join("")}
    </tr>
    <tr class="warning-outlook-period-row">
      ${times.map(buildHourlyWarningOutlookTimeHeading).join("")}
    </tr>
  `;
}

function formatOutlookTypeLabel(type) {
  return type === "暴風" ? "強風" : type;
}

function buildWarningOutlookTimeHeading(slot) {
  const language = getCurrentLanguage();
  const label = formatWarningOutlookTime(slot, { language });
  const { dateLabel, timeLabel } = getWarningOutlookTimeDisplay(slot, { language });
  if (!dateLabel) return `<th>${escapeHtml(timeLabel)}</th>`;
  return `
    <th class="warning-outlook-time-multiline" aria-label="${escapeHtml(label)}">
      <span class="warning-outlook-date">${escapeHtml(dateLabel)}</span>
      <span class="warning-outlook-period">${escapeHtml(timeLabel)}</span>
    </th>
  `;
}

function buildHourlyWarningOutlookTimeHeading(slot) {
  const language = getCurrentLanguage();
  const { timeLabel } = getWarningOutlookTimeDisplay(slot, {
    language,
    indicateDayChange: false
  });
  return `<th>${escapeHtml(timeLabel)}</th>`;
}

function buildDailyWarningOutlookTimeHeading(slot) {
  return buildWarningOutlookTimeHeading(slot);
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
    setSocialSharePayload("amedas", null);
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

  const rankingView = getAmedasRankingView(metric.id);
  const precipitationPeriod = getAmedasPrecipitationPeriod(
    state.amedasPrecipitationPeriod ?? state.data?.precipitationPeriod
  );
  const metricDisplayLabel = metric.id === "precipitation"
    ? getAmedasPrecipitationDisplayLabel(precipitationPeriod.id)
    : metric.label;
  const windKind = metric.id === "wind" ? amedasWindRankingKind : "average";
  const order = getAmedasRankingOrder(metric.id, rankingView);
  const items = assignAmedasCompetitionRanks(
    buildAmedasRankingItems(state.data, metric, order, rankingView, windKind, precipitationPeriod.id)
  ).slice(0, AMEDAS_RANKING_LIMIT);
  const orderLabel = getAmedasRankingLabel(metric.id, rankingView, windKind, order);
  const rankingUpdatedAt = getAmedasRankingUpdatedAt(state.data, metric.id, rankingView, windKind);
  setSocialSharePayload("amedas", {
    type: "amedas",
    metricLabel: metricDisplayLabel,
    orderLabel,
    totalLocations: items.length,
    updatedAt: rankingUpdatedAt ? formatAmedasRankingClock(rankingUpdatedAt) : "--:--",
    items: items.map((item) => ({
      rank: item.rank,
      name: item.name,
      value: formatAmedasRankingValue(item.value, metric),
      color: item.color,
      observationTime: item.observationTime ? formatAmedasRankingClock(item.observationTime) : ""
    }))
  });
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
  const pressureControls = metric.id === "pressure" ? `
    <div class="amedas-ranking-toggle amedas-ranking-slider" aria-label="気圧ランキング集計期間" style="${getAmedasRankingSliderStyle(rankingView === "current" ? 0 : 1, 2)}">
      <button type="button" data-amedas-pressure-ranking-period="current" class="${rankingView === "current" ? "active" : ""}">実況</button>
      <button type="button" data-amedas-pressure-ranking-period="daily" class="${rankingView === "daily" ? "active" : ""}">今日ここまで</button>
    </div>
  ` : "";
  const supportsOrderControls = (metric.id === "temperature" && rankingView === "current") || metric.id === "humidity" || metric.id === "pressure";
  const orderControls = supportsOrderControls ? `
    <div class="amedas-ranking-toggle amedas-ranking-slider" aria-label="${escapeHtml(metric.label)}ランキング順序" style="${getAmedasRankingSliderStyle(order === "top" ? 0 : 1, 2)}">
      <button type="button" data-amedas-ranking-order="top" data-amedas-ranking-order-metric="${escapeHtml(metric.id)}" class="${order === "top" ? "active" : ""}">高い順</button>
      <button type="button" data-amedas-ranking-order="bottom" data-amedas-ranking-order-metric="${escapeHtml(metric.id)}" class="${order === "bottom" ? "active" : ""}">低い順</button>
    </div>
  ` : "";

  root.innerHTML = `
    <div class="amedas-ranking-head">
      <span data-amedas-ranking-title="${escapeHtml(metric.id)}" data-amedas-precipitation-period="${escapeHtml(precipitationPeriod.id)}">${escapeHtml(metricDisplayLabel)}ランキング</span>
      <button type="button" class="social-share-trigger amedas-ranking-share" data-social-share="amedas" aria-label="ランキングを画像で共有" title="ランキングを画像で共有">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0-11 4 4m-4-4L8 7M5 12v7h14v-7"/></svg>
      </button>
      <div class="amedas-ranking-meta">
        <small>${orderLabel} ${items.length}地点</small>
        ${rankingUpdatedAt ? `<time>更新 ${escapeHtml(formatAmedasRankingClock(rankingUpdatedAt))}</time>` : ""}
      </div>
    </div>
    ${temperatureControls}
    ${windControls}
    ${pressureControls}
    ${orderControls}
    ${items.length ? `<div class="amedas-ranking-list">
      ${items.map((item) => `
        <button type="button" class="amedas-ranking-row" data-amedas-station-id="${escapeHtml(item.id)}">
          <span class="amedas-ranking-rank">${item.rank}</span>
          <span class="amedas-ranking-name">${escapeHtml(item.name)}</span>
          <span class="amedas-ranking-reading" style="--rank-color:${escapeHtml(item.color)}">
            <strong class="amedas-ranking-value">${escapeHtml(formatAmedasRankingValue(item.value, metric))}</strong>
            ${item.observationTime ? `<time>観測 ${escapeHtml(formatAmedasRankingClock(item.observationTime))}</time>` : ""}
          </span>
        </button>
      `).join("")}
    </div>` : `<div class="amedas-ranking-empty">${getAmedasRankingEmptyMessage(metric.id, rankingView)}</div>`}
  `;
}

function getAmedasRankingView(metricId) {
  if (metricId === "temperature") return amedasTemperatureRankingView;
  if (metricId === "wind") return amedasWindRankingView;
  if (metricId === "pressure") return amedasPressureRankingView;
  return "current";
}

function getAmedasRankingOrder(metricId, rankingView) {
  if (rankingView === "minimum") return "bottom";
  if (rankingView === "maximum") return "top";
  return amedasRankingOrderByMetric[metricId] ?? "top";
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
  if (metricId === "pressure") {
    const period = rankingView === "daily" ? "今日最低" : "実況";
    return `${period}・${order === "bottom" ? "低い順" : "高い順"}`;
  }
  if (metricId === "humidity") return `実況・${order === "bottom" ? "低い順" : "高い順"}`;
  if (rankingView === "maximum") return "日最高";
  if (rankingView === "minimum") return "日最低";
  return order === "bottom" ? "下位" : "上位";
}

function getAmedasRankingEmptyMessage(metricId, rankingView) {
  if (rankingView === "current") return "表示できる観測値がありません";
  if (metricId === "wind") return "今日の風速ランキングを取得できません";
  if (metricId === "pressure") return "今日の最低海面気圧ランキングを取得できません";
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
  const dayOffset = chart.dayOffset === 1 || state.amedasDailyChartDayOffset === 1 ? 1 : 0;
  const precipitationPeriod = getAmedasPrecipitationPeriod(
    state.amedasPrecipitationPeriod ?? state.data?.precipitationPeriod
  );
  const chartDoesNotMatch = chart.metricId !== metric.id
    || (metric.id === "precipitation" && chart.precipitationPeriod !== precipitationPeriod.id);
  const periodToggle = state.earlyAccessEnabled ? buildAmedasDailyChartPeriodToggle(dayOffset) : "";
  if (!state.selectedAmedasStationId || chart.status === "idle" || chartDoesNotMatch) {
    root.innerHTML = `<p class="amedas-temperature-chart-empty">地図上の観測点をタップすると、${escapeHtml(getAmedasDailySeriesTitle(metric.id, 0, precipitationPeriod.id))}を表示します。</p>`;
    return;
  }
  if (chart.status === "loading") {
    root.innerHTML = `${periodToggle}<p class="amedas-temperature-chart-empty">${escapeHtml(chart.stationName || "観測点")}の${escapeHtml(getAmedasDailySeriesTitle(metric.id, dayOffset, precipitationPeriod.id))}を読み込んでいます...</p>`;
    return;
  }
  if (chart.status === "error") {
    root.innerHTML = `${periodToggle}<p class="amedas-temperature-chart-empty">${escapeHtml(getAmedasDailySeriesTitle(metric.id, dayOffset, precipitationPeriod.id))}を取得できませんでした。</p>`;
    return;
  }

  const points = chart.data?.points ?? [];
  if (!points.length) {
    root.innerHTML = `${periodToggle}<p class="amedas-temperature-chart-empty">この観測点では${escapeHtml(getAmedasDailySeriesTitle(metric.id, dayOffset, precipitationPeriod.id))}を観測していません。</p>`;
    return;
  }

  const latest = chart.data?.latest;
  const isRollingPrecipitation = metric.id === "precipitation" && precipitationPeriod.id === "24h";
  root.style.setProperty("--amedas-series-color", metric.color);
  root.style.setProperty("--amedas-gust-color", metric.color);
  root.innerHTML = `
    ${periodToggle}
    <div class="amedas-temperature-chart-head">
      <div>
        <span>${escapeHtml(getAmedasDailySeriesTitle(metric.id, dayOffset, precipitationPeriod.id))}</span>
        <strong>${escapeHtml(chart.stationName || "観測点")}</strong>
      </div>
      <div class="amedas-temperature-chart-current">
        ${formatAmedasDailyColoredValue(latest?.value, metric, precipitationPeriod.id)}
        <span>${escapeHtml(latest?.label ?? "--:--")}</span>
      </div>
    </div>
    ${metric.id === "wind" ? `
      <div class="amedas-temperature-chart-key" aria-label="グラフの凡例">
        <span>平均風速</span>
        <span class="gust">最大瞬間風速</span>
      </div>
    ` : ""}
    ${buildAmedasDailyChartSvg(points, chart.data?.min, chart.data?.max, metric, dayOffset, precipitationPeriod.id)}
    ${isRollingPrecipitation ? `
      <p class="amedas-temperature-chart-note">${escapeHtml(getAmedasRollingPrecipitationNote())}</p>
    ` : ""}
    <div class="amedas-temperature-chart-range${metric.id === "wind" ? " is-wind" : ""}">
      <span>${escapeHtml(getAmedasDailyMinLabel(metric.id))} ${formatAmedasDailyColoredValue(chart.data?.min, metric, precipitationPeriod.id)}</span>
      <span>${escapeHtml(getAmedasDailyMaxLabel(metric.id))} ${formatAmedasDailyColoredValue(chart.data?.max, metric, precipitationPeriod.id)}</span>
      ${metric.id === "wind" && Number.isFinite(chart.data?.maxGust) ? `<span>最大瞬間 ${formatAmedasDailyColoredValue(chart.data.maxGust, metric, precipitationPeriod.id)}${chart.data.maxGustLabel ? ` (${escapeHtml(chart.data.maxGustLabel)})` : ""}</span>` : ""}
    </div>
  `;
}

function buildAmedasDailyChartPeriodToggle(dayOffset) {
  return `
    <div class="amedas-chart-period-toggle" aria-label="グラフの日付" style="--amedas-chart-period-index:${dayOffset}">
      <button type="button" data-amedas-chart-day="0" class="${dayOffset === 0 ? "active" : ""}">今日</button>
      <button type="button" data-amedas-chart-day="1" class="${dayOffset === 1 ? "active" : ""}">昨日</button>
    </div>
  `;
}

function buildAmedasDailyChartSvg(points, minValue, maxValue, metric, dayOffset = 0, precipitationPeriodId = "1h") {
  const width = 320;
  const height = 142;
  const inset = { top: 10, right: 8, bottom: 23, left: 34 };
  const plotWidth = width - inset.left - inset.right;
  const plotHeight = height - inset.top - inset.bottom;
  const isPrecipitation = metric.id === "precipitation";
  const isRollingPrecipitation = isPrecipitation && precipitationPeriodId === "24h";
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
  const shapes = isPrecipitation && !isRollingPrecipitation
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
    <svg class="amedas-temperature-chart-plot" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(getAmedasDailySeriesTitle(metric.id, dayOffset, precipitationPeriodId))}">
      <g class="amedas-temperature-chart-grid">${grids}</g>
      <g class="amedas-temperature-chart-axis">${times}</g>
      <g class="amedas-temperature-chart-line${isPrecipitation && !isRollingPrecipitation ? " is-bar" : ""}${isRollingPrecipitation ? " is-rolling-precipitation" : ""}">${shapes}</g>
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

function formatAmedasDailyColoredValue(value, metric, precipitationPeriodId = "1h") {
  const color = getAmedasObservationColor(metric.id, value, precipitationPeriodId);
  return `<b class="amedas-temperature-chart-value" style="--amedas-value-color:${escapeHtml(color)}">${escapeHtml(formatAmedasDailyValue(value, metric))}</b>`;
}

function getAmedasDailySeriesTitle(metricId, dayOffset = 0, precipitationPeriodId = "1h") {
  const isEnglish = getCurrentLanguage() === "en";
  const dayLabel = dayOffset === 1 ? (isEnglish ? "Yesterday's" : "昨日の") : (isEnglish ? "Today's" : "今日の");
  if (metricId === "precipitation") {
    const period = getAmedasPrecipitationPeriod(precipitationPeriodId);
    if (period.id === "24h") {
      return isEnglish
        ? `${dayLabel} previous 24-hour rainfall trend`
        : `${dayLabel}前24時間降水量の推移`;
    }
    return isEnglish ? `${dayLabel} ${period.primary} rain` : `${dayLabel}${period.label}降水量`;
  }
  if (metricId === "wind") return `${dayLabel}${isEnglish ? " wind speed" : "風速"}`;
  if (metricId === "humidity") return `${dayLabel}${isEnglish ? " humidity" : "湿度"}`;
  if (metricId === "pressure") return `${dayLabel}${isEnglish ? " sea-level pressure" : "海面気圧"}`;
  if (metricId === "snow") return `${dayLabel}${isEnglish ? " snow depth" : "積雪深"}`;
  return `${dayLabel}${isEnglish ? " temperature" : "気温"}`;
}

function getAmedasPrecipitationDisplayLabel(precipitationPeriodId = "1h") {
  const period = getAmedasPrecipitationPeriod(precipitationPeriodId);
  if (period.id === "24h") {
    return getCurrentLanguage() === "en" ? "Previous 24-hour rainfall" : "前24時間降水量（移動合計）";
  }
  return getCurrentLanguage() === "en" ? `${period.primary} rainfall` : `${period.label}降水量`;
}

function getAmedasRollingPrecipitationNote() {
  return getCurrentLanguage() === "en"
    ? "This is the total for the preceding 24 hours at each time. It decreases when older rainfall leaves the window."
    : "各時刻から遡った24時間の合計です。古い雨が集計範囲から外れると値が下がります。";
}

function getAmedasDailyMinLabel(metricId) {
  if (metricId === "precipitation") return "最小";
  if (metricId === "wind") return "最小風速";
  if (metricId === "humidity") return "最低湿度";
  if (metricId === "pressure") return "最低気圧";
  if (metricId === "snow") return "最小積雪深";
  return "最低";
}

function getAmedasDailyMaxLabel(metricId) {
  if (metricId === "precipitation") return "最大";
  if (metricId === "wind") return "最大風速";
  if (metricId === "humidity") return "最高湿度";
  if (metricId === "pressure") return "最高気圧";
  if (metricId === "snow") return "最大積雪深";
  return "最高";
}

function buildAmedasRankingItems(
  data = {},
  metric,
  order = "top",
  rankingView = "current",
  windKind = "average",
  precipitationPeriodId = "1h"
) {
  const pointsById = new Map((data.points ?? []).map((point) => [String(point.id), point]));
  const usesDailyTemperature = metric.id === "temperature" && rankingView !== "current";
  const usesDailyWind = metric.id === "wind" && rankingView === "daily";
  const usesDailyPressure = metric.id === "pressure" && rankingView === "daily";
  const source = usesDailyTemperature
    ? (data.temperatureRankings?.[rankingView] ?? [])
    : (usesDailyWind
      ? (data.windRankings?.[windKind === "gust" ? "gust" : "maximum"] ?? [])
      : (usesDailyPressure ? (data.pressureRankings?.minimum ?? []) : (data.points ?? [])));
  return source
    .map((point) => ({
      id: point.id,
      name: point.name,
      coordinates: point.coordinates ?? pointsById.get(String(point.id))?.coordinates,
      value: usesDailyTemperature || usesDailyWind || usesDailyPressure
        ? point.value
        : point.values?.[metric.id === "wind" && windKind === "gust" ? "gust" : metric.id],
      observationTime: point.observationTime ?? (usesDailyTemperature || usesDailyWind || usesDailyPressure ? null : data.latestTime)
    }))
    .map((item) => ({
      ...item,
      color: getAmedasObservationColor(metric.id, item.value, precipitationPeriodId)
    }))
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

function getAmedasRankingUpdatedAt(data = {}, metricId, rankingView, windKind) {
  if (metricId === "temperature" && rankingView !== "current") {
    return data.temperatureRankings?.[`${rankingView}UpdatedAt`] ?? null;
  }
  if (metricId === "wind" && rankingView === "daily") {
    const key = windKind === "gust" ? "gustUpdatedAt" : "maximumUpdatedAt";
    return data.windRankings?.[key] ?? null;
  }
  if (metricId === "pressure" && rankingView === "daily") {
    return data.pressureRankings?.minimumUpdatedAt ?? null;
  }
  return data.latestTime ?? null;
}

function formatAmedasRankingClock(value) {
  const text = String(value ?? "");
  const directMatch = text.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (directMatch) return `${directMatch[1].padStart(2, "0")}:${directMatch[2]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Tokyo"
  }).format(date);
}

function getAmedasLevels(metricId) {
  return AMEDAS_LEVELS_BY_METRIC[metricId] ?? [];
}

function buildWorldTyphoonModelDetails(layer) {
  const isEnglish = getCurrentLanguage() === "en";
  const worldModel = layer.id;
  const isNoaaModel = worldModel === "gefs" || worldModel === "gefs-mean";
  const isDeterministicModel = worldModel === "ifs-hres" || worldModel === "aifs-single";
  const modelLabel = layer.modelInfo?.label
    ?? (isNoaaModel ? "NOAA/NCEP GEFS" : "ECMWF");
  const modelColor = layer.modelInfo?.color ?? "#38bdf8";
  if (["idle", "loading"].includes(layer.status)) {
    return `
      <section class="typhoon-world-model-detail" style="--world-model-color: ${escapeHtml(modelColor)}">
        <header class="typhoon-world-model-header">
          <i aria-hidden="true"></i>
          <h3>${escapeHtml(modelLabel)}</h3>
        </header>
        <div class="typhoon-empty"><strong>${isEnglish ? "Loading global forecast..." : "各国予想を取得中です。"}</strong></div>
      </section>
    `;
  }
  if (layer.status === "error") {
    return `
      <section class="typhoon-world-model-detail" style="--world-model-color: ${escapeHtml(modelColor)}">
        <header class="typhoon-world-model-header">
          <i aria-hidden="true"></i>
          <h3>${escapeHtml(modelLabel)}</h3>
        </header>
        <div class="typhoon-empty">
          <strong>${isEnglish ? "Global forecast is unavailable." : "各国予想を取得できませんでした。"}</strong>
          <span>${escapeHtml(layer.error ?? "")}</span>
        </div>
      </section>
    `;
  }

  const system = layer.system;
  const candidates = layer.candidates ?? [];
  if (!system) {
    return `
      <section class="typhoon-world-model-detail" style="--world-model-color: ${escapeHtml(modelColor)}">
        <header class="typhoon-world-model-header">
          <i aria-hidden="true"></i>
          <h3>${escapeHtml(modelLabel)}</h3>
        </header>
        <div class="typhoon-empty"><strong>${isEnglish ? "No matching global forecast track is available." : "対象となる各国予想進路はありません。"}</strong></div>
      </section>
    `;
  }

  const source = layer.source ?? {};
  const maxStep = getWorldForecastMaxStep(system);
  const sourceUrl = source.url ?? (isNoaaModel
    ? "https://www.emc.ncep.noaa.gov/emc/pages/numerical_forecast_systems/gefs.php"
    : "https://www.ecmwf.int/en/forecasts/datasets/open-data");
  const licenseUrl = source.licenseUrl ?? (isNoaaModel
    ? "https://registry.opendata.aws/noaa-gefs/"
    : "https://creativecommons.org/licenses/by/4.0/");
  const termsUrl = source.termsUrl ?? (isNoaaModel
    ? "https://www.weather.gov/disclaimer"
    : "https://apps.ecmwf.int/datasets/licences/general/");
  const candidateExplanation = isDeterministicModel
    ? (isEnglish
      ? "This is a single deterministic forecast and does not provide an ensemble-based development probability."
      : "単一の決定論予報です。アンサンブルに基づく発生確率はありません。")
    : isNoaaModel
    ? (isEnglish
      ? "Candidates with at least 20% development probability in the NCEP ensemble tracker. This is not confirmation that a typhoon will form."
      : "NCEPのensemble trackerが示す発生確率20%以上の候補です。台風発生の確定情報ではありません。")
    : (isEnglish
      ? "Leading candidates supported by at least 20 ensemble members. This is not a development probability or confirmation that a typhoon will form."
      : "20本以上のアンサンブルメンバーが支持する上位候補です。発生確率や台風発生の確定情報ではありません。");
  const forecastExplanation = isDeterministicModel
    ? (isEnglish
      ? "A reference track from one numerical forecast. This is not an official JMA typhoon track forecast."
      : "単一の数値予報による参考進路です。気象庁の公式な台風進路予報ではありません。")
    : (isEnglish
      ? "Reference information showing numerical forecast spread. This is not an official JMA typhoon track forecast."
      : "数値予報のばらつきを示す参考情報です。気象庁の公式な台風進路予報ではありません。");
  const mapSystems = layer.systems ?? [];
  const mapSystemCount = mapSystems.filter((mapSystem) =>
    (mapSystem.members ?? []).some((member) => member.coordinates?.length >= 2)
    || mapSystem.controlCoordinates?.length >= 2
  ).length;
  const mapTrackCount = mapSystems.reduce((total, mapSystem) => {
    const hasControlTrack = mapSystem.controlCoordinates?.length >= 2;
    const memberTracks = (mapSystem.members ?? []).filter((member) =>
      member.coordinates?.length >= 2
      && !(Number(member.id) === 0 && hasControlTrack)
    ).length;
    return total + memberTracks + (hasControlTrack ? 1 : 0);
  }, 0);

  return `
    <section class="typhoon-world-model-detail" style="--world-model-color: ${escapeHtml(modelColor)}">
      <header class="typhoon-world-model-header">
        <i aria-hidden="true"></i>
        <h3>${escapeHtml(modelLabel)}</h3>
        <span>${isEnglish
          ? (isDeterministicModel ? "Deterministic" : "Ensemble")
          : (isDeterministicModel ? "単一予報" : "アンサンブル")}</span>
      </header>
      <dl class="typhoon-world-summary">
        <div><dt>${isEnglish ? "Target" : "対象"}</dt><dd>${escapeHtml(system.name)}</dd></div>
        <div><dt>${isEnglish ? "Base time" : "基準時刻"}</dt><dd>${escapeHtml(formatWorldForecastTime(system.forecastBaseTime, isEnglish ? "en" : "ja"))}</dd></div>
        <div><dt>${isEnglish ? "Forecast range" : "予報期間"}</dt><dd>${escapeHtml(isEnglish ? `${Math.ceil(maxStep / 24)} days` : `${Math.ceil(maxStep / 24)}日`)}</dd></div>
        <div><dt>${isEnglish ? "Members" : "メンバー"}</dt><dd>${escapeHtml(isEnglish ? `${system.memberCount}` : `${system.memberCount}本`)}</dd></div>
        <div><dt>${isEnglish ? "On map" : "地図に表示"}</dt><dd>${escapeHtml(isEnglish ? `${mapSystemCount} systems / ${mapTrackCount} tracks` : `${mapSystemCount}系統 / ${mapTrackCount}本`)}</dd></div>
      </dl>
      <section class="typhoon-world-candidates">
        <div class="typhoon-world-candidates-head">
          <h4>${isEnglish ? "Development candidates" : "発達候補"}</h4>
          <span>${escapeHtml(isEnglish ? `${candidates.length} items` : `${candidates.length}件`)}</span>
        </div>
        <p>${escapeHtml(candidateExplanation)}</p>
        ${candidates.length ? `
          <table class="typhoon-world-candidate-list">
            <thead>
              <tr><th scope="col">${isEnglish ? "Candidate" : "候補名"}</th><th scope="col">${isEnglish ? "Support" : "支持状況"}</th></tr>
            </thead>
            <tbody>
              ${candidates.slice(0, 6).map((candidate) => `
                <tr><th scope="row">${escapeHtml(candidate.name)}</th><td>${escapeHtml(formatWorldCandidateSupport(candidate, isEnglish ? "en" : "ja"))}</td></tr>
              `).join("")}
            </tbody>
          </table>
        ` : ""}
      </section>
      <footer class="typhoon-world-attribution">
        <p><strong>${isEnglish ? "Reference" : "参考情報"}</strong>${escapeHtml(forecastExplanation)}</p>
        <p><strong>${isEnglish ? "Source" : "出典"}</strong>${escapeHtml(source.attribution ?? modelLabel)}${isEnglish ? " (processed)" : "（加工済み）"}</p>
        <div>
          <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${isEnglish ? "Data" : "データ"}</a>
          <a href="${escapeHtml(licenseUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.license ?? (isEnglish ? "License" : "利用条件"))}</a>
          <a href="${escapeHtml(termsUrl)}" target="_blank" rel="noopener noreferrer">${isEnglish ? "Terms" : "利用条件"}</a>
        </div>
      </footer>
    </section>
  `;
}

function renderTyphoonDetails(tab, state) {
  const root = document.getElementById("typhoon-detail-grid");
  if (!root) return;

  const isTyphoon = tab.id === "typhoon";
  root.hidden = !isTyphoon;
  if (!isTyphoon) {
    setSocialSharePayload("typhoon", null);
    root.innerHTML = "";
    return;
  }

  if (state.data?.worldForecastMode) {
    setSocialSharePayload("typhoon", null);
    const layers = state.data?.worldForecastLayers ?? [];
    root.innerHTML = layers.length
      ? layers.map(buildWorldTyphoonModelDetails).join("")
      : `<div class="typhoon-empty"><strong>表示する各国予想モデルを選択してください。</strong></div>`;
    return;
  }

  if (state.data?.hasTyphoon === false) {
    setSocialSharePayload("typhoon", null);
    root.innerHTML = `
      <div class="typhoon-empty">
        <strong>${escapeHtml(NO_TYPHOON_MESSAGE)}</strong>
      </div>
    `;
    return;
  }

  const details = getTyphoonDetails(state);
  const selectedTyphoon = state.data?.selectedTyphoon
    ?? state.data?.typhoons?.[0]
    ?? null;
  const transitionStatus = selectedTyphoon?.transitionStatus
    ?? selectedTyphoon?.details?.transitionStatus
    ?? details.transitionStatus
    ?? "";
  if (selectedTyphoon) {
    setSocialSharePayload("typhoon", {
      type: "typhoon",
      name: selectedTyphoon.name ?? details.name ?? "台風",
      updatedAt: selectedTyphoon.updatedAt ?? state.data?.updatedAt ?? state.data?.latestTime ?? "-",
      center: selectedTyphoon.center,
      track: selectedTyphoon.track ?? selectedTyphoon.pastTrack ?? [],
      forecastTrack: selectedTyphoon.forecastTrack ?? [],
      forecastCircles: selectedTyphoon.forecastCircles ?? [],
      strongWindRadius: selectedTyphoon.strongWindRadius,
      strongWindCenter: selectedTyphoon.strongWindCenter ?? selectedTyphoon.center,
      stormRadius: selectedTyphoon.stormRadius,
      stormCenter: selectedTyphoon.stormCenter ?? selectedTyphoon.center,
      stormWarningArea: selectedTyphoon.stormWarningArea ?? [],
      stormWarningAreaShape: selectedTyphoon.stormWarningAreaShape ?? null,
      stormWarningGroups: selectedTyphoon.stormWarningGroups ?? [],
      transitionStatus,
      size: details.size,
      strength: details.strength,
      pressure: details.pressure,
      maxWind: details.maxWind,
      maxGust: details.maxGust,
      movement: formatTyphoonMovement(details.direction, details.speed),
      position: details.position
    });
  } else {
    setSocialSharePayload("typhoon", null);
  }
  const movement = formatTyphoonMovement(details.direction, details.speed);
  const statusMarkup = transitionStatus ? `
    <div class="typhoon-transition-status" role="status">
      <span>現在の状態</span>
      <strong>${escapeHtml(transitionStatus)}</strong>
    </div>
  ` : "";
  const shareMarkup = selectedTyphoon ? `
    <button type="button" class="social-share-trigger typhoon-share-button" data-social-share="typhoon" aria-label="台風情報を画像で共有" title="台風情報を画像で共有">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0-11 4 4m-4-4L8 7M5 12v7h14v-7"/></svg>
    </button>
  ` : "";
  const classificationItems = getTyphoonClassificationItems(details);
  const classificationMarkup = classificationItems.length ? `
    <div class="typhoon-analysis-classification" aria-label="台風の大きさと強さ">
      ${classificationItems.map(([label, value, kind, toneClass]) => `
        <strong class="typhoon-analysis-classification-item is-${kind}${toneClass}" aria-label="${escapeHtml(label)}: ${escapeHtml(value)}">${escapeHtml(value)}</strong>
      `).join("")}
    </div>
  ` : "";
  const positionMarkup = details.position !== "-" ? `
    <dl class="typhoon-analysis-position">
      <div>
        <dt>中心位置</dt>
        <dd>${escapeHtml(details.position)}</dd>
      </div>
    </dl>
  ` : "";
  root.innerHTML = `
    <section class="typhoon-analysis-panel" aria-label="台風の解析値">
      <header class="typhoon-analysis-head">
        <strong>台風の解析値</strong>
        ${shareMarkup}
      </header>
      ${statusMarkup}
      ${classificationMarkup}
      <dl class="typhoon-analysis-primary">
        ${[
          ["中心気圧", details.pressure, "pressure"],
          ["最大風速", details.maxWind, "wind"],
          ["最大瞬間", details.maxGust, "gust"]
        ].map(([label, value, kind]) => `
          <div class="typhoon-analysis-metric is-${kind}">
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(value)}</dd>
          </div>
        `).join("")}
      </dl>
      ${positionMarkup}
      <dl class="typhoon-analysis-movement">
        <div>
          <dt>移動</dt>
          <dd>${escapeHtml(movement)}</dd>
        </div>
      </dl>
    </section>
  `;
}

function renderEarthquakeList(tab, state) {
  const root = document.getElementById("earthquake-list");
  if (!root) return;
  const render = (markup) => {
    root.innerHTML = markup;
    initializeMobileDockSegmentIndicators(root);
    applyMobileEarthquakeDetailPage(mobileEarthquakeSummaryPage);
  };

  const isEarthquake = tab.id === "earthquake";
  root.hidden = !isEarthquake;
  root.classList.remove("is-distribution-view");
  if (!isEarthquake) {
    setSocialSharePayload("earthquake", null);
    root.innerHTML = "";
    return;
  }

  if (state.earthquakeContentMode === "volcano" || state.data?.earthquakeContentMode === "volcano") {
    setSocialSharePayload("earthquake", null);
    renderVolcanoList(state, render);
    return;
  }

  const view = state.data?.earthquakeView ?? "recent";
  root.classList.toggle("is-distribution-view", view === "distribution");
  const viewToggle = buildEarthquakeViewToggle(view);
  const mapLayerControls = buildEarthquakeMapLayerControls(state.data ?? {});
  const earthquakes = state.data?.earthquakes ?? [];
  const selectedEarthquake = state.data?.selectedEarthquake ?? earthquakes[0] ?? null;
  if (selectedEarthquake) {
    const unknownText = getEarthquakeUnknownText(selectedEarthquake);
    const selectedObservationSource = selectedEarthquake.intensityStations?.length
      ? selectedEarthquake.intensityStations
      : (selectedEarthquake.intensityCities ?? []);
    const selectedTsunamiState = getEarthquakeTsunamiState(
      selectedEarthquake,
      state.data?.tsunami,
      state.data?.tsunamiStatus
    );
    setSocialSharePayload("earthquake", {
      type: "earthquake",
      intensity: formatEarthquakeUnknownMetric(
        selectedEarthquake.maxIntensityShort ?? selectedEarthquake.maxIntensityLabel,
        unknownText
      ),
      intensityColor: getEarthquakeIntensityColor(selectedEarthquake.maxIntensity),
      eventTime: formatEarthquakeEventTime(
        selectedEarthquake.eventTime ?? selectedEarthquake.reportTime
      ),
      coordinates: selectedEarthquake.coordinates,
      hypocenter: formatEarthquakeHypocenterText(selectedEarthquake, "震央調査中"),
      magnitude: formatEarthquakeMagnitude(selectedEarthquake.magnitude, {
        prefix: true,
        unknownText
      }),
      depth: formatEarthquakeDepthText(selectedEarthquake.depth, { compact: true, unknownText }),
      tsunami: getEarthquakeTsunamiMetricText(selectedTsunamiState),
      observations: selectedObservationSource.map((observation) => ({
        name: observation.stationName
          ?? observation.cityName
          ?? observation.areaName
          ?? "観測地点",
        prefecture: observation.prefecture ?? "",
        intensity: observation.intensityShort
          ?? observation.intensityLabel
          ?? observation.intensity
          ?? "--",
        intensityColor: getEarthquakeIntensityColor(observation.intensity),
        coordinates: observation.coordinates
      }))
    });
  } else {
    setSocialSharePayload("earthquake", null);
  }
  const renderDetailPages = (earthquakeMarkup) => render(`
    <div class="earthquake-detail-mode" data-mobile-earthquake-detail="earthquake">
      ${earthquakeMarkup}
    </div>
    <div class="earthquake-detail-mode tsunami-dedicated-detail" data-mobile-earthquake-detail="tsunami">
      ${buildTsunamiDedicatedDetailMarkup(
        selectedEarthquake,
        state.data?.tsunami,
        state.data?.tsunamiStatus
      )}
    </div>
    <div class="earthquake-detail-mode tide-dedicated-detail" data-mobile-earthquake-detail="tide">
      ${buildTideObservationDedicatedDetailMarkup(state.data?.tideObservation)}
    </div>
  `);

  if (view === "distribution") {
    renderDetailPages(
      `${viewToggle}${mapLayerControls}${buildEarthquakeDistributionMarkup(state.data ?? {})}`
    );
    return;
  }

  const renderRecent = (earthquakeMarkup) => renderDetailPages(
    `${viewToggle}${mapLayerControls}${earthquakeMarkup}`
  );

  if (state.status === "loading") {
    renderRecent(`<div class="earthquake-empty" role="status" aria-live="polite">${escapeHtml(
      localizeText("気象庁防災情報XMLから地震情報を取得中です。")
    )}</div>`);
    return;
  }

  if (state.status === "error") {
    renderRecent(`<div class="earthquake-empty" role="alert">${escapeHtml(
      localizeText("気象庁防災情報XMLから地震情報を取得できませんでした。")
    )}</div>`);
    return;
  }

  if (!earthquakes.length) {
    renderRecent(`<div class="earthquake-empty">${escapeHtml(
      localizeText("直近の地震情報はありません。")
    )}</div>`);
    return;
  }

  const selectedId = String(state.data?.selectedEarthquakeId ?? earthquakes[0]?.id ?? "");
  const collapsedId = String(state.data?.collapsedEarthquakeId ?? "");
  const requestedVisibleCount = Number(state.data?.earthquakeHistoryVisibleCount);
  const visibleCount = Number.isFinite(requestedVisibleCount)
    ? Math.max(1, Math.min(earthquakes.length, Math.floor(requestedVisibleCount)))
    : earthquakes.length;
  const visibleEarthquakes = earthquakes.slice(0, visibleCount);
  const remainingCount = Math.max(0, earthquakes.length - visibleEarthquakes.length);
  const canFetchOlderHistory = state.data?.earthquakeHistoryHasMoreSourceEntries === true;
  const isLoadingMore = state.data?.earthquakeHistoryLoadingMore === true;
  const historyMarkup = visibleEarthquakes.map((earthquake, index) => {
    const isActive = String(earthquake.id) === selectedId;
    const isExpanded = isActive && String(earthquake.id) !== collapsedId;
    const intensityColor = getEarthquakeIntensityColor(earthquake.maxIntensity);
    const intensityTextClass = getEarthquakeIntensityTextClass(earthquake.maxIntensity);
    const unknownText = getEarthquakeUnknownText(earthquake);
    const magnitude = formatEarthquakeMagnitude(earthquake.magnitude, { prefix: true, unknownText });
    const depthText = formatEarthquakeDepthText(earthquake.depth, { compact: true, unknownText });
    const observations = buildEarthquakeObservationRows(earthquake);
    const observationsId = `earthquake-observations-${index}`;
    const tsunamiState = getEarthquakeTsunamiState(
      earthquake,
      state.data?.tsunami,
      state.data?.tsunamiStatus
    );
    const summaryMarkup = renderExpandedEarthquakeSummary({
      earthquake,
      intensityColor,
      intensityTextClass,
      magnitude,
      depthText,
      tsunamiState
    });
    return `
      <article class="earthquake-history-item${isActive ? " active" : ""}${isExpanded ? " expanded" : ""}">
        <button
          type="button"
          class="earthquake-select-button earthquake-detail-button"
          data-earthquake-id="${escapeHtml(earthquake.id)}"
          aria-expanded="${isExpanded ? "true" : "false"}"
          aria-pressed="${isActive ? "true" : "false"}"
          aria-controls="${observationsId}"
        >
          ${summaryMarkup}
          <span class="earthquake-card-chevron" aria-hidden="true"></span>
        </button>
        ${isExpanded ? renderEarthquakeObservations(observations, observationsId, { showShareButton: true }) : ""}
        ${isExpanded ? renderEarthquakeTsunamiDetails(tsunamiState) : ""}
      </article>
    `;
  }).join("");
  const loadMoreError = String(state.data?.earthquakeHistoryLoadMoreError ?? "").trim();
  const loadMoreMarkup = remainingCount > 0 || canFetchOlderHistory || isLoadingMore ? `
    ${loadMoreError ? `<p class="earthquake-history-load-more-error">${escapeHtml(loadMoreError)}</p>` : ""}
    <button
      type="button"
      class="earthquake-history-load-more"
      data-earthquake-history-load-more
      ${isLoadingMore ? 'disabled aria-busy="true"' : ""}
      aria-label="${isLoadingMore
        ? escapeHtml(localizeText("過去の地震履歴を読み込み中"))
        : escapeHtml(localizeText("地震履歴をさらに読み込む"))}"
    >
      <span class="earthquake-history-load-more-rule" aria-hidden="true"></span>
      <span class="earthquake-history-load-more-label">
        <span class="earthquake-history-load-more-icon" aria-hidden="true"></span>
        <span>${escapeHtml(localizeText(isLoadingMore ? "読み込み中…" : "さらに読み込む"))}</span>
      </span>
      <span class="earthquake-history-load-more-rule" aria-hidden="true"></span>
    </button>
  ` : "";
  renderRecent(historyMarkup + loadMoreMarkup);
}

function buildVolcanoMobileContextMarkup(state) {
  const reports = state.data?.reports ?? [];
  const selectedCode = String(state.selectedVolcanoCode ?? state.data?.selectedVolcanoCode ?? "");
  const report = reports.find((item) => String(item.volcanoCode ?? item.code ?? "") === selectedCode)
    ?? getHighestPriorityVolcanoReport(reports);
  if (state.status === "loading") {
    return `<div class="mobile-dock-content mobile-dock-volcano" aria-busy="true">${buildMobileDockLoadingStatus("火山情報を読み込み中")}</div>`;
  }
  if (!report) {
    return buildMobileContextMarkup(
      localizeText("火山情報"),
      getCurrentLanguage() === "en" ? "No recent bulletins" : "直近の発表はありません",
      getCurrentLanguage() === "en" ? "Press and hold for earthquakes" : "長押しで地震へ"
    );
  }
  const level = Math.max(0, Math.min(5, Number(report.level) || 0));
  const priority = Math.max(0, Math.min(5, Number(report.alertPriority || level) || 0));
  const forecasts = getAvailableVolcanoAshForecasts(report);
  const forecastIndex = Math.max(0, Math.min(
    forecasts.length - 1,
    Number(state.selectedVolcanoAshForecastIndex ?? state.data?.selectedVolcanoAshForecastIndex) || 0
  ));
  const forecast = forecasts[forecastIndex];
  const forecastTime = forecast
    ? `${formatVolcanoForecastTime(forecast.startTime)}～${formatVolcanoForecastTime(forecast.endTime)}`
    : "";
  const forecastTimes = forecasts.map((item) =>
    `${formatVolcanoForecastTime(item.startTime)}～${formatVolcanoForecastTime(item.endTime)}`
  );
  const rawStatus = String(report.currentStatus ?? report.kindName ?? report.infoKind ?? "警戒状況未確認");
  const conciseStatus = level > 0
    ? rawStatus
      .replace(new RegExp(`^(?:噴火警戒)?レベル\\s*${level}\\s*`), "")
      .replace(/^[(（]\s*|\s*[)）]$/g, "")
      .trim() || rawStatus
    : rawStatus;
  const displayStatus = localizeVolcanoText(
    conciseStatus,
    level > 0
      ? localizeText(VOLCANO_ALERT_LEVEL_GUIDE.find((item) => item.level === level)?.keyword ?? "警戒状況未確認")
      : localizeText("警戒状況未確認")
  );
  const displayVolcanoName = report.volcanoName
    ? localizeText(report.volcanoName)
    : localizeText("火山名不明");
  const displayReportTime = report.reportTime ?? localizeText("時刻不明");
  return `
    <div class="mobile-dock-content mobile-dock-volcano level-${priority}">
      <div class="mobile-dock-volcano-main">
        <div class="mobile-dock-volcano-copy">
          <div class="mobile-dock-volcano-meta">
            <span>${escapeHtml(localizeText("気象庁発表"))}</span>
            <time>${escapeHtml(displayReportTime)}</time>
          </div>
          <div class="mobile-dock-volcano-title">
            <strong>${escapeHtml(displayVolcanoName)}</strong>
            <span>${escapeHtml(displayStatus)}</span>
          </div>
        </div>
        <em>${level > 0 ? escapeHtml(localizeText(`レベル${level}`)) : escapeHtml(localizeText("火山情報"))}</em>
      </div>
      ${forecasts.length > 1 ? `
        <div class="mobile-dock-volcano-forecast">
          <span><b>${escapeHtml(localizeText("降灰予報"))}</b><strong>${escapeHtml(forecastTime)}</strong></span>
          <div class="volcano-ash-timeline">
            <div class="volcano-ash-timeline-rail" aria-hidden="true">
              ${forecasts.map(() => "<i></i>").join("")}
            </div>
            <input class="volcano-ash-slider" type="range" min="0" max="${forecasts.length - 1}" step="1" value="${forecastIndex}" data-mobile-dock-control data-volcano-ash-forecast-index data-volcano-ash-forecast-times="${escapeHtml(JSON.stringify(forecastTimes))}" aria-label="${escapeHtml(localizeText("降灰予報の予測時間"))}" aria-valuetext="${escapeHtml(forecastTime)}">
          </div>
        </div>` : forecast ? `<div class="mobile-dock-volcano-forecast"><span><b>${escapeHtml(localizeText("降灰予報"))}</b><strong>${escapeHtml(forecastTime)}</strong></span></div>` : ""}
    </div>`;
}

function formatVolcanoForecastTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value ?? localizeText("時刻不明"));
  return new Intl.DateTimeFormat(getCurrentLanguage() === "en" ? "en-US" : "ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

const VOLCANO_ALERT_LEVEL_GUIDE = [
  {
    level: 5,
    keyword: "避難",
    range: "居住地域",
    action: "危険な居住地域から避難します。対象地域と避難方法は、自治体の指示を確認してください。",
    scope: 100
  },
  {
    level: 4,
    keyword: "高齢者等避難",
    range: "居住地域",
    action: "高齢者など避難に時間がかかる方は避難し、ほかの住民は避難の準備をします。",
    scope: 88
  },
  {
    level: 3,
    keyword: "入山規制",
    range: "火口から居住地域近くまで",
    action: "登山禁止や入山規制が行われます。状況により、高齢者などは避難の準備をします。",
    scope: 67
  },
  {
    level: 2,
    keyword: "火口周辺規制",
    range: "火口周辺",
    action: "火口周辺への立ち入りが規制されます。規制範囲には入らないでください。",
    scope: 45
  },
  {
    level: 1,
    keyword: "活火山であることに留意",
    range: "火口内など",
    action: "最新の火山情報を確認します。状況により、火口内への立ち入りが規制されます。",
    scope: 28
  }
];

function buildVolcanoAlertLevelGuide() {
  const scopeRows = VOLCANO_ALERT_LEVEL_GUIDE.map(({ level, keyword, scope }) => {
    const chartKeyword = level === 1 ? "活火山に留意" : keyword;
    return `
    <div class="volcano-guide-scope-row level-${level}">
      <b>L${level}</b>
      <span
        style="--volcano-guide-scope:${scope}%"
        title="${escapeHtml(localizeText(keyword))}"
        aria-label="${escapeHtml(localizeText(keyword))}"
      >${escapeHtml(localizeText(chartKeyword))}</span>
    </div>
  `;
  }).join("");
  const levelRows = VOLCANO_ALERT_LEVEL_GUIDE.map(({ level, keyword, range, action }) => `
    <li class="volcano-guide-level level-${level}">
      <span class="volcano-guide-level-number"><small>${escapeHtml(localizeText("レベル"))}</small>${level}</span>
      <div class="volcano-guide-level-copy">
        <div>
          <strong>${escapeHtml(localizeText(keyword))}</strong>
          <span>${escapeHtml(localizeText(range))}</span>
        </div>
        <p>${escapeHtml(localizeText(action))}</p>
      </div>
    </li>
  `).join("");

  return `
    <article class="volcano-level-guide">
      <header class="volcano-level-guide-header">
        <span>${escapeHtml(localizeText("火山情報の見方"))}</span>
        <h2>${escapeHtml(localizeText("噴火警戒レベル"))}</h2>
        <p>${escapeHtml(localizeText("火山活動の状況と、防災上警戒すべき範囲を5段階で示します。"))}</p>
      </header>
      <section class="volcano-guide-scope" aria-labelledby="volcano-guide-scope-title">
        <div class="volcano-guide-section-title">
          <h3 id="volcano-guide-scope-title">${escapeHtml(localizeText("警戒範囲の目安"))}</h3>
          <span>${escapeHtml(localizeText("活動に応じて範囲が広がります"))}</span>
        </div>
        <div class="volcano-guide-scope-chart">${scopeRows}</div>
        <div class="volcano-guide-scope-axis" aria-hidden="true">
          <span>${escapeHtml(localizeText("火口内"))}</span>
          <span>${escapeHtml(localizeText("火口周辺"))}</span>
          <span>${escapeHtml(localizeText("居住地域近く"))}</span>
          <span>${escapeHtml(localizeText("居住地域"))}</span>
        </div>
      </section>
      <section class="volcano-guide-levels" aria-labelledby="volcano-guide-levels-title">
        <div class="volcano-guide-section-title">
          <h3 id="volcano-guide-levels-title">${escapeHtml(localizeText("レベル別の行動"))}</h3>
          <span>${escapeHtml(localizeText("対象範囲は火山ごとに異なります"))}</span>
        </div>
        <ol>${levelRows}</ol>
      </section>
      <p class="volcano-guide-footnote">${escapeHtml(localizeText("地図上の▲を選択すると、その火山の発表内容を表示します。噴火警戒レベルを運用していない火山では、警報・予報の表現が異なります。実際の規制や避難対象は、気象庁・自治体等の最新発表に従ってください。"))}</p>
    </article>
  `;
}

function renderVolcanoList(state, render) {
  if (state.status === "loading") {
    render(`<div class="earthquake-empty">${escapeHtml(localizeText("気象庁防災情報XMLから火山情報を取得中です。"))}</div>`);
    return;
  }
  if (state.status === "error") {
    render(`<div class="earthquake-empty">${escapeHtml(localizeText("火山情報を取得できませんでした。最新性を確認できていません。"))}</div>`);
    return;
  }
  const reports = state.data?.reports ?? [];
  if (!reports.length) {
    render(`<div class="earthquake-empty">${escapeHtml(localizeText("直近の火山情報はありません。"))}</div>`);
    return;
  }
  const selectedCode = String(state.selectedVolcanoCode ?? state.data?.selectedVolcanoCode ?? "");
  const selectedBulletinId = String(state.selectedVolcanoBulletinId ?? "");
  const selectedReport = reports.find((report) =>
    String(report.volcanoCode ?? report.code ?? "") === selectedCode
  );
  const selectedBulletin = (selectedReport?.relatedReports ?? [])
    .find((item) => String(item.id ?? "") === selectedBulletinId);
  render(`
    ${selectedBulletin
      ? ""
      : selectedReport
        ? `<div class="volcano-bulletin-detail-nav volcano-selection-nav">
            <button type="button" data-volcano-clear-selection>${escapeHtml(localizeText("← 火山情報の見方"))}</button>
            <span>${escapeHtml(localizeText("地図で選択中"))}</span>
          </div>`
        : `<section class="volcano-panel-intro">
            <div>
              <strong>${escapeHtml(localizeText("火山防災情報"))}</strong>
              <span>${escapeHtml(localizeText("噴火警戒レベルと、必要な行動を確認できます。"))}</span>
            </div>
          </section>`}
    <div class="volcano-report-list">
      ${selectedReport
        ? buildSelectedVolcanoDetail(selectedReport, selectedBulletinId)
        : buildVolcanoAlertLevelGuide()}
    </div>
    <p class="volcano-source-note">${escapeHtml(localizeText("出典："))}<a href="https://www.jma.go.jp/bosai/volcano/" target="_blank" rel="noopener noreferrer">${escapeHtml(localizeText("気象庁「火山情報」"))}</a>${escapeHtml(localizeText("。MeteoScopeは気象庁の公式アプリではありません。避難や規制は自治体等の公式発表も確認してください。"))}</p>
  `);
}

function buildSelectedVolcanoDetail(report, selectedBulletinId = "") {
  const relatedReports = report.relatedReports?.length ? report.relatedReports : [report];
  const selectedBulletin = relatedReports.find((item) => String(item.id ?? "") === selectedBulletinId);
  if (selectedBulletin) return buildVolcanoBulletinDetail(report, selectedBulletin);
  const warningDetailReport = getVolcanoWarningDetailReport(report);
  const detailReport = warningDetailReport ?? report;
  const latestRelatedReports = getLatestVolcanoReportsByType(relatedReports);
  const level = Math.max(0, Math.min(5, Number(report.level) || 0));
  const priority = Math.max(0, Math.min(5, Number(report.alertPriority ?? level) || 0));
  const statusText = report.currentStatus ?? report.kindName ?? detailReport.kindName ?? "警戒状況未確認";
  const alertName = report.currentStatus ?? report.kindName ?? detailReport.kindName ?? statusText;
  const levelGuide = VOLCANO_ALERT_LEVEL_GUIDE.find((item) => item.level === level);
  const restriction = localizeVolcanoText(
    extractVolcanoRestriction(alertName, alertName),
    localizeText(levelGuide?.keyword ?? "警戒状況未確認")
  );
  const warningText = warningDetailReport
    ? warningDetailReport.prevention || warningDetailReport.volcanoHeadline || warningDetailReport.headline
    : "";
  const targetAreaGroups = relatedReports.flatMap((item) => item.targetAreas ?? []);
  const uniqueAreaGroups = [...new Map(targetAreaGroups.map((group) => [
    `${group.kindName}:${group.areas?.map((area) => area.code || area.name).join(",")}`,
    group
  ])).values()];
  const craterName = relatedReports.find((item) => item.craterName)?.craterName ?? "";
  const volcanoName = report.volcanoName ? localizeText(report.volcanoName) : localizeText("火山名不明");
  const localizedCraterName = craterName ? localizeText(craterName) : "";
  const displayName = craterName && !volcanoName.includes(craterName)
    ? `${volcanoName}${localizedCraterName ? ` (${localizedCraterName})` : ""}`
    : volcanoName;
  return `
    <article class="volcano-selected-detail level-${priority}">
      <header class="volcano-selected-header">
        <div>
          <h2>${escapeHtml(displayName)}</h2>
          <time>${escapeHtml(detailReport.reportTime ?? report.reportTime ?? localizeText("発表時刻不明"))}</time>
        </div>
      </header>
      ${buildVolcanoSummaryNotice()}
      <section class="volcano-alert-summary" aria-label="${escapeHtml(localizeText("現在の噴火警報・予報"))}">
        <span>${level > 0 ? escapeHtml(localizeText(`噴火警戒レベル${level}`)) : escapeHtml(localizeVolcanoText(detailReport.infoKind, localizeText("火山情報")))}</span>
        <strong>${escapeHtml(restriction)}</strong>
      </section>
      ${warningText ? `
        <section class="volcano-detail-section">
          <h3>${escapeHtml(localizeText("現在の警戒事項等"))}</h3>
          ${formatVolcanoParagraphs(
            warningText,
            localizeText(levelGuide?.action ?? "発表内容は気象庁の原文で確認してください。")
          )}
        </section>` : ""}
      ${detailReport.activity ? `
        <section class="volcano-detail-section">
          <h3>${escapeHtml(localizeText("火山活動の状況"))}</h3>
          ${formatVolcanoParagraphs(
            detailReport.activity,
            "Detailed volcanic activity is available in the original JMA bulletin."
          )}
        </section>` : ""}
      ${uniqueAreaGroups.length ? `
        <section class="volcano-detail-section">
          <h3>${escapeHtml(localizeText("噴火警報・予報の対象市町村"))}</h3>
          <div class="volcano-target-groups">
            ${uniqueAreaGroups.map(buildVolcanoTargetAreaGroup).join("")}
          </div>
        </section>` : ""}
      ${detailReport.nextAdvisory ? `
        <section class="volcano-detail-section volcano-next-advisory">
          <h3>${escapeHtml(localizeText("次回の情報"))}</h3>
          ${formatVolcanoParagraphs(
            detailReport.nextAdvisory,
            "The next bulletin schedule is available in the original JMA bulletin. Updates may be issued sooner if conditions change."
          )}
        </section>` : ""}
      ${buildVolcanoOriginalSourceLink(detailReport.sourceUrl)}
      <section class="volcano-detail-section volcano-history-section">
        <h3>${escapeHtml(localizeText("関連する発表"))}</h3>
        <div class="volcano-detail-history">
          ${latestRelatedReports.map((item) => buildVolcanoHistoryItem(item, selectedBulletinId)).join("")}
        </div>
      </section>
    </article>`;
}

function buildVolcanoBulletinDetail(volcano, bulletin) {
  const volcanoName = volcano.volcanoName ? localizeText(volcano.volcanoName) : localizeText("火山名不明");
  const craterName = bulletin.craterName ?? "";
  const localizedCraterName = craterName ? localizeText(craterName) : "";
  const displayName = craterName && !volcanoName.includes(craterName)
    ? `${volcanoName}${localizedCraterName ? ` (${localizedCraterName})` : ""}`
    : volcanoName;
  const groups = bulletin.targetAreas ?? [];
  const sections = [
    bulletin.volcanoHeadline || bulletin.headline
      ? `<section class="volcano-detail-section"><h3>${escapeHtml(localizeText("発表内容"))}</h3>${formatVolcanoParagraphs(bulletin.volcanoHeadline || bulletin.headline, "See the original JMA bulletin for the full announcement.")}</section>`
      : "",
    bulletin.activity
      ? `<section class="volcano-detail-section"><h3>${escapeHtml(localizeText("火山活動の状況"))}</h3>${formatVolcanoParagraphs(bulletin.activity, "Detailed volcanic activity is available in the original JMA bulletin.")}</section>`
      : "",
    bulletin.prevention
      ? `<section class="volcano-detail-section"><h3>${escapeHtml(localizeText("警戒事項等"))}</h3>${formatVolcanoParagraphs(bulletin.prevention, "Follow the current restrictions and safety instructions from JMA and local authorities.")}</section>`
      : "",
    groups.length
      ? `<section class="volcano-detail-section"><h3>${escapeHtml(localizeText("対象地域"))}</h3><div class="volcano-target-groups">${groups.map(buildVolcanoTargetAreaGroup).join("")}</div></section>`
      : "",
    bulletin.nextAdvisory
      ? `<section class="volcano-detail-section volcano-next-advisory"><h3>${escapeHtml(localizeText("次回の情報"))}</h3>${formatVolcanoParagraphs(bulletin.nextAdvisory, "The next bulletin schedule is available in the original JMA bulletin. Updates may be issued sooner if conditions change.")}</section>`
      : ""
  ].filter(Boolean).join("");
  return `
    <article class="volcano-selected-detail volcano-bulletin-detail">
      <div class="volcano-bulletin-detail-nav">
        <button type="button" data-volcano-bulletin-back>${getCurrentLanguage() === "en" ? `← Back to ${escapeHtml(volcanoName)}` : `← ${escapeHtml(volcanoName)}の情報へ戻る`}</button>
        <span>${escapeHtml(localizeText("選択した発表"))}</span>
      </div>
      <header class="volcano-selected-header">
        <span class="volcano-selected-kicker">${escapeHtml(displayName)}</span>
        <h2>${escapeHtml(localizeVolcanoText(
          formatVolcanoBulletinTitle(bulletin.title ?? bulletin.infoKind ?? "火山情報"),
          getVolcanoBulletinFallbackTitle(bulletin)
        ))}</h2>
        <time>${escapeHtml(bulletin.reportTime ?? localizeText("発表時刻不明"))}</time>
      </header>
      ${buildVolcanoSummaryNotice()}
      ${sections || `<section class="volcano-detail-section"><p>${escapeHtml(localizeText("この発表の本文は取得できませんでした。気象庁XML原文を確認してください。"))}</p></section>`}
      ${buildVolcanoOriginalSourceLink(bulletin.sourceUrl)}
    </article>`;
}

function buildVolcanoSummaryNotice() {
  if (getCurrentLanguage() !== "en") return "";
  return `
    <aside class="volcano-summary-notice" role="note">
      <strong>Automated English summary</strong>
      <p>Only details identified with high confidence are shown. Some observations, dates, quantities, locations, conditions, and precautions may be omitted. This is not an official or complete translation. Check the original JMA bulletin before making safety decisions.</p>
    </aside>`;
}

function buildVolcanoOriginalSourceLink(sourceUrl) {
  if (!sourceUrl) return "";
  return `<a class="volcano-xml-source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(localizeText("気象庁発表原文を確認"))}</a>`;
}

function extractVolcanoRestriction(statusText, fallback) {
  const match = String(statusText ?? "").match(
    /^(?:噴火警戒)?レベル\s*[1-5]\s*[（(]([^）)]+)[）)]/u
  );
  return match?.[1] ?? fallback ?? statusText ?? "警戒状況未確認";
}

function formatVolcanoParagraphs(value, englishFallback = "") {
  if (getCurrentLanguage() === "en") {
    const paragraphs = String(value ?? "")
      .split(/\n{2,}/u)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => localizeVolcanoText(paragraph, englishFallback))
      .filter((paragraph, index, values) =>
        Boolean(paragraph) && values.indexOf(paragraph) === index
      );
    return (paragraphs.length ? paragraphs : [englishFallback])
      .filter(Boolean)
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join("");
  }
  return String(value ?? "")
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(formatVolcanoParagraph)
    .join("");
}

function formatVolcanoParagraph(paragraph) {
  const countTable = parseVolcanoSeismicCountTable(paragraph);
  if (!countTable) return `<p>${escapeHtml(paragraph)}</p>`;
  const before = countTable.before.length
    ? `<p>${escapeHtml(countTable.before.join("\n"))}</p>`
    : "";
  const after = countTable.after.length
    ? `<p>${escapeHtml(countTable.after.join("\n"))}</p>`
    : "";
  const rows = countTable.rows.map((row) => `
    <tr>
      <th scope="row">${escapeHtml(row.period)}</th>
      <td>${escapeHtml(row.earthquakeCount)}回</td>
      <td>${escapeHtml(row.explosionCount)}回</td>
    </tr>`).join("");
  return `${before}
    <div class="volcano-seismic-table-wrap">
      <table class="volcano-seismic-table">
        <caption>火山性地震・爆発の回数</caption>
        <thead>
          <tr>
            <th scope="col">期間</th>
            <th scope="col">火山性地震</th>
            <th scope="col">爆発</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${after}`;
}

function buildVolcanoTargetAreaGroup(group) {
  return `
    <div class="volcano-target-group">
      <strong>${escapeHtml(localizeVolcanoText(group.kindName, localizeText("対象地域")))}</strong>
      <ul>${(group.areas ?? []).map((area) => `<li>${escapeHtml(area.name ? localizeText(area.name) : localizeText("対象地域不明"))}</li>`).join("")}</ul>
    </div>`;
}

function buildVolcanoHistoryItem(report, selectedBulletinId = "") {
  const summary = report.volcanoHeadline || report.headline || report.activity || report.prevention || "発表内容は気象庁の原文で確認してください。";
  const reportId = String(report.id ?? "");
  const selectedClass = reportId === selectedBulletinId ? " is-selected" : "";
  const title = localizeVolcanoText(
    formatVolcanoBulletinTitle(report.title ?? report.kindName ?? report.infoKind ?? "火山情報"),
    getVolcanoBulletinFallbackTitle(report)
  );
  const displaySummary = localizeVolcanoText(
    summary,
    "Open this bulletin for the latest volcanic activity and safety information."
  );
  return `
    <button type="button" class="volcano-history-item${selectedClass}" data-volcano-bulletin-id="${escapeHtml(reportId)}"${reportId ? "" : " disabled"}>
      <span><strong>${escapeHtml(title)}</strong><time>${escapeHtml(report.reportTime ?? localizeText("発表時刻不明"))}</time><small>${escapeHtml(displaySummary)}</small></span>
      <b aria-hidden="true">›</b>
    </button>`;
}

function getVolcanoBulletinFallbackTitle(report) {
  const source = [
    report?.title,
    report?.kindName,
    report?.infoKind,
    report?.bulletinCode
  ].filter(Boolean).join(" ");
  if (/降灰/u.test(source) || /VFVO5[3-6]/u.test(source)) return "Ashfall forecast";
  if (/解説/u.test(source) || /VFSV/u.test(source)) return "Volcano activity commentary";
  if (/観測報/u.test(source) || /VFVO52/u.test(source)) return "Volcanic observation report";
  if (/噴火速報/u.test(source) || /VFVO50/u.test(source)) return "Eruption bulletin";
  if (/警報|予報/u.test(source) || /VFVO51/u.test(source)) return "Volcanic warning or forecast";
  return localizeText("火山情報");
}

function formatVolcanoBulletinTitle(value) {
  const compact = String(value ?? "火山情報")
    .replace(/^火山名[\s\u3000]*/u, "")
    .replace(/(?:令和|平成|昭和)[０-９\d]+年[０-９\d]+月[０-９\d]+日[０-９\d]+時[０-９\d]+分\s*$/u, "")
    .trim();
  const numbered = compact.match(/^(?<kind>.+?)[（(][^()（）]*?第(?<number>[０-９\d]+)号[）)]$/u);
  if (numbered?.groups) return `${numbered.groups.kind}（第${numbered.groups.number}号）`;
  return compact || "火山情報";
}

function buildEarthquakeMapLayerControls(data) {
  const layers = [
    ...(data.selectedEarthquake?.estimatedIntensity
      ? [["estimatedIntensity", "推計震度", data.estimatedIntensityVisible !== false]]
      : []),
    ["activeFault", "主要活断層", data.activeFaultVisible !== false],
    ["plateBoundary", "プレート境界", data.plateBoundaryVisible !== false],
    ["plateDepthContours", "プレート等深線", data.plateDepthContoursVisible !== false]
  ];
  return `
    <section class="earthquake-map-layer-controls${layers.length > 3 ? " has-estimated-intensity" : ""}" aria-label="地震地図の表示項目">
      ${layers.map(([id, label, visible]) => `
        <button
          type="button"
          class="earthquake-map-layer-button${visible ? " active" : ""}"
          data-earthquake-map-layer="${escapeHtml(id)}"
          data-earthquake-layer-visible="${visible ? "off" : "on"}"
          aria-pressed="${visible ? "true" : "false"}"
        >
          <span>${escapeHtml(label)}</span>
          <strong>${visible ? "ON" : "OFF"}</strong>
        </button>
      `).join("")}
    </section>
  `;
}

function buildEarthquakeViewToggle(activeView) {
  return `
    <div class="earthquake-view-toggle mobile-dock-action-row mobile-dock-mode-switch mobile-dock-segmented" role="tablist" aria-label="地震情報の表示">
      <button type="button" role="tab" data-earthquake-view="recent" aria-selected="${activeView === "recent"}" class="mobile-dock-action${activeView === "recent" ? " active" : ""}">最近の地震</button>
      <button type="button" role="tab" data-earthquake-view="distribution" aria-selected="${activeView === "distribution"}" class="mobile-dock-action${activeView === "distribution" ? " active" : ""}">震央分布</button>
    </div>
  `;
}

function buildEarthquakeDepthLegend() {
  const gradientStops = HYPOCENTER_DEPTH_STOPS
    .map((stop) => `${stop.color} ${getHypocenterDepthStopPercentage(stop.depthKm)}%`)
    .join(", ");
  const labels = HYPOCENTER_DEPTH_STOPS.map((stop, index) => {
    const isFirst = index === 0;
    const isLast = index === HYPOCENTER_DEPTH_STOPS.length - 1;
    const edgeClass = isFirst ? " is-start" : isLast ? " is-end" : "";
    const label = isLast ? `${stop.depthKm}km` : String(stop.depthKm);
    return `<span class="earthquake-depth-gradient-label${edgeClass}" style="left:${getHypocenterDepthStopPercentage(stop.depthKm)}%">${label}</span>`;
  }).join("");

  return `
    <div class="earthquake-depth-legend" aria-label="深さの色分け">
      <div class="earthquake-depth-legend-title"><span>震源の深さ（km）</span><span>浅い → 深い</span></div>
      <div class="earthquake-depth-gradient" style="background:linear-gradient(90deg, ${escapeHtml(gradientStops)})" aria-hidden="true"></div>
      <div class="earthquake-depth-gradient-labels">${labels}</div>
    </div>
  `;
}

function buildEarthquakeDistributionMarkup(data) {
  const filters = data.distributionFilters ?? { dayOffset: 0, minMagnitude: "0", maxDepth: "all" };
  const rangeEnabled = filters.rangeEnabled === true;
  const hasArea = Array.isArray(filters.areaPolygon) && filters.areaPolygon.length >= 3;
  const areaDrawing = data.distributionAreaDrawing === true;
  const snapshot = data.distribution;
  const status = data.distributionStatus ?? "idle";
  const count = snapshot?.items?.length ?? 0;
  const availableDates = Array.isArray(snapshot?.availableDates)
    ? snapshot.availableDates.slice(0, HYPOCENTER_DISTRIBUTION_DAY_COUNT)
    : [];
  const maximumOffset = Math.max(0, availableDates.length - 1);
  const dayOffset = Math.min(maximumOffset, Math.max(0, Number(filters.dayOffset ?? snapshot?.dayOffset ?? 0)));
  const selectedDate = availableDates[dayOffset] ?? snapshot?.selectedSourceDate ?? "";
  const requestedRangeStartDate = filters.startDate || snapshot?.rangeStartDate || availableDates[Math.min(6, availableDates.length - 1)] || selectedDate;
  const requestedRangeEndDate = filters.endDate || snapshot?.rangeEndDate || availableDates[0] || selectedDate;
  const rangeStartDate = requestedRangeStartDate <= requestedRangeEndDate
    ? requestedRangeStartDate
    : requestedRangeEndDate;
  const rangeEndDate = requestedRangeStartDate <= requestedRangeEndDate
    ? requestedRangeEndDate
    : requestedRangeStartDate;
  const rangeExceeded = rangeEnabled
    && !isHypocenterDistributionRangeWithinLimit(rangeStartDate, rangeEndDate);
  const rangeLoading = rangeEnabled && (status === "loading" || status === "refreshing");
  const isPendingDate = snapshot && Number(snapshot.dayOffset) !== dayOffset;
  const displayedCount = isPendingDate || rangeLoading
    ? "取得中"
    : `${count.toLocaleString("ja-JP")}件`;
  const sourceType = snapshot?.selectedSource === "jma-xml"
    ? "jma-xml"
    : snapshot?.rangeMode
      ? "jma-combined"
      : "jma-daily";
  const resultMeta = status === "error"
    ? "更新を確認できません"
    : `${sourceType === "jma-xml" ? "有感地震・XML" : sourceType === "jma-combined" ? `指定期間${snapshot?.rangeDayCount ?? 0}日` : "暫定値"}・${hasArea ? "囲み範囲" : "全域"}`;
  const syncStatusMarkup = buildDistributionSyncStatus(snapshot);
  const statusMarkup = status === "loading"
    ? `<div class="earthquake-empty">${rangeEnabled ? "指定期間の震央分布を取得中です。" : "気象庁の震央分布を取得中です。"}</div>`
    : status === "error" && !snapshot
      ? `<div class="earthquake-empty">${escapeHtml(data.distributionError ?? "震央分布を取得できませんでした")}<button type="button" class="earthquake-distribution-retry" data-earthquake-distribution-retry>再試行</button></div>`
      : `<div class="earthquake-distribution-result">
          <div class="earthquake-distribution-result-date">
            <span>${rangeEnabled ? "表示期間" : "表示対象日"}</span>
            <strong>${escapeHtml(rangeEnabled
              ? `${formatDistributionFullDate(rangeStartDate)}〜${formatDistributionFullDate(rangeEndDate)}`
              : selectedDate ? formatDistributionFullDate(selectedDate) : "取得日不明")}</strong>
          </div>
          <div class="earthquake-distribution-result-count">
            <strong>${escapeHtml(displayedCount)}</strong>
            <span>${escapeHtml(rangeLoading
              ? "指定期間を検索しています"
              : isPendingDate || status === "refreshing"
                ? "日付を切り替えています"
                : resultMeta)}</span>
          </div>
        </div>`;
  return `
    <section class="earthquake-distribution-panel" aria-label="震央分布の条件">
      <div class="earthquake-distribution-control-card earthquake-distribution-period-card">
        <div class="earthquake-distribution-section-head">
          <strong>表示期間</strong>
          <span>${rangeEnabled
            ? rangeExceeded
              ? `${HYPOCENTER_DISTRIBUTION_MAX_RANGE_DAYS}日を超えています`
              : `最大${HYPOCENTER_DISTRIBUTION_MAX_RANGE_DAYS}日`
            : "1日ごとに確認"}</span>
        </div>
        <div class="earthquake-distribution-range-mode mobile-dock-action-row mobile-dock-mode-switch mobile-dock-segmented" role="group" aria-label="震央分布の期間">
          <button type="button" class="mobile-dock-action${rangeEnabled ? "" : " active"}" data-earthquake-distribution-range-mode="day" aria-pressed="${rangeEnabled ? "false" : "true"}">1日</button>
          <button type="button" class="mobile-dock-action${rangeEnabled ? " active" : ""}" data-earthquake-distribution-range-mode="range" aria-pressed="${rangeEnabled ? "true" : "false"}">期間指定</button>
        </div>
        ${rangeEnabled
          ? buildDistributionRangeControls(
            rangeStartDate,
            rangeEndDate,
            hasArea,
            areaDrawing,
            availableDates,
            rangeExceeded,
            rangeLoading
          )
          : buildDistributionDateButton(selectedDate, false, maximumOffset === 0, dayOffset, maximumOffset)}
      </div>
      <div class="earthquake-distribution-control-card">
        <div class="earthquake-distribution-section-head">
          <strong>絞り込み</strong>
          <span>規模・深さ</span>
        </div>
        <div class="earthquake-distribution-filters">
          ${buildDistributionSelect("minMagnitude", "規模", filters.minMagnitude, HYPOCENTER_DISTRIBUTION_MAGNITUDE_OPTIONS)}
          ${buildDistributionSelect("maxDepth", "深さ", filters.maxDepth, HYPOCENTER_DISTRIBUTION_DEPTH_OPTIONS)}
        </div>
      </div>
      <div class="earthquake-distribution-control-card earthquake-distribution-presentation-card">
        ${buildHypocenterPresentationToggle(data.distribution3DEnabled === true)}
      </div>
      ${statusMarkup}
      ${buildEarthquakeDepthLegend()}
      ${buildEarthquakeDistributionTrend(snapshot)}
      ${syncStatusMarkup}
      ${buildEarthquakeDistributionSourceNote(snapshot)}
    </section>
  `;
}

function buildDistributionRangeControls(
  startDate,
  endDate,
  hasArea,
  areaDrawing,
  availableDates = [],
  rangeExceeded = false,
  rangeLoading = false
) {
  const presets = [7, 15, 30].map((days) => {
    const endIndex = Math.max(0, availableDates.indexOf(endDate));
    const startIndex = Math.min(availableDates.length - 1, endIndex + days - 1);
    const presetStartDate = availableDates[startIndex] ?? startDate;
    const active = startDate === presetStartDate;
    return `<button type="button" class="${active ? "active" : ""}" data-earthquake-distribution-range-preset="${days}" data-range-start-date="${escapeHtml(presetStartDate)}" data-range-end-date="${escapeHtml(endDate)}" aria-pressed="${active ? "true" : "false"}" ${rangeLoading ? "disabled" : ""}>${days}日</button>`;
  }).join("");
  return `
    <div class="earthquake-distribution-range-controls" data-range-loading="${rangeLoading ? "true" : "false"}">
      <div class="earthquake-distribution-range-presets" role="group" aria-label="期間のプリセット">${presets}</div>
      <label><span>開始日</span><input type="date" data-earthquake-distribution-range-date="startDate" value="${escapeHtml(startDate)}" aria-invalid="${rangeExceeded ? "true" : "false"}" ${rangeLoading ? "disabled" : ""}></label>
      <label><span>終了日</span><input type="date" data-earthquake-distribution-range-date="endDate" value="${escapeHtml(endDate)}" aria-invalid="${rangeExceeded ? "true" : "false"}" ${rangeLoading ? "disabled" : ""}></label>
      <button
        type="button"
        class="earthquake-distribution-range-search"
        data-earthquake-distribution-range-search
        ${rangeExceeded || rangeLoading ? "disabled" : ""}
        aria-busy="${rangeLoading ? "true" : "false"}"
      >${rangeLoading ? "取得中…" : "この期間で検索"}</button>
      <p
        class="earthquake-distribution-range-error"
        data-earthquake-distribution-range-error
        role="alert"
        ${rangeExceeded ? "" : "hidden"}
      >${escapeHtml(HYPOCENTER_DISTRIBUTION_RANGE_TOO_LONG_MESSAGE)}</p>
      <div class="earthquake-distribution-area-actions">
        <button
          type="button"
          class="earthquake-distribution-area-search${areaDrawing ? " is-drawing" : ""}"
          data-earthquake-distribution-area-search
          aria-pressed="${areaDrawing ? "true" : "false"}"
        >${areaDrawing ? "範囲選択を中止" : hasArea ? "囲み直す" : "囲って検索"}</button>
        ${hasArea ? '<button type="button" class="earthquake-distribution-area-clear" data-earthquake-distribution-area-clear>範囲解除</button>' : ""}
      </div>
      <p>${hasArea ? "地図上の囲み範囲だけを表示しています。" : "囲って検索すると、地図上で指定した範囲だけに絞れます。"}</p>
    </div>
  `;
}

function validateDistributionRangeDraft(controls) {
  const startInput = controls?.querySelector('[data-earthquake-distribution-range-date="startDate"]');
  const endInput = controls?.querySelector('[data-earthquake-distribution-range-date="endDate"]');
  const searchButton = controls?.querySelector("[data-earthquake-distribution-range-search]");
  const error = controls?.querySelector("[data-earthquake-distribution-range-error]");
  const startDate = startInput instanceof HTMLInputElement ? startInput.value : "";
  const endDate = endInput instanceof HTMLInputElement ? endInput.value : "";
  const complete = Boolean(startDate && endDate);
  const withinLimit = complete && isHypocenterDistributionRangeWithinLimit(startDate, endDate);
  const loading = controls?.dataset.rangeLoading === "true";
  const valid = withinLimit && !loading;
  const invalid = complete && !withinLimit;
  startInput?.setAttribute("aria-invalid", invalid ? "true" : "false");
  endInput?.setAttribute("aria-invalid", invalid ? "true" : "false");
  if (searchButton instanceof HTMLButtonElement) searchButton.disabled = !valid;
  if (error instanceof HTMLElement) error.hidden = !invalid;
  return { valid, startDate, endDate };
}

function buildEarthquakeDistributionSourceNote(snapshot) {
  const usesXml = snapshot?.selectedSource === "jma-xml";
  const url = usesXml
    ? "https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml"
    : "https://www.data.jma.go.jp/eqev/data/daily_map/index.html";
  const label = usesXml ? "気象庁 防災情報XML" : "気象庁「日々の震源リスト」";
  const qualification = usesXml
    ? "当日・前日は防災情報XMLで発表された有感地震のみを表示しています。同一発表座標の地震は件数付きで重ねて表示します。"
    : "2日前以前の震源要素は暫定値で、後日変更される場合があります。";
  return `<p class="earthquake-distribution-note">出典：<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>。${qualification}</p>`;
}

function buildDistributionSyncStatus(snapshot) {
  if (!snapshot) return "";
  const statuses = [
    ["取得失敗", Number(snapshot.failedSourceDateCount ?? snapshot.failedDates ?? 0)],
    ["未保存", Number(snapshot.missingStoredDateCount ?? 0)],
    ["気象庁公開待ち", Number(snapshot.pendingPublicationDateCount ?? 0)]
  ].filter(([, count]) => Number.isFinite(count) && count > 0);
  if (!statuses.length) return "";
  return `<p class="earthquake-distribution-note">同期状況：${statuses
    .map(([label, count]) => `${escapeHtml(label)} ${escapeHtml(String(count))}日`)
    .join("・")}</p>`;
}

function buildEarthquakeDistributionTrend(snapshot) {
  if (!snapshot) return "";
  return `
    <section class="earthquake-distribution-analytics" aria-label="震央分布の集計グラフ">
      ${buildEarthquakeDailyTrend(snapshot.dailyCounts)}
    </section>
  `;
}

function buildEarthquakeDailyTrend(dailyCounts) {
  const points = (Array.isArray(dailyCounts) ? dailyCounts : [])
    .filter((item) => item?.source !== "jma-xml")
    .map((item) => ({ sourceDate: String(item?.sourceDate ?? ""), count: Math.max(0, Number(item?.count) || 0) }))
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/u.test(item.sourceDate))
    .sort((a, b) => a.sourceDate.localeCompare(b.sourceDate));
  if (!points.length) {
    return '<div class="earthquake-distribution-chart-empty">日別件数はデータ更新後に表示されます。</div>';
  }
  const maximum = getChartAxisMaximum(Math.max(0, ...points.map((point) => point.count)));
  const width = 320;
  const height = 142;
  const left = 34;
  const right = 8;
  const top = 10;
  const bottom = 28;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const coordinates = points.map((point, index) => ({
    ...point,
    x: left + (points.length === 1 ? plotWidth / 2 : plotWidth * index / (points.length - 1)),
    y: top + plotHeight * (1 - point.count / maximum)
  }));
  const grid = [0, 0.5, 1].map((ratio) => {
    const y = top + plotHeight * (1 - ratio);
    const value = Math.round(maximum * ratio);
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="earthquake-chart-grid"></line><text x="${left - 6}" y="${y + 3}" text-anchor="end" class="earthquake-chart-axis-text">${value}</text>`;
  }).join("");
  const polyline = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const circles = coordinates.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="2.5" class="earthquake-chart-point"><title>${escapeHtml(formatDistributionFullDate(point.sourceDate))} ${point.count}件</title></circle>`).join("");
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const labels = labelIndexes.map((index) => {
    const point = coordinates[index];
    const anchor = index === 0 ? "start" : index === points.length - 1 ? "end" : "middle";
    return `<text x="${point.x}" y="${height - 8}" text-anchor="${anchor}" class="earthquake-chart-axis-text">${escapeHtml(formatDistributionDate(point.sourceDate))}</text>`;
  }).join("");
  return `
    <div class="earthquake-distribution-chart-head"><strong>日別の総地震回数</strong><span>古い日 → 最新</span></div>
    <svg class="earthquake-distribution-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="収録${HYPOCENTER_DISTRIBUTION_DAY_COUNT}日間の日別総地震回数">${grid}<polyline points="${polyline}" class="earthquake-chart-line"></polyline>${circles}${labels}</svg>
    <p class="earthquake-distribution-chart-caption">2日前以前の「日々の震源リスト」による全規模・全深さの日別収録件数。当日・前日の有感地震XMLは含みません。</p>
  `;
}

function getChartAxisMaximum(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function buildDistributionSelect(key, label, selectedValue, choices) {
  return `
    <label><span>${escapeHtml(label)}</span><select data-earthquake-distribution-filter="${escapeHtml(key)}">
      ${choices.map(([value, text]) => `<option value="${escapeHtml(value)}"${String(value) === String(selectedValue) ? " selected" : ""}>${escapeHtml(text)}</option>`).join("")}
    </select></label>
  `;
}

function formatDistributionDate(value) {
  const match = String(value ?? "").match(/^\d{4}-(\d{2})-(\d{2})$/u);
  return match ? `${Number(match[1])}/${Number(match[2])}` : String(value ?? "日付不明");
}

function formatDistributionFullDate(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  return match
    ? `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`
    : String(value ?? "日付不明");
}

function buildEarthquakeDistributionMobileContextMarkup(data) {
  const isEnglish = getCurrentLanguage() === "en";
  const snapshot = data.distribution;
  const filters = data.distributionFilters ?? {};
  const availableDates = Array.isArray(snapshot?.availableDates)
    ? snapshot.availableDates.slice(0, HYPOCENTER_DISTRIBUTION_DAY_COUNT)
    : [];
  const maximumOffset = Math.max(0, availableDates.length - 1);
  const dayOffset = Math.min(maximumOffset, Math.max(0, Number(filters.dayOffset ?? snapshot?.dayOffset ?? 0)));
  const selectedDate = availableDates[dayOffset] ?? snapshot?.selectedSourceDate ?? "";
  const rangeEnabled = filters.rangeEnabled === true;
  const rangeStartDate = filters.startDate || snapshot?.rangeStartDate || "";
  const rangeEndDate = filters.endDate || snapshot?.rangeEndDate || "";
  const count = snapshot?.items?.length ?? 0;
  const isPendingDate = snapshot && Number(snapshot.dayOffset) !== dayOffset;
  const earthquakes = data.earthquakes ?? [];
  const earthquake = data.selectedEarthquake ?? earthquakes[0];
  const periodLabel = rangeEnabled
    ? `${formatDistributionDate(rangeStartDate)}–${formatDistributionDate(rangeEndDate)}`
    : selectedDate ? formatDistributionDate(selectedDate) : isEnglish ? "Waiting" : "取得待ち";
  const distributionKicker = isEnglish
    ? `Epicenters · ${periodLabel} · ${rangeEnabled ? "Selected" : "Provisional"}`
    : `震央分布・${periodLabel}・${rangeEnabled ? "指定範囲" : "暫定値"}`;
  const primaryMarkup = `
    ${buildEarthquakeMobileViewSwitch("distribution")}
    <div class="mobile-dock-earthquake-distribution-summary">
      <div class="mobile-dock-earthquake-distribution-head">
        <span class="mobile-dock-kicker">${escapeHtml(distributionKicker)}</span>
        ${buildHypocenterPresentationToggle(data.distribution3DEnabled === true, true)}
        <strong>${isPendingDate
          ? isEnglish ? "Loading" : "取得中"
          : isEnglish ? `${count.toLocaleString("en-US")} items` : `${count.toLocaleString("ja-JP")}件`}</strong>
      </div>
      ${rangeEnabled
        ? `<div class="mobile-dock-earthquake-distribution-range-hint">${isEnglish
          ? "Change the period or selected area in Details"
          : "詳細パネルで期間・囲み範囲を変更"}</div>`
        : buildDistributionDateButton(selectedDate, true, maximumOffset === 0, dayOffset, maximumOffset)}
    </div>
  `;
  return buildMobileEarthquakeSummaryCarousel({
    containerClass: "mobile-dock-content mobile-dock-earthquake-distribution mobile-dock-earthquake-carousel",
    primaryAriaLabel: isEnglish ? "Epicenter distribution summary" : "震央分布要約",
    primaryDotLabel: isEnglish ? "Epicenter distribution" : "地震・震央分布",
    primaryMarkup,
    earthquake,
    tsunami: data.tsunami,
    tsunamiStatus: data.tsunamiStatus,
    tideObservation: data.tideObservation
  });
}

function buildDistributionDateButton(selectedDate, compact = false, disabled = false, dayOffset = 0, maximumOffset = 0) {
  const isEnglish = getCurrentLanguage() === "en";
  const label = selectedDate
    ? isEnglish ? selectedDate.replaceAll("-", "/") : formatDistributionFullDate(selectedDate)
    : isEnglish ? "Select date" : "日付を選択";
  const previousLabel = isEnglish ? "Previous day's epicenter distribution" : "前日の震央分布";
  const nextLabel = isEnglish ? "Next day's epicenter distribution" : "翌日の震央分布";
  return `
    <div class="earthquake-distribution-date-navigation${compact ? " compact" : ""}">
      <button type="button" class="earthquake-distribution-date-step" data-earthquake-distribution-date-step="1" data-current-day-offset="${dayOffset}"${compact ? " data-mobile-dock-control" : ""}${dayOffset >= maximumOffset ? " disabled" : ""} aria-label="${previousLabel}">${isEnglish ? "Prev" : "前日"}</button>
      <label class="earthquake-distribution-date-control${compact ? " compact" : ""}">
      ${compact ? "" : `<span>${isEnglish ? "Date" : "日付"}</span>`}
      <button type="button" data-earthquake-distribution-date-open data-selected-date="${escapeHtml(selectedDate)}"${compact ? " data-mobile-dock-control" : ""}${disabled ? " disabled" : ""} aria-label="${isEnglish ? "Select the epicenter distribution date" : "震央分布の日付を選択"}">
        <span>${escapeHtml(label)}</span><span aria-hidden="true">⌄</span>
      </button>
      </label>
      <button type="button" class="earthquake-distribution-date-step" data-earthquake-distribution-date-step="-1" data-current-day-offset="${dayOffset}"${compact ? " data-mobile-dock-control" : ""}${dayOffset <= 0 ? " disabled" : ""} aria-label="${nextLabel}">${isEnglish ? "Next" : "翌日"}</button>
    </div>`;
}

function buildHypocenterPresentationToggle(is3D, compact = false) {
  return `
    <div class="hypocenter-presentation${compact ? " compact" : ""}"${compact ? " data-mobile-dock-control" : ""}>
      ${compact ? "" : `<span><strong>地下の立体表示</strong><small>震源・等深線の深さ方向を強調</small></span>`}
      <div class="hypocenter-presentation-switch mobile-dock-segmented" role="group" aria-label="震源とプレート等深線の立体表示">
        <button type="button" class="${is3D ? "" : "active"}" data-earthquake-distribution-presentation="flat" aria-pressed="${is3D ? "false" : "true"}">平面</button>
        <button type="button" class="${is3D ? "active" : ""}" data-earthquake-distribution-presentation="3d" aria-pressed="${is3D ? "true" : "false"}">立体</button>
      </div>
    </div>
  `;
}

function buildEarthquakeMobileViewSwitch(activeView) {
  return `
    <div class="mobile-dock-action-row mobile-dock-mode-switch mobile-dock-segmented mobile-dock-earthquake-view-switch" role="tablist" aria-label="地震情報の表示">
      <button type="button" role="tab" class="mobile-dock-action${activeView === "recent" ? " active" : ""}" data-mobile-dock-control data-earthquake-view="recent" aria-selected="${activeView === "recent"}">最近の地震</button>
      <button type="button" role="tab" class="mobile-dock-action${activeView === "distribution" ? " active" : ""}" data-mobile-dock-control data-earthquake-view="distribution" aria-selected="${activeView === "distribution"}">震央分布</button>
    </div>
  `;
}

function renderExpandedEarthquakeSummary({
  earthquake,
  intensityColor,
  intensityTextClass,
  magnitude,
  depthText,
  tsunamiState
}) {
  const unknownText = getEarthquakeUnknownText(earthquake);
  const tsunamiMetricText = getEarthquakeTsunamiMetricText(tsunamiState);
  const magnitudeMetricText = magnitude === unknownText
    ? unknownText
    : String(magnitude).replace(/^M\s*/u, "M") || unknownText;
  const intensityMetricText = formatEarthquakeUnknownMetric(
    earthquake.maxIntensityShort ?? earthquake.maxIntensityLabel,
    unknownText
  );
  const depthMetricText = formatEarthquakeUnknownMetric(depthText, unknownText);
  const intensityUnknownClass = ["不明", "調査中"].includes(intensityMetricText)
    ? " is-unknown-value"
    : "";
  return `
    <span class="earthquake-card-intensity earthquake-card-intensity-detail">
      <strong class="${intensityTextClass}" style="--earthquake-item-intensity-bg: ${escapeHtml(intensityColor)};">
        <small>最大震度</small>
        <span class="${intensityUnknownClass.trim()}">${escapeHtml(intensityMetricText)}</span>
      </strong>
    </span>
    <span class="earthquake-detail-heading">
      <time>${escapeHtml(formatEarthquakeEventTime(earthquake.eventTime ?? earthquake.reportTime))}発生</time>
      <span class="earthquake-detail-epicenter-row">
        <small>震源地</small>
        <strong>${escapeHtml(formatEarthquakeHypocenterText(earthquake))}</strong>
      </span>
    </span>
    <span class="earthquake-detail-metrics">
      <strong>${escapeHtml(magnitudeMetricText)}</strong>
      <strong>${escapeHtml(depthMetricText)}</strong>
      <strong class="earthquake-detail-tsunami level-${escapeHtml(tsunamiState.level)}">${escapeHtml(tsunamiMetricText)}</strong>
    </span>
  `;
}

function getEarthquakeTsunamiMetricText(state) {
  if (state?.level === "none") {
    return state?.label === "解除" ? "解除" : "津波の心配なし";
  }
  if (state?.level === "unknown" || state?.level === "unavailable") {
    return state?.label === "調査中" ? "調査中" : "不明";
  }
  if (state?.level === "forecast") return "若干の海面変動";
  return state?.label || "不明";
}

function formatEarthquakeUnknownMetric(value, unknownText = "不明") {
  const text = String(value ?? "").trim();
  return !text || /^(?:--|-|不明|未確認|震度不明)$/u.test(text) ? unknownText : text;
}

function getEarthquakeTsunamiState(earthquake, tsunami, status) {
  const unknownText = getEarthquakeUnknownText(earthquake, "津波情報未確認");
  if (status === "unavailable") {
    return {
      level: "unavailable",
      label: unknownText === "調査中" ? unknownText : "津波情報を確認できません",
      tsunami: null
    };
  }
  const matchingTsunami = earthquake?.tsunamiReport ?? tsunami;
  const eventId = String(earthquake?.eventId ?? "").trim();
  const tsunamiEventId = String(matchingTsunami?.eventId ?? "").trim();
  if (matchingTsunami && eventId && tsunamiEventId && eventId === tsunamiEventId) {
    const isCancellation = matchingTsunami.highestLevel === "none"
      && matchingTsunami.isCancellation === true;
    return {
      level: matchingTsunami.highestLevel,
      label: isCancellation ? "解除" : getTsunamiLevelLabel(matchingTsunami.highestLevel),
      tsunami: matchingTsunami
    };
  }
  const tsunamiComment = String(earthquake?.tsunamiComment ?? earthquake?.headline ?? "");
  const activeLevel = eventId && tsunamiEventId && eventId === tsunamiEventId
    ? matchingTsunami?.highestLevel
    : "";
  const commentState = classifyEarthquakeTsunamiComment(
    tsunamiComment,
    activeLevel,
    tsunami?.highestLevel === "none" && tsunami?.isCancellation === true
  );
  if (commentState) {
    return { ...commentState, tsunami: null };
  }
  return { level: "unknown", label: unknownText, tsunami: null };
}

function getCurrentTsunamiState(earthquake, tsunami, status) {
  if (status === "available" && tsunami) {
    return {
      level: tsunami.highestLevel,
      label: getTsunamiLevelLabel(tsunami.highestLevel),
      tsunami
    };
  }
  return getEarthquakeTsunamiState(earthquake, tsunami, status);
}

function buildTsunamiDedicatedDetailMarkup(earthquake, tsunami, status) {
  const state = getCurrentTsunamiState(earthquake, tsunami, status);
  const report = state.tsunami;
  const areas = (report?.areas ?? []).filter((area) => area.level !== "none");
  const coastalObservations = report?.observations ?? [];
  const offshoreObservations = report?.offshoreObservations ?? [];
  const headline = report?.headline || (
    state.level === "none"
      ? "現在発表中の津波警報・注意報はありません。"
      : state.level === "unavailable"
        ? "津波情報を取得できませんでした。"
        : "気象庁の津波情報を確認しています。"
  );

  return `
    <section class="tsunami-dedicated-panel level-${escapeHtml(state.level)}" aria-label="津波情報">
      ${report?.isTestScenario ? `
        <div class="tsunami-test-notice" role="status">
          <strong>訓練・テスト表示</strong>
          <span>実際の津波情報ではありません</span>
        </div>
      ` : ""}
      <p class="tsunami-dedicated-headline">${escapeHtml(headline)}</p>
      ${areas.length ? `
        <section class="tsunami-dedicated-section" aria-labelledby="tsunami-area-heading">
          <h3 id="tsunami-area-heading">警報・注意報の発表区域</h3>
          <div class="tsunami-area-list">
            ${areas.map((area) => `
              <article class="tsunami-area-row level-${escapeHtml(area.level)}">
                <span class="tsunami-level-badge">${escapeHtml(getTsunamiLevelLabel(area.level))}</span>
                <div><strong>${escapeHtml(area.name)}</strong><span>${escapeHtml(buildTsunamiAreaDetail(area))}</span></div>
              </article>
            `).join("")}
          </div>
        </section>
      ` : ""}
      ${buildTsunamiDedicatedObservationSection(
        "沿岸の津波観測",
        coastalObservations,
        "coastal"
      )}
      ${buildTsunamiDedicatedObservationSection(
        "沖合の津波観測",
        offshoreObservations,
        "offshore"
      )}
      ${renderTsunamiOfficialLink()}
    </section>
  `;
}

function buildTsunamiDedicatedObservationSection(title, observations, type) {
  if (!observations.length) return "";
  return `
    <section class="tsunami-dedicated-section" aria-labelledby="tsunami-observation-${escapeHtml(type)}">
      <h3 id="tsunami-observation-${escapeHtml(type)}">${escapeHtml(title)}</h3>
      <div class="tsunami-dedicated-observation-list">
        ${observations.slice(0, 50).map((observation) => `
          <article>
            <span class="tsunami-observation-station">
              <strong>${escapeHtml(observation.stationName)}</strong>
              <small>${escapeHtml([observation.agency, observation.sensor].filter(Boolean).join(" / "))}</small>
            </span>
            <span>
              <strong>${escapeHtml(
                observation.maxHeightCondition || observation.maxHeight || "高さ未発表"
              )}</strong>
              ${observation.maxHeightTime ? `<small>${escapeHtml(observation.maxHeightTime)}</small>` : ""}
            </span>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderEarthquakeTsunamiDetails(state) {
  const tsunami = state?.tsunami;
  if (!tsunami) return "";
  const currentAreas = (tsunami.areas ?? []).filter((area) => area.level !== "none");
  const observations = [...(tsunami.observations ?? []), ...(tsunami.offshoreObservations ?? [])];
  return `
    <section class="earthquake-tsunami-details level-${escapeHtml(tsunami.highestLevel)}" aria-label="津波情報">
      <div class="tsunami-information-heading">
        <div><small>気象庁発表</small><strong>${escapeHtml(getTsunamiLevelLabel(tsunami.highestLevel))}</strong></div>
        <time>${escapeHtml(tsunami.reportTime || "時刻未取得")}</time>
      </div>
      ${tsunami.headline ? `<p>${escapeHtml(tsunami.headline)}</p>` : ""}
      ${currentAreas.length ? `
        <div class="tsunami-area-list">
          ${currentAreas.map((area) => `
            <article class="tsunami-area-row level-${escapeHtml(area.level)}">
              <span class="tsunami-level-badge">${escapeHtml(getTsunamiLevelLabel(area.level))}</span>
              <div><strong>${escapeHtml(area.name)}</strong><span>${escapeHtml(buildTsunamiAreaDetail(area))}</span></div>
            </article>
          `).join("")}
        </div>
      ` : ""}
      ${observations.length ? `
        <details class="tsunami-observations">
          <summary>観測された津波 ${observations.length}地点</summary>
          <div>${observations.slice(0, 30).map((observation) => `
            <p>
              <span class="tsunami-observation-station">
                <strong>${escapeHtml(observation.stationName)}</strong>
                <small>${escapeHtml([
                  observation.offshore ? "沖合" : "沿岸",
                  observation.agency,
                  observation.sensor
                ].filter(Boolean).join(" / "))}</small>
              </span>
              <span>${escapeHtml(
                observation.maxHeightCondition || observation.maxHeight || "高さ未発表"
              )}${observation.maxHeightTime ? ` / ${escapeHtml(observation.maxHeightTime)}` : ""}</span>
            </p>
          `).join("")}</div>
        </details>
      ` : ""}
      ${renderTsunamiOfficialLink()}
    </section>
  `;
}

function buildTsunamiAreaDetail(area) {
  const arrival = area.arrivalCondition || (area.arrivalTime ? `到達予想 ${area.arrivalTime}` : "到達予想時刻なし");
  const height = area.heightCondition || (area.height ? `予想最大波 ${area.height}` : "高さ未発表");
  return `${arrival} / ${height}`;
}

function renderTsunamiOfficialLink() {
  return `<a class="tsunami-official-link" href="https://www.jma.go.jp/bosai/map.html#contents=tsunami" target="_blank" rel="noopener noreferrer">気象庁の津波情報を開く</a>`;
}

function renderEarthquakeObservations(observations, observationsId, { showShareButton = false } = {}) {
  const visibleObservations = getCurrentLanguage() === "en"
    ? groupEarthquakeObservationRowsByMunicipality(observations)
    : observations;
  const title = visibleObservations[0]?.kind === "city" ? "各地の震度（市区町村）" : "各地の震度";
  const body = visibleObservations.length
    ? `<div class="earthquake-observation-list">${visibleObservations.map((observation) => {
      const intensityColor = getEarthquakeIntensityColor(observation.intensity);
      const intensityTextClass = getEarthquakeIntensityTextClass(observation.intensity);
      return `
        <div class="earthquake-observation-row">
          <strong class="earthquake-observation-intensity ${intensityTextClass}" style="--earthquake-item-intensity-bg: ${escapeHtml(intensityColor)};" aria-label="${escapeHtml(observation.intensityLabel)}">${escapeHtml(observation.intensityShort)}</strong>
          <span class="earthquake-observation-prefecture">${escapeHtml(observation.prefecture || "--")}</span>
          <span class="earthquake-observation-name">${escapeHtml(observation.name)}</span>
        </div>
      `;
    }).join("")}</div>`
    : `<p class="earthquake-observation-empty">各地の震度情報はありません。</p>`;
  return `
    <section id="${observationsId}" class="earthquake-observations" aria-label="${escapeHtml(title)}">
      <div class="earthquake-observations-heading">
        <div class="earthquake-observations-title-row">
          <h2>${escapeHtml(title)}</h2>
          ${showShareButton ? `
            <button type="button" class="social-share-trigger earthquake-share-button" data-social-share="earthquake" aria-label="地震情報を画像で共有" title="地震情報を画像で共有">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0-11 4 4m-4-4L8 7M5 12v7h14v-7"/></svg>
            </button>
          ` : ""}
        </div>
        ${visibleObservations.length ? `<span>${visibleObservations.length}地点</span>` : ""}
      </div>
      ${body}
    </section>
  `;
}

function buildMobileTsunamiStatusMarkup(earthquake, tsunami, status) {
  const tsunamiState = getEarthquakeTsunamiState(earthquake, tsunami, status);
  const label = getEarthquakeTsunamiMetricText(tsunamiState);
  return `<span class="earthquake-tsunami-status level-${escapeHtml(tsunamiState.level)}">${escapeHtml(label)}</span>`;
}

function formatEarthquakeEventTime(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "--") return "--";
  return text.endsWith("頃") ? text : `${text}頃`;
}

function getTyphoonDetails(state) {
  if (state.status === "loading") {
    return buildEmptyTyphoonDetails();
  }
  if (state.status === "error") {
    return buildEmptyTyphoonDetails();
  }
  const details = state.data?.details ?? buildEmptyTyphoonDetails();
  return {
    ...details,
    size: normalizeSummaryValue(details.size),
    strength: normalizeSummaryValue(details.strength),
    pressure: normalizeSummaryValue(details.pressure),
    maxWind: normalizeSummaryValue(details.maxWind),
    maxGust: normalizeSummaryValue(details.maxGust),
    direction: normalizeSummaryValue(details.direction),
    speed: normalizeSummaryValue(details.speed),
    position: normalizeSummaryValue(details.position)
  };
}

function formatTyphoonMovement(direction, speed) {
  const normalizedDirection = normalizeSummaryValue(direction);
  const normalizedSpeed = normalizeSummaryValue(speed);
  const hasDirection = normalizedDirection !== "-";
  const hasSpeed = normalizedSpeed !== "-";
  if (hasDirection && hasSpeed) return `${normalizedDirection} ${normalizedSpeed}`;
  if (hasDirection) return normalizedDirection;
  if (hasSpeed) return normalizedSpeed;
  return "-";
}

function buildEmptyTyphoonDetails() {
  return {
    transitionStatus: null,
    size: "-",
    strength: "-",
    pressure: "-",
    maxWind: "-",
    maxGust: "-",
    direction: "-",
    speed: "-",
    position: "-"
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
