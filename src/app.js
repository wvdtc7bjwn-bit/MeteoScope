import { AMEDAS_METRICS, AUTO_REFRESH_INTERVAL_MS, AUTO_REFRESH_RESUME_THROTTLE_MS, EARTHQUAKE_REFRESH_INTERVAL_MS, KIKIKURU_LAYER_OPTIONS, TABS, WORLD_TYPHOON_DATA_REFRESH_INTERVAL_MS } from "./config.js";
import { createWeatherMap } from "./map/weatherMap.js";
import { setupTabs } from "./ui/tabs.js";
import { setupAmedasDailyChartToggle, setupAmedasPrecipitationPeriods, setupAmedasRankingToggle, setupAmedasSubTabs, setupEarthquakeMapLayerToggles, setupEarthquakeSelector, setupKikikuruLayerToggles, setupMobileDockSegmentedControls, setupMobileEarthquakeSummarySwipe, setupMobileWeatherTimelineTapControls, setupRadarControls, setupRadarOverlayToggle, setupTideObservationControls, setupTyphoonForecastModeControls, setupTyphoonSelector, setupWarningAreaSelection, setupWeatherChartControls, updateLeftPanel } from "./ui/leftPanel.js";
import { applyAmedasPrecipitationPeriod, DEFAULT_AMEDAS_PRECIPITATION_PERIOD, normalizeAmedasPrecipitationPeriod } from "./amedasPrecipitationPeriod.js";
import { setupLegendToggle } from "./ui/legendToggle.js";
import { setupWeatherDistributionToggle, syncWeatherDistributionToggle, toggleWeatherDistributionPicker } from "./ui/weatherDistributionToggle.js";
import { setupPanelToggle } from "./ui/panelToggle.js";
import { setupFeedbackModal } from "./ui/feedbackModal.js";
import { setupWeeklyWeatherModal } from "./ui/weeklyWeatherModal.js";
import { setupNumericWeatherChartModal } from "./ui/numericWeatherChartModal.js";
import { setupUpperAirModal } from "./ui/upperAirModal.js";
import { openDisasterQuizModal, setupDisasterQuizModal } from "./ui/disasterQuizModal.js";
import { setupOnboardingModal } from "./ui/onboardingModal.js";
import { setupLegalConsentModal } from "./ui/legalConsentModal.js";
import { openSettingsModal, refreshSettingsModalView, setupSettingsModal } from "./ui/settingsModal.js";
import { startClock } from "./ui/time.js";
import { fetchRadarTimes, findLatestRadarObservationIndex } from "./jma/radar.js";
import { selectTyphoonRadarFrame } from "./typhoonRadarOverlay.js";
import { fetchLightningTimes, findLatestLightningObservationIndex } from "./jma/lightning.js";
import { activateNearestWeatherDistributionFrame, activateWeatherDistributionFrame, fetchWeatherDistribution, getWeatherDistributionLabel, isWeatherDistributionMode } from "./jma/weatherDistribution.js";
import { fetchAmedasDailySeries, fetchAmedasLatestTime } from "./jma/amedas.js";
import { fetchWarningDetails, fetchWarningMap } from "./jma/warnings.js";
import { fetchTyphoonList } from "./jma/typhoon.js";
import {
  buildWorldTyphoonTimeline,
  fetchWorldTyphoonForecast,
  formatWorldTyphoonSystemLabel,
  getWorldTyphoonModel,
  selectWorldTyphoonForecastPositions,
  selectWorldTyphoonGenesisSystems,
  selectWorldTyphoonSystem
} from "./worldTyphoon.js";
import {
  EARTHQUAKE_HISTORY_INITIAL_VISIBLE_COUNT,
  EARTHQUAKE_HISTORY_LOAD_MORE_COUNT,
  EARTHQUAKE_XML_DETAIL_FETCH_INCREMENT,
  EARTHQUAKE_XML_INITIAL_DETAIL_FETCH_LIMIT,
  EARTHQUAKE_XML_MAX_DETAIL_FETCH_LIMIT,
  fetchEarthquakeXmlList
} from "./jma/earthquakeXml.js";
import { fetchTideObservationSeries, fetchTideStationCatalog } from "./jma/tideLevel.js";
import {
  consolidateVolcanoReports,
  fetchVolcanoLatestActivityReports,
  fetchVolcanoXmlList
} from "./jma/volcanoXml.js";
import { fetchKikikuruTiles } from "./jma/kikikuru.js";
import { fetchRiverFloodForecasts } from "./jma/riverFlood.js";
import {
  HYPOCENTER_DISTRIBUTION_MAX_DAY_OFFSET,
  normalizeHypocenterDistributionRange,
  fetchHypocenterDistribution
} from "./jma/hypocenterDistribution.js";
import { activateWeatherChartFrame, fetchWeatherChart, findLatestWeatherChartFrameIndex } from "./jma/weatherChart.js";
import { resolveCurrentLocationInfo, searchMunicipalities } from "./location/currentLocation.js";
import { addMyArea, getMyAreaLimit, loadMyAreas, removeMyArea } from "./location/myAreas.js";
import { buildLocationRadarTimeline, sampleRadarAtLocation } from "./location/radarTimeline.js";
import { sampleLightningAtLocation } from "./location/lightningStatus.js";
import { sampleCurrentKikikuruStatus } from "./location/kikikuruStatus.js";
import { buildMyAreaEarlyWarningSummaries, buildMyAreaWarningSummaries } from "./warningLocationInsights.js";
import { createAdminNoticePush } from "./push/adminNoticePush.js";
import { setupRemoteConfig } from "./remoteConfig.js";
import { setupTheme } from "./ui/theme.js";
import { getCurrentLanguage, setupLocale } from "./ui/locale.js";
import { activateEarlyAccess, deactivateEarlyAccess, fetchEarlyAccessActiveFaultSegments, validateEarlyAccess } from "./ui/earlyAccess.js";
import { CommunityReportClient } from "./domain/communityReportClient.js";
import { openCommunityReportModal, setupCommunityReportModal } from "./ui/communityReportModal.js";
import { setupWorldTyphoonTargetModal, updateWorldTyphoonTargetPicker } from "./ui/worldTyphoonTargetModal.js";
import { yieldToMainThread } from "./scheduling.js";
import { setupLongPressButton } from "./ui/longPressButton.js";
import { setupEarthquakeLongPressHint } from "./ui/earthquakeLongPressHint.js";
import { setupMapUtilityMenu } from "./ui/mapUtilityMenu.js";
import { openMeteoScopeLensModal, setupMeteoScopeLensModal } from "./ui/meteoScopeLensModal.js";
import { getSocialSharePayload } from "./socialShareState.js";
import { recordDiagnostic } from "./runtimeDiagnostics.js";

const loaders = {
  radar: fetchRadarTimes,
  amedas: fetchAmedasLatestTime,
  warnings: fetchWarningTabData,
  typhoon: fetchTyphoonList,
  earthquake: fetchEarthquakeTabData
};

const TAB_DATA_TTL_MS = {
  radar: 60 * 1000,
  amedas: 5 * 60 * 1000,
  warnings: 60 * 1000,
  typhoon: 10 * 60 * 1000,
  earthquake: 5 * 60 * 1000
};

let disasterMapModulePromise = null;
let disasterDashboardModulePromise = null;

function loadDisasterMapModule() {
  disasterMapModulePromise ??= import("./ui/disasterMapModal.js");
  return disasterMapModulePromise;
}

function loadDisasterDashboardModule() {
  disasterDashboardModulePromise ??= import("./ui/disasterDashboardModal.js");
  return disasterDashboardModulePromise;
}

function getStoredDisasterMapPdfInfo(...args) {
  return loadDisasterMapModule().then((module) => module.getStoredDisasterMapPdfInfo(...args));
}

function clearStoredDisasterMapPdf(...args) {
  return loadDisasterMapModule().then((module) => module.clearStoredDisasterMapPdf(...args));
}

function setupLazyDisasterMapModal() {
  const button = document.getElementById("disaster-map-button");
  if (!button || button.dataset.lazyDisasterMapReady === "true") return;
  button.dataset.lazyDisasterMapReady = "true";
  let initialized = false;
  let initializationPromise = null;
  const initialize = () => {
    initializationPromise ??= loadDisasterMapModule().then((module) => {
      module.setupDisasterMapModal();
      initialized = true;
    });
    return initializationPromise;
  };
  button.addEventListener("pointerenter", () => void initialize(), { once: true });
  button.addEventListener("focus", () => void initialize(), { once: true });
  button.addEventListener("click", async (event) => {
    if (initialized) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    button.setAttribute("aria-busy", "true");
    try {
      await initialize();
      button.click();
    } finally {
      button.removeAttribute("aria-busy");
    }
  }, { capture: true });
}

let earthquakeHistoryDetailFetchLimit = EARTHQUAKE_XML_INITIAL_DETAIL_FETCH_LIMIT;

async function fetchEarthquakeTabData({
  earthquakeDetailFetchLimit = earthquakeHistoryDetailFetchLimit
} = {}) {
  const [earthquakeData, tideResult] = await Promise.all([
    fetchEarthquakeXmlList({ earthquakeDetailFetchLimit }),
    fetchTideStationCatalog().catch((error) => {
      console.warn("[MeteoScope] tide station catalog unavailable", error);
      return { stations: [], unavailable: true };
    })
  ]);
  const data = {
    ...earthquakeData,
    tideStations: tideResult.stations ?? [],
    tideStationsUnavailable: tideResult.unavailable === true
  };
  if (!import.meta.env.DEV) return data;

  const { applyLocalTsunamiTestScenario } = await import("./dev/tsunamiTestScenario.js");
  return applyLocalTsunamiTestScenario(data);
}

const KIKIKURU_DATA_TTL_MS = 60 * 1000;
const WARNING_DETAILS_TTL_MS = 60 * 1000;
const EARLY_WARNING_REFRESH_INTERVAL_MS = 60 * 1000;
const RIVER_FLOOD_DATA_TTL_MS = 60 * 1000;
const WEATHER_CHART_DATA_TTL_MS = 10 * 60 * 1000;
const WEATHER_DISTRIBUTION_DATA_TTL_MS = 10 * 60 * 1000;
const LIGHTNING_REFRESH_INTERVAL_MS = 60 * 1000;
const LIGHTNING_DATA_TTL_MS = LIGHTNING_REFRESH_INTERVAL_MS - 1000;
const LOCATION_WATCH_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 20000,
  maximumAge: 60 * 1000
};
const LOCATION_RESOLVE_MIN_DISTANCE_METERS = 250;
const LOCATION_RESOLVE_MIN_INTERVAL_MS = 60 * 1000;
const EARTHQUAKE_LAYER_VISIBILITY_STORAGE_KEYS = {
  activeFault: "meteoscope-earthquake-active-fault-visible-v1",
  plateBoundary: "meteoscope-earthquake-plate-boundary-visible-v1",
  plateDepthContours: "meteoscope-earthquake-plate-depth-contours-visible-v1",
  estimatedIntensity: "meteoscope-earthquake-estimated-intensity-visible-v1"
};
const EARLY_ACCESS_ACTIVE_FAULT_SOURCE_STORAGE_KEY =
  "meteoscope-early-access-active-fault-source-v1";
const EARTHQUAKE_DISTRIBUTION_RECENT_XML_STORAGE_KEY = "meteoscope-earthquake-distribution-recent-xml-v1";
const AMEDAS_PRECIPITATION_PERIOD_STORAGE_KEY = "meteoscope-amedas-precipitation-period-v1";

function loadAmedasPrecipitationPeriod() {
  try {
    return normalizeAmedasPrecipitationPeriod(
      localStorage.getItem(AMEDAS_PRECIPITATION_PERIOD_STORAGE_KEY)
    );
  } catch {
    return DEFAULT_AMEDAS_PRECIPITATION_PERIOD;
  }
}

function saveAmedasPrecipitationPeriod(periodId) {
  try {
    localStorage.setItem(AMEDAS_PRECIPITATION_PERIOD_STORAGE_KEY, periodId);
  } catch {
    // Storage can be unavailable in privacy-restricted environments.
  }
}

function loadEarthquakeLayerVisibility(layerId) {
  try {
    return localStorage.getItem(EARTHQUAKE_LAYER_VISIBILITY_STORAGE_KEYS[layerId]) !== "0";
  } catch {
    return true;
  }
}

function saveEarthquakeLayerVisibility(layerId, visible) {
  try {
    localStorage.setItem(EARTHQUAKE_LAYER_VISIBILITY_STORAGE_KEYS[layerId], visible ? "1" : "0");
  } catch {
    // Storage can be unavailable in privacy-restricted environments.
  }
}

function loadEarlyAccessActiveFaultSource() {
  try {
    return localStorage.getItem(EARLY_ACCESS_ACTIVE_FAULT_SOURCE_STORAGE_KEY) === "gsj"
      ? "gsj"
      : "jshis";
  } catch {
    return "jshis";
  }
}

function saveEarlyAccessActiveFaultSource(source) {
  try {
    localStorage.setItem(
      EARLY_ACCESS_ACTIVE_FAULT_SOURCE_STORAGE_KEY,
      source === "gsj" ? "gsj" : "jshis"
    );
  } catch {
    // Storage can be unavailable in privacy-restricted environments.
  }
}

function loadEarthquakeDistributionRecentXmlVisibility() {
  try {
    return localStorage.getItem(EARTHQUAKE_DISTRIBUTION_RECENT_XML_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function saveEarthquakeDistributionRecentXmlVisibility(visible) {
  try {
    localStorage.setItem(EARTHQUAKE_DISTRIBUTION_RECENT_XML_STORAGE_KEY, visible ? "1" : "0");
  } catch {
    // Storage can be unavailable in privacy-restricted environments.
  }
}

async function fetchWarningTabData(options = {}) {
  const includeDetails = Boolean(options.includeDetails);
  if (!includeDetails) {
    return {
      ...await fetchWarningMap({ includeDetails: false, signal: options.signal }),
      kikikuru: { unavailable: true, deferred: true }
    };
  }

  return await fetchWarningDetails({
    areaCode: options.areaCode,
    includeEarlyWarnings: Boolean(options.includeEarlyWarnings),
    signal: options.signal
  });
}

export function createWeatherApp() {
  const localeController = setupLocale();
  const themeController = setupTheme();
  setupRemoteConfig();

  const launchOptions = getLaunchOptions();
  let activeTab = launchOptions.initialTab;
  let activeAmedasMetric = AMEDAS_METRICS[0].id;
  let activeAmedasPrecipitationPeriod = loadAmedasPrecipitationPeriod();
  let selectedAmedasStationId = "";
  let earlyAccessState = { status: "checking", active: false, message: "認証状態を確認中です。" };
  let earlyAccessEnabled = false;
  let amedasDailyChartDayOffset = 0;
  let amedasDailyChart = { status: "idle", stationId: "", stationName: "", metricId: "", precipitationPeriod: activeAmedasPrecipitationPeriod, dayOffset: 0, data: null };
  let amedasDailyChartRequestId = 0;
  let activeWarningView = "status";
  let activeKikikuruLayer = KIKIKURU_LAYER_OPTIONS[0]?.id ?? "land";
  let activeTyphoonId = "";
  let activeTyphoonForecastMode = "jma";
  let activeWorldTyphoonTargetKeys = [];
  let activeWorldTyphoonForecastTime = "";
  let worldTyphoonPositionFrame = 0;
  let worldTyphoonPositionTimer = 0;
  let worldTyphoonPositionLastUpdate = 0;
  const worldTyphoonModelIds = [
    "ecmwf",
    "ifs-hres",
    "aifs-ens",
    "aifs-single",
    "gefs",
    "gefs-mean"
  ];
  const activeWorldTyphoonModels = {
    ecmwf: true,
    "ifs-hres": true,
    "aifs-ens": true,
    "aifs-single": true,
    gefs: true,
    "gefs-mean": true
  };
  const worldTyphoonForecasts = {
    ecmwf: { status: "idle", data: null, error: "", loadedAt: 0 },
    "ifs-hres": { status: "idle", data: null, error: "", loadedAt: 0 },
    "aifs-ens": { status: "idle", data: null, error: "", loadedAt: 0 },
    "aifs-single": { status: "idle", data: null, error: "", loadedAt: 0 },
    gefs: { status: "idle", data: null, error: "", loadedAt: 0 },
    "gefs-mean": { status: "idle", data: null, error: "", loadedAt: 0 }
  };
  const worldTyphoonForecastRequests = {
    ecmwf: null,
    "ifs-hres": null,
    "aifs-ens": null,
    "aifs-single": null,
    gefs: null,
    "gefs-mean": null
  };
  let activeEarthquakeId = "";
  let collapsedEarthquakeId = "";
  let earthquakeHistoryVisibleCount = EARTHQUAKE_HISTORY_INITIAL_VISIBLE_COUNT;
  let earthquakeHistoryLoadingMore = false;
  let earthquakeHistoryLoadMoreError = "";
  let earthquakeHistoryLoadMoreRequest = null;
  let earthquakeContentMode = "earthquake";
  let volcanoData = null;
  let volcanoLoadedAt = 0;
  let selectedVolcanoCode = "";
  let selectedVolcanoBulletinId = "";
  let selectedVolcanoAshForecastIndex = 0;
  let volcanoRefreshRequest = null;
  const volcanoLatestActivityRequests = new Map();
  let earthquakeView = "recent";
  let earthquakeDistribution3DEnabled = false;
  let earthquakeDistributionRecentXmlVisible =
    loadEarthquakeDistributionRecentXmlVisibility();
  let earthquakeDistributionFilters = {
    dayOffset: 0,
    minMagnitude: "0",
    maxDepth: "all",
    includeRecentXml: earthquakeDistributionRecentXmlVisible,
    rangeEnabled: false,
    startDate: "",
    endDate: "",
    areaPolygon: []
  };
  let earthquakeDistributionState = { status: "idle", data: null, error: "" };
  let earthquakeDistributionRequestId = 0;
  let earthquakeDistributionAreaDrawing = false;
  let earthquakeSummaryPage = "earthquake";
  let earthquakeActiveFaultVisible = loadEarthquakeLayerVisibility("activeFault");
  let earlyAccessActiveFaultSource = loadEarlyAccessActiveFaultSource();
  let earlyAccessActiveFaultDataState = { status: "idle", data: null, error: "" };
  let earlyAccessActiveFaultDataRequest = null;
  let earlyAccessActiveFaultDataRequestId = 0;
  let earthquakePlateBoundaryVisible = loadEarthquakeLayerVisibility("plateBoundary");
  let earthquakePlateDepthContoursVisible = loadEarthquakeLayerVisibility("plateDepthContours");
  let earthquakeEstimatedIntensityVisible = loadEarthquakeLayerVisibility("estimatedIntensity");
  let tideObservation = { status: "idle", station: null, points: [], rangeHours: 24 };
  let tideObservationRequest = null;
  let tideObservationRequestId = 0;
  let weatherMap = null;
  let latestDataByTab = {};
  const tabDataLoadedAt = {};
  let radarPlayTimer = null;
  let lightningPlayTimer = null;
  let weatherChartPlayTimer = null;
  let autoRefreshTimer = null;
  let lightningRefreshTimer = null;
  let earlyWarningRefreshTimer = null;
  let earthquakeRefreshTimer = null;
  let activeLoadRequestId = 0;
  let autoRefreshInFlight = false;
  let earthquakeRefreshRequest = null;
  let lastAutoRefreshStartedAt = 0;
  let lastEarthquakeRefreshStartedAt = 0;
  let tabControls = null;
  let currentLocationInfo = { status: "idle" };
  let currentLocationMarkerVisible = true;
  let myAreas = loadMyAreas();
  let locationRadarTimeline = { status: "idle", points: [] };
  let locationRadarRequestId = 0;
  let currentKikikuruStatus = { status: "idle", elementId: activeKikikuruLayer };
  let currentKikikuruRequestId = 0;
  let locationWatchId = null;
  let locationRequest = null;
  let hasFocusedInitialLocation = false;
  let locationResolveRequestId = 0;
  let lastResolvedLocation = null;
  let weatherChartEnabled = false;
  let weatherChartStatus = "idle";
  let weatherChartData = null;
  let weatherChartLoadedAt = 0;
  let weatherChartRequest = null;
  let weatherChartRequestId = 0;
  let weatherChartRequestExtendedHistory = null;
  let weatherChartExtendedHistory = false;
  let activeWeatherChartFrameIndex = 0;
  let lightningEnabled = false;
  let lightningStatus = "idle";
  let lightningData = null;
  let lightningLoadedAt = 0;
  let lightningRequest = null;
  let lightningRequestId = 0;
  let weatherDistributionMode = null;
  let weatherDistributionStatus = "idle";
  const weatherDistributionDataByMode = new Map();
  const weatherDistributionLoadedAtByMode = new Map();
  const weatherDistributionRequestsByMode = new Map();
  let weatherDistributionPlayTimer = null;
  let typhoonRadarOverlayEnabled = false;
  let typhoonRadarOverlayStatus = "idle";
  const adminNoticePush = createAdminNoticePush({
    onChange: () => refreshSettingsModalView()
  });
  const loadRequestsByTab = new Map();
  let warningDetailsRequest = null;
  let warningKikikuruRequest = null;
  let riverFloodRequest = null;
  const warningDetailsLoadedAtByKey = new Map();
  let warningKikikuruLoadedAt = 0;
  let riverFloodLoadedAt = 0;
  let backgroundPrefetchStarted = false;
  let communityReports = [];
  let communityReportsRequest = null;
  let scheduledMapRenderFrame = 0;
  let mapRenderGeneration = 0;
  let scheduledPanelRenderFrame = 0;
  let scheduledPanelRenderNextFrame = 0;
  let panelRenderGeneration = 0;
  let tabAutoFocusGeneration = 0;

  function syncSocialShareMapButton(tabId = activeTab) {
    const button = document.getElementById("social-share-map-button");
    if (!button) return;
  const labels = {
    amedas: "アメダスランキング",
    typhoon: "台風情報",
    earthquake: "地震情報",
    warnings: "現在地付近の発表状況"
  };
  const payloadType = tabId === "warnings" ? "warning" : tabId;
  const label = labels[tabId] ?? "";
  const payload = label ? getSocialSharePayload(payloadType) : null;
  button.dataset.socialShare = label ? payloadType : "";
    button.disabled = !payload;
    button.setAttribute(
      "aria-label",
      payload ? `${label}を画像で共有` : (label ? `${label}を読み込み中` : "このタブでは画像共有を利用できません")
    );
    button.title = payload
      ? `${label}を画像で共有`
      : (label ? `${label}を読み込み中` : "このタブでは画像共有を利用できません");
  }

  function syncMeteoScopeLensButton(tabId = activeTab) {
    const button = document.getElementById("meteoscope-lens-button");
    if (!button) return;
    const available = tabId === "amedas" && (latestDataByTab.amedas?.points?.length ?? 0) > 0;
    button.hidden = tabId !== "amedas";
    button.disabled = !available;
    button.classList.remove("is-early-access-locked");
    button.setAttribute("aria-label", !available
      ? "AMeDAS情報を読み込み中"
      : "MeteoScope Lensを開く");
    button.title = "MeteoScope Lens";
  }

  function renderLeftPanelState(tab, panelState) {
    updateLeftPanel(tab, panelState);
    syncSocialShareMapButton(tab?.id);
    syncMeteoScopeLensButton(tab?.id);
  syncWeatherDistributionToggle({
    visible: tab?.id === "radar" && Boolean(weatherDistributionMode),
    activeMode: tab?.id === "radar" ? weatherDistributionMode : null
  });
  }

  async function selectTab(tabId) {
    const switchStartedAt = performance.now();
    const tab = TABS.find((item) => item.id === tabId) ?? TABS[0];
    const tabChanged = activeTab !== tab.id;
    if (tabChanged) tabAutoFocusGeneration += 1;
    const autoFocusGeneration = tabAutoFocusGeneration;
    if (activeTab === "warnings" && tab.id !== "warnings" && warningDetailsRequest?.abortOnTabChange) {
      warningDetailsRequest.controller.abort();
    }
    activeTab = tab.id;
    syncTyphoonRadarOverlayButton();
    syncEarlyWarningRefreshTimer();
    syncSocialShareMapButton(tab.id);
    invalidateScheduledMapRender();
    invalidateScheduledPanelRender();
    syncActiveTabToUrl(tab.id);
    tabControls?.setActiveButton(tab.id);
    try {
      if (tab.id !== "radar") {
        stopRadarPlayback();
        stopLightningPlayback();
        stopWeatherChartPlayback();
      }
      weatherMap?.setMode(tab.id);
      if (tab.id === "radar") void refreshCommunityReports();
    } catch (error) {
      console.warn("[MeteoScope] tab map update failed", error);
    }

    const requestId = ++activeLoadRequestId;
    const cachedData = tab.id === "earthquake" && earthquakeContentMode === "volcano"
      ? volcanoData
      : latestDataByTab[tab.id];
    if (cachedData) {
      let cachedViewUpdated = false;
      try {
        updateCurrentView(tab, cachedData, { deferPanel: true });
        cachedViewUpdated = true;
      } catch (error) {
        console.warn("[MeteoScope] cached tab view update failed", error);
      }
      if (cachedViewUpdated) {
        if (tabChanged) scheduleTabAutoFocus(tab.id, autoFocusGeneration);
        if (tab.id === "earthquake") {
          if (earthquakeContentMode === "volcano") void refreshVolcanoData();
          else void refreshEarthquakeData();
        }
        if (tab.id === "warnings" && activeWarningView === "river") {
          void refreshRiverFloodData();
        }
        if (!isTabDataFresh(tab.id)) void refreshCachedTab(tab);
        scheduleBackgroundPrefetch(tab.id);
        recordDiagnostic("tab-switch", {
          tab: tab.id,
          cached: true,
          durationMs: Math.round(performance.now() - switchStartedAt)
        });
        return;
      }
    } else {
      scheduleMapRender(tab.id, buildDisplayData(tab, {}));
      schedulePanelRender(tab, {
        status: "loading",
        amedasMetric: activeAmedasMetric,
        amedasPrecipitationPeriod: activeAmedasPrecipitationPeriod,
        warningView: activeWarningView,
        activeKikikuruLayer,
        radarPlaying: Boolean(radarPlayTimer),
        currentLocation: currentLocationInfo,
        myAreas,
        locationInsights: buildLocationInsights(tab.id, null),
        earthquakeContentMode,
        earthquakeActiveFaultVisible,
        earthquakePlateBoundaryVisible,
        earthquakePlateDepthContoursVisible,
        weatherChartEnabled,
        weatherChartStatus,
        weatherChart: weatherChartData,
        weatherDistributionMode,
        weatherDistributionStatus,
        weatherDistribution: getActiveWeatherDistribution(),
        lightningEnabled,
        lightningStatus,
        lightning: lightningData,
        lightningPlaying: Boolean(lightningPlayTimer)
      });
    }

    try {
      await yieldToMainThread();
      if (requestId !== activeLoadRequestId || activeTab !== tab.id) return;
      const data = tab.id === "earthquake" && earthquakeContentMode === "volcano"
        ? await fetchVolcanoXmlList()
        : await loadTabData(tab.id);
      if (requestId !== activeLoadRequestId || activeTab !== tab.id) return;
      if (tab.id === "earthquake" && earthquakeContentMode === "volcano") {
        volcanoData = data;
        volcanoLoadedAt = Date.now();
      }
      else {
        latestDataByTab[tab.id] = data;
        tabDataLoadedAt[tab.id] = Date.now();
      }
      updateCurrentView(tab, data, { deferPanel: true });
      if (tabChanged) scheduleTabAutoFocus(tab.id, autoFocusGeneration);
      if (tab.id === "warnings" && activeWarningView === "river") void refreshRiverFloodData();
      scheduleBackgroundPrefetch(tab.id);
      recordDiagnostic("tab-switch", {
        tab: tab.id,
        cached: false,
        durationMs: Math.round(performance.now() - switchStartedAt)
      });
    } catch (error) {
      if (requestId !== activeLoadRequestId || activeTab !== tab.id) return;
      console.warn(`[MeteoScope] ${tab.id} load failed`, error);
      schedulePanelRender(tab, {
        status: "error",
        error,
        amedasMetric: activeAmedasMetric,
        amedasPrecipitationPeriod: activeAmedasPrecipitationPeriod,
        warningView: activeWarningView,
        activeKikikuruLayer,
        radarPlaying: Boolean(radarPlayTimer),
        currentLocation: currentLocationInfo,
        myAreas,
        locationInsights: buildLocationInsights(tab.id, null),
        earthquakeContentMode,
        earthquakeActiveFaultVisible,
        earthquakePlateBoundaryVisible,
        earthquakePlateDepthContoursVisible,
        weatherChartEnabled,
        weatherChartStatus,
        weatherChart: weatherChartData
      });
    }
  }

  function selectAmedasMetric(metricId) {
    activeAmedasMetric = AMEDAS_METRICS.some((item) => item.id === metricId) ? metricId : AMEDAS_METRICS[0].id;
    if (activeTab !== "amedas") return;
    const tab = TABS.find((item) => item.id === "amedas");
    updateCurrentView(tab, latestDataByTab.amedas);
    const selectedPoint = (latestDataByTab.amedas?.points ?? [])
      .find((point) => String(point.id) === selectedAmedasStationId);
    if (selectedPoint && (
      amedasDailyChart.metricId !== activeAmedasMetric
      || (activeAmedasMetric === "precipitation"
        && amedasDailyChart.precipitationPeriod !== activeAmedasPrecipitationPeriod)
    )) {
      void loadAmedasDailyChart(selectedPoint, activeAmedasMetric, amedasDailyChartDayOffset);
    }
  }

  function selectAmedasPrecipitationPeriod(periodId) {
    const normalizedPeriod = normalizeAmedasPrecipitationPeriod(periodId);
    if (normalizedPeriod === activeAmedasPrecipitationPeriod) return;
    activeAmedasPrecipitationPeriod = normalizedPeriod;
    saveAmedasPrecipitationPeriod(normalizedPeriod);
    if (activeTab !== "amedas") return;

    const tab = TABS.find((item) => item.id === "amedas");
    updateCurrentView(tab, latestDataByTab.amedas);
    const selectedPoint = (latestDataByTab.amedas?.points ?? [])
      .find((point) => String(point.id) === selectedAmedasStationId);
    if (selectedPoint && activeAmedasMetric === "precipitation") {
      void loadAmedasDailyChart(selectedPoint, activeAmedasMetric, amedasDailyChartDayOffset);
    }
  }

  function selectAmedasDailyChartDay(dayOffset) {
    const normalizedDayOffset = Number(dayOffset) === 1 ? 1 : 0;
    if (normalizedDayOffset === 1 && !earlyAccessEnabled) return;
    if (normalizedDayOffset === amedasDailyChartDayOffset) return;
    amedasDailyChartDayOffset = normalizedDayOffset;
    const selectedPoint = (latestDataByTab.amedas?.points ?? [])
      .find((point) => String(point.id) === selectedAmedasStationId);
    if (!selectedPoint) return;
    void loadAmedasDailyChart(selectedPoint, activeAmedasMetric, amedasDailyChartDayOffset);
  }

  async function refreshEarlyAccess() {
    earlyAccessState = await validateEarlyAccess();
    earlyAccessEnabled = earlyAccessState.active;
    applyEarlyAccessState();
    return earlyAccessState;
  }

  async function authenticateEarlyAccess(code) {
    earlyAccessState = { status: "checking", active: false, message: "シリアルコードを確認中です。" };
    refreshSettingsModalView();
    earlyAccessState = await activateEarlyAccess(code);
    earlyAccessEnabled = earlyAccessState.active;
    applyEarlyAccessState();
    return earlyAccessState;
  }

  function releaseEarlyAccess() {
    earlyAccessState = deactivateEarlyAccess();
    earlyAccessEnabled = false;
    applyEarlyAccessState();
    return earlyAccessState;
  }

  function applyEarlyAccessState() {
    document.documentElement.dataset.earlyAccess = earlyAccessEnabled ? "active" : "inactive";
    document.dispatchEvent(new CustomEvent("meteoscope:early-access-change"));
    void applyActiveFaultDataSource();
    refreshWeatherChartAccessMode();
    syncMeteoScopeLensButton();
    if (!earlyAccessEnabled && amedasDailyChartDayOffset === 1) {
      amedasDailyChartDayOffset = 0;
      const selectedPoint = (latestDataByTab.amedas?.points ?? [])
        .find((point) => String(point.id) === selectedAmedasStationId);
      if (selectedPoint) void loadAmedasDailyChart(selectedPoint, activeAmedasMetric, 0);
    } else if (activeTab === "amedas") {
      refreshAmedasPanel();
    }
    refreshSettingsModalView();
  }

  function getEffectiveActiveFaultSource() {
    return earlyAccessEnabled && earlyAccessActiveFaultSource === "gsj" ? "gsj" : "jshis";
  }

  function setEarlyAccessActiveFaultSource(source) {
    if (!earlyAccessEnabled) return getEffectiveActiveFaultSource();
    earlyAccessActiveFaultSource = source === "gsj" ? "gsj" : "jshis";
    saveEarlyAccessActiveFaultSource(earlyAccessActiveFaultSource);
    void applyActiveFaultDataSource();
    refreshSettingsModalView();
    if (activeTab === "earthquake") refreshActivePanel();
    return getEffectiveActiveFaultSource();
  }

  async function applyActiveFaultDataSource() {
    const source = getEffectiveActiveFaultSource();
    if (source !== "gsj") {
      earlyAccessActiveFaultDataRequestId += 1;
      earlyAccessActiveFaultDataRequest = null;
      if (!earlyAccessEnabled) {
        earlyAccessActiveFaultDataState = { status: "idle", data: null, error: "" };
        weatherMap?.setGsjActiveFaultData(null);
      }
      weatherMap?.setActiveFaultDataSource("jshis");
      return "jshis";
    }

    if (earlyAccessActiveFaultDataState.data) {
      weatherMap?.setGsjActiveFaultData(earlyAccessActiveFaultDataState.data);
      weatherMap?.setActiveFaultDataSource("gsj");
      return "gsj";
    }
    if (earlyAccessActiveFaultDataRequest) return earlyAccessActiveFaultDataRequest;

    const requestId = ++earlyAccessActiveFaultDataRequestId;
    earlyAccessActiveFaultDataState = { status: "loading", data: null, error: "" };
    weatherMap?.setActiveFaultDataSource("jshis");
    refreshSettingsModalView();
    if (activeTab === "earthquake") refreshActivePanel();

    const request = fetchEarlyAccessActiveFaultSegments()
      .then((data) => {
        if (requestId !== earlyAccessActiveFaultDataRequestId || getEffectiveActiveFaultSource() !== "gsj") {
          return getEffectiveActiveFaultSource();
        }
        earlyAccessActiveFaultDataState = { status: "ready", data, error: "" };
        weatherMap?.setGsjActiveFaultData(data);
        weatherMap?.setActiveFaultDataSource("gsj");
        return "gsj";
      })
      .catch((error) => {
        if (requestId !== earlyAccessActiveFaultDataRequestId) return getEffectiveActiveFaultSource();
        console.warn("[MeteoScope] protected GSJ active-fault load failed", error);
        earlyAccessActiveFaultDataState = {
          status: "error",
          data: null,
          error: error?.message || "産総研活断層データを取得できませんでした。"
        };
        weatherMap?.setActiveFaultDataSource("jshis");
        return "jshis";
      })
      .finally(() => {
        if (requestId !== earlyAccessActiveFaultDataRequestId) return;
        earlyAccessActiveFaultDataRequest = null;
        refreshSettingsModalView();
        if (activeTab === "earthquake") refreshActivePanel();
      });
    earlyAccessActiveFaultDataRequest = request;
    return request;
  }

  function refreshWeatherChartAccessMode() {
    const accessModeChanged = weatherChartExtendedHistory !== earlyAccessEnabled
      || (weatherChartRequestExtendedHistory !== null && weatherChartRequestExtendedHistory !== earlyAccessEnabled);
    if (!accessModeChanged || (!weatherChartData && !weatherChartRequest)) return;

    weatherChartRequestId += 1;
    weatherChartRequest = null;
    weatherChartRequestExtendedHistory = null;
    weatherChartData = null;
    weatherChartLoadedAt = 0;
    activeWeatherChartFrameIndex = 0;
    weatherChartStatus = "idle";
    if (!weatherChartEnabled) return;

    weatherChartStatus = "loading";
    refreshRadarPanel();
    void refreshWeatherChartData()
      .then(() => {
        weatherChartStatus = "ok";
      })
      .catch((error) => {
        console.warn("[MeteoScope] weather chart access mode reload failed", error);
        weatherChartStatus = "error";
      })
      .finally(refreshRadarPanel);
  }

  function selectKikikuruLayer(layerId) {
    if (layerId === "status") {
      activeWarningView = activeWarningView === "status" ? "early" : "status";
      syncEarlyWarningRefreshTimer();
      if (activeTab !== "warnings") return;
      const tab = TABS.find((item) => item.id === "warnings");
      updateCurrentView(tab, latestDataByTab.warnings, { immediateMap: true });
      if (activeWarningView === "early") refreshWarningDetails({ includeEarlyWarnings: true });
      return;
    }

    if (layerId === "early") {
      activeWarningView = "early";
      syncEarlyWarningRefreshTimer();
      if (activeTab !== "warnings") return;
      const tab = TABS.find((item) => item.id === "warnings");
      updateCurrentView(tab, latestDataByTab.warnings, { immediateMap: true });
      refreshWarningDetails({ includeEarlyWarnings: true });
      return;
    }

if (layerId === "river") {
      activeWarningView = "river";
      syncEarlyWarningRefreshTimer();
      if (activeTab !== "warnings") return;
      const tab = TABS.find((item) => item.id === "warnings");
      if (!latestDataByTab.warnings?.riverFlood) {
        latestDataByTab.warnings = {
          ...(latestDataByTab.warnings ?? {}),
          riverFlood: { status: "loading", reports: [], riverFeatures: { type: "FeatureCollection", features: [] } }
        };
      }
      updateCurrentView(tab, latestDataByTab.warnings);
      void refreshRiverFloodData();
      return;
    }

    if (layerId !== "kikikuru" && !KIKIKURU_LAYER_OPTIONS.some((element) => element.id === layerId)) return;
    activeWarningView = "kikikuru";
    syncEarlyWarningRefreshTimer();
    if (layerId !== "kikikuru") activeKikikuruLayer = layerId;
    currentKikikuruStatus = { status: "loading", elementId: activeKikikuruLayer };
    if (activeTab !== "warnings") return;
    const tab = TABS.find((item) => item.id === "warnings");
    updateCurrentView(tab, latestDataByTab.warnings);
    void refreshKikikuruData();
  }

  function selectTyphoon(typhoonId) {
    activeTyphoonId = String(typhoonId ?? "");
    if (activeTab !== "typhoon") return;
    const tab = TABS.find((item) => item.id === "typhoon");
    updateCurrentView(tab, latestDataByTab.typhoon);
    focusSelectedTyphoon();
  }

  function getTyphoonRadarOverlaySelection(selectedTyphoon) {
    if (!typhoonRadarOverlayEnabled || !selectedTyphoon?.updatedAt) return null;
    return selectTyphoonRadarFrame(
      latestDataByTab.radar?.frames ?? [],
      selectedTyphoon.updatedAt
    );
  }

  function buildTyphoonRadarOverlayState(selectedTyphoon) {
    const selection = getTyphoonRadarOverlaySelection(selectedTyphoon);
    const status = typhoonRadarOverlayEnabled
      ? (typhoonRadarOverlayStatus === "loading"
          ? "loading"
          : (selection ? "ready" : "unavailable"))
      : "idle";
    return {
      enabled: typhoonRadarOverlayEnabled,
      status,
      available: Boolean(selection),
      visible: activeTyphoonForecastMode === "jma"
        && typhoonRadarOverlayEnabled
        && Boolean(selection),
      targetTime: selectedTyphoon?.updatedAt ?? "",
      frameTime: selection?.frame?.label ?? "",
      radarTileUrl: selection?.frame?.radarTileUrl ?? null
    };
  }

  function syncTyphoonRadarOverlayButton(displayData = null) {
    const button = document.getElementById("typhoon-radar-overlay-button");
    if (!button) return;
    const selectedTyphoon = displayData?.selectedTyphoon
      ?? (latestDataByTab.typhoon?.typhoons ?? []).find((typhoon) =>
        String(typhoon.id) === String(activeTyphoonId)
      )
      ?? latestDataByTab.typhoon?.typhoons?.[0]
      ?? null;
    const overlay = displayData?.typhoonRadarOverlay
      ?? buildTyphoonRadarOverlayState(selectedTyphoon);
    const isEnglish = getCurrentLanguage() === "en";
    const visible = activeTab === "typhoon"
      && activeTyphoonForecastMode === "jma"
      && Boolean(selectedTyphoon);
    const label = overlay.status === "loading"
      ? (isEnglish ? "Loading radar for the bulletin time" : "発表時刻の雨雲レーダを読み込み中")
      : overlay.status === "unavailable"
        ? (isEnglish
            ? "Radar for this bulletin time is unavailable"
            : "この発表時刻の雨雲レーダは利用できません")
        : overlay.visible
          ? (isEnglish
              ? `Hide radar at ${overlay.frameTime}`
              : `${overlay.frameTime}の雨雲レーダを隠す`)
          : (isEnglish
              ? "Overlay radar from the typhoon bulletin time"
              : "台風情報の発表時刻の雨雲レーダを重ねる");

    button.hidden = !visible;
    button.disabled = overlay.status === "loading";
    button.classList.toggle("is-active", overlay.visible);
    button.classList.toggle("is-loading", overlay.status === "loading");
    button.classList.toggle("is-unavailable", overlay.status === "unavailable");
    button.setAttribute("aria-pressed", String(Boolean(overlay.enabled)));
    button.setAttribute("aria-label", label);
    button.title = label;
    button.dataset.radarTime = overlay.frameTime;
  }

  async function refreshTyphoonRadarOverlayData() {
    try {
      const radarData = await loadTabData("radar");
      latestDataByTab.radar = mergeRefreshedData("radar", latestDataByTab.radar, radarData);
      tabDataLoadedAt.radar = Date.now();
      const selectedTyphoon = (latestDataByTab.typhoon?.typhoons ?? []).find((typhoon) =>
        String(typhoon.id) === String(activeTyphoonId)
      ) ?? latestDataByTab.typhoon?.typhoons?.[0];
      typhoonRadarOverlayStatus = getTyphoonRadarOverlaySelection(selectedTyphoon)
        ? "ready"
        : "unavailable";
    } catch (error) {
      typhoonRadarOverlayStatus = "unavailable";
      console.warn("[MeteoScope] typhoon bulletin radar overlay failed", error);
    }
  }

  async function toggleTyphoonRadarOverlay() {
    if (activeTab !== "typhoon" || activeTyphoonForecastMode !== "jma") return;
    const tab = TABS.find((item) => item.id === "typhoon");
    if (typhoonRadarOverlayEnabled) {
      typhoonRadarOverlayEnabled = false;
      typhoonRadarOverlayStatus = "idle";
      updateCurrentView(tab, latestDataByTab.typhoon ?? {});
      return;
    }

    typhoonRadarOverlayEnabled = true;
    typhoonRadarOverlayStatus = "loading";
    updateCurrentView(tab, latestDataByTab.typhoon ?? {});
    await refreshTyphoonRadarOverlayData();
    if (activeTab === "typhoon") {
      updateCurrentView(tab, latestDataByTab.typhoon ?? {});
    }
  }

  function isTabDataFresh(tabId) {
    const loadedAt = Number(tabDataLoadedAt[tabId]) || 0;
    const ttlMs = TAB_DATA_TTL_MS[tabId] ?? 60 * 1000;
    return loadedAt > 0 && Date.now() - loadedAt < ttlMs;
  }

  async function refreshCachedTab(tab) {
    if (!tab || tab.id === "earthquake") return;
    try {
      const nextData = await loadTabData(tab.id);
      latestDataByTab[tab.id] = mergeRefreshedData(tab.id, latestDataByTab[tab.id], nextData);
      tabDataLoadedAt[tab.id] = Date.now();
      if (tab.id === "typhoon" && typhoonRadarOverlayEnabled) {
        await refreshTyphoonRadarOverlayData();
      }
      if (activeTab === tab.id) updateCurrentView(tab, latestDataByTab[tab.id], { deferPanel: true });
    } catch (error) {
      console.warn(`[MeteoScope] ${tab.id} background refresh failed`, error);
    }
  }

  function selectTyphoonForecastMode(mode) {
    const nextMode = mode === "world" ? "world" : "jma";
    if (nextMode === activeTyphoonForecastMode) return;
    activeTyphoonForecastMode = nextMode;
    if (activeTab !== "typhoon") return;
    const tab = TABS.find((item) => item.id === "typhoon");
    updateCurrentView(tab, latestDataByTab.typhoon ?? {});
    if (nextMode === "world") {
      worldTyphoonModelIds
        .filter((modelId) => activeWorldTyphoonModels[modelId])
        .forEach((modelId) => void ensureWorldTyphoonForecast({ model: modelId }));
      return;
    }
    focusSelectedTyphoon();
  }

  function toggleWorldTyphoonModel(model) {
    const modelId = worldTyphoonModelIds.includes(model) ? model : "ecmwf";
    activeWorldTyphoonModels[modelId] = !activeWorldTyphoonModels[modelId];
    if (activeTab !== "typhoon" || activeTyphoonForecastMode !== "world") return;
    const tab = TABS.find((item) => item.id === "typhoon");
    updateCurrentView(tab, latestDataByTab.typhoon ?? {});
    if (activeWorldTyphoonModels[modelId]) {
      void ensureWorldTyphoonForecast({ model: modelId });
      return;
    }
    focusSelectedTyphoon();
  }

  function selectWorldTyphoonForecastTime(validTime) {
    if (!Number.isFinite(Date.parse(validTime ?? ""))) return;
    activeWorldTyphoonForecastTime = validTime;
    if (activeTab !== "typhoon" || activeTyphoonForecastMode !== "world") return;
    if (worldTyphoonPositionFrame || worldTyphoonPositionTimer) return;
    worldTyphoonPositionFrame = requestAnimationFrame(() => {
      worldTyphoonPositionFrame = 0;
      const elapsed = performance.now() - worldTyphoonPositionLastUpdate;
      const delay = Math.max(0, 40 - elapsed);
      worldTyphoonPositionTimer = window.setTimeout(() => {
        worldTyphoonPositionTimer = 0;
        if (activeTab !== "typhoon" || activeTyphoonForecastMode !== "world") return;
        worldTyphoonPositionLastUpdate = performance.now();
        const displayData = buildTyphoonDisplayData(
          latestDataByTab.typhoon ?? {},
          { interpolateWorldTime: true }
        );
        weatherMap?.updateWorldTyphoonForecastPositions(displayData);
      }, delay);
    });
  }

  function selectWorldTyphoonTarget(targetKey) {
    const nextKey = String(targetKey ?? "all");
    const nextKeys = nextKey === "all"
      ? []
      : (activeWorldTyphoonTargetKeys.includes(nextKey)
        ? activeWorldTyphoonTargetKeys.filter((key) => key !== nextKey)
        : [...activeWorldTyphoonTargetKeys, nextKey]);
    if (
      nextKeys.length === activeWorldTyphoonTargetKeys.length
      && nextKeys.every((key, index) => key === activeWorldTyphoonTargetKeys[index])
    ) return;
    activeWorldTyphoonTargetKeys = nextKeys;
    if (activeTab !== "typhoon" || activeTyphoonForecastMode !== "world") return;
    updateCurrentView(TABS.find((item) => item.id === "typhoon"), latestDataByTab.typhoon ?? {});
  }

  function ensureWorldTyphoonForecast({
    force = false,
    model = "ecmwf",
    refreshView = true
  } = {}) {
    const modelId = worldTyphoonModelIds.includes(model) ? model : "ecmwf";
    const forecastState = worldTyphoonForecasts[modelId];
    const isFresh = forecastState.loadedAt > 0
      && Date.now() - forecastState.loadedAt < WORLD_TYPHOON_DATA_REFRESH_INTERVAL_MS;
    if (!force && forecastState.status === "ok" && isFresh) {
      focusSelectedTyphoon();
      return Promise.resolve(forecastState.data);
    }
    if (worldTyphoonForecastRequests[modelId]) return worldTyphoonForecastRequests[modelId];
    worldTyphoonForecasts[modelId] = { ...forecastState, status: "loading", error: "" };
    if (
      refreshView
      && activeTab === "typhoon"
      && activeTyphoonForecastMode === "world"
      && activeWorldTyphoonModels[modelId]
    ) {
      updateCurrentView(TABS.find((item) => item.id === "typhoon"), latestDataByTab.typhoon ?? {});
    }
    worldTyphoonForecastRequests[modelId] = fetchWorldTyphoonForecast(modelId)
      .then((data) => {
        worldTyphoonForecasts[modelId] = {
          status: "ok",
          data,
          error: "",
          loadedAt: Date.now()
        };
        if (
          refreshView
          && activeTab === "typhoon"
          && activeTyphoonForecastMode === "world"
          && activeWorldTyphoonModels[modelId]
        ) {
          updateCurrentView(TABS.find((item) => item.id === "typhoon"), latestDataByTab.typhoon ?? {});
          focusSelectedTyphoon();
        }
        return data;
      })
      .catch((error) => {
        console.warn(`[MeteoScope] ${getWorldTyphoonModel(modelId).label} world typhoon forecast load failed`, error);
        worldTyphoonForecasts[modelId] = {
          status: forecastState.data ? "ok" : "error",
          data: forecastState.data,
          error: error?.message ?? "各国予想を取得できませんでした",
          loadedAt: forecastState.loadedAt ?? 0
        };
        if (
          refreshView
          && activeTab === "typhoon"
          && activeTyphoonForecastMode === "world"
          && activeWorldTyphoonModels[modelId]
        ) {
          updateCurrentView(TABS.find((item) => item.id === "typhoon"), latestDataByTab.typhoon ?? {});
        }
        return null;
      })
      .finally(() => {
        worldTyphoonForecastRequests[modelId] = null;
      });
    return worldTyphoonForecastRequests[modelId];
  }

  function refreshActiveWorldTyphoonForecasts() {
    if (activeTab !== "typhoon" || activeTyphoonForecastMode !== "world") {
      return Promise.resolve([]);
    }
    const now = Date.now();
    const staleModelIds = worldTyphoonModelIds.filter((modelId) => {
      if (!activeWorldTyphoonModels[modelId]) return false;
      const forecastState = worldTyphoonForecasts[modelId];
      return forecastState.status !== "ok"
        || forecastState.loadedAt <= 0
        || now - forecastState.loadedAt >= WORLD_TYPHOON_DATA_REFRESH_INTERVAL_MS;
    });
    if (!staleModelIds.length) return Promise.resolve([]);

    return Promise.all(
      staleModelIds.map((modelId) => ensureWorldTyphoonForecast({
        model: modelId,
        refreshView: false
      }))
    ).then((results) => {
      if (activeTab === "typhoon" && activeTyphoonForecastMode === "world") {
        updateCurrentView(
          TABS.find((item) => item.id === "typhoon"),
          latestDataByTab.typhoon ?? {}
        );
      }
      return results;
    });
  }

  function selectEarthquake(earthquakeId) {
    const nextEarthquakeId = String(earthquakeId ?? "");
    const isSelected = nextEarthquakeId === activeEarthquakeId;
    if (isSelected) {
      collapsedEarthquakeId = collapsedEarthquakeId === nextEarthquakeId ? "" : nextEarthquakeId;
    } else {
      activeEarthquakeId = nextEarthquakeId;
      collapsedEarthquakeId = "";
    }
    if (activeTab !== "earthquake") return;
    const tab = TABS.find((item) => item.id === "earthquake");
    updateCurrentView(tab, latestDataByTab.earthquake);
    if (!isSelected) focusSelectedEarthquake();
  }

  async function loadMoreEarthquakeHistory() {
    if (earthquakeHistoryLoadMoreRequest) return;
    const currentData = latestDataByTab.earthquake;
    const earthquakeCount = currentData?.earthquakes?.length ?? 0;
    const previousVisibleCount = earthquakeHistoryVisibleCount;
    const targetVisibleCount = previousVisibleCount + EARTHQUAKE_HISTORY_LOAD_MORE_COUNT;
    if (earthquakeCount >= targetVisibleCount) {
      earthquakeHistoryVisibleCount = targetVisibleCount;
      earthquakeHistoryLoadMoreError = "";
      if (activeTab === "earthquake" && earthquakeContentMode === "earthquake") {
        refreshActivePanel();
      }
      return;
    }
    if (!currentData?.earthquakeHistoryHasMoreSourceEntries) {
      earthquakeHistoryVisibleCount = Math.min(earthquakeCount, targetVisibleCount);
      earthquakeHistoryLoadMoreError = "";
      if (activeTab === "earthquake" && earthquakeContentMode === "earthquake") {
        refreshActivePanel();
      }
      return;
    }

    earthquakeHistoryLoadingMore = true;
    earthquakeHistoryLoadMoreError = "";
    refreshActivePanel();
    const previousDetailFetchLimit = earthquakeHistoryDetailFetchLimit;
    earthquakeHistoryLoadMoreRequest = (async () => {
      let nextData = currentData;
      while (
        (nextData?.earthquakes?.length ?? 0) < targetVisibleCount
        && nextData?.earthquakeHistoryHasMoreSourceEntries
        && earthquakeHistoryDetailFetchLimit < EARTHQUAKE_XML_MAX_DETAIL_FETCH_LIMIT
      ) {
        earthquakeHistoryDetailFetchLimit = Math.min(
          EARTHQUAKE_XML_MAX_DETAIL_FETCH_LIMIT,
          earthquakeHistoryDetailFetchLimit + EARTHQUAKE_XML_DETAIL_FETCH_INCREMENT
        );
        nextData = await fetchEarthquakeTabData({
          earthquakeDetailFetchLimit: earthquakeHistoryDetailFetchLimit
        });
      }
      return nextData;
    })()
      .then((nextData) => {
        latestDataByTab.earthquake = nextData;
        earthquakeHistoryVisibleCount = Math.min(
          nextData?.earthquakes?.length ?? 0,
          targetVisibleCount
        );
        tabDataLoadedAt.earthquake = Date.now();
        return nextData;
      })
      .catch((error) => {
        earthquakeHistoryDetailFetchLimit = previousDetailFetchLimit;
        earthquakeHistoryLoadMoreError = "過去の地震履歴を取得できませんでした。";
        console.warn("[MeteoScope] older earthquake history load failed", error);
        return currentData;
      })
      .finally(() => {
        earthquakeHistoryLoadingMore = false;
        earthquakeHistoryLoadMoreRequest = null;
        if (activeTab === "earthquake" && earthquakeContentMode === "earthquake") {
          refreshActivePanel();
        }
      });
    await earthquakeHistoryLoadMoreRequest;
  }

  async function selectTideObservationStation(stationCode) {
    const station = (latestDataByTab.earthquake?.tideStations ?? [])
      .find((item) => String(item.code) === String(stationCode));
    if (!station || earthquakeContentMode !== "earthquake") return;
    const requestId = ++tideObservationRequestId;
    tideObservation = {
      status: "loading",
      station,
      points: [],
      latest: null,
      rangeHours: tideObservation.rangeHours || 24,
      error: ""
    };
    if (activeTab === "earthquake") refreshActivePanel();

    tideObservationRequest = fetchTideObservationSeries(station, { force: true })
      .then((series) => {
        if (requestId !== tideObservationRequestId) return tideObservation;
        tideObservation = {
          ...series,
          status: "ok",
          rangeHours: tideObservation.rangeHours || 24,
          error: ""
        };
        return tideObservation;
      })
      .catch((error) => {
        if (requestId !== tideObservationRequestId) return tideObservation;
        console.warn("[MeteoScope] tide observation unavailable", error);
        tideObservation = {
          ...tideObservation,
          status: "error",
          error: "潮位観測値を取得できませんでした。"
        };
        return tideObservation;
      })
      .finally(() => {
        if (requestId === tideObservationRequestId) tideObservationRequest = null;
        if (requestId === tideObservationRequestId && activeTab === "earthquake") {
          refreshActivePanel();
        }
      });
    return tideObservationRequest;
  }

  function selectTideObservationRange(hours) {
    const rangeHours = Number(hours);
    if (![1, 6, 12, 24].includes(rangeHours) || !tideObservation.station) return;
    tideObservation = { ...tideObservation, rangeHours };
    if (activeTab === "earthquake") refreshActivePanel();
  }

  function closeTideObservation() {
    tideObservationRequestId += 1;
    tideObservationRequest = null;
    tideObservation = {
      status: "idle",
      station: null,
      points: [],
      latest: null,
      rangeHours: tideObservation.rangeHours || 24
    };
    if (activeTab === "earthquake") refreshActivePanel();
  }

  function refreshVolcanoView({ scrollToTop = false } = {}) {
    if (activeTab !== "earthquake" || earthquakeContentMode !== "volcano") return;
    updateCurrentView(TABS.find((item) => item.id === "earthquake"), volcanoData ?? {});
    if (scrollToTop) {
      requestAnimationFrame(() => {
        const sidebar = document.getElementById("sidebar");
        if (sidebar) sidebar.scrollTop = 0;
      });
    }
  }

  function toggleEarthquakeContentMode() {
    earthquakeContentMode = earthquakeContentMode === "volcano" ? "earthquake" : "volcano";
    selectedVolcanoCode = "";
    selectedVolcanoBulletinId = "";
    selectedVolcanoAshForecastIndex = 0;
    const button = document.querySelector('.tab-button[data-tab="earthquake"]');
    const label = button?.querySelector(".tab-button-label");
    if (label) label.textContent = earthquakeContentMode === "volcano" ? "火山" : "地震";
    button?.classList.toggle("is-volcano-mode", earthquakeContentMode === "volcano");
    button?.setAttribute("aria-label", earthquakeContentMode === "volcano" ? "火山情報" : "地震情報");
    button?.setAttribute(
      "aria-description",
      earthquakeContentMode === "volcano" ? "長押しで地震情報へ切り替え" : "長押しで火山情報へ切り替え"
    );
    weatherMap?.setActiveFaultVisible(earthquakeContentMode === "earthquake" && earthquakeActiveFaultVisible);
    weatherMap?.setPlateBoundaryVisible(earthquakeContentMode === "earthquake" && earthquakePlateBoundaryVisible);
    weatherMap?.setPlateDepthContoursVisible(earthquakeContentMode === "earthquake" && earthquakePlateDepthContoursVisible);
    void selectTab("earthquake");
  }

  async function refreshVolcanoData({ force = false } = {}) {
    if (activeTab !== "earthquake" || earthquakeContentMode !== "volcano") return volcanoData;
    if (document.hidden && !force) return volcanoData;
    const nextData = await ensureVolcanoData({ force });
    if (activeTab === "earthquake" && earthquakeContentMode === "volcano" && nextData) {
      updateCurrentView(TABS.find((item) => item.id === "earthquake"), nextData);
    }
    return nextData;
  }

  async function ensureVolcanoData({ force = false } = {}) {
    if (!force && volcanoData && Date.now() - volcanoLoadedAt < TAB_DATA_TTL_MS.earthquake) return volcanoData;
    if (volcanoRefreshRequest) return volcanoRefreshRequest;
    volcanoRefreshRequest = fetchVolcanoXmlList()
      .then((nextData) => {
        volcanoData = nextData;
        volcanoLoadedAt = Date.now();
        return nextData;
      })
      .catch((error) => {
        console.warn("[MeteoScope] volcano XML refresh failed", error);
        if (!volcanoData && activeTab === "earthquake" && earthquakeContentMode === "volcano") {
          renderLeftPanelState(TABS.find((item) => item.id === "earthquake"), {
            status: "error",
            error,
            earthquakeContentMode
          });
        }
        return volcanoData;
      })
      .finally(() => { volcanoRefreshRequest = null; });
    return volcanoRefreshRequest;
  }

  async function refreshSelectedVolcanoLatestActivity(volcanoCode) {
    const code = String(volcanoCode ?? "").trim();
    if (!code || !volcanoData?.reports?.length) return;
    if (volcanoLatestActivityRequests.has(code)) return volcanoLatestActivityRequests.get(code);

    const selectedReport = volcanoData.reports.find((report) =>
      String(report?.volcanoCode ?? report?.code ?? "") === code
    );
    const baselineReport = selectedReport?.relatedReports?.find((report) => report.bulletinCode === "CURRENT")
      ?? selectedReport;
    if (!baselineReport) return;

    const request = fetchVolcanoLatestActivityReports(
      [baselineReport],
      { codes: [code], activeOnly: false }
    ).then((latestReports) => {
      if (!latestReports.length || !volcanoData?.reports?.length) return;
      const rawReports = volcanoData.reports.flatMap((report) =>
        report.relatedReports?.length ? report.relatedReports : [report]
      ).filter((report) =>
        !(report.bulletinCode === "ACTIVITY_LATEST" && String(report.volcanoCode ?? "") === code)
      );
      const reports = consolidateVolcanoReports([...latestReports, ...rawReports]);
      volcanoData = {
        ...volcanoData,
        reports,
        mapVolcanoes: reports.filter((report) => Array.isArray(report.coordinates))
      };
      if (activeTab === "earthquake" && earthquakeContentMode === "volcano" && selectedVolcanoCode === code) {
        refreshVolcanoView();
      }
    }).catch((error) => {
      console.warn(`[MeteoScope] latest volcano activity unavailable for ${code}`, error);
    }).finally(() => {
      volcanoLatestActivityRequests.delete(code);
    });
    volcanoLatestActivityRequests.set(code, request);
    return request;
  }

  function selectEarthquakeView(view) {
    if (!["recent", "distribution"].includes(view)) return;
    if (view !== "distribution" && earthquakeDistributionAreaDrawing) {
      weatherMap?.cancelHypocenterAreaDrawing();
      earthquakeDistributionAreaDrawing = false;
    }
    earthquakeView = view;
    if (activeTab !== "earthquake") return;
    const tab = TABS.find((item) => item.id === "earthquake");
    updateCurrentView(tab, latestDataByTab.earthquake ?? {});
    if (view === "distribution" && earthquakeDistributionState.status === "idle") {
      void refreshEarthquakeDistribution();
    }
  }

  function updateEarthquakeDistributionFilters(filters = {}) {
    const requestedStartDate = filters.startDate ?? earthquakeDistributionFilters.startDate;
    const requestedEndDate = filters.endDate ?? earthquakeDistributionFilters.endDate;
    const normalizedRange = normalizeHypocenterDistributionRange(
      requestedStartDate,
      requestedEndDate
    );
    earthquakeDistributionFilters = {
      ...earthquakeDistributionFilters,
      dayOffset: Number.isInteger(Number(filters.dayOffset))
        ? Math.min(HYPOCENTER_DISTRIBUTION_MAX_DAY_OFFSET, Math.max(0, Number(filters.dayOffset)))
        : earthquakeDistributionFilters.dayOffset,
      minMagnitude: filters.minMagnitude ?? earthquakeDistributionFilters.minMagnitude,
      maxDepth: filters.maxDepth ?? earthquakeDistributionFilters.maxDepth,
      rangeEnabled: filters.rangeEnabled ?? earthquakeDistributionFilters.rangeEnabled,
      startDate: normalizedRange?.startDate ?? requestedStartDate,
      endDate: normalizedRange?.endDate ?? requestedEndDate,
      areaPolygon: filters.areaPolygon ?? earthquakeDistributionFilters.areaPolygon,
      includeRecentXml: earthquakeDistributionRecentXmlVisible
    };
    if (activeTab === "earthquake") {
      const tab = TABS.find((item) => item.id === "earthquake");
      updateCurrentView(tab, latestDataByTab.earthquake ?? {});
    }
    void refreshEarthquakeDistribution();
  }

  function selectEarthquakeDistributionRangeMode(enabled) {
    if (!enabled) {
      weatherMap?.clearHypocenterAreaSelection();
      earthquakeDistributionAreaDrawing = false;
      updateEarthquakeDistributionFilters({
        rangeEnabled: false,
        areaPolygon: []
      });
      return;
    }
    const availableDates = earthquakeDistributionState.data?.availableDates ?? [];
    const endDate = earthquakeDistributionFilters.endDate || availableDates[0] || "";
    const startDate = earthquakeDistributionFilters.startDate || availableDates[Math.min(6, availableDates.length - 1)] || endDate;
    earthquakeDistributionFilters = {
      ...earthquakeDistributionFilters,
      rangeEnabled: true,
      startDate,
      endDate
    };
    if (activeTab === "earthquake") {
      const tab = TABS.find((item) => item.id === "earthquake");
      updateCurrentView(tab, latestDataByTab.earthquake ?? {});
    }
  }

  function startEarthquakeDistributionAreaSearch() {
    if (activeTab !== "earthquake" || earthquakeView !== "distribution") return;
    if (earthquakeDistributionAreaDrawing) {
      weatherMap?.cancelHypocenterAreaDrawing();
      earthquakeDistributionAreaDrawing = false;
      updateCurrentView(TABS.find((item) => item.id === "earthquake"), latestDataByTab.earthquake ?? {});
      return;
    }
    earthquakeDistribution3DEnabled = false;
    const availableDates = earthquakeDistributionState.data?.availableDates ?? [];
    const endDate = earthquakeDistributionFilters.endDate || availableDates[0] || "";
    const startDate = earthquakeDistributionFilters.startDate || availableDates[Math.min(6, availableDates.length - 1)] || endDate;
    earthquakeDistributionFilters = {
      ...earthquakeDistributionFilters,
      rangeEnabled: true,
      startDate,
      endDate
    };
    const started = weatherMap?.startHypocenterAreaSelection((areaPolygon) => {
      earthquakeDistributionAreaDrawing = false;
      if (!Array.isArray(areaPolygon) || areaPolygon.length < 3) {
        updateCurrentView(TABS.find((item) => item.id === "earthquake"), latestDataByTab.earthquake ?? {});
        return;
      }
      updateEarthquakeDistributionFilters({ areaPolygon, rangeEnabled: true });
    });
    if (!started) return;
    earthquakeDistributionAreaDrawing = true;
    updateCurrentView(TABS.find((item) => item.id === "earthquake"), latestDataByTab.earthquake ?? {});
  }

  function clearEarthquakeDistributionAreaSearch() {
    weatherMap?.clearHypocenterAreaSelection();
    earthquakeDistributionAreaDrawing = false;
    updateEarthquakeDistributionFilters({ areaPolygon: [] });
  }

  function setEarthquakeDistributionRecentXmlVisible(visible) {
    earthquakeDistributionRecentXmlVisible = Boolean(visible);
    saveEarthquakeDistributionRecentXmlVisibility(
      earthquakeDistributionRecentXmlVisible
    );
    earthquakeDistributionFilters = {
      ...earthquakeDistributionFilters,
      dayOffset: 0,
      includeRecentXml: earthquakeDistributionRecentXmlVisible
    };
    earthquakeDistributionState = { status: "loading", data: null, error: "" };
    refreshSettingsModalView();
    if (activeTab === "earthquake") {
      const tab = TABS.find((item) => item.id === "earthquake");
      updateCurrentView(tab, latestDataByTab.earthquake ?? {});
    }
    void refreshEarthquakeDistribution({ force: true });
  }

  function selectEarthquakeDistributionPresentation(presentation) {
    earthquakeDistribution3DEnabled = presentation === "3d";
    if (activeTab !== "earthquake" || earthquakeView !== "distribution") return;
    const tab = TABS.find((item) => item.id === "earthquake");
    updateCurrentView(tab, latestDataByTab.earthquake ?? {});
  }

  async function refreshEarthquakeDistribution({ force = false } = {}) {
    const requestId = ++earthquakeDistributionRequestId;
    earthquakeDistributionState = {
      ...earthquakeDistributionState,
      status: earthquakeDistributionState.data ? "refreshing" : "loading",
      error: ""
    };
    if (activeTab === "earthquake" && earthquakeView === "distribution") {
      const tab = TABS.find((item) => item.id === "earthquake");
      updateCurrentView(tab, latestDataByTab.earthquake ?? {});
    }
    try {
      const data = await fetchHypocenterDistribution(
        earthquakeDistributionFilters,
        { force }
      );
      if (requestId !== earthquakeDistributionRequestId) return;
      earthquakeDistributionState = { status: "ok", data, error: "" };
    } catch (error) {
      if (requestId !== earthquakeDistributionRequestId) return;
      earthquakeDistributionState = {
        ...earthquakeDistributionState,
        status: "error",
        error: error?.message ?? "震央分布を取得できませんでした"
      };
    }
    if (activeTab === "earthquake" && earthquakeView === "distribution") {
      const tab = TABS.find((item) => item.id === "earthquake");
      updateCurrentView(tab, latestDataByTab.earthquake ?? {});
    }
  }

  function setEarthquakeMapLayerVisible(layerId, visible) {
    const isVisible = Boolean(visible);
    if (layerId === "activeFault") {
      earthquakeActiveFaultVisible = isVisible;
      weatherMap?.setActiveFaultVisible(isVisible);
    } else if (layerId === "plateBoundary") {
      earthquakePlateBoundaryVisible = isVisible;
      weatherMap?.setPlateBoundaryVisible(isVisible);
    } else if (layerId === "plateDepthContours") {
      earthquakePlateDepthContoursVisible = isVisible;
      weatherMap?.setPlateDepthContoursVisible(isVisible);
    } else if (layerId === "estimatedIntensity") {
      earthquakeEstimatedIntensityVisible = isVisible;
    } else {
      return;
    }
    saveEarthquakeLayerVisibility(layerId, isVisible);
    if (activeTab !== "earthquake") return;
    const tab = TABS.find((item) => item.id === "earthquake");
    updateCurrentView(tab, latestDataByTab.earthquake ?? {});
  }

  function focusSelectedTyphoon({ includeWorldForecast = false } = {}) {
    if (activeTyphoonForecastMode === "world") {
      if (!includeWorldForecast) return;
      const displayData = buildTyphoonDisplayData(latestDataByTab.typhoon ?? {});
      const worldCoordinates = buildWorldTyphoonFocusCoordinates(displayData);
      if (worldCoordinates.length) {
        weatherMap?.fitToCoordinates(worldCoordinates, {
          maxZoom: 6.2,
          duration: 900
        });
        return;
      }
    }
    const typhoons = latestDataByTab.typhoon?.typhoons ?? [];
    const selected = typhoons.find((typhoon) => String(typhoon.id) === String(activeTyphoonId)) ?? typhoons[0];
    const coordinates = buildTyphoonFocusCoordinates(selected);
    if (!coordinates.length) return;
    weatherMap?.fitToCoordinates(coordinates, {
      maxZoom: 6.9,
      duration: 900
    });
  }

  function focusSelectedEarthquake() {
    const earthquakes = latestDataByTab.earthquake?.earthquakes ?? [];
    const selected = earthquakes.find((earthquake) => String(earthquake.id) === String(activeEarthquakeId)) ?? earthquakes[0];
    const coordinates = buildEarthquakeFocusCoordinates(selected);
    if (!coordinates.length) return;
    if (coordinates.length > 1) {
      weatherMap?.fitToCoordinates(coordinates, {
        maxZoom: 7.4,
        duration: 850
      });
      return;
    }
    weatherMap?.flyToLocation(coordinates[0], {
      minZoom: 7,
      duration: 850
    });
  }

  function scheduleTabAutoFocus(tabId, generation) {
    if (tabId !== "typhoon" && tabId !== "earthquake") return;
    window.requestAnimationFrame(() => {
      if (generation !== tabAutoFocusGeneration || activeTab !== tabId) return;
      if (tabId === "typhoon") {
        focusSelectedTyphoon({ includeWorldForecast: true });
        return;
      }
      if (earthquakeContentMode === "earthquake") focusSelectedEarthquake();
    });
  }

  function focusAmedasStation(stationId) {
    const point = (latestDataByTab.amedas?.points ?? [])
      .find((item) => String(item.id) === String(stationId));
    if (!Array.isArray(point?.coordinates)) return;
    weatherMap?.flyToLocation(point.coordinates, {
      minZoom: 9.2,
      duration: 850
    });
  }

  function selectAmedasStation(stationId) {
    const point = (latestDataByTab.amedas?.points ?? [])
      .find((item) => String(item.id) === String(stationId));
    if (!point) return;

    selectedAmedasStationId = String(point.id);
    focusAmedasStation(point.id);
    void loadAmedasDailyChart(point, activeAmedasMetric, amedasDailyChartDayOffset);
    refreshAmedasPanel();
  }

  async function loadAmedasDailyChart(
    point,
    metricId,
    dayOffset = amedasDailyChartDayOffset,
    precipitationPeriod = activeAmedasPrecipitationPeriod
  ) {
    const requestId = ++amedasDailyChartRequestId;
    amedasDailyChart = {
      status: "loading",
      stationId: String(point.id),
      stationName: point.name,
      metricId,
      precipitationPeriod,
      dayOffset,
      data: null
    };
    refreshAmedasPanel();

    try {
      const data = await fetchAmedasDailySeries(
        point.id,
        latestDataByTab.amedas?.latestRawTime,
        metricId,
        dayOffset,
        precipitationPeriod
      );
      if (requestId !== amedasDailyChartRequestId) return;
      amedasDailyChart = {
        status: "ok",
        stationId: String(point.id),
        stationName: point.name,
        metricId,
        precipitationPeriod,
        dayOffset,
        data
      };
    } catch (error) {
      if (requestId !== amedasDailyChartRequestId) return;
      console.warn("[MeteoScope] AMeDAS daily series load failed", error);
      amedasDailyChart = {
        status: "error",
        stationId: String(point.id),
        stationName: point.name,
        metricId,
        precipitationPeriod,
        dayOffset,
        data: null
      };
    }
    refreshAmedasPanel();
  }

  function updateCurrentView(tab, data, options = {}) {
    const displayData = buildDisplayData(tab, data);
    updateWorldTyphoonTargetPicker({
      visible: tab.id === "typhoon" && Boolean(displayData.worldForecastMode),
      options: displayData.worldForecastTargets,
      selectedKeys: displayData.selectedWorldForecastTargetKeys
    });
    syncTyphoonRadarOverlayButton(tab.id === "typhoon" ? displayData : null);
    if (tab.id === "radar") {
      displayData.weatherChartEnabled = weatherChartEnabled;
      displayData.weatherChartStatus = weatherChartStatus;
      displayData.weatherChart = weatherChartData;
      displayData.weatherDistributionMode = weatherDistributionMode;
      displayData.weatherDistributionStatus = weatherDistributionStatus;
      displayData.weatherDistribution = getActiveWeatherDistribution();
      displayData.lightningEnabled = lightningEnabled;
      displayData.lightningStatus = lightningStatus;
      displayData.lightning = lightningData;
    }
    if (tab.id === "radar") ensureLocationRadarTimeline(displayData);
    const panelState = {
      status: "ok",
      data: displayData,
      amedasMetric: activeAmedasMetric,
      amedasPrecipitationPeriod: activeAmedasPrecipitationPeriod,
      selectedAmedasStationId,
      amedasDailyChart,
      amedasDailyChartDayOffset,
      earlyAccessEnabled,
      warningView: activeWarningView,
      activeKikikuruLayer,
      radarPlaying: Boolean(radarPlayTimer),
      currentLocation: currentLocationInfo,
      myAreas,
      locationInsights: buildLocationInsights(tab.id, displayData),
      earthquakeContentMode,
      selectedVolcanoCode,
      selectedVolcanoBulletinId,
      selectedVolcanoAshForecastIndex,
      earthquakeActiveFaultVisible,
      earthquakePlateBoundaryVisible,
      earthquakePlateDepthContoursVisible,
      weatherChartEnabled,
      weatherChartStatus,
      weatherChart: weatherChartData,
      weatherDistributionMode,
      weatherDistributionStatus,
      weatherDistribution: getActiveWeatherDistribution(),
      weatherDistributionPlaying: Boolean(weatherDistributionPlayTimer),
      lightningEnabled,
      lightningStatus,
      lightning: lightningData,
      lightningPlaying: Boolean(lightningPlayTimer)
    };
    if (!options.skipMap) {
      if (options.immediateMap) {
        invalidateScheduledMapRender();
        weatherMap?.renderData(tab.id, displayData);
      } else {
        scheduleMapRender(tab.id, displayData);
      }
    }
    if (options.deferPanel) {
      schedulePanelRender(tab, panelState);
    } else {
      invalidateScheduledPanelRender();
      renderLeftPanelState(tab, panelState);
    }
  }

  function invalidateScheduledMapRender() {
    mapRenderGeneration += 1;
    if (!scheduledMapRenderFrame) return;
    window.cancelAnimationFrame(scheduledMapRenderFrame);
    scheduledMapRenderFrame = 0;
  }

  function scheduleMapRender(tabId, displayData) {
    const generation = ++mapRenderGeneration;
    if (scheduledMapRenderFrame) window.cancelAnimationFrame(scheduledMapRenderFrame);
    scheduledMapRenderFrame = window.requestAnimationFrame(() => {
      scheduledMapRenderFrame = 0;
      if (generation !== mapRenderGeneration || activeTab !== tabId) return;
      weatherMap?.renderData(tabId, displayData);
    });
  }

  function invalidateScheduledPanelRender() {
    panelRenderGeneration += 1;
    if (scheduledPanelRenderFrame) {
      window.cancelAnimationFrame(scheduledPanelRenderFrame);
      scheduledPanelRenderFrame = 0;
    }
    if (scheduledPanelRenderNextFrame) {
      window.cancelAnimationFrame(scheduledPanelRenderNextFrame);
      scheduledPanelRenderNextFrame = 0;
    }
  }

  function schedulePanelRender(tab, panelState) {
    const generation = ++panelRenderGeneration;
    if (scheduledPanelRenderFrame) window.cancelAnimationFrame(scheduledPanelRenderFrame);
    if (scheduledPanelRenderNextFrame) window.cancelAnimationFrame(scheduledPanelRenderNextFrame);
    scheduledPanelRenderFrame = window.requestAnimationFrame(() => {
      scheduledPanelRenderFrame = 0;
      scheduledPanelRenderNextFrame = window.requestAnimationFrame(() => {
        scheduledPanelRenderNextFrame = 0;
        if (generation !== panelRenderGeneration || activeTab !== tab.id) return;
        renderLeftPanelState(tab, panelState);
      });
    });
  }

  function buildDisplayData(tab, data = {}) {
    if (tab.id === "amedas") {
      return {
        ...applyAmedasPrecipitationPeriod(data, activeAmedasPrecipitationPeriod),
        activeMetric: activeAmedasMetric
      };
    }
    if (tab.id === "warnings") return { ...data, activeWarningView, activeKikikuruLayer, currentKikikuruStatus };
    if (tab.id === "typhoon") return buildTyphoonDisplayData(data);
    if (tab.id === "earthquake") {
      if (earthquakeContentMode === "volcano") {
        return {
          ...(volcanoData ?? data ?? {}),
          earthquakeContentMode: "volcano",
          earthquakeView: "volcano",
          selectedVolcanoCode,
          selectedVolcanoAshForecastIndex
        };
      }
      return { ...buildEarthquakeDisplayData(data), earthquakeContentMode: "earthquake" };
    }
    if (tab.id !== "radar") return data;

    const frames = data.frames ?? [];
    const activeFrameIndex = clampRadarIndex(data.activeFrameIndex ?? 0, frames);
    const activeFrame = frames[activeFrameIndex] ?? null;
    const distribution = getActiveWeatherDistribution();
    const distributionFrames = distribution?.frames ?? [];
    const distributionFrameIndex = clampRadarIndex(distribution?.activeFrameIndex ?? 0, distributionFrames);
    const distributionFrame = distributionFrames[distributionFrameIndex] ?? null;
    const lightningFrames = lightningData?.frames ?? [];
    const lightningFrameIndex = clampRadarIndex(lightningData?.activeFrameIndex ?? 0, lightningFrames);
    const lightningFrame = lightningFrames[lightningFrameIndex] ?? null;
    return {
      ...data,
      activeFrameIndex,
      activeFrame,
      latestTime: weatherDistributionMode
        ? (distributionFrame?.label ?? data.latestTime)
        : (lightningEnabled
        ? (lightningFrame?.label ?? data.latestTime)
        : (activeFrame?.label ?? data.latestTime)),
      latestRawTime: weatherDistributionMode
        ? (distributionFrame?.validtime ?? data.latestRawTime)
        : (lightningEnabled
        ? (lightningFrame?.validtime ?? data.latestRawTime)
        : (activeFrame?.validtime ?? data.latestRawTime)),
      radarTileUrl: weatherChartEnabled || lightningEnabled || weatherDistributionMode
        ? null
        : (activeFrame?.radarTileUrl ?? data.radarTileUrl),
      weatherDistributionMode,
      weatherDistributionStatus,
      weatherDistribution: distribution,
      weatherDistributionTileUrl: weatherDistributionMode ? distributionFrame?.distributionTileUrl ?? null : null,
      lightningEnabled,
      lightningStatus,
      lightning: lightningData,
      lightningTileUrl: lightningEnabled ? lightningFrame?.lightningTileUrl ?? null : null,
      lightningObservationUrl: lightningEnabled ? lightningFrame?.lightningObservationUrl ?? null : null
    };
  }

  function buildTyphoonDisplayData(data = {}, { interpolateWorldTime = false } = {}) {
    const typhoons = (data.typhoons ?? []).map(localizeTyphoonForDisplay);
    let selected = null;
    if (!typhoons.length) {
      activeTyphoonId = "";
    } else {
      selected = typhoons.find((typhoon) => String(typhoon.id) === String(activeTyphoonId))
        ?? typhoons[0];
      activeTyphoonId = String(selected.id ?? "");
    }

    const typhoonRadarOverlay = buildTyphoonRadarOverlayState(selected);
    const base = {
      ...data,
      typhoons,
      forecastMode: activeTyphoonForecastMode,
      selectedTyphoonId: activeTyphoonId,
      selectedTyphoon: selected,
      details: selected?.details ?? data.details,
      latestTime: selected?.updatedAt ?? data.latestTime,
      updatedAt: selected?.updatedAt ?? data.updatedAt,
      typhoonRadarOverlay,
      radarTileUrl: typhoonRadarOverlay.visible
        ? typhoonRadarOverlay.radarTileUrl
        : null
    };
    if (activeTyphoonForecastMode !== "world") return base;
    const worldForecastModelStates = worldTyphoonModelIds.map((modelId) => {
      const forecastState = worldTyphoonForecasts[modelId];
      return {
        id: modelId,
        enabled: Boolean(activeWorldTyphoonModels[modelId]),
        modelInfo: getWorldTyphoonModel(modelId),
        status: forecastState.status,
        error: forecastState.error,
        source: forecastState.data?.source ?? null,
        baseTime: forecastState.data?.forecastBaseTime ?? "",
        systems: forecastState.data?.systems ?? [],
        candidates: selectWorldTyphoonGenesisSystems(forecastState.data),
        system: selectWorldTyphoonSystem(forecastState.data, selected)
      };
    });
    const worldForecastTargets = worldForecastModelStates
      .filter((layer) => layer.enabled)
      .flatMap((layer) => {
        const candidateIds = new Set(layer.candidates.map((candidate) => String(candidate.id)));
        return layer.systems
          .filter((system) => system.kind !== "genesis" || candidateIds.has(String(system.id)))
          .map((system) => ({
            key: `${layer.id}::${system.id}`,
            modelId: layer.id,
            modelLabel: layer.modelInfo?.label ?? layer.id,
            modelColor: layer.modelInfo?.color ?? "#56b7f2",
            systemId: String(system.id),
            name: formatWorldTyphoonSystemLabel(system),
            kind: system.kind,
            memberCount: system.memberCount
          }));
      });
    const availableWorldForecastTargetKeys = new Set(worldForecastTargets.map((target) => target.key));
    activeWorldTyphoonTargetKeys = activeWorldTyphoonTargetKeys.filter((key) => (
      availableWorldForecastTargetKeys.has(key)
    ));
    const selectedWorldForecastTargets = worldForecastTargets.filter((target) => (
      activeWorldTyphoonTargetKeys.includes(target.key)
    ));
    const selectedWorldForecastTargetKeys = new Set(activeWorldTyphoonTargetKeys);
    const selectedWorldForecastModelIds = new Set(selectedWorldForecastTargets.map((target) => target.modelId));
    const enabledWorldForecastLayers = worldForecastModelStates
      .filter((layer) => (
        layer.enabled
        && (!selectedWorldForecastTargets.length || selectedWorldForecastModelIds.has(layer.id))
      ))
      .map((layer) => {
        const systems = selectedWorldForecastTargets.length
          ? layer.systems.filter((system) => selectedWorldForecastTargetKeys.has(`${layer.id}::${system.id}`))
          : layer.systems;
        return {
          ...layer,
          systems,
          timelineSystems: systems,
          system: selectedWorldForecastTargets.length ? systems[0] ?? null : layer.system
        };
      });
    const worldForecastTimes = buildWorldTyphoonTimeline(enabledWorldForecastLayers);
    const requestedForecastTime = Date.parse(activeWorldTyphoonForecastTime || "") || Date.now();
    const nearestWorldForecastTime = worldForecastTimes.reduce((nearest, time) => (
      Math.abs(Date.parse(time) - requestedForecastTime)
        < Math.abs(Date.parse(nearest) - requestedForecastTime)
        ? time
        : nearest
    ), worldForecastTimes[0] ?? "");
    const earliestWorldForecastTime = Date.parse(worldForecastTimes[0] ?? "");
    const latestWorldForecastTime = Date.parse(worldForecastTimes.at(-1) ?? "");
    const canInterpolateWorldTime = interpolateWorldTime
      && Number.isFinite(requestedForecastTime)
      && requestedForecastTime >= earliestWorldForecastTime
      && requestedForecastTime <= latestWorldForecastTime;
    const worldForecastTime = canInterpolateWorldTime
      ? new Date(requestedForecastTime).toISOString()
      : nearestWorldForecastTime;
    if (!interpolateWorldTime && worldForecastTime) {
      activeWorldTyphoonForecastTime = worldForecastTime;
    }
    const worldForecastLayers = enabledWorldForecastLayers.map((layer) => ({
      ...layer,
      forecastPositions: (layer.timelineSystems ?? []).flatMap((system) => {
        return selectWorldTyphoonForecastPositions(system, worldForecastTime)
          .map((forecastPosition) => ({ system, ...forecastPosition }));
      })
    }));
    const readyLayers = worldForecastLayers.filter((layer) => layer.status === "ok");
    const firstLayer = worldForecastLayers[0] ?? null;
    const worldForecastStatus = worldForecastLayers.length === 0
      ? "idle"
      : (worldForecastLayers.some((layer) => ["idle", "loading"].includes(layer.status))
        ? "loading"
        : (readyLayers.length > 0 ? "ok" : "error"));

    return {
      ...base,
      hasTyphoon: readyLayers.some((layer) => Boolean(layer.system)),
      worldForecastMode: true,
      worldForecastModelStates,
      worldForecastTargets,
      selectedWorldForecastTargetKeys: activeWorldTyphoonTargetKeys,
      worldForecastLayers,
      worldForecastTimes,
      worldForecastTime,
      worldForecastStatus,
      worldForecastError: worldForecastLayers
        .filter((layer) => layer.status === "error" && layer.error)
        .map((layer) => layer.error)
        .join(" / "),
      worldForecastModel: firstLayer?.id ?? "",
      worldForecastModelInfo: firstLayer?.modelInfo ?? null,
      worldForecastSource: firstLayer?.source ?? null,
      worldForecastBaseTime: firstLayer?.baseTime ?? "",
      worldForecastCandidates: firstLayer?.candidates ?? [],
      worldForecastSystem: firstLayer?.system ?? null
    };
  }

  function localizeTyphoonForDisplay(typhoon) {
    if (!typhoon || getCurrentLanguage() !== "en" || !typhoon.nameEn) return typhoon;
    return {
      ...typhoon,
      name: typhoon.nameEn,
      details: {
        ...typhoon.details,
        name: typhoon.details?.nameEn ?? typhoon.nameEn
      }
    };
  }

  function buildEarthquakeDisplayData(data = {}) {
    const distribution = earthquakeDistributionState.data;
    const earthquakeMapView = earthquakeSummaryPage === "earthquake"
      ? earthquakeView
      : "recent";
    const distributionData = {
      earthquakeView,
      earthquakeMapView,
      distribution3DEnabled: earthquakeDistribution3DEnabled,
      distributionFilters: earthquakeDistributionFilters,
      distributionStatus: earthquakeDistributionState.status,
      distributionError: earthquakeDistributionState.error,
      distribution,
      distributionAreaDrawing: earthquakeDistributionAreaDrawing,
      distributionItems: distribution?.items ?? []
    };
    const tideData = {
      tideObservation,
      selectedTideStationCode: tideObservation.station?.code ?? "",
      tideStationsVisible: earthquakeSummaryPage === "tide"
    };
    const earthquakes = data.earthquakes ?? [];
    if (!earthquakes.length) {
      activeEarthquakeId = "";
      return {
        ...data,
        ...distributionData,
        ...tideData,
        earthquakeHistoryVisibleCount,
        earthquakeHistoryLoadingMore,
        earthquakeHistoryLoadMoreError,
        activeFaultVisible: earthquakeActiveFaultVisible,
        activeFaultSource: getEffectiveActiveFaultSource(),
        plateBoundaryVisible: earthquakePlateBoundaryVisible,
        plateDepthContoursVisible: earthquakePlateDepthContoursVisible,
        estimatedIntensityVisible: earthquakeEstimatedIntensityVisible
      };
    }

    const selected = earthquakes.find((earthquake) => String(earthquake.id) === String(activeEarthquakeId))
      ?? earthquakes[0];
    activeEarthquakeId = String(selected.id ?? "");

    return {
      ...data,
      ...distributionData,
      ...tideData,
      activeFaultVisible: earthquakeActiveFaultVisible,
      activeFaultSource: getEffectiveActiveFaultSource(),
      plateBoundaryVisible: earthquakePlateBoundaryVisible,
      plateDepthContoursVisible: earthquakePlateDepthContoursVisible,
      estimatedIntensityVisible: earthquakeEstimatedIntensityVisible,
      selectedEarthquakeId: activeEarthquakeId,
      collapsedEarthquakeId,
      earthquakeHistoryVisibleCount,
      earthquakeHistoryLoadingMore,
      earthquakeHistoryLoadMoreError,
      selectedEarthquake: selected,
      latestTime: selected.reportTime ?? data.latestTime,
      updatedAt: selected.reportTime ?? data.updatedAt
    };
  }

  function buildLocationInsights(tabId, data) {
    if (tabId === "radar") {
      return {
        type: "radar",
        currentLocation: getCurrentLocationTarget(),
        timeline: locationRadarTimeline
      };
    }

    if (tabId === "warnings") {
      if (!["status", "early"].includes(activeWarningView)) return null;
      const warningData = data ?? latestDataByTab.warnings ?? {};
      return {
        type: "myAreas",
        warningView: activeWarningView,
        loading: activeWarningView === "early" && !warningData.earlyDetailsLoaded,
        areas: activeWarningView === "early"
          ? buildMyAreaEarlyWarningSummaries(myAreas, warningData)
          : buildMyAreaWarningSummaries(myAreas, warningData)
      };
    }

    return null;
  }

  function getCurrentLocationTarget() {
    if (currentLocationInfo?.status !== "found" || !Array.isArray(currentLocationInfo.coordinates)) return null;
    return {
      id: "current-location",
      kind: "current",
      label: currentLocationInfo.areaName ? `現在地 (${currentLocationInfo.areaName})` : "現在地",
      areaCode: currentLocationInfo.areaCode,
      areaName: currentLocationInfo.areaName,
      prefecture: currentLocationInfo.prefecture,
      coordinates: currentLocationInfo.coordinates
    };
  }

  function ensureLocationRadarTimeline(radarData) {
    const current = getCurrentLocationTarget();
    if (!current) {
      locationRadarTimeline = { status: "idle", points: [] };
      return;
    }

    const frames = radarData?.frames ?? [];
    if (!frames.length) {
      locationRadarTimeline = {
        status: "unavailable",
        points: [],
        message: "雨雲時系列を表示できません。"
      };
      return;
    }

    const sourceKey = [
      current.coordinates.join(","),
      frames.map((frame) => frame.validtime ?? frame.label ?? "").join("|")
    ].join("::");
    if (locationRadarTimeline.sourceKey === sourceKey && locationRadarTimeline.status !== "idle") return;

    const requestId = ++locationRadarRequestId;
    locationRadarTimeline = {
      status: "loading",
      points: [],
      sourceKey,
      location: current,
      message: "現在地直下の雨雲を読み取っています。"
    };

    buildLocationRadarTimeline(current.coordinates, radarData)
      .then((timeline) => {
        if (requestId !== locationRadarRequestId) return;
        locationRadarTimeline = {
          ...timeline,
          sourceKey,
          location: current
        };
        if (activeTab === "radar") refreshActivePanel();
      })
      .catch((error) => {
        if (requestId !== locationRadarRequestId) return;
        console.warn("[MeteoScope] current location radar timeline failed", error);
        locationRadarTimeline = {
          status: "unavailable",
          points: [],
          sourceKey,
          location: current,
          message: "現在地直下の雨雲時系列を取得できませんでした。"
        };
        if (activeTab === "radar") refreshActivePanel();
      });
  }

  function selectRadarFrame(index) {
    if (activeTab !== "radar") return;
    const radarData = latestDataByTab.radar;
    if (!radarData?.frames?.length) return;
    radarData.activeFrameIndex = clampRadarIndex(index, radarData.frames);
    const tab = TABS.find((item) => item.id === "radar");
    updateCurrentView(tab, radarData);
  }

  function getActiveWeatherDistribution() {
    return weatherDistributionMode
      ? weatherDistributionDataByMode.get(weatherDistributionMode) ?? null
      : null;
  }

  function setWeatherDistributionFrame(index, { refreshPanel = true } = {}) {
    const distribution = getActiveWeatherDistribution();
    if (activeTab !== "radar" || !distribution?.frames?.length) return;
    const next = activateWeatherDistributionFrame(distribution, index);
    weatherDistributionDataByMode.set(weatherDistributionMode, next);
    weatherDistributionStatus = "ok";
    if (refreshPanel) {
      refreshRadarPanel();
      return;
    }
    refreshWeatherDistributionMapLayer();
  }

  function selectWeatherDistributionFrame(index) {
    setWeatherDistributionFrame(index, { refreshPanel: true });
  }

  function stepWeatherDistributionFrame(delta) {
    const distribution = getActiveWeatherDistribution();
    if (!distribution?.frames?.length) return;
    selectWeatherDistributionFrame((distribution.activeFrameIndex ?? 0) + delta);
  }

  function goLatestWeatherDistributionFrame() {
    const distribution = getActiveWeatherDistribution();
    if (!distribution?.frames?.length) return;
    stopWeatherDistributionPlayback();
    weatherDistributionDataByMode.set(
      weatherDistributionMode,
      activateNearestWeatherDistributionFrame(distribution)
    );
    refreshRadarPanel();
  }

  function stepRadarFrame(delta) {
    const radarData = latestDataByTab.radar;
    if (!radarData?.frames?.length) return;
    selectRadarFrame((radarData.activeFrameIndex ?? 0) + delta);
  }

  function goLatestRadarObservation() {
    const radarData = latestDataByTab.radar;
    if (!radarData?.frames?.length) return;
    stopRadarPlayback();
    const latestObservationIndex = findLatestRadarObservationIndex(radarData.frames);
    selectRadarFrame(latestObservationIndex >= 0 ? latestObservationIndex : radarData.frames.length - 1);
  }

  function selectLightningFrame(index) {
    if (activeTab !== "radar" || !lightningData?.frames?.length) return;
    lightningData.activeFrameIndex = clampRadarIndex(index, lightningData.frames);
    lightningData.activeFrame = lightningData.frames[lightningData.activeFrameIndex] ?? null;
    lightningData.lightningTileUrl = lightningData.activeFrame?.lightningTileUrl ?? null;
    lightningData.lightningObservationUrl = lightningData.activeFrame?.lightningObservationUrl ?? null;
    lightningData.latestTime = lightningData.activeFrame?.label ?? lightningData.latestTime;
    lightningData.latestRawTime = lightningData.activeFrame?.validtime ?? lightningData.latestRawTime;
    refreshRadarPanel();
  }

  function stepLightningFrame(delta) {
    if (!lightningData?.frames?.length) return;
    selectLightningFrame((lightningData.activeFrameIndex ?? 0) + delta);
  }

  function goLatestLightningObservation() {
    if (!lightningData?.frames?.length) return;
    stopLightningPlayback();
    const latestIndex = findLatestLightningObservationIndex(lightningData.frames);
    selectLightningFrame(latestIndex >= 0 ? latestIndex : lightningData.frames.length - 1);
  }

  function selectActiveRadarTimelineFrame(index) {
    if (weatherDistributionMode) selectWeatherDistributionFrame(index);
    else if (lightningEnabled) selectLightningFrame(index);
    else selectRadarFrame(index);
  }

  function stepActiveRadarTimeline(delta) {
    if (weatherDistributionMode) stepWeatherDistributionFrame(delta);
    else if (lightningEnabled) stepLightningFrame(delta);
    else stepRadarFrame(delta);
  }

  function goLatestActiveRadarTimeline() {
    if (weatherDistributionMode) goLatestWeatherDistributionFrame();
    else if (lightningEnabled) goLatestLightningObservation();
    else goLatestRadarObservation();
  }

  function refreshWeatherChartMapLayer() {
    if (activeTab !== "radar" || !latestDataByTab.radar) return;
    const tab = TABS.find((item) => item.id === "radar");
    if (!tab) return;
    const displayData = buildDisplayData(tab, latestDataByTab.radar);
    displayData.weatherChartEnabled = weatherChartEnabled;
    displayData.weatherChartStatus = weatherChartStatus;
    displayData.weatherChart = weatherChartData;
    weatherMap?.renderData(tab.id, displayData);
  }

  function refreshWeatherDistributionMapLayer() {
    if (activeTab !== "radar" || !latestDataByTab.radar) return;
    const tab = TABS.find((item) => item.id === "radar");
    if (!tab) return;
    const displayData = buildDisplayData(tab, latestDataByTab.radar);
    displayData.weatherDistributionMode = weatherDistributionMode;
    displayData.weatherDistributionStatus = weatherDistributionStatus;
    displayData.weatherDistribution = getActiveWeatherDistribution();
    weatherMap?.renderData(tab.id, displayData);
  }

  function setWeatherChartFrame(index, { refreshPanel = true } = {}) {
    if (activeTab !== "radar" || !weatherChartData?.frames?.length) return;
    activeWeatherChartFrameIndex = clampRadarIndex(index, weatherChartData.frames);
    weatherChartData = activateWeatherChartFrame(weatherChartData, activeWeatherChartFrameIndex);
    weatherChartStatus = "ok";
    if (refreshPanel) {
      refreshRadarPanel();
      return;
    }
    refreshWeatherChartMapLayer();
  }

  function previewWeatherChartFrame(index) {
    setWeatherChartFrame(index, { refreshPanel: false });
  }

  function selectWeatherChartFrame(index) {
    setWeatherChartFrame(index, { refreshPanel: true });
  }

  function stepWeatherChartFrame(delta) {
    if (!weatherChartData?.frames?.length) return;
    selectWeatherChartFrame((weatherChartData.activeFrameIndex ?? activeWeatherChartFrameIndex) + delta);
  }

  function goLatestWeatherChartFrame() {
    if (!weatherChartData?.frames?.length) return;
    stopWeatherChartPlayback();
    selectWeatherChartFrame(findLatestWeatherChartFrameIndex(weatherChartData.frames));
  }

  function startRadarPlayback() {
    if (radarPlayTimer || weatherChartEnabled || lightningEnabled || weatherDistributionMode || !latestDataByTab.radar?.frames?.length) return;
    radarPlayTimer = window.setInterval(() => {
      const radarData = latestDataByTab.radar;
      if (!radarData?.frames?.length || activeTab !== "radar" || weatherChartEnabled || lightningEnabled || weatherDistributionMode) {
        stopRadarPlayback();
        return;
      }
      const nextIndex = ((radarData.activeFrameIndex ?? 0) + 1) % radarData.frames.length;
      selectRadarFrame(nextIndex);
    }, 850);
    refreshRadarPanel();
  }

  function toggleRadarPlayback() {
    if (!radarPlayTimer) {
      startRadarPlayback();
      return;
    }
    stopRadarPlayback();
    refreshRadarPanel();
  }

  function stopRadarPlayback() {
    if (!radarPlayTimer) return;
    window.clearInterval(radarPlayTimer);
    radarPlayTimer = null;
  }

  function startLightningPlayback() {
    if (lightningPlayTimer || !lightningEnabled || !lightningData?.frames?.length) return;
    lightningPlayTimer = window.setInterval(() => {
      if (!lightningEnabled || !lightningData?.frames?.length || activeTab !== "radar") {
        stopLightningPlayback();
        return;
      }
      selectLightningFrame(((lightningData.activeFrameIndex ?? 0) + 1) % lightningData.frames.length);
    }, 850);
    refreshRadarPanel();
  }

  function toggleActiveRadarPlayback() {
    if (weatherDistributionMode) {
      if (weatherDistributionPlayTimer) {
        stopWeatherDistributionPlayback();
        refreshRadarPanel();
      } else {
        startWeatherDistributionPlayback();
      }
      return;
    }
    if (lightningEnabled) {
      if (lightningPlayTimer) {
        stopLightningPlayback();
        refreshRadarPanel();
      } else {
        startLightningPlayback();
      }
      return;
    }
    toggleRadarPlayback();
  }

  function stopLightningPlayback() {
    if (!lightningPlayTimer) return;
    window.clearInterval(lightningPlayTimer);
    lightningPlayTimer = null;
  }

  function stopLightningPlaybackAndRefresh() {
    stopLightningPlayback();
    refreshRadarPanel();
  }

  function startWeatherDistributionPlayback() {
    const distribution = getActiveWeatherDistribution();
    if (weatherDistributionPlayTimer || !weatherDistributionMode || !distribution?.frames?.length) return;
    weatherDistributionPlayTimer = window.setInterval(() => {
      const current = getActiveWeatherDistribution();
      if (!weatherDistributionMode || !current?.frames?.length || activeTab !== "radar") {
        stopWeatherDistributionPlayback();
        return;
      }
      selectWeatherDistributionFrame(((current.activeFrameIndex ?? 0) + 1) % current.frames.length);
    }, 850);
    refreshRadarPanel();
  }

  function stopWeatherDistributionPlayback() {
    if (!weatherDistributionPlayTimer) return;
    window.clearInterval(weatherDistributionPlayTimer);
    weatherDistributionPlayTimer = null;
  }

  function startWeatherChartPlayback() {
    if (weatherChartPlayTimer || !weatherChartEnabled || !weatherChartData?.frames?.length) return;
    weatherChartPlayTimer = window.setInterval(() => {
      if (!weatherChartEnabled || !weatherChartData?.frames?.length || activeTab !== "radar") {
        stopWeatherChartPlayback();
        return;
      }
      const currentIndex = weatherChartData.activeFrameIndex ?? activeWeatherChartFrameIndex;
      selectWeatherChartFrame((currentIndex + 1) % weatherChartData.frames.length);
    }, 850);
  }

  function stopWeatherChartPlayback() {
    if (!weatherChartPlayTimer) return;
    window.clearInterval(weatherChartPlayTimer);
    weatherChartPlayTimer = null;
  }

  function stopRadarPlaybackAndRefresh() {
    stopRadarPlayback();
    refreshRadarPanel();
  }

  function refreshRadarPanel() {
    if (activeTab !== "radar" || !latestDataByTab.radar) return;
    const tab = TABS.find((item) => item.id === "radar");
    updateCurrentView(tab, latestDataByTab.radar);
  }

  async function selectRadarOverlay(overlayId) {
    if (!["radar", "weather-distribution", "temperature-distribution", "snowfall-distribution", "weather-chart", "lightning"].includes(overlayId)) return;
    weatherChartEnabled = overlayId === "weather-chart";
    lightningEnabled = overlayId === "lightning";
    weatherDistributionMode = overlayId === "weather-distribution"
      ? "weather"
      : (overlayId === "temperature-distribution"
        ? "temperature"
        : (overlayId === "snowfall-distribution" ? "snowfall" : null));
    if (weatherChartEnabled) {
      stopRadarPlayback();
      stopLightningPlayback();
      stopWeatherDistributionPlayback();
    } else if (lightningEnabled) {
      stopRadarPlayback();
      stopWeatherChartPlayback();
      stopWeatherDistributionPlayback();
    } else if (weatherDistributionMode) {
      stopRadarPlayback();
      stopWeatherChartPlayback();
      stopLightningPlayback();
    } else {
      stopWeatherChartPlayback();
      stopLightningPlayback();
      stopWeatherDistributionPlayback();
    }

    if (overlayId === "radar") {
      refreshRadarPanel();
      return;
    }

    if (overlayId === "lightning") {
      if (hasFreshLightningData()) {
        lightningStatus = "ok";
        refreshRadarPanel();
        return;
      }
      lightningStatus = "loading";
      refreshRadarPanel();
      try {
        await refreshLightningData();
        lightningStatus = "ok";
      } catch (error) {
        console.warn("[MeteoScope] lightning nowcast load failed", error);
        lightningStatus = "error";
      }
      refreshRadarPanel();
      return;
    }

    if (weatherDistributionMode) {
      const mode = weatherDistributionMode;
      if (hasFreshWeatherDistributionData(mode)) {
        weatherDistributionDataByMode.set(
          mode,
          activateNearestWeatherDistributionFrame(weatherDistributionDataByMode.get(mode))
        );
        weatherDistributionStatus = "ok";
        refreshRadarPanel();
        return;
      }
      weatherDistributionStatus = "loading";
      refreshRadarPanel();
      try {
        await refreshWeatherDistributionData(mode);
        if (weatherDistributionMode === mode) weatherDistributionStatus = "ok";
      } catch (error) {
        console.warn(`[MeteoScope] ${getWeatherDistributionLabel(mode)} load failed`, error);
        if (weatherDistributionMode === mode) weatherDistributionStatus = "error";
      }
      refreshRadarPanel();
      return;
    }

    if (hasFreshWeatherChartData()) {
      weatherChartStatus = "ok";
      refreshRadarPanel();
      return;
    }
    weatherChartStatus = "loading";
    refreshRadarPanel();
    try {
      await refreshWeatherChartData();
      weatherChartStatus = "ok";
    } catch (error) {
      console.warn("[MeteoScope] weather chart load failed", error);
      weatherChartStatus = "error";
    }
    refreshRadarPanel();
  }

  async function refreshLightningData() {
    if (hasFreshLightningData()) return lightningData;
    if (lightningRequest) return lightningRequest;

    const requestId = ++lightningRequestId;
    const request = fetchLightningTimes()
      .then((data) => {
        if (requestId !== lightningRequestId) return lightningData;
        lightningData = data;
        lightningLoadedAt = Date.now();
        return lightningData;
      })
      .finally(() => {
        if (requestId === lightningRequestId) lightningRequest = null;
      });
    lightningRequest = request;
    return request;
  }

  async function refreshActiveLightning({ force = false } = {}) {
    if (document.hidden || activeTab !== "radar" || !lightningEnabled) return;
    if (force) lightningLoadedAt = 0;

    try {
      await refreshLightningData();
      if (activeTab !== "radar" || !lightningEnabled) return;
      lightningStatus = "ok";
      refreshRadarPanel();
    } catch (error) {
      console.warn("[MeteoScope] lightning one-minute refresh failed", error);
      if (activeTab !== "radar" || !lightningEnabled) return;
      lightningStatus = "error";
      refreshRadarPanel();
    }
  }

  function hasFreshLightningData() {
    return Boolean(
      lightningData?.frames?.length &&
      lightningLoadedAt > 0 &&
      Date.now() - lightningLoadedAt < LIGHTNING_DATA_TTL_MS
    );
  }

  async function refreshWeatherDistributionData(mode) {
    if (!isWeatherDistributionMode(mode)) return null;
    if (hasFreshWeatherDistributionData(mode)) return weatherDistributionDataByMode.get(mode);
    const pending = weatherDistributionRequestsByMode.get(mode);
    if (pending) return pending;

    const request = fetchWeatherDistribution(mode)
      .then((data) => {
        weatherDistributionDataByMode.set(mode, data);
        weatherDistributionLoadedAtByMode.set(mode, Date.now());
        return data;
      })
      .finally(() => {
        weatherDistributionRequestsByMode.delete(mode);
      });
    weatherDistributionRequestsByMode.set(mode, request);
    return request;
  }

  function hasFreshWeatherDistributionData(mode) {
    const data = weatherDistributionDataByMode.get(mode);
    const loadedAt = weatherDistributionLoadedAtByMode.get(mode) ?? 0;
    return Boolean(
      data?.frames?.length
      && loadedAt > 0
      && Date.now() - loadedAt < WEATHER_DISTRIBUTION_DATA_TTL_MS
    );
  }

  async function refreshWeatherChartData() {
    const extendedHistory = Boolean(earlyAccessEnabled);
    if (hasFreshWeatherChartData()) return weatherChartData;
    if (weatherChartRequest && weatherChartRequestExtendedHistory === extendedHistory) return weatherChartRequest;

    const requestId = ++weatherChartRequestId;
    weatherChartRequestExtendedHistory = extendedHistory;
    const request = fetchWeatherChart({ extendedHistory })
      .then((data) => {
        if (requestId !== weatherChartRequestId) return weatherChartRequest ?? weatherChartData;
        activeWeatherChartFrameIndex = Number.isInteger(data.activeFrameIndex) ? data.activeFrameIndex : 0;
        weatherChartData = activateWeatherChartFrame(data, activeWeatherChartFrameIndex);
        weatherChartExtendedHistory = extendedHistory;
        weatherChartLoadedAt = Date.now();
        return weatherChartData;
      })
      .finally(() => {
        if (requestId !== weatherChartRequestId) return;
        weatherChartRequest = null;
        weatherChartRequestExtendedHistory = null;
      });
    weatherChartRequest = request;
    return request;
  }

  function hasFreshWeatherChartData() {
    return Boolean(
      (weatherChartData?.featureCount > 0 || weatherChartData?.frames?.some((frame) => frame.featureCount > 0)) &&
      weatherChartExtendedHistory === Boolean(earlyAccessEnabled) &&
      weatherChartLoadedAt > 0 &&
      Date.now() - weatherChartLoadedAt < WEATHER_CHART_DATA_TTL_MS
    );
  }

  function refreshAmedasPanel() {
    if (activeTab !== "amedas" || !latestDataByTab.amedas) return;
    const tab = TABS.find((item) => item.id === "amedas");
    updateCurrentView(tab, latestDataByTab.amedas);
  }

  function clampRadarIndex(index, frames = []) {
    if (!frames.length) return 0;
    return Math.max(0, Math.min(frames.length - 1, Number(index) || 0));
  }

  async function loadTabData(tabId) {
    if (!loaders[tabId]) return null;
    const inFlight = loadRequestsByTab.get(tabId);
    if (inFlight) return inFlight;

    const request = loaders[tabId]()
      .finally(() => {
        loadRequestsByTab.delete(tabId);
      });
    loadRequestsByTab.set(tabId, request);
    return request;
  }

  async function ensureDashboardTabData(tabId, { force = false } = {}) {
    const cached = latestDataByTab[tabId];
    const loadedAt = Number(tabDataLoadedAt[tabId]) || 0;
    const fresh = cached && loadedAt > 0 && Date.now() - loadedAt < (TAB_DATA_TTL_MS[tabId] ?? 0);
    if (!force && fresh) return cached;

    const nextData = await loadTabData(tabId);
    latestDataByTab[tabId] = mergeRefreshedData(tabId, cached, nextData);
    tabDataLoadedAt[tabId] = Date.now();
    return latestDataByTab[tabId];
  }

  async function loadDisasterDashboardData({ force = false } = {}) {
    if (currentLocationInfo?.status !== "found") {
      await requestAndFocusCurrentPosition({ announceLoading: false, setBusy: false });
    }
    if (currentLocationInfo?.status !== "found") {
      return {
        currentLocation: currentLocationInfo,
        generatedAt: new Date().toISOString(),
        partialFailure: false
      };
    }

    if (force) lightningLoadedAt = 0;
    const results = await Promise.allSettled([
      refreshWarningDetailsData({
        force,
        areaCode: currentLocationInfo.areaCode,
        includeEarlyWarnings: true,
        abortOnTabChange: false
      }),
      refreshRiverFloodData({ force }),
      refreshKikikuruData({ force }),
      ensureDashboardTabData("earthquake", { force }),
      ensureDashboardTabData("radar", { force }),
      ensureDashboardTabData("amedas", { force }),
      ensureVolcanoData({ force }),
      refreshLightningData()
    ]);

    const kikikuruStatuses = await loadDashboardKikikuruStatuses();
    const coordinates = currentLocationInfo.coordinates;
    const [radarPointResult, lightningPointResult] = await Promise.allSettled([
      sampleRadarAtLocation(coordinates, latestDataByTab.radar),
      sampleLightningAtLocation(coordinates, lightningData)
    ]);
    const radarPoint = radarPointResult.status === "fulfilled"
      ? radarPointResult.value
      : { status: "unavailable", intensity: null, value: "", time: "" };
    const lightningPoint = lightningPointResult.status === "fulfilled"
      ? lightningPointResult.value
      : { status: "unavailable", level: null, time: "" };
    const sourceUnavailable = [
      latestDataByTab.warnings?.riverFlood?.status === "error",
      latestDataByTab.warnings?.kikikuru?.unavailable === true,
      !latestDataByTab.earthquake,
      !latestDataByTab.radar,
      !latestDataByTab.amedas,
      !volcanoData,
      !lightningData
    ].some(Boolean);

    return {
      currentLocation: currentLocationInfo,
      riverFlood: latestDataByTab.warnings?.riverFlood,
      kikikuruStatuses,
      earthquake: latestDataByTab.earthquake,
      volcano: volcanoData,
      radar: { ...latestDataByTab.radar, pointSample: radarPoint },
      lightning: { ...lightningData, pointSample: lightningPoint },
      amedas: latestDataByTab.amedas,
      generatedAt: new Date().toISOString(),
      partialFailure: sourceUnavailable
        || results.some((result) => result.status === "rejected")
        || radarPointResult.status === "rejected"
        || lightningPointResult.status === "rejected"
    };
  }

  async function loadDashboardKikikuruStatuses() {
    const coordinates = currentLocationInfo?.coordinates;
    const kikikuru = latestDataByTab.warnings?.kikikuru;
    if (currentLocationInfo?.status !== "found" || !Array.isArray(coordinates) || !kikikuru?.tileUrls) {
      return {};
    }

    const entries = await Promise.all(KIKIKURU_LAYER_OPTIONS
      .filter((layer) => layer.id === "land" || layer.id === "inund")
      .map(async (layer) => {
        try {
          return [layer.id, await sampleCurrentKikikuruStatus(coordinates, kikikuru, layer.id)];
        } catch (error) {
          console.warn(`[MeteoScope] dashboard Kikikuru sample failed for ${layer.id}`, error);
          return [layer.id, { status: "unavailable", elementId: layer.id }];
        }
      }));
    return Object.fromEntries(entries);
  }

  async function refreshCommunityReports({ force = false } = {}) {
    if (communityReportsRequest) return communityReportsRequest;
    communityReportsRequest = CommunityReportClient.list({
      bounds: weatherMap?.getVisibleBounds?.(),
      limit: 100,
      force
    })
      .then((result) => {
        communityReports = Array.isArray(result?.reports) ? result.reports : [];
        weatherMap?.setCommunityReports(communityReports);
        return communityReports;
      })
      .catch((error) => {
        console.warn("[MeteoScope] community reports refresh failed", error);
        weatherMap?.setCommunityReports(communityReports);
        return communityReports;
      })
      .finally(() => { communityReportsRequest = null; });
    return communityReportsRequest;
  }

  async function refreshActiveTab({ force = false } = {}) {
    if (document.hidden || autoRefreshInFlight) return;
    const now = Date.now();
    if (!force && now - lastAutoRefreshStartedAt < AUTO_REFRESH_RESUME_THROTTLE_MS) return;

    const tab = TABS.find((item) => item.id === activeTab) ?? TABS[0];
    if (!loaders[tab.id]) return;
    if (tab.id === "earthquake") {
      if (earthquakeContentMode === "volcano") {
        await refreshVolcanoData({ force });
        return;
      }
      await refreshEarthquakeTabData({ force });
      return;
    }

    autoRefreshInFlight = true;
    lastAutoRefreshStartedAt = now;
    try {
      const nextData = await loadTabData(tab.id);
      if (activeTab !== tab.id) return;
      latestDataByTab[tab.id] = mergeRefreshedData(tab.id, latestDataByTab[tab.id], nextData);
      tabDataLoadedAt[tab.id] = Date.now();
      if (tab.id === "typhoon" && typhoonRadarOverlayEnabled) {
        await refreshTyphoonRadarOverlayData();
      }
      if (tab.id === "radar" && lightningEnabled) {
        try {
          if (force) lightningLoadedAt = 0;
          await refreshLightningData();
          lightningStatus = "ok";
        } catch (error) {
          console.warn("[MeteoScope] lightning nowcast auto refresh failed", error);
          lightningStatus = "error";
        }
      }
      updateCurrentView(tab, latestDataByTab[tab.id]);
      if (tab.id === "radar") await refreshCommunityReports();
      if (tab.id === "typhoon") await refreshActiveWorldTyphoonForecasts();
      if (tab.id === "warnings") await refreshRiverFloodData({ force });
    } catch (error) {
      console.warn(`[MeteoScope] ${tab.id} auto refresh failed`, error);
    } finally {
      autoRefreshInFlight = false;
    }
  }

  async function refreshEarthquakeTabData({
    force = false,
    refreshOpenDistribution = true
  } = {}) {
    const nextData = await refreshEarthquakeData({ force });
    const shouldRefreshDistribution = earthquakeContentMode !== "volcano"
      && (
        earthquakeDistributionRecentXmlVisible
        || (refreshOpenDistribution && earthquakeView === "distribution")
      );
    if (shouldRefreshDistribution) {
      await refreshEarthquakeDistribution({ force });
    }
    return nextData;
  }

  async function refreshEarthquakeData({ force = false } = {}) {
    if (activeTab !== "earthquake") return latestDataByTab.earthquake;
    if (document.hidden && !force) return latestDataByTab.earthquake;
    if (earthquakeRefreshRequest) return earthquakeRefreshRequest;

    const now = Date.now();
    if (!force && now - lastEarthquakeRefreshStartedAt < EARTHQUAKE_REFRESH_INTERVAL_MS - 1000) {
      return latestDataByTab.earthquake;
    }

    const previousData = latestDataByTab.earthquake;
    const selectedIdAtStart = String(activeEarthquakeId ?? "");
    const previousLatestId = String(previousData?.earthquakes?.[0]?.id ?? "");
    const selectedWasLatest = !selectedIdAtStart || !previousLatestId || selectedIdAtStart === previousLatestId;
    lastEarthquakeRefreshStartedAt = now;

    earthquakeRefreshRequest = loadTabData("earthquake")
      .then((nextData) => {
        const earthquakes = nextData?.earthquakes ?? [];
        const nextLatestId = String(earthquakes[0]?.id ?? "");
        const selectedStillExists = earthquakes.some((earthquake) =>
          String(earthquake.id) === selectedIdAtStart
        );

        if (!earthquakes.length) {
          activeEarthquakeId = "";
        } else if (selectedWasLatest || !selectedStillExists) {
          activeEarthquakeId = nextLatestId;
        } else {
          activeEarthquakeId = selectedIdAtStart;
        }

        latestDataByTab.earthquake = nextData;
        if (activeTab === "earthquake") {
          const tab = TABS.find((item) => item.id === "earthquake");
          updateCurrentView(tab, nextData);
        }
        return nextData;
      })
      .catch((error) => {
        console.warn("[MeteoScope] earthquake XML refresh failed", error);
        return latestDataByTab.earthquake;
      })
      .finally(() => {
        earthquakeRefreshRequest = null;
      });

    return earthquakeRefreshRequest;
  }

  async function locateCurrentPosition() {
    await requestAndFocusCurrentPosition({ announceLoading: true, setBusy: true });
  }

  async function startLocationWatchOnLaunch() {
    await requestAndFocusCurrentPosition({ announceLoading: false, setBusy: false });
  }

  async function requestAndFocusCurrentPosition({ announceLoading, setBusy }) {
    if (!navigator.geolocation) {
      currentLocationInfo = {
        status: "error",
        message: "このブラウザでは位置情報を利用できません。"
      };
      refreshSettingsModalView();
      refreshActivePanel();
      return;
    }
    if (locationRequest) return locationRequest;

    if (setBusy) setLocateButtonBusy(true);
    if (announceLoading) {
      currentLocationInfo = {
        status: "loading",
        message: "現在地を取得中です..."
      };
      refreshActivePanel();
    }

    locationRequest = (async () => {
      try {
        const position = await requestCurrentPosition();
        await applyCurrentPosition(position, { forceResolve: true, flyTo: true });
        if (locationWatchId === null) startLocationWatch({ announceLoading: false });
      } catch (error) {
        currentLocationInfo = buildCurrentLocationError(error);
        refreshSettingsModalView();
        refreshActivePanel();
      } finally {
        if (setBusy) setLocateButtonBusy(false);
        locationRequest = null;
      }
    })();
    return locationRequest;
  }

  function startLocationWatch({ announceLoading = true } = {}) {
    if (!navigator.geolocation) {
      currentLocationInfo = {
        status: "error",
        message: "このブラウザでは位置情報を利用できません。"
      };
      refreshSettingsModalView();
      refreshActivePanel();
      return;
    }
    if (locationWatchId !== null) return;

    if (announceLoading) {
      currentLocationInfo = {
        status: "loading",
        message: "現在地を取得中です..."
      };
      refreshSettingsModalView();
      refreshActivePanel();
    }

    locationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        const shouldFocus = !hasFocusedInitialLocation && Boolean(getPositionCoordinates(position));
        applyCurrentPosition(position, { flyTo: shouldFocus }).catch((error) => {
          console.warn("[MeteoScope] current location watch update failed", error);
        });
      },
      (error) => {
        if (Number(error?.code) === 1) {
          stopLocationWatch();
        }
        currentLocationInfo = buildCurrentLocationError(error);
        refreshSettingsModalView();
        refreshActivePanel();
      },
      LOCATION_WATCH_OPTIONS
    );
  }

  async function applyCurrentPosition(position, options = {}) {
    const coordinates = getPositionCoordinates(position);
    if (!coordinates) {
      currentLocationInfo = {
        status: "error",
        message: "現在地の座標を読み取れませんでした。"
      };
      refreshSettingsModalView();
      refreshActivePanel();
      return;
    }

    weatherMap?.showCurrentLocation(coordinates, position.coords.accuracy);
    if (options.flyTo) {
      hasFocusedInitialLocation = true;
      weatherMap?.flyToLocation(coordinates);
    }

    if (!shouldResolveCurrentLocation(coordinates, options.forceResolve)) return;

    const requestId = ++locationResolveRequestId;
    try {
      const warningData = latestDataByTab.warnings ?? await fetchWarningTabData();
      if (requestId !== locationResolveRequestId) return;
      latestDataByTab.warnings = warningData;
      const nextInfo = await resolveCurrentLocationInfo(coordinates, warningData);
      if (requestId !== locationResolveRequestId) return;
      currentLocationInfo = nextInfo;
      lastResolvedLocation = {
        coordinates,
        resolvedAt: Date.now()
      };
      resetLocationRadarTimeline();
      void refreshCurrentKikikuruStatus();
      refreshSettingsModalView();
      refreshActivePanel();
    } catch (error) {
      if (requestId !== locationResolveRequestId) return;
      currentLocationInfo = buildCurrentLocationError(error);
      refreshSettingsModalView();
      refreshActivePanel();
    }
  }

  function shouldResolveCurrentLocation(coordinates, forceResolve = false) {
    if (forceResolve || !lastResolvedLocation) return true;

    const movedMeters = getDistanceMeters(lastResolvedLocation.coordinates, coordinates);
    const elapsedMs = Date.now() - lastResolvedLocation.resolvedAt;
    return movedMeters >= LOCATION_RESOLVE_MIN_DISTANCE_METERS || elapsedMs >= LOCATION_RESOLVE_MIN_INTERVAL_MS;
  }

  function resetLocationRadarTimeline() {
    locationRadarRequestId += 1;
    locationRadarTimeline = { status: "idle", points: [] };
  }

  function stopLocationWatch() {
    if (locationWatchId === null || !navigator.geolocation?.clearWatch) return;
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }

  function refreshActivePanel() {
    const tab = TABS.find((item) => item.id === activeTab) ?? TABS[0];
    const data = latestDataByTab[tab.id];
    if (data) {
      updateCurrentView(tab, data);
      return;
    }

    renderLeftPanelState(tab, {
      status: "loading",
      amedasMetric: activeAmedasMetric,
      amedasPrecipitationPeriod: activeAmedasPrecipitationPeriod,
      warningView: activeWarningView,
      activeKikikuruLayer,
      radarPlaying: Boolean(radarPlayTimer),
      currentLocation: currentLocationInfo,
      myAreas,
      locationInsights: buildLocationInsights(tab.id, null),
      earthquakeActiveFaultVisible,
      earthquakePlateBoundaryVisible,
      earthquakePlateDepthContoursVisible,
      earthquakeEstimatedIntensityVisible,
      weatherChartEnabled,
      weatherChartStatus,
      weatherChart: weatherChartData,
      lightningEnabled,
      lightningStatus,
      lightning: lightningData,
      lightningPlaying: Boolean(lightningPlayTimer)
    });
  }

  function setLocateButtonBusy(isBusy) {
    const button = document.getElementById("locate-button");
    if (!button) return;
    button.classList.toggle("loading", isBusy);
    button.disabled = isBusy;
    button.setAttribute("aria-busy", isBusy ? "true" : "false");
  }

  function setCurrentLocationMarkerVisible(isVisible) {
    currentLocationMarkerVisible = Boolean(isVisible);
    weatherMap?.setCurrentLocationVisible(currentLocationMarkerVisible);
    const button = document.getElementById("locate-button");
    if (!button) return;
    button.classList.toggle("marker-hidden", !currentLocationMarkerVisible);
    const label = currentLocationMarkerVisible
      ? "現在地へ移動。長押しで現在地マーカーを非表示"
      : "現在地へ移動。長押しで現在地マーカーを表示";
    button.setAttribute("aria-label", label);
    button.title = label;
  }

  function toggleCurrentLocationMarker() {
    setCurrentLocationMarkerVisible(!currentLocationMarkerVisible);
  }

  function startAutoRefresh() {
    if (autoRefreshTimer) window.clearInterval(autoRefreshTimer);
    autoRefreshTimer = window.setInterval(() => {
      refreshActiveTab({ force: true });
    }, AUTO_REFRESH_INTERVAL_MS);

    if (lightningRefreshTimer) window.clearInterval(lightningRefreshTimer);
    lightningRefreshTimer = window.setInterval(() => {
      refreshActiveLightning({ force: true });
    }, LIGHTNING_REFRESH_INTERVAL_MS);

    syncEarlyWarningRefreshTimer();

    scheduleEarthquakeRefresh();

    document.addEventListener("visibilitychange", () => {
      syncEarlyWarningRefreshTimer();
      if (!document.hidden) {
        if (activeTab === "warnings" && activeWarningView === "early") {
          void refreshWarningDetails({ includeEarlyWarnings: true });
        }
        if (activeTab === "earthquake") {
          refreshEarthquakeTabData({ force: true });
        } else {
          refreshActiveTab();
        }
      }
    });
    window.addEventListener("focus", () => {
      syncEarlyWarningRefreshTimer();
      if (activeTab === "warnings" && activeWarningView === "early") {
        void refreshWarningDetails({ includeEarlyWarnings: true });
      }
      if (activeTab === "earthquake") {
        refreshEarthquakeTabData({ force: true });
      } else {
        refreshActiveTab();
      }
    });
  }

  function scheduleEarthquakeRefresh() {
    if (earthquakeRefreshTimer) window.clearTimeout(earthquakeRefreshTimer);
    earthquakeRefreshTimer = null;
    // 接続中は全タブ共通の5分更新に任せ、地震専用タイマーとの二重取得を避ける。
    earthquakeRefreshTimer = window.setTimeout(async () => {
      earthquakeRefreshTimer = null;
      try {
        await refreshEarthquakeTabData({ refreshOpenDistribution: false });
      } finally {
        scheduleEarthquakeRefresh();
      }
    }, EARTHQUAKE_REFRESH_INTERVAL_MS);
  }

  function scheduleBackgroundPrefetch(excludeTabId) {
    if (backgroundPrefetchStarted) return;
    backgroundPrefetchStarted = true;

    const run = () => {
      TABS
        .filter((tab) => tab.id !== excludeTabId && tab.id !== "warnings" && loaders[tab.id])
        .forEach((tab, index) => {
          window.setTimeout(() => {
            prefetchTabData(tab.id);
          }, 2500 + index * 1600);
        });
    };

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run, { timeout: 7000 });
    } else {
      window.setTimeout(run, 5000);
    }
  }

  async function prefetchTabData(tabId) {
    if (latestDataByTab[tabId] || document.hidden) return;
    try {
      latestDataByTab[tabId] = await loadTabData(tabId);
      tabDataLoadedAt[tabId] = Date.now();
      if (tabId === "warnings") weatherMap?.prepareWarningData(latestDataByTab[tabId]);
    } catch (error) {
      console.warn(`[MeteoScope] ${tabId} prefetch failed`, error);
    }
  }

  function syncEarlyWarningRefreshTimer() {
    if (earlyWarningRefreshTimer) {
      window.clearInterval(earlyWarningRefreshTimer);
      earlyWarningRefreshTimer = null;
    }
    if (document.hidden || activeTab !== "warnings" || activeWarningView !== "early") return;

    earlyWarningRefreshTimer = window.setInterval(() => {
      void refreshWarningDetails({ force: true, includeEarlyWarnings: true });
    }, EARLY_WARNING_REFRESH_INTERVAL_MS);
  }

  async function refreshWarningDetails(options = {}) {
    return refreshWarningDetailsData(options);
  }

  async function refreshCurrentLocationWarningInfo(warningData) {
    if (currentLocationInfo?.status !== "found" || !Array.isArray(currentLocationInfo.coordinates)) return;
    try {
      currentLocationInfo = await resolveCurrentLocationInfo(currentLocationInfo.coordinates, warningData);
      refreshSettingsModalView();
    } catch (error) {
      console.warn("[MeteoScope] current location warning refresh failed", error);
    }
  }
  async function refreshWarningDetailsData({
    force = false,
    areaCode = "",
    includeEarlyWarnings = false,
    abortOnTabChange = true
  } = {}) {
    const normalizedAreaCode = String(areaCode ?? "").trim();
    const requestKey = includeEarlyWarnings ? "early" : (normalizedAreaCode ? `area:${normalizedAreaCode}` : "");
    if (!requestKey) return latestDataByTab.warnings;
    const loadedAt = warningDetailsLoadedAtByKey.get(requestKey) ?? 0;
    if (!force && hasFreshWarningDetails(latestDataByTab.warnings, loadedAt, {
      areaCode: normalizedAreaCode,
      includeEarlyWarnings
    })) return latestDataByTab.warnings;
    if (warningDetailsRequest?.key === requestKey) return warningDetailsRequest.promise;
    warningDetailsRequest?.controller.abort();

    const controller = new AbortController();
    const request = fetchWarningTabData({
      includeDetails: true,
      areaCode: normalizedAreaCode,
      includeEarlyWarnings,
      signal: controller.signal
    })
      .then(async (detailsData) => {
        if (controller.signal.aborted) return latestDataByTab.warnings;
        latestDataByTab.warnings = mergeWarningTabData(latestDataByTab.warnings, detailsData);
        warningDetailsLoadedAtByKey.set(requestKey, Date.now());
        weatherMap?.prepareWarningData(latestDataByTab.warnings);
        await refreshCurrentLocationWarningInfo(latestDataByTab.warnings);
        if (activeTab === "warnings") refreshWarningsView({ updateMap: true });
        return latestDataByTab.warnings;
      })
      .catch((error) => {
        if (error?.name === "AbortError") return latestDataByTab.warnings;
        console.warn("[MeteoScope] warning detail load failed", error);
        return latestDataByTab.warnings;
      })
      .finally(() => {
        if (warningDetailsRequest?.controller === controller) warningDetailsRequest = null;
      });
    warningDetailsRequest = { key: requestKey, promise: request, controller, abortOnTabChange };
    return request;
  }

  async function refreshRiverFloodData({ force = false } = {}) {
    const current = latestDataByTab.warnings?.riverFlood;
    if (!force && current?.status === "ok" && Date.now() - riverFloodLoadedAt < RIVER_FLOOD_DATA_TTL_MS) {
      return latestDataByTab.warnings;
    }
    if (riverFloodRequest) return riverFloodRequest;

    riverFloodRequest = fetchRiverFloodForecasts()
      .then((riverFlood) => {
        latestDataByTab.warnings = {
          ...(latestDataByTab.warnings ?? {}),
          riverFlood: { ...riverFlood, status: "ok" }
        };
        riverFloodLoadedAt = Date.now();
        refreshWarningsView({ view: "river", updateMap: true });
        return latestDataByTab.warnings;
      })
      .catch((error) => {
        console.warn("[MeteoScope] river flood load failed", error);
        latestDataByTab.warnings = {
          ...(latestDataByTab.warnings ?? {}),
          riverFlood: { status: "error", error, reports: [], riverFeatures: { type: "FeatureCollection", features: [] } }
        };
        refreshWarningsView({ view: "river", updateMap: true });
        return latestDataByTab.warnings;
      })
      .finally(() => {
        riverFloodRequest = null;
      });
    return riverFloodRequest;
  }

  async function refreshKikikuruData({ force = false } = {}) {
    const currentKikikuru = latestDataByTab.warnings?.kikikuru;
    if (!force && hasFreshKikikuruData(currentKikikuru, warningKikikuruLoadedAt)) {
      void refreshCurrentKikikuruStatus(currentKikikuru);
      return latestDataByTab.warnings;
    }
    if (warningKikikuruRequest) return warningKikikuruRequest;

    warningKikikuruRequest = fetchKikikuruTiles()
      .then((kikikuruData) => {
        latestDataByTab.warnings = {
          ...(latestDataByTab.warnings ?? {}),
          kikikuru: kikikuruData
        };
        warningKikikuruLoadedAt = Date.now();
        refreshWarningsView({ view: "kikikuru", updateMap: true });
        void refreshCurrentKikikuruStatus(kikikuruData);
        return latestDataByTab.warnings;
      })
      .catch((error) => {
        console.warn("[MeteoScope] kikikuru tile load failed", error);
        latestDataByTab.warnings = {
          ...(latestDataByTab.warnings ?? {}),
          kikikuru: { unavailable: true, error }
        };
        refreshWarningsView({ view: "kikikuru" });
        return latestDataByTab.warnings;
      })
      .finally(() => {
        warningKikikuruRequest = null;
      });
    return warningKikikuruRequest;
  }

  async function refreshCurrentKikikuruStatus(kikikuruData = latestDataByTab.warnings?.kikikuru) {
    const coordinates = currentLocationInfo?.coordinates;
    const requestId = ++currentKikikuruRequestId;
    if (currentLocationInfo?.status !== "found" || !Array.isArray(coordinates) || !kikikuruData?.tileUrls) {
      currentKikikuruStatus = { status: "unavailable", elementId: activeKikikuruLayer, label: "取得できません" };
      refreshWarningsView({ view: "kikikuru" });
      return currentKikikuruStatus;
    }

    currentKikikuruStatus = { status: "loading", elementId: activeKikikuruLayer };
    refreshWarningsView({ view: "kikikuru" });
    try {
      const result = await sampleCurrentKikikuruStatus(coordinates, kikikuruData, activeKikikuruLayer);
      if (requestId !== currentKikikuruRequestId) return currentKikikuruStatus;
      currentKikikuruStatus = result;
    } catch (error) {
      if (requestId !== currentKikikuruRequestId) return currentKikikuruStatus;
      console.warn("[MeteoScope] current location kikikuru sample failed", error);
      currentKikikuruStatus = { status: "unavailable", elementId: activeKikikuruLayer, label: "取得できません" };
    }
    refreshWarningsView({ view: "kikikuru" });
    return currentKikikuruStatus;
  }

  function refreshWarningsView(options = {}) {
    if (activeTab !== "warnings") return;
    if (options.view && activeWarningView !== options.view) return;
    const tab = TABS.find((item) => item.id === "warnings");
    updateCurrentView(tab, latestDataByTab.warnings, {
      deferPanel: true,
      skipMap: options.updateMap !== true
    });
  }

  function scheduleCriticalWarningPrefetch() {
    const run = async () => {
      await prefetchTabData("warnings");
    };
    window.setTimeout(() => void run(), 250);
  }

  function getSettingsState() {
    return {
      myAreas,
      currentLocation: currentLocationInfo,
      adminNoticePush: adminNoticePush.getState(),
      myAreaLimit: getMyAreaLimit(),
      themePreference: themeController.getPreference(),
      languagePreference: localeController.getPreference(),
      earthquakeDistributionRecentXmlVisible,
      earlyAccessEnabled,
      earlyAccessActiveFaultSource,
      earlyAccessActiveFaultDataState,
      earlyAccessState
    };
  }

  async function searchSettingsAreas(query) {
    return searchMunicipalities(query);
  }

  function addSettingsMyArea(area) {
    myAreas = addMyArea(myAreas, area);
    refreshSettingsModalView();
    refreshActivePanel();
  }

  function addCurrentLocationToMyAreas() {
    if (currentLocationInfo?.status !== "found" || !currentLocationInfo.areaCode) return;
    addSettingsMyArea({
      areaCode: currentLocationInfo.areaCode,
      areaName: currentLocationInfo.areaName,
      prefecture: currentLocationInfo.prefecture,
      coordinates: currentLocationInfo.coordinates ?? currentLocationInfo.center
    });
  }

  function removeSettingsMyArea(areaCode) {
    myAreas = removeMyArea(myAreas, areaCode);
    refreshSettingsModalView();
    refreshActivePanel();
  }

  async function toggleAdminNoticePush() {
    const pushState = adminNoticePush.getState();
    if (pushState.enabled || pushState.subscribed) {
      await adminNoticePush.disable();
    } else {
      await adminNoticePush.enable();
    }
    refreshSettingsModalView();
  }

  function finishInitialMapLoading() {
    const loader = document.getElementById("app-startup-loader");
    document.documentElement.classList.remove("app-initializing");
    if (loader) loader.hidden = true;
    requestAnimationFrame(() => weatherMap?.resize());
  }

  function showInitialMapLoadingError() {
    const loader = document.getElementById("app-startup-loader");
    if (!loader) return;
    loader.setAttribute("aria-label", "地図の読み込みに失敗しました");
    loader.querySelector(".app-startup-spinner")?.setAttribute("hidden", "");
    const message = loader.querySelector("span:last-child");
    if (message) message.textContent = "地図を読み込めませんでした。再読み込みしてください。";
  }

  function start() {
    weatherMap = createWeatherMap("map");
    void applyActiveFaultDataSource();
    weatherMap.setActiveFaultVisible(earthquakeActiveFaultVisible);
    weatherMap.setPlateBoundaryVisible(earthquakePlateBoundaryVisible);
    weatherMap.setPlateDepthContoursVisible(earthquakePlateDepthContoursVisible);
    weatherMap.setTheme(themeController.getResolvedTheme());
    weatherMap.setCurrentLocationVisible(currentLocationMarkerVisible);
    themeController.subscribe(({ resolvedTheme }) => weatherMap?.setTheme(resolvedTheme));
    localeController.subscribe(() => {
      void selectTab(activeTab);
    });
    weatherMap.initialize();
    tabControls = setupTabs({ onChange: selectTab, tabs: TABS });
    const earthquakeTabButton = document.querySelector('.tab-button[data-tab="earthquake"]');
    const earthquakeLongPressHint = setupEarthquakeLongPressHint(earthquakeTabButton);
    setupLongPressButton(earthquakeTabButton, {
      onLongPress: () => {
        earthquakeLongPressHint.dismiss();
        toggleEarthquakeContentMode();
      }
    });
    setupAmedasSubTabs({ onChange: selectAmedasMetric });
    setupAmedasPrecipitationPeriods({ onChange: selectAmedasPrecipitationPeriod });
    setupAmedasDailyChartToggle({ onChange: selectAmedasDailyChartDay });
    setupMobileDockSegmentedControls();
    setupMobileEarthquakeSummarySwipe({
      onChange: (page) => {
        if (!["earthquake", "tsunami", "tide"].includes(page) || earthquakeSummaryPage === page) return;
        earthquakeSummaryPage = page;
        if (activeTab === "earthquake" && earthquakeContentMode === "earthquake") refreshActivePanel();
      }
    });
    setupTideObservationControls({
      onRangeChange: selectTideObservationRange,
      onClose: closeTideObservation
    });
    setupAmedasRankingToggle({ onChange: refreshAmedasPanel, onSelectStation: focusAmedasStation });
    window.addEventListener("amedas-station-select", (event) => {
      const stationId = event.detail?.stationId;
      if (stationId) selectAmedasStation(stationId);
    });
    window.addEventListener("volcano-select", (event) => {
      const volcanoCode = String(event.detail?.volcanoCode ?? "").trim();
      if (!volcanoCode || earthquakeContentMode !== "volcano") return;
      const reports = volcanoData?.reports ?? [];
      if (!reports.some((report) => String(report.volcanoCode ?? report.code ?? "") === volcanoCode)) return;
      selectedVolcanoCode = volcanoCode;
      selectedVolcanoBulletinId = "";
      selectedVolcanoAshForecastIndex = 0;
      refreshVolcanoView({ scrollToTop: true });
      void refreshSelectedVolcanoLatestActivity(volcanoCode);
    });
    window.addEventListener("tide-station-select", (event) => {
      const stationCode = String(event.detail?.stationCode ?? "").trim();
      if (stationCode) void selectTideObservationStation(stationCode);
    });
    setupKikikuruLayerToggles({ onChange: selectKikikuruLayer });
    setupWarningAreaSelection({
      onDetailRequest: (areaCode) => refreshWarningDetails({ areaCode }),
      onListExpansion: () => refreshWarningsView()
    });
    setupTyphoonSelector({ onChange: selectTyphoon });
    setupTyphoonForecastModeControls({
      onChange: selectTyphoonForecastMode,
      onModelToggle: toggleWorldTyphoonModel,
      onTimeChange: selectWorldTyphoonForecastTime
    });
    setupWorldTyphoonTargetModal({ onSelect: selectWorldTyphoonTarget });
    document.getElementById("typhoon-radar-overlay-button")
      ?.addEventListener("click", () => void toggleTyphoonRadarOverlay());
    setupEarthquakeSelector({
      onChange: selectEarthquake,
      onHistoryLoadMore: loadMoreEarthquakeHistory,
      onVolcanoClear: () => {
        selectedVolcanoCode = "";
        selectedVolcanoBulletinId = "";
        selectedVolcanoAshForecastIndex = 0;
        refreshVolcanoView({ scrollToTop: true });
      },
      onVolcanoBulletinSelect: async (bulletinId) => {
        selectedVolcanoBulletinId = String(bulletinId ?? "").trim();
        refreshVolcanoView({ scrollToTop: true });
        const selectedReport = volcanoData?.reports?.find((report) =>
          String(report?.volcanoCode ?? report?.code ?? "") === selectedVolcanoCode
        );
        const selectedBulletin = selectedReport?.relatedReports?.find((report) =>
          String(report?.id ?? "") === selectedVolcanoBulletinId
        );
        if (
          selectedBulletin?.bulletinCode === "ACTIVITY_LATEST"
          && !selectedBulletin.activity
          && !selectedBulletin.prevention
        ) {
          await refreshSelectedVolcanoLatestActivity(selectedVolcanoCode);
        }
      },
      onVolcanoBulletinBack: () => {
        selectedVolcanoBulletinId = "";
        refreshVolcanoView({ scrollToTop: true });
      },
      onVolcanoAshForecastChange: (index) => {
        if (!Number.isInteger(index) || index < 0) return;
        selectedVolcanoAshForecastIndex = index;
        refreshVolcanoView();
      },
      onViewChange: selectEarthquakeView,
      onDistributionPresentationChange: selectEarthquakeDistributionPresentation,
      onDistributionFilterChange: updateEarthquakeDistributionFilters,
      onDistributionRangeModeChange: selectEarthquakeDistributionRangeMode,
      onDistributionAreaSearch: startEarthquakeDistributionAreaSearch,
      onDistributionAreaClear: clearEarthquakeDistributionAreaSearch,
      onDistributionRetry: refreshEarthquakeDistribution,
      getDistributionDates: () => earthquakeDistributionState.data?.availableDates ?? []
    });
    setupEarthquakeMapLayerToggles({ onChange: setEarthquakeMapLayerVisible });
    setupRadarControls({
      onSeek: selectActiveRadarTimelineFrame,
      onStep: stepActiveRadarTimeline,
      onTogglePlay: toggleActiveRadarPlayback,
      onGoLatest: goLatestActiveRadarTimeline
    });
    setupRadarOverlayToggle({
      onChange: selectRadarOverlay,
      onWeatherDistributionPicker: toggleWeatherDistributionPicker
    });
    setupWeatherDistributionToggle({
      onChange: (mode) => selectRadarOverlay(mode === "weather" ? "weather-distribution" : `${mode}-distribution`)
    });
    setupWeatherChartControls({
      onSeek: selectWeatherChartFrame,
      onPreview: previewWeatherChartFrame,
      onStep: stepWeatherChartFrame,
      onGoLatest: goLatestWeatherChartFrame
    });
    setupMobileWeatherTimelineTapControls({
      onRadarPlay: startRadarPlayback,
      onRadarStop: stopRadarPlaybackAndRefresh,
      onRadarGoLatest: goLatestRadarObservation,
      onLightningPlay: startLightningPlayback,
      onLightningStop: stopLightningPlaybackAndRefresh,
      onLightningGoLatest: goLatestLightningObservation,
      onWeatherChartPlay: startWeatherChartPlayback,
      onWeatherChartStop: stopWeatherChartPlayback,
      onWeatherChartGoLatest: goLatestWeatherChartFrame,
      onWeatherDistributionPlay: startWeatherDistributionPlayback,
      onWeatherDistributionStop: stopWeatherDistributionPlayback,
      onWeatherDistributionGoLatest: goLatestWeatherDistributionFrame
    });
    setupLegendToggle();
    setupPanelToggle({ onLayoutChange: () => weatherMap?.resize() });
    const onboarding = setupOnboardingModal({ onOpenSettings: openSettingsModal });
    let userServicesStarted = false;
    const startUserServices = () => {
      if (userServicesStarted) return;
      userServicesStarted = true;
      startAutoRefresh();
      scheduleCriticalWarningPrefetch();
      void adminNoticePush.initialize().then(() => refreshSettingsModalView());
      void startLocationWatchOnLaunch();
      void selectTab(activeTab);
      void refreshEarlyAccess();
      onboarding.showFirstRun();
      earthquakeLongPressHint.showFirstRun();
    };
    const legalConsent = setupLegalConsentModal({ onAccepted: startUserServices });
    setupSettingsModal({
      getState: getSettingsState,
      onSearchArea: searchSettingsAreas,
      onAddArea: addSettingsMyArea,
      onAddCurrentLocation: addCurrentLocationToMyAreas,
      onRemoveArea: removeSettingsMyArea,
      getDisasterMapPdfInfo: getStoredDisasterMapPdfInfo,
      onClearDisasterMapPdf: clearStoredDisasterMapPdf,
      onToggleAdminNoticePush: toggleAdminNoticePush,
      onThemeChange: (theme) => themeController.setPreference(theme),
      onLanguageChange: (language) => localeController.setPreference(language),
      onEarthquakeDistributionRecentXmlChange:
        setEarthquakeDistributionRecentXmlVisible,
      onActivateEarlyAccess: authenticateEarlyAccess,
      onDeactivateEarlyAccess: releaseEarlyAccess,
      onEarlyAccessActiveFaultSourceChange: setEarlyAccessActiveFaultSource,
      onOpenGuide: onboarding.open,
      tabs: TABS,
      getTabOrder: () => tabControls?.getOrder?.() ?? TABS.map((tab) => tab.id),
      onTabOrderChange: (order) => tabControls?.setOrder?.(order) ?? order
    });
    setupLazyDisasterMapModal();
    setupWeeklyWeatherModal({
      getCurrentLocation: () => currentLocationInfo,
      requestCurrentLocation: () => requestAndFocusCurrentPosition({ announceLoading: true, setBusy: true })
    });
    setupNumericWeatherChartModal();
    setupUpperAirModal({
      isEarlyAccessEnabled: () => earlyAccessEnabled,
      onOpenSettings: openSettingsModal
    });
    const disasterDashboardButton = document.getElementById("disaster-dashboard-button");
    disasterDashboardButton?.addEventListener("click", () => {
      void loadDisasterDashboardModule().then((dashboardModule) => {
        dashboardModule.setupDisasterDashboardModal({
          loadData: loadDisasterDashboardData,
          requestCurrentLocation: () => requestAndFocusCurrentPosition({ announceLoading: true, setBusy: true }),
          onNavigate: (tabId) => selectTab(tabId)
        });
        return dashboardModule.openDisasterDashboardModal();
      }).catch((error) => {
        console.warn("[MeteoScope] failed to open disaster dashboard", error);
      });
    }, { once: true });
    setupDisasterQuizModal();
    setupMapUtilityMenu();
    setupMeteoScopeLensModal({
      getContext: () => ({
        data: latestDataByTab.amedas,
        metricId: activeAmedasMetric,
        precipitationPeriod: activeAmedasPrecipitationPeriod,
        currentLocation: currentLocationInfo,
        earlyAccessEnabled
      })
    });
    document.getElementById("meteoscope-lens-button")?.addEventListener("click", () => {
      openMeteoScopeLensModal();
    });
    setupCommunityReportModal({
      getContext: () => ({ currentLocation: currentLocationInfo }),
      onSubmitted: () => refreshCommunityReports({ force: true }),
      onOpenAccount: openDisasterQuizModal
    });
    setupFeedbackModal();
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest("[data-community-report-open]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      void openCommunityReportModal();
    });
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest("[data-social-share]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const payload = getSocialSharePayload(button.dataset.socialShare);
      if (!payload) return;
      void import("./ui/socialShareModal.js").then(({ openSocialShareModal }) => {
        openSocialShareModal(payload);
      });
    });
    setupLongPressButton(document.getElementById("locate-button"), {
      onPress: locateCurrentPosition,
      onLongPress: toggleCurrentLocationMarker
    });
    setCurrentLocationMarkerVisible(currentLocationMarkerVisible);
    startClock("clock");
    const initialMapReady = weatherMap.whenReady();
    void initialMapReady.then((ready) => {
      if (!ready) {
        showInitialMapLoadingError();
        return;
      }
      finishInitialMapLoading();
      if (!legalConsent.showIfRequired()) startUserServices();
    });
  }

  return { start, selectTab };
}

function buildTyphoonFocusCoordinates(typhoon) {
  if (!typhoon) return [];
  const focusCircles = [
    ...(typhoon.forecastCircles ?? []),
    {
      center: typhoon.strongWindCenter ?? typhoon.center,
      radius: typhoon.strongWindRadius
    },
    {
      center: typhoon.stormCenter ?? typhoon.center,
      radius: typhoon.stormRadius
    },
    ...(Array.isArray(typhoon.stormWarningGroups) ? typhoon.stormWarningGroups.flat() : []),
    ...(Array.isArray(typhoon.stormWarningArea) ? typhoon.stormWarningArea : [])
  ];
  const coordinates = [
    typhoon.center,
    ...(typhoon.forecastTrack ?? []),
    ...collectTyphoonFocusCircleCoordinates(focusCircles),
    ...collectTyphoonStormWarningShapeCoordinates(typhoon.stormWarningAreaShape)
  ];

  return coordinates.filter((point) =>
    Array.isArray(point)
    && point.length === 2
    && point.every((value) => Number.isFinite(value))
  );
}

function collectTyphoonFocusCircleCoordinates(circles = []) {
  return circles.flatMap((circle) => [
    circle?.center,
    ...expandCircleBounds(circle?.center, Number(circle?.radius))
  ]);
}

function collectTyphoonStormWarningShapeCoordinates(shape) {
  if (!shape || typeof shape !== "object") return [];
  return [
    ...collectTyphoonFocusCircleCoordinates(Array.isArray(shape.arc) ? shape.arc : []),
    ...(Array.isArray(shape.line) ? shape.line.flat() : [])
  ];
}

function buildWorldTyphoonFocusCoordinates(displayData = {}) {
  const hasSelectedTargets = (displayData.selectedWorldForecastTargetKeys ?? []).length > 0;
  return (displayData.worldForecastLayers ?? []).flatMap((layer) => {
    const primarySystemId = String(layer.system?.id ?? "");
    const positions = hasSelectedTargets || !primarySystemId
      ? (layer.forecastPositions ?? [])
      : (layer.forecastPositions ?? []).filter(({ system }) => (
        String(system?.id ?? "") === primarySystemId
      ));
    return positions
      .map(({ position }) => position?.coordinates)
      .filter((point) => (
        Array.isArray(point)
        && point.length === 2
        && point.every((value) => Number.isFinite(value))
      ));
  });
}

function buildEarthquakeFocusCoordinates(earthquake) {
  if (!earthquake) return [];
  const estimatedIntensityBounds = earthquake.estimatedIntensity?.bounds;
  const coordinates = [
    earthquake.coordinates,
    ...(earthquake.intensityStations ?? []).map((station) => station.coordinates),
    ...(earthquake.estimatedIntensity
      ? []
      : (earthquake.intensityAreaFeatures ?? []).flatMap(getFeatureBoundsCoordinates)),
    ...(Array.isArray(estimatedIntensityBounds) ? estimatedIntensityBounds : [])
  ];

  return coordinates.filter((point) =>
    Array.isArray(point)
    && point.length === 2
    && point.every((value) => Number.isFinite(value))
  );
}

function getFeatureBoundsCoordinates(feature) {
  const bounds = getGeometryBounds(feature?.geometry);
  if (!bounds) return [];
  return [
    [bounds.minLng, bounds.minLat],
    [bounds.maxLng, bounds.maxLat]
  ];
}

function getGeometryBounds(geometry) {
  if (!geometry?.coordinates) return null;
  const bounds = {
    minLng: Infinity,
    minLat: Infinity,
    maxLng: -Infinity,
    maxLat: -Infinity
  };

  collectGeometryCoordinates(geometry.coordinates, (coordinate) => {
    const [lng, lat] = coordinate;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    bounds.minLng = Math.min(bounds.minLng, lng);
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLng = Math.max(bounds.maxLng, lng);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
  });

  return Number.isFinite(bounds.minLng) ? bounds : null;
}

function collectGeometryCoordinates(value, callback) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
    callback(value);
    return;
  }
  value.forEach((item) => collectGeometryCoordinates(item, callback));
}

function expandCircleBounds(center, radiusKm) {
  if (!Array.isArray(center) || !Number.isFinite(radiusKm) || radiusKm <= 0) return [];
  const [lng, lat] = center;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [];
  const latRadius = radiusKm / 111.32;
  const lngRadius = radiusKm / Math.max(12, 111.32 * Math.cos(lat * Math.PI / 180));
  return [
    [lng - lngRadius, lat],
    [lng + lngRadius, lat],
    [lng, lat - latRadius],
    [lng, lat + latRadius]
  ];
}

function hasFreshKikikuruData(kikikuru, loadedAt) {
  return Boolean(
    kikikuru?.tileUrls &&
    !kikikuru.deferred &&
    !kikikuru.unavailable &&
    Date.now() - loadedAt < KIKIKURU_DATA_TTL_MS
  );
}

function hasFreshWarningDetails(warningData, loadedAt, options = {}) {
  const normalizedAreaCode = String(options.areaCode ?? "").trim();
  const requestedDetailsLoaded = options.includeEarlyWarnings
    ? Boolean(warningData?.earlyDetailsLoaded)
    : Boolean(
        normalizedAreaCode
        && warningData?.statusDetailAreaCodes?.some((areaCode) => String(areaCode) === normalizedAreaCode)
      );
  return requestedDetailsLoaded && loadedAt > 0 && Date.now() - loadedAt < WARNING_DETAILS_TTL_MS;
}

function requestCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, LOCATION_WATCH_OPTIONS);
  });
}

function getPositionCoordinates(position) {
  const longitude = Number(position?.coords?.longitude);
  const latitude = Number(position?.coords?.latitude);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return [longitude, latitude];
}

function getDistanceMeters(from, to) {
  if (!Array.isArray(from) || !Array.isArray(to)) return Number.POSITIVE_INFINITY;
  const [fromLon, fromLat] = from.map(Number);
  const [toLon, toLat] = to.map(Number);
  if (![fromLon, fromLat, toLon, toLat].every(Number.isFinite)) return Number.POSITIVE_INFINITY;

  const earthRadiusMeters = 6371000;
  const toRadians = (value) => value * Math.PI / 180;
  const dLat = toRadians(toLat - fromLat);
  const dLon = toRadians(toLon - fromLon);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildCurrentLocationError(error) {
  const code = Number(error?.code);
  if (code === 1) {
    return {
      status: "error",
      message: "位置情報の利用が許可されていません。"
    };
  }
  if (code === 3) {
    return {
      status: "error",
      message: "位置情報の取得がタイムアウトしました。"
    };
  }
  return {
    status: "error",
    message: "現在地を取得できませんでした。"
  };
}

function getLaunchOptions() {
  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get("tab");
  const initialTab = TABS.some((tab) => tab.id === tabParam) ? tabParam : "radar";
  return { initialTab };
}

function syncActiveTabToUrl(tabId) {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === tabId) return;
    url.searchParams.set("tab", tabId);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch (error) {
    console.warn("[MeteoScope] tab URL sync failed", error);
  }
}

function mergeRefreshedData(tabId, currentData, nextData) {
  if (tabId === "warnings") return mergeWarningTabData(currentData, nextData);
  if (tabId === "amedas") return mergeAmedasData(currentData, nextData);
  if (tabId !== "radar" || !currentData?.frames?.length || !nextData?.frames?.length) return nextData;

  const currentIndex = clampIndex(currentData.activeFrameIndex, currentData.frames);
  const currentFrame = currentData.frames[currentIndex] ?? null;
  const currentLatestObservationIndex = findLatestRadarObservationIndex(currentData.frames);
  const nextLatestObservationIndex = findLatestRadarObservationIndex(nextData.frames);

  if (currentIndex === currentLatestObservationIndex && nextLatestObservationIndex >= 0) {
    return { ...nextData, activeFrameIndex: nextLatestObservationIndex };
  }

  const sameFrameIndex = nextData.frames.findIndex((frame) =>
    frame.validtime === currentFrame?.validtime &&
    frame.isForecast === currentFrame?.isForecast
  );

  return {
    ...nextData,
    activeFrameIndex: sameFrameIndex >= 0
      ? sameFrameIndex
      : clampIndex(currentIndex, nextData.frames)
  };
}

function mergeAmedasData(currentData, nextData) {
  if (!currentData || !nextData) return nextData;
  return {
    ...nextData,
    temperatureRankings: nextData.temperatureRankings?.status === "ok"
      ? nextData.temperatureRankings
      : currentData.temperatureRankings,
    windRankings: nextData.windRankings?.status === "ok"
      ? nextData.windRankings
      : currentData.windRankings,
    pressureRankings: nextData.pressureRankings?.status === "ok"
      ? nextData.pressureRankings
      : currentData.pressureRankings
  };
}

function mergeWarningTabData(currentData, nextData = {}) {
  if (!currentData) return nextData;
  if (nextData.detailsLoaded) {
    const activeAreas = mergeWarningAreaDetails(currentData.activeAreas, nextData.activeAreas);
    const outlookAreas = mergeWarningOutlookAreas(currentData.outlookAreas, nextData.outlookAreas);
    const groups = mergeWarningGroupDetails(nextData.groups, activeAreas);
    const statusDetailAreaCodes = [...new Set([
      ...(currentData.statusDetailAreaCodes ?? []),
      ...(nextData.statusDetailAreaCodes ?? [])
    ].map(String))];
    const preserveEarlyDetails = !nextData.earlyDetailsLoaded && currentData.earlyDetailsLoaded;
    return {
      ...currentData,
      ...nextData,
      activeAreas,
      outlookAreas,
      groups,
      earlyWarnings: preserveEarlyDetails ? currentData.earlyWarnings : nextData.earlyWarnings,
      earlyAreas: preserveEarlyDetails ? currentData.earlyAreas : nextData.earlyAreas,
      earlyMunicipalityAreas: preserveEarlyDetails
        ? currentData.earlyMunicipalityAreas
        : nextData.earlyMunicipalityAreas,
      statusDetailsLoaded: Boolean(currentData.statusDetailsLoaded || nextData.statusDetailsLoaded),
      statusDetailAreaCodes,
      earlyDetailsLoaded: Boolean(currentData.earlyDetailsLoaded || nextData.earlyDetailsLoaded),
      detailsLoaded: true,
      kikikuru: nextData.kikikuru ?? currentData.kikikuru,
      riverFlood: nextData.riverFlood ?? currentData.riverFlood
    };
  }

  return {
    ...currentData,
    ...nextData,
    earlyWarnings: currentData.earlyWarnings ?? nextData.earlyWarnings,
    earlyAreas: currentData.earlyAreas ?? nextData.earlyAreas,
    earlyMunicipalityAreas: currentData.earlyMunicipalityAreas ?? nextData.earlyMunicipalityAreas,
    kikikuru: currentData.kikikuru ?? nextData.kikikuru,
    riverFlood: currentData.riverFlood ?? nextData.riverFlood,
    statusDetailsLoaded: Boolean(currentData.statusDetailsLoaded),
    statusDetailAreaCodes: currentData.statusDetailAreaCodes ?? [],
    earlyDetailsLoaded: Boolean(currentData.earlyDetailsLoaded),
    detailsLoaded: Boolean(currentData.detailsLoaded)
  };
}

function mergeWarningAreaDetails(currentAreas = [], nextAreas = []) {
  const currentByCode = new Map((currentAreas ?? []).map((area) => [String(area.areaCode), area]));
  return (nextAreas ?? []).map((area) => {
    const current = currentByCode.get(String(area.areaCode));
    if (!current || area.outlook?.length) return area;
    return { ...area, outlook: current.outlook ?? [] };
  });
}

function mergeWarningOutlookAreas(currentAreas = [], nextAreas = []) {
  const merged = new Map((currentAreas ?? []).map((area) => [String(area.areaCode), area]));
  (nextAreas ?? []).forEach((area) => merged.set(String(area.areaCode), area));
  return [...merged.values()];
}

function mergeWarningGroupDetails(nextGroups = [], activeAreas = []) {
  const detailByCode = new Map((activeAreas ?? []).map((area) => [String(area.areaCode), area]));
  return (nextGroups ?? []).map((group) => ({
    ...group,
    areas: (group.areas ?? []).map((area) => detailByCode.get(String(area.areaCode)) ?? area)
  }));
}

function clampIndex(index, items = []) {
  if (!items.length) return 0;
  return Math.max(0, Math.min(items.length - 1, Number(index) || 0));
}
