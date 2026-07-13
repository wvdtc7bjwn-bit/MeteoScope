import { AMEDAS_METRICS, AUTO_REFRESH_INTERVAL_MS, AUTO_REFRESH_RESUME_THROTTLE_MS, EARTHQUAKE_REFRESH_INTERVAL_MS, KIKIKURU_LAYER_OPTIONS, TABS } from "./config.js";
import { createWeatherMap } from "./map/weatherMap.js";
import { setupTabs } from "./ui/tabs.js";
import { setupAmedasDailyChartToggle, setupAmedasRankingToggle, setupAmedasSubTabs, setupEarthquakeSelector, setupKikikuruLayerToggles, setupMobileDockSegmentedControls, setupRadarControls, setupRadarOverlayToggle, setupTyphoonSelector, setupWarningAreaSelection, setupWeatherChartControls, updateLeftPanel } from "./ui/leftPanel.js";
import { setupLegendToggle } from "./ui/legendToggle.js";
import { setupPanelToggle } from "./ui/panelToggle.js";
import { setupFeedbackModal } from "./ui/feedbackModal.js";
import { setupOnboardingModal } from "./ui/onboardingModal.js";
import { openSettingsModal, refreshSettingsModalView, setupSettingsModal } from "./ui/settingsModal.js";
import {
  clearStoredDisasterMapPdf,
  getStoredDisasterMapPdfInfo,
  setupDisasterMapModal
} from "./ui/disasterMapModal.js";
import { startClock } from "./ui/time.js";
import { fetchRadarTimes } from "./jma/radar.js";
import { fetchAmedasDailySeries, fetchAmedasLatestTime } from "./jma/amedas.js";
import { fetchWarningDetails, fetchWarningMap } from "./jma/warnings.js";
import { fetchTyphoonList } from "./jma/typhoon.js";
import { fetchEarthquakeXmlList } from "./jma/earthquakeXml.js";
import { fetchKikikuruTiles } from "./jma/kikikuru.js";
import { fetchRiverFloodForecasts } from "./jma/riverFlood.js";
import { activateWeatherChartFrame, fetchWeatherChart, findLatestWeatherChartFrameIndex } from "./jma/weatherChart.js";
import { resolveCurrentLocationInfo, searchMunicipalities } from "./location/currentLocation.js";
import { addMyArea, getMyAreaLimit, loadMyAreas, removeMyArea } from "./location/myAreas.js";
import { buildLocationRadarTimeline } from "./location/radarTimeline.js";
import { sampleCurrentKikikuruStatus } from "./location/kikikuruStatus.js";
import { createLocationWarningPush } from "./push/locationWarningPush.js";
import { setupRemoteConfig } from "./remoteConfig.js";
import { setupTheme } from "./ui/theme.js";
import { activateEarlyAccess, deactivateEarlyAccess, validateEarlyAccess } from "./ui/earlyAccess.js";

const loaders = {
  radar: fetchRadarTimes,
  amedas: fetchAmedasLatestTime,
  warnings: fetchWarningTabData,
  typhoon: fetchTyphoonList,
  earthquake: fetchEarthquakeXmlList
};

const KIKIKURU_DATA_TTL_MS = 60 * 1000;
const WARNING_DETAILS_TTL_MS = 60 * 1000;
const RIVER_FLOOD_DATA_TTL_MS = 60 * 1000;
const WEATHER_CHART_DATA_TTL_MS = 10 * 60 * 1000;
const LOCATION_WATCH_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 20000,
  maximumAge: 60 * 1000
};
const LOCATION_RESOLVE_MIN_DISTANCE_METERS = 250;
const LOCATION_RESOLVE_MIN_INTERVAL_MS = 60 * 1000;

async function fetchWarningTabData(options = {}) {
  const includeDetails = Boolean(options.includeDetails);
  if (!includeDetails) {
    return {
      ...await fetchWarningMap({ includeDetails: false }),
      kikikuru: { unavailable: true, deferred: true }
    };
  }

  return await fetchWarningDetails();
}

export function createWeatherApp() {
  const themeController = setupTheme();
  setupRemoteConfig();

  const launchOptions = getLaunchOptions();
  let activeTab = launchOptions.initialTab;
  let activeAmedasMetric = AMEDAS_METRICS[0].id;
  let selectedAmedasStationId = "";
  let earlyAccessState = { status: "checking", active: false, message: "認証状態を確認中です。" };
  let earlyAccessEnabled = false;
  let amedasDailyChartDayOffset = 0;
  let amedasDailyChart = { status: "idle", stationId: "", stationName: "", metricId: "", dayOffset: 0, data: null };
  let amedasDailyChartRequestId = 0;
  let activeWarningView = "status";
  let activeKikikuruLayer = KIKIKURU_LAYER_OPTIONS[0]?.id ?? "land";
  let activeTyphoonId = "";
  let activeEarthquakeId = "";
  let weatherMap = null;
  let latestDataByTab = {};
  let radarPlayTimer = null;
  let autoRefreshTimer = null;
  let earthquakeRefreshTimer = null;
  let activeLoadRequestId = 0;
  let autoRefreshInFlight = false;
  let earthquakeRefreshRequest = null;
  let lastAutoRefreshStartedAt = 0;
  let lastEarthquakeRefreshStartedAt = 0;
  let tabControls = null;
  let currentLocationInfo = { status: "idle" };
  let myAreas = loadMyAreas();
  let locationRadarTimeline = { status: "idle", points: [] };
  let locationRadarRequestId = 0;
  let currentKikikuruStatus = { status: "idle", elementId: activeKikikuruLayer };
  let currentKikikuruRequestId = 0;
  let locationWatchId = null;
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
  const locationWarningPush = createLocationWarningPush({
    onChange: () => refreshSettingsModalView()
  });
  const loadRequestsByTab = new Map();
  let warningDetailsRequest = null;
  let warningKikikuruRequest = null;
  let riverFloodRequest = null;
  let warningDetailsTimer = null;
  let warningFullRefreshTimer = null;
  let warningDetailsLoadedAt = 0;
  let warningKikikuruLoadedAt = 0;
  let riverFloodLoadedAt = 0;
  let backgroundPrefetchStarted = false;

  async function selectTab(tabId) {
    const tab = TABS.find((item) => item.id === tabId) ?? TABS[0];
    activeTab = tab.id;
    syncActiveTabToUrl(tab.id);
    tabControls?.setActiveButton(tab.id);
    try {
      if (tab.id !== "radar") stopRadarPlayback();
      weatherMap?.setMode(tab.id);
    } catch (error) {
      console.warn("[MeteoScope] tab map update failed", error);
    }

    const requestId = ++activeLoadRequestId;
    const cachedData = latestDataByTab[tab.id];
    if (cachedData) {
      let cachedViewUpdated = false;
      try {
        updateCurrentView(tab, cachedData);
        cachedViewUpdated = true;
      } catch (error) {
        console.warn("[MeteoScope] cached tab view update failed", error);
      }
      if (tab.id === "earthquake") {
        refreshEarthquakeData({ force: true });
      }
      if (tab.id === "warnings" && cachedViewUpdated) {
        queueWarningFullRefresh({ delayMs: 700 });
        scheduleBackgroundPrefetch(tab.id);
        return;
      }
    } else {
      updateLeftPanel(tab, {
        status: "loading",
        amedasMetric: activeAmedasMetric,
        warningView: activeWarningView,
        activeKikikuruLayer,
        radarPlaying: Boolean(radarPlayTimer),
        currentLocation: currentLocationInfo,
        myAreas,
        locationInsights: buildLocationInsights(tab.id, null),
        weatherChartEnabled,
        weatherChartStatus,
        weatherChart: weatherChartData
      });
    }

    try {
      const data = await loadTabData(tab.id);
      if (requestId !== activeLoadRequestId || activeTab !== tab.id) return;
      latestDataByTab[tab.id] = data;
      updateCurrentView(tab, data);
      if (tab.id === "warnings") queueWarningFullRefresh({ delayMs: 350 });
      scheduleBackgroundPrefetch(tab.id);
    } catch (error) {
      if (requestId !== activeLoadRequestId || activeTab !== tab.id) return;
      console.warn(`[MeteoScope] ${tab.id} load failed`, error);
      updateLeftPanel(tab, {
        status: "error",
        error,
        amedasMetric: activeAmedasMetric,
        warningView: activeWarningView,
        activeKikikuruLayer,
        radarPlaying: Boolean(radarPlayTimer),
        currentLocation: currentLocationInfo,
        myAreas,
        locationInsights: buildLocationInsights(tab.id, null),
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
    if (selectedPoint && amedasDailyChart.metricId !== activeAmedasMetric) {
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
    refreshWeatherChartAccessMode();
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
      if (activeTab !== "warnings") return;
      const tab = TABS.find((item) => item.id === "warnings");
      updateCurrentView(tab, latestDataByTab.warnings);
      if (activeWarningView === "early") refreshWarningDetails();
      else scheduleWarningDetailsRefresh();
      return;
    }

    if (layerId === "early") {
      activeWarningView = "early";
      if (activeTab !== "warnings") return;
      const tab = TABS.find((item) => item.id === "warnings");
      updateCurrentView(tab, latestDataByTab.warnings);
      refreshWarningDetails();
      return;
    }

if (layerId === "river") {
      activeWarningView = "river";
      if (activeTab !== "warnings") return;
      const tab = TABS.find((item) => item.id === "warnings");
      if (!latestDataByTab.warnings?.riverFlood) {
        latestDataByTab.warnings = {
          ...(latestDataByTab.warnings ?? {}),
          riverFlood: { status: "loading", reports: [], riverFeatures: { type: "FeatureCollection", features: [] } }
        };
      }
      updateCurrentView(tab, latestDataByTab.warnings);
      cancelScheduledWarningDetailsRefresh();
      void refreshRiverFloodData();
      return;
    }

    if (layerId !== "kikikuru" && !KIKIKURU_LAYER_OPTIONS.some((element) => element.id === layerId)) return;
    activeWarningView = "kikikuru";
    if (layerId !== "kikikuru") activeKikikuruLayer = layerId;
    currentKikikuruStatus = { status: "loading", elementId: activeKikikuruLayer };
    if (activeTab !== "warnings") return;
    const tab = TABS.find((item) => item.id === "warnings");
    updateCurrentView(tab, latestDataByTab.warnings);
    cancelScheduledWarningDetailsRefresh();
    void refreshKikikuruData();
  }

  function selectTyphoon(typhoonId) {
    activeTyphoonId = String(typhoonId ?? "");
    if (activeTab !== "typhoon") return;
    const tab = TABS.find((item) => item.id === "typhoon");
    updateCurrentView(tab, latestDataByTab.typhoon);
    focusSelectedTyphoon();
  }

  function selectEarthquake(earthquakeId) {
    activeEarthquakeId = String(earthquakeId ?? "");
    if (activeTab !== "earthquake") return;
    const tab = TABS.find((item) => item.id === "earthquake");
    updateCurrentView(tab, latestDataByTab.earthquake);
    focusSelectedEarthquake();
  }

  function focusSelectedTyphoon() {
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

  async function loadAmedasDailyChart(point, metricId, dayOffset = amedasDailyChartDayOffset) {
    const requestId = ++amedasDailyChartRequestId;
    amedasDailyChart = {
      status: "loading",
      stationId: String(point.id),
      stationName: point.name,
      metricId,
      dayOffset,
      data: null
    };
    refreshAmedasPanel();

    try {
      const data = await fetchAmedasDailySeries(point.id, latestDataByTab.amedas?.latestRawTime, metricId, dayOffset);
      if (requestId !== amedasDailyChartRequestId) return;
      amedasDailyChart = {
        status: "ok",
        stationId: String(point.id),
        stationName: point.name,
        metricId,
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
        dayOffset,
        data: null
      };
    }
    refreshAmedasPanel();
  }

  function updateCurrentView(tab, data) {
    const displayData = buildDisplayData(tab, data);
    if (tab.id === "radar") {
      displayData.weatherChartEnabled = weatherChartEnabled;
      displayData.weatherChartStatus = weatherChartStatus;
      displayData.weatherChart = weatherChartData;
    }
    if (tab.id === "radar") ensureLocationRadarTimeline(displayData);
    updateLeftPanel(tab, {
      status: "ok",
      data: displayData,
      amedasMetric: activeAmedasMetric,
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
      weatherChartEnabled,
      weatherChartStatus,
      weatherChart: weatherChartData
    });
    weatherMap?.renderData(tab.id, displayData);
  }

  function buildDisplayData(tab, data = {}) {
    if (tab.id === "amedas") return { ...data, activeMetric: activeAmedasMetric };
    if (tab.id === "warnings") return { ...data, activeWarningView, activeKikikuruLayer, currentKikikuruStatus };
    if (tab.id === "typhoon") return buildTyphoonDisplayData(data);
    if (tab.id === "earthquake") return buildEarthquakeDisplayData(data);
    if (tab.id !== "radar") return data;

    const frames = data.frames ?? [];
    const activeFrameIndex = clampRadarIndex(data.activeFrameIndex ?? 0, frames);
    const activeFrame = frames[activeFrameIndex] ?? null;
    return {
      ...data,
      activeFrameIndex,
      activeFrame,
      latestTime: activeFrame?.label ?? data.latestTime,
      latestRawTime: activeFrame?.validtime ?? data.latestRawTime,
      radarTileUrl: weatherChartEnabled ? null : (activeFrame?.radarTileUrl ?? data.radarTileUrl)
    };
  }

  function buildTyphoonDisplayData(data = {}) {
    const typhoons = data.typhoons ?? [];
    if (!typhoons.length) {
      activeTyphoonId = "";
      return data;
    }

    const selected = typhoons.find((typhoon) => String(typhoon.id) === String(activeTyphoonId))
      ?? typhoons[0];
    activeTyphoonId = String(selected.id ?? "");

    return {
      ...data,
      selectedTyphoonId: activeTyphoonId,
      selectedTyphoon: selected,
      details: selected.details ?? data.details,
      latestTime: selected.updatedAt ?? data.latestTime,
      updatedAt: selected.updatedAt ?? data.updatedAt
    };
  }

  function buildEarthquakeDisplayData(data = {}) {
    const earthquakes = data.earthquakes ?? [];
    if (!earthquakes.length) {
      activeEarthquakeId = "";
      return data;
    }

    const selected = earthquakes.find((earthquake) => String(earthquake.id) === String(activeEarthquakeId))
      ?? earthquakes[0];
    activeEarthquakeId = String(selected.id ?? "");

    return {
      ...data,
      selectedEarthquakeId: activeEarthquakeId,
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
      return {
        type: "myAreas",
        areas: buildMyAreaWarningSummaries(data ?? latestDataByTab.warnings)
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

  function buildMyAreaWarningSummaries(data = {}) {
    if (!myAreas.length) return [];
    const activeAreaByCode = new Map((data?.activeAreas ?? []).map((area) => [String(area.areaCode), area]));
    return myAreas.map((area) => {
      const activeArea = activeAreaByCode.get(String(area.areaCode));
      return {
        ...area,
        warnings: activeArea?.warnings ?? [],
        updatedAt: activeArea?.updatedAt ?? data?.updatedAt ?? data?.latestTime ?? "",
        hasWarnings: Boolean(activeArea?.warnings?.length)
      };
    });
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

  function stepRadarFrame(delta) {
    const radarData = latestDataByTab.radar;
    if (!radarData?.frames?.length) return;
    selectRadarFrame((radarData.activeFrameIndex ?? 0) + delta);
  }

  function goLatestRadarObservation() {
    const radarData = latestDataByTab.radar;
    if (!radarData?.frames?.length) return;
    const latestObservationIndex = findLatestObservationIndex(radarData.frames);
    selectRadarFrame(latestObservationIndex >= 0 ? latestObservationIndex : radarData.frames.length - 1);
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
    selectWeatherChartFrame(findLatestWeatherChartFrameIndex(weatherChartData.frames));
  }

  function toggleRadarPlayback() {
    if (radarPlayTimer) {
      stopRadarPlayback();
      refreshRadarPanel();
      return;
    }

    radarPlayTimer = window.setInterval(() => {
      const radarData = latestDataByTab.radar;
      if (!radarData?.frames?.length || activeTab !== "radar") {
        stopRadarPlayback();
        return;
      }
      const nextIndex = ((radarData.activeFrameIndex ?? 0) + 1) % radarData.frames.length;
      selectRadarFrame(nextIndex);
    }, 850);
    refreshRadarPanel();
  }

  function stopRadarPlayback() {
    if (!radarPlayTimer) return;
    window.clearInterval(radarPlayTimer);
    radarPlayTimer = null;
  }

  function refreshRadarPanel() {
    if (activeTab !== "radar" || !latestDataByTab.radar) return;
    const tab = TABS.find((item) => item.id === "radar");
    updateCurrentView(tab, latestDataByTab.radar);
  }

  async function toggleWeatherChartOverlay(overlayId) {
    if (overlayId !== "weather-chart") return;
    weatherChartEnabled = !weatherChartEnabled;
    if (weatherChartEnabled) stopRadarPlayback();

    if (!weatherChartEnabled) {
      weatherChartStatus = weatherChartData ? "ok" : "idle";
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

  async function refreshActiveTab({ force = false } = {}) {
    if (document.hidden || autoRefreshInFlight) return;
    const now = Date.now();
    if (!force && now - lastAutoRefreshStartedAt < AUTO_REFRESH_RESUME_THROTTLE_MS) return;

    const tab = TABS.find((item) => item.id === activeTab) ?? TABS[0];
    if (!loaders[tab.id]) return;
    if (tab.id === "earthquake") {
      await refreshEarthquakeData({ force });
      return;
    }

    autoRefreshInFlight = true;
    lastAutoRefreshStartedAt = now;
    try {
      const nextData = await loadTabData(tab.id);
      if (activeTab !== tab.id) return;
      latestDataByTab[tab.id] = mergeRefreshedData(tab.id, latestDataByTab[tab.id], nextData);
      updateCurrentView(tab, latestDataByTab[tab.id]);
      if (tab.id === "warnings") queueWarningFullRefresh({ force: true, delayMs: 0 });
    } catch (error) {
      console.warn(`[MeteoScope] ${tab.id} auto refresh failed`, error);
    } finally {
      autoRefreshInFlight = false;
    }
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
        console.warn("[MeteoScope] earthquake realtime refresh failed", error);
        return latestDataByTab.earthquake;
      })
      .finally(() => {
        earthquakeRefreshRequest = null;
      });

    return earthquakeRefreshRequest;
  }

  async function locateCurrentPosition() {
    if (!navigator.geolocation) {
      currentLocationInfo = {
        status: "error",
        message: "このブラウザでは位置情報を利用できません。"
      };
      refreshSettingsModalView();
      refreshActivePanel();
      return;
    }

    setLocateButtonBusy(true);
    if (locationWatchId === null) startLocationWatch();
    currentLocationInfo = {
      status: "loading",
      message: "現在地を取得中です..."
    };
    refreshActivePanel();

    try {
      const position = await requestCurrentPosition();
      await applyCurrentPosition(position, { forceResolve: true, flyTo: true });
    } catch (error) {
      currentLocationInfo = buildCurrentLocationError(error);
      refreshSettingsModalView();
      refreshActivePanel();
    } finally {
      setLocateButtonBusy(false);
    }
  }

  function startLocationWatch() {
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

    currentLocationInfo = {
      status: "loading",
      message: "現在地を取得中です..."
    };
    refreshSettingsModalView();
    refreshActivePanel();

    locationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        applyCurrentPosition(position).catch((error) => {
          console.warn("[MeteoScope] current location watch update failed", error);
        });
      },
      (error) => {
        if (Number(error?.code) === 1) stopLocationWatch();
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
    if (options.flyTo) weatherMap?.flyToLocation(coordinates);

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
      void locationWarningPush.sync(nextInfo);
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

    updateLeftPanel(tab, {
      status: "loading",
      amedasMetric: activeAmedasMetric,
      warningView: activeWarningView,
      activeKikikuruLayer,
      radarPlaying: Boolean(radarPlayTimer),
      currentLocation: currentLocationInfo,
      myAreas,
      locationInsights: buildLocationInsights(tab.id, null),
      weatherChartEnabled,
      weatherChartStatus,
      weatherChart: weatherChartData
    });
  }

  function setLocateButtonBusy(isBusy) {
    const button = document.getElementById("locate-button");
    if (!button) return;
    button.classList.toggle("loading", isBusy);
    button.disabled = isBusy;
    button.setAttribute("aria-busy", isBusy ? "true" : "false");
  }

  function startAutoRefresh() {
    if (autoRefreshTimer) window.clearInterval(autoRefreshTimer);
    autoRefreshTimer = window.setInterval(() => {
      refreshActiveTab({ force: true });
    }, AUTO_REFRESH_INTERVAL_MS);

    if (earthquakeRefreshTimer) window.clearInterval(earthquakeRefreshTimer);
    earthquakeRefreshTimer = window.setInterval(() => {
      refreshEarthquakeData();
    }, EARTHQUAKE_REFRESH_INTERVAL_MS);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        refreshActiveTab();
        refreshEarthquakeData({ force: true });
      }
    });
    window.addEventListener("focus", () => {
      refreshActiveTab();
      refreshEarthquakeData({ force: true });
    });
  }

  function scheduleBackgroundPrefetch(excludeTabId) {
    if (backgroundPrefetchStarted) return;
    backgroundPrefetchStarted = true;

    const run = () => {
      TABS
        .filter((tab) => tab.id !== excludeTabId && loaders[tab.id])
        .forEach((tab, index) => {
          window.setTimeout(() => {
            prefetchTabData(tab.id);
          }, index * 600);
        });
    };

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run, { timeout: 2500 });
    } else {
      window.setTimeout(run, 1200);
    }
  }

  async function prefetchTabData(tabId) {
    if (latestDataByTab[tabId] || document.hidden) return;
    try {
      latestDataByTab[tabId] = await loadTabData(tabId);
    } catch (error) {
      console.warn(`[MeteoScope] ${tabId} prefetch failed`, error);
    }
  }

  function scheduleWarningDetailsRefresh() {
    if (latestDataByTab.warnings?.detailsLoaded || warningDetailsRequest || warningDetailsTimer) return;
    warningDetailsTimer = window.setTimeout(() => {
      warningDetailsTimer = null;
      if (activeTab !== "warnings" || activeWarningView !== "status") return;
      refreshWarningDetails();
    }, 1800);
  }

  function cancelScheduledWarningDetailsRefresh() {
    if (!warningDetailsTimer) return;
    window.clearTimeout(warningDetailsTimer);
    warningDetailsTimer = null;
  }

  function queueWarningFullRefresh({ force = false, delayMs = 0 } = {}) {
    if (warningFullRefreshTimer) {
      window.clearTimeout(warningFullRefreshTimer);
      warningFullRefreshTimer = null;
    }
    warningFullRefreshTimer = window.setTimeout(() => {
      warningFullRefreshTimer = null;
      if (activeTab !== "warnings") return;
      refreshAllWarningData({ force });
    }, delayMs);
  }

  async function refreshWarningDetails() {
    return refreshWarningDetailsData();
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
  async function refreshWarningDetailsData({ force = false } = {}) {
    if (!force && hasFreshWarningDetails(latestDataByTab.warnings, warningDetailsLoadedAt)) return latestDataByTab.warnings;
    if (warningDetailsRequest) return warningDetailsRequest;
    cancelScheduledWarningDetailsRefresh();
    warningDetailsRequest = fetchWarningTabData({ includeDetails: true })
      .then(async (detailsData) => {
        latestDataByTab.warnings = mergeWarningTabData(latestDataByTab.warnings, detailsData);
        warningDetailsLoadedAt = Date.now();
        await refreshCurrentLocationWarningInfo(latestDataByTab.warnings);
        refreshWarningsView();
        return latestDataByTab.warnings;
      })
      .catch((error) => {
        console.warn("[MeteoScope] warning detail load failed", error);
        return latestDataByTab.warnings;
      })
      .finally(() => {
        warningDetailsRequest = null;
      });
    return warningDetailsRequest;
  }

  async function refreshAllWarningData({ force = false } = {}) {
    const tasks = [
      refreshWarningDetailsData({ force }),
      refreshKikikuruData({ force })
    ];
    if (activeWarningView === "river" || latestDataByTab.warnings?.riverFlood) {
      tasks.push(refreshRiverFloodData({ force }));
    }
    const results = await Promise.allSettled(tasks);
    results.filter((result) => result.status === "rejected").forEach((result) => {
      console.warn("[MeteoScope] warning data refresh failed", result.reason);
    });
    return latestDataByTab.warnings;
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
        refreshWarningsView({ view: "river" });
        return latestDataByTab.warnings;
      })
      .catch((error) => {
        console.warn("[MeteoScope] river flood load failed", error);
        latestDataByTab.warnings = {
          ...(latestDataByTab.warnings ?? {}),
          riverFlood: { status: "error", error, reports: [], riverFeatures: { type: "FeatureCollection", features: [] } }
        };
        refreshWarningsView({ view: "river" });
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
        refreshWarningsView({ view: "kikikuru" });
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
    updateCurrentView(tab, latestDataByTab.warnings);
  }

  function getSettingsState() {
    return {
      myAreas,
      currentLocation: currentLocationInfo,
      locationWarningPush: locationWarningPush.getState(),
      myAreaLimit: getMyAreaLimit(),
      themePreference: themeController.getPreference(),
      earlyAccessEnabled,
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

  async function toggleLocationWarningPush() {
    const pushState = locationWarningPush.getState();
    if (pushState.enabled || pushState.subscribed) {
      await locationWarningPush.disable();
    } else {
      await locationWarningPush.enable(currentLocationInfo);
    }
    refreshSettingsModalView();
  }

  async function toggleLocationWarningAdvisory() {
    const pushState = locationWarningPush.getState();
    await locationWarningPush.setNotifyAdvisory(!pushState.notifyAdvisory, currentLocationInfo);
    refreshSettingsModalView();
  }

  function start() {
    weatherMap = createWeatherMap("map");
    weatherMap.setTheme(themeController.getResolvedTheme());
    themeController.subscribe(({ resolvedTheme }) => weatherMap?.setTheme(resolvedTheme));
    weatherMap.initialize();
    tabControls = setupTabs({ onChange: selectTab, tabs: TABS });
    setupAmedasSubTabs({ onChange: selectAmedasMetric });
    setupAmedasDailyChartToggle({ onChange: selectAmedasDailyChartDay });
    setupMobileDockSegmentedControls();
    setupAmedasRankingToggle({ onChange: refreshAmedasPanel, onSelectStation: focusAmedasStation });
    window.addEventListener("amedas-station-select", (event) => {
      const stationId = event.detail?.stationId;
      if (stationId) selectAmedasStation(stationId);
    });
    setupKikikuruLayerToggles({ onChange: selectKikikuruLayer });
    setupWarningAreaSelection({ onDetailRequest: () => refreshWarningDetails() });
    setupTyphoonSelector({ onChange: selectTyphoon });
    setupEarthquakeSelector({ onChange: selectEarthquake });
    setupRadarControls({
      onSeek: selectRadarFrame,
      onStep: stepRadarFrame,
      onTogglePlay: toggleRadarPlayback,
      onGoLatest: goLatestRadarObservation
    });
    setupRadarOverlayToggle({ onChange: toggleWeatherChartOverlay });
    setupWeatherChartControls({
      onSeek: selectWeatherChartFrame,
      onPreview: previewWeatherChartFrame,
      onStep: stepWeatherChartFrame,
      onGoLatest: goLatestWeatherChartFrame
    });
    setupLegendToggle();
    setupPanelToggle({ onLayoutChange: () => weatherMap?.resize() });
    const onboarding = setupOnboardingModal({ onOpenSettings: openSettingsModal });
    setupSettingsModal({
      getState: getSettingsState,
      onSearchArea: searchSettingsAreas,
      onAddArea: addSettingsMyArea,
      onAddCurrentLocation: addCurrentLocationToMyAreas,
      onRemoveArea: removeSettingsMyArea,
      getDisasterMapPdfInfo: getStoredDisasterMapPdfInfo,
      onClearDisasterMapPdf: clearStoredDisasterMapPdf,
      onToggleLocationWarningPush: toggleLocationWarningPush,
      onToggleLocationWarningAdvisory: toggleLocationWarningAdvisory,
      onThemeChange: (theme) => themeController.setPreference(theme),
      onActivateEarlyAccess: authenticateEarlyAccess,
      onDeactivateEarlyAccess: releaseEarlyAccess,
      onOpenGuide: onboarding.open,
      tabs: TABS,
      getTabOrder: () => tabControls?.getOrder?.() ?? TABS.map((tab) => tab.id),
      onTabOrderChange: (order) => tabControls?.setOrder?.(order) ?? order
    });
    setupDisasterMapModal();
    setupFeedbackModal();
    document.getElementById("locate-button")?.addEventListener("click", locateCurrentPosition);
    startClock("clock");
    startAutoRefresh();
    void locationWarningPush.initialize().then(() => refreshSettingsModalView());
    startLocationWatch();
    selectTab(activeTab);
    void refreshEarlyAccess();
    onboarding.showFirstRun();
  }

  return { start, selectTab };
}

function buildTyphoonFocusCoordinates(typhoon) {
  if (!typhoon) return [];
  const coordinates = [
    typhoon.center,
    ...(typhoon.forecastTrack ?? []),
    ...(typhoon.forecastCircles ?? []).flatMap((circle) => [
      circle.center,
      ...expandCircleBounds(circle.center, circle.radius)
    ])
  ];

  return coordinates.filter((point) =>
    Array.isArray(point)
    && point.length === 2
    && point.every((value) => Number.isFinite(value))
  );
}

function buildEarthquakeFocusCoordinates(earthquake) {
  if (!earthquake) return [];
  const coordinates = [
    earthquake.coordinates,
    ...(earthquake.intensityStations ?? []).map((station) => station.coordinates),
    ...(earthquake.intensityAreaFeatures ?? []).flatMap(getFeatureBoundsCoordinates)
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

function hasFreshWarningDetails(warningData, loadedAt) {
  return Boolean(
    warningData?.detailsLoaded &&
    loadedAt > 0 &&
    Date.now() - loadedAt < WARNING_DETAILS_TTL_MS
  );
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
  const currentLatestObservationIndex = findLatestObservationIndex(currentData.frames);
  const nextLatestObservationIndex = findLatestObservationIndex(nextData.frames);

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
    return {
      ...currentData,
      ...nextData,
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
    detailsLoaded: Boolean(nextData.detailsLoaded)
  };
}

function findLatestObservationIndex(frames = []) {
  return frames.reduce((latestIndex, frame, index) => frame.isForecast ? latestIndex : index, -1);
}

function clampIndex(index, items = []) {
  if (!items.length) return 0;
  return Math.max(0, Math.min(items.length - 1, Number(index) || 0));
}
