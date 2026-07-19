import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  AMEDAS_METRICS,
  DEFAULT_VIEW,
  getAmedasObservationColor,
  getEarthquakeIntensityColor,
  getEarthquakeIntensityRank,
  JMA_ENDPOINTS,
  KIKIKURU_ELEMENTS,
  MAP_DATA_ENDPOINTS
} from "../config.js";
import { formatEarthquakeDepthText } from "../earthquakeFormat.js";
import { worldLandGeoJson } from "./data/worldLandGeoJson.js";
import { worldCountriesGeoJson } from "./data/worldCountriesGeoJson.js";
import { planWarningFeatureStateChanges } from "./warningFeatureState.js";
import { WARNING_GEOMETRY_FIX_CODES } from "./warningGeometryFixCodes.js";
import { createHypocenter3DLayer } from "./hypocenter3DLayer.js";

const MODE_CLASS = {
  radar: "mode-radar",
  amedas: "mode-amedas",
  warnings: "mode-warnings",
  typhoon: "mode-typhoon",
  earthquake: "mode-earthquake"
};

const SAMPLE_SOURCE_ID = "weather-samples";
const SAMPLE_LAYERS = ["sample-fill", "sample-line", "sample-line-dashed", "sample-circle", "sample-wind-arrow", "sample-cross", "sample-label"];
const AMEDAS_INTERACTIVE_LAYERS = ["sample-circle", "sample-wind-arrow", "sample-label"];
const SAMPLE_CIRCLE_BASE_RADIUS = ["coalesce", ["get", "radius"], 8];
const SAMPLE_CIRCLE_RADIUS_EXPRESSION = buildCircleZoomExpression({
  zoomStops: [
    [3, 0.55, 0.3],
    [5, 0.72, 0.42],
    [7, 0.92, 0.65],
    [9, 1.12, 0.85],
    [10, 1.22, 1]
  ],
  fallbackValue: SAMPLE_CIRCLE_BASE_RADIUS,
  createValue: (scale) => ["*", SAMPLE_CIRCLE_BASE_RADIUS, scale]
});
const SAMPLE_CIRCLE_STROKE_WIDTH_EXPRESSION = buildCircleZoomExpression({
  zoomStops: [
    [3, 0.9, 0.6],
    [5, 1.2, 0.8],
    [7, 1.6, 1.2],
    [9, 1.9, 1.7],
    [10, 2.2, 2]
  ],
  fallbackValue: 2,
  createValue: (width) => width,
  overrideProperty: "strokeWidth"
});
const TYPHOON_SOURCE_ID = "jma-typhoon";
const TYPHOON_LAYERS = [
  "typhoon-wind-area-fill",
  "typhoon-wind-area-line",
  "typhoon-forecast-area-fill",
  "typhoon-forecast-circle-fill",
  "typhoon-forecast-area",
  "typhoon-warning-area-fill",
  "typhoon-warning-area",
  "typhoon-forecast-circle",
  "layer-typhoon-past-track",
  "typhoon-forecast-route",
  "typhoon-center-x",
  "typhoon-forecast-label",
  "typhoon-label"
];
const TYPHOON_FORECAST_INFO_LAYERS = [
  "typhoon-forecast-circle-fill",
  "typhoon-forecast-circle",
  "typhoon-forecast-label"
];
const WIND_ARROW_IMAGE_ID = "amedas-wind-arrow";
const RADAR_SOURCE_PREFIX = "jma-nowcast-radar-z";
const RADAR_LAYER_PREFIX = "jma-nowcast-radar-z";
const WEATHER_CHART_LINE_SOURCE_ID = "jma-weather-chart-lines";
const WEATHER_CHART_POINT_SOURCE_ID = "jma-weather-chart-points";
const WEATHER_CHART_LAYERS = [
  "weather-chart-isobar-line",
  "weather-chart-front-line",
  "weather-chart-front-cold-overview-symbol",
  "weather-chart-front-warm-overview-symbol",
  "weather-chart-front-cold-symbol",
  "weather-chart-front-warm-symbol",
  "weather-chart-front-stationary-cold-symbol",
  "weather-chart-front-stationary-warm-symbol",
  "weather-chart-front-occluded-symbol",
  "weather-chart-pressure-point",
  "weather-chart-isobar-label",
  "weather-chart-pressure-label",
  "weather-chart-pressure-value-label"
];
const WEATHER_CHART_MAX_ZOOM = 6.4;
const WEATHER_FRONT_COLD_IMAGE_ID = "weather-front-cold-triangle";
const WEATHER_FRONT_WARM_IMAGE_ID = "weather-front-warm-semicircle";
const WEATHER_FRONT_OCCLUDED_IMAGE_ID = "weather-front-occluded-pair";
const WEATHER_FRONT_SYMBOL_SIZE = ["interpolate", ["linear"], ["zoom"], 3, 0.42, 6, 0.58, 8, 0.72];
const WEATHER_FRONT_COMPACT_SYMBOL_SIZE = ["interpolate", ["linear"], ["zoom"], 2, 0.25, 3, 0.32, 6, 0.58, 8, 0.72];
const WEATHER_FRONT_OVERVIEW_MAX_ZOOM = 4.25;
const KIKIKURU_SOURCE_PREFIX = "jma-kikikuru";
const KIKIKURU_LAYER_PREFIX = "jma-kikikuru";
const RIVER_FLOOD_SOURCE_ID = "jma-river-flood";
const RIVER_FLOOD_LAYERS = ["jma-river-flood-casing", "jma-river-flood-line", "jma-river-flood-label"];
const JSHIS_MAJOR_FAULT_SOURCE_ID = "jshis-major-faults";
const JSHIS_MAJOR_FAULT_FILL_LAYER_ID = "jshis-major-fault-fill";
const JSHIS_MAJOR_FAULT_LINE_LAYER_ID = "jshis-major-fault-line";
const ACTIVE_FAULT_LAYERS = [
  JSHIS_MAJOR_FAULT_FILL_LAYER_ID,
  JSHIS_MAJOR_FAULT_LINE_LAYER_ID
];
const JSHIS_MAJOR_FAULT_INTERACTIVE_LAYERS = [JSHIS_MAJOR_FAULT_FILL_LAYER_ID, JSHIS_MAJOR_FAULT_LINE_LAYER_ID];
const PLATE_BOUNDARY_SOURCE_ID = "usgs-tectonic-plate-boundaries";
const PLATE_BOUNDARY_LAYER_IDS = {
  convergent: "usgs-plate-boundary-convergent",
  transform: "usgs-plate-boundary-transform",
  other: "usgs-plate-boundary-other"
};
const PLATE_BOUNDARY_LAYERS = Object.values(PLATE_BOUNDARY_LAYER_IDS);
const PLATE_DEPTH_SOURCE_ID = "usgs-slab2-depth-contours";
const PLATE_DEPTH_LINE_LAYER_ID = "usgs-slab2-depth-contour-line";
const PLATE_DEPTH_LABEL_LAYER_ID = "usgs-slab2-depth-contour-label";
const PLATE_DEPTH_LAYERS = [PLATE_DEPTH_LINE_LAYER_ID, PLATE_DEPTH_LABEL_LAYER_ID];
const PLATE_DEPTH_COLOR_EXPRESSION = [
  "interpolate", ["linear"], ["to-number", ["get", "depthKm"], 0],
  0, "#ef362b",
  30, "#ffda47",
  100, "#4be05b",
  300, "#45d3ee",
  700, "#1c44d2"
];
const KIKIKURU_ZOOM_LEVELS = [
  { id: "z4", z: 4, minzoom: 3, maxzoom: 5 },
  { id: "z6", z: 6, minzoom: 5, maxzoom: 7 },
  { id: "z8", z: 8, minzoom: 7, maxzoom: 10 },
  { id: "z10", z: 10, minzoom: 10, maxzoom: 22 }
];
const RADAR_ZOOM_LEVELS = [
  { id: "z2", z: 2, minzoom: 1, maxzoom: 3 },
  { id: "z4", z: 4, minzoom: 3, maxzoom: 5 },
  { id: "z6", z: 6, minzoom: 5, maxzoom: 7 },
  { id: "z8", z: 8, minzoom: 7, maxzoom: 9 },
  { id: "z10", z: 10, minzoom: 9, maxzoom: 22 }
];
const MUNICIPALITY_SOURCE_ID = "jma-weather-warning-municipalities";
const MUNICIPALITY_FIX_SOURCE_ID = "jma-weather-warning-municipality-fixes";
const PREFECTURE_SOURCE_ID = "japan-prefectures";
const CURRENT_LOCATION_SOURCE_ID = "current-location";
const COMMUNITY_REPORT_SOURCE_ID = "community-weather-reports";
const COMMUNITY_REPORT_LAYERS = [
  "community-report-cluster",
  "community-report-cluster-count",
  "community-report-point"
];
const MUNICIPALITY_FILL_LAYER_ID = "jma-municipality-fill";
const MUNICIPALITY_FIX_FILL_LAYER_ID = "jma-municipality-fix-fill";
const WARNING_OVERLAY_LAYER_ID = "jma-warning-overlay";
const WARNING_FIX_OVERLAY_LAYER_ID = "jma-warning-fix-overlay";
const WARNING_CLICK_LAYER_ID = "jma-warning-click-target";
const WARNING_FIX_CLICK_LAYER_ID = "jma-warning-fix-click-target";
const WARNING_HATCH_LAYER_ID = "jma-warning-emergency-hatch";
const WARNING_FIX_HATCH_LAYER_ID = "jma-warning-fix-emergency-hatch";
const MUNICIPALITY_LINE_LAYER_ID = "jma-municipality-line";
const MUNICIPALITY_FIX_LINE_LAYER_ID = "jma-municipality-fix-line";
const WARNING_OVERLAY_LAYER_IDS = [WARNING_OVERLAY_LAYER_ID, WARNING_FIX_OVERLAY_LAYER_ID];
const WARNING_CLICK_LAYER_IDS = [WARNING_CLICK_LAYER_ID, WARNING_FIX_CLICK_LAYER_ID];
const WARNING_HATCH_LAYER_IDS = [WARNING_HATCH_LAYER_ID, WARNING_FIX_HATCH_LAYER_ID];
const WARNING_HATCH_IMAGE_ID = "jma-warning-emergency-hatch-pattern";
const STORM_WARNING_ENDPOINT_SNAP_PX = 48;
const STORM_WARNING_DUPLICATE_SEGMENT_PX = 18;
const warningGeometryFixCodeSet = new Set(WARNING_GEOMETRY_FIX_CODES);
const MAP_THEME_COLORS = {
  dark: {
    background: "#0c1326",
    worldLand: "#252a33",
    worldCountryLine: "#5e6672",
    municipalityFill: "#3c3d40",
    municipalityLine: "#848a94",
    prefectureLine: "#f7fbff",
    weatherIsobar: "rgba(246, 250, 255, 0.78)",
    weatherIsobarLabel: "rgba(246, 250, 255, 0.86)",
    weatherIsobarHalo: "rgba(5, 9, 20, 0.82)",
    typhoonForecastCircle: "#f8fbff",
    typhoonForecastRoute: "#f8fbff",
    typhoonPastTrack: "#ffffff",
    typhoonCenter: "#f8fbff",
    typhoonLabel: "#f8fbff",
    typhoonLabelHalo: "rgba(5, 9, 20, 0.9)",
    activeFaultFill: "#ff6a3d",
    activeFault: "#ff6a3d",
    plateConvergent: "#ff5a52",
    plateTransform: "#b77aff",
    plateOther: "#41c7b5",
    plateDepthLabelHalo: "rgba(5, 9, 20, 0.9)"
  },
  light: {
    background: "#eaf1f8",
    worldLand: "#d7dee5",
    worldCountryLine: "#7f8d9b",
    municipalityFill: "#f4f5f6",
    municipalityLine: "#9aa5af",
    prefectureLine: "#536373",
    weatherIsobar: "rgba(48, 66, 85, 0.82)",
    weatherIsobarLabel: "rgba(37, 55, 74, 0.92)",
    weatherIsobarHalo: "rgba(247, 251, 255, 0.9)",
    typhoonForecastCircle: "#405a74",
    typhoonForecastRoute: "#1678ad",
    typhoonPastTrack: "#56697b",
    typhoonCenter: "#153e5c",
    typhoonLabel: "#193650",
    typhoonLabelHalo: "rgba(248, 252, 255, 0.94)",
    activeFaultFill: "#e24a2d",
    activeFault: "#d83b24",
    plateConvergent: "#c8322b",
    plateTransform: "#7650b5",
    plateOther: "#148b7b",
    plateDepthLabelHalo: "rgba(248, 252, 255, 0.94)"
  }
};
const NATURAL_EARTH_JAPAN_MASK_BOUNDS = {
  minLng: 122.0,
  maxLng: 149.5,
  minLat: 23.0,
  maxLat: 46.5
};
const KOREAN_ISLANDS_NATURAL_EARTH_BOUNDS = {
  minLng: 124.0,
  maxLng: 131.2,
  minLat: 33.0,
  maxLat: 38.3
};

const baseMapData = {
  worldLand: buildWorldLandWithoutJapanData(),
  worldCountries: buildWorldCountriesWithoutJapanData()
};
const warningFeatureStateCache = new WeakMap();
const kikikuruTileUrlCache = new Map();
const weatherChartZoomLimitCache = new WeakMap();

export function createWeatherMap(elementId) {
  let map = null;
  let pendingRender = null;
  let activeMode = "radar";
  let activeTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  let activeFaultVisible = true;
  let plateBoundaryVisible = true;
  let plateDepthContoursVisible = true;
  let warningAreasByCode = new Map();
  let mapInfoElement = null;
  let mapInfoLngLat = null;
  let mapInfoOwner = null;
  let communityReports = [];
  let hypocenter3DEnabled = false;
  let previousHypocenterCamera = null;
  const hypocenter3D = createHypocenter3DLayer(maplibregl, getHypocenterDepthColor);

  function initialize() {
    map = new maplibregl.Map({
      container: elementId,
      center: [DEFAULT_VIEW.center[1], DEFAULT_VIEW.center[0]],
      zoom: DEFAULT_VIEW.zoom,
      minZoom: DEFAULT_VIEW.minZoom,
      maxZoom: DEFAULT_VIEW.maxZoom,
      renderWorldCopies: false,
      dragRotate: true,
      pitchWithRotate: false,
      attributionControl: false,
      style: createBaseStyle(activeTheme)
    });
    map.getContainer().dataset.theme = activeTheme;
    map.touchZoomRotate.enableRotation();

    map.on("load", () => {
      setupSampleLayers();
      applyMapTheme(map, activeTheme);
      setMode(activeMode);
      if (pendingRender) {
        renderData(pendingRender.mode, pendingRender.data);
        pendingRender = null;
      }
    });
  }

  function setMode(mode) {
    activeMode = mode;
    const container = map?.getContainer();
    if (!container) return;
    hideMapInfo();
    Object.values(MODE_CLASS).forEach((className) => container.classList.remove(className));
    container.classList.add(MODE_CLASS[mode] ?? MODE_CLASS.radar);
    setRadarVisible(map, mode === "radar");
    if (mode !== "radar") setWeatherChartVisible(map, false);
    if (mode !== "warnings") {
      setKikikuruVisible(map, false);
    }
    if (mode !== "warnings") updateWarningMunicipalityPaint(map, mode);
    syncPlateDepthContourVisibility();
    syncPlateBoundaryVisibility();
    syncActiveFaultVisibility();
    syncCommunityReportVisibility();
    if (activeMode !== "earthquake") updateHypocenter3DPresentation(false);
  }

  function setActiveFaultVisible(visible) {
    activeFaultVisible = Boolean(visible);
    if (!activeFaultVisible) hideMapInfo("active-fault");
    syncActiveFaultVisibility();
  }

  function setPlateBoundaryVisible(visible) {
    plateBoundaryVisible = Boolean(visible);
    syncPlateBoundaryVisibility();
  }

  function setPlateDepthContoursVisible(visible) {
    plateDepthContoursVisible = Boolean(visible);
    syncPlateDepthContourVisibility();
  }

  function syncActiveFaultVisibility() {
    if (!map?.getSource(SAMPLE_SOURCE_ID)) return;
    const shouldShow = activeMode === "earthquake" && activeFaultVisible;
    if (shouldShow) ensureActiveFaultLayers();
    ACTIVE_FAULT_LAYERS.forEach((layerId) => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", shouldShow ? "visible" : "none");
    });
  }

  function ensureActiveFaultLayers() {
    if (!map || map.getSource(JSHIS_MAJOR_FAULT_SOURCE_ID)) return;
    const colors = MAP_THEME_COLORS[activeTheme] ?? MAP_THEME_COLORS.dark;
    const beforeLayerId = map.getLayer("sample-circle") ? "sample-circle" : undefined;
    const visibility = activeMode === "earthquake" && activeFaultVisible ? "visible" : "none";
    map.addSource(JSHIS_MAJOR_FAULT_SOURCE_ID, {
      type: "vector",
      tiles: [MAP_DATA_ENDPOINTS.jshisMajorFaultTiles],
      minzoom: 4,
      maxzoom: 10
    });
    map.addLayer({
      id: JSHIS_MAJOR_FAULT_FILL_LAYER_ID,
      type: "fill",
      source: JSHIS_MAJOR_FAULT_SOURCE_ID,
      "source-layer": "major_fault",
      minzoom: 4,
      maxzoom: 11,
      layout: { visibility },
      paint: {
        "fill-color": colors.activeFaultFill,
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.13, 7, 0.18, 10, 0.24]
      }
    }, beforeLayerId);
    map.addLayer({
      id: JSHIS_MAJOR_FAULT_LINE_LAYER_ID,
      type: "line",
      source: JSHIS_MAJOR_FAULT_SOURCE_ID,
      "source-layer": "major_fault",
      minzoom: 4,
      maxzoom: 11,
      layout: { visibility, "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colors.activeFault,
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.72, 7, 0.86, 10, 0.96],
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.1, 7, 1.8, 10, 3]
      }
    }, beforeLayerId);
    JSHIS_MAJOR_FAULT_INTERACTIVE_LAYERS.forEach((layerId) => {
      map.on("mouseenter", layerId, () => {
        if (activeMode === "earthquake" && activeFaultVisible) map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layerId, () => {
        if (activeMode === "earthquake") map.getCanvas().style.cursor = "";
      });
    });
  }

  function syncPlateBoundaryVisibility() {
    if (!map?.getSource(SAMPLE_SOURCE_ID)) return;
    const shouldShow = activeMode === "earthquake" && plateBoundaryVisible;
    if (shouldShow) ensurePlateBoundaryLayers();
    PLATE_BOUNDARY_LAYERS.forEach((layerId) => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", shouldShow ? "visible" : "none");
    });
  }

  function ensurePlateBoundaryLayers() {
    if (!map || map.getSource(PLATE_BOUNDARY_SOURCE_ID)) return;
    const colors = MAP_THEME_COLORS[activeTheme] ?? MAP_THEME_COLORS.dark;
    const beforeLayerId = map.getLayer("sample-circle") ? "sample-circle" : undefined;
    map.addSource(PLATE_BOUNDARY_SOURCE_ID, {
      type: "geojson",
      data: MAP_DATA_ENDPOINTS.tectonicPlateBoundaries
    });
    const definitions = [
      [PLATE_BOUNDARY_LAYER_IDS.convergent, "Convergent Boundary", colors.plateConvergent, null],
      [PLATE_BOUNDARY_LAYER_IDS.transform, "Transform Boundary", colors.plateTransform, [2.5, 1.5]],
      [PLATE_BOUNDARY_LAYER_IDS.other, "Other", colors.plateOther, [1, 1.5]]
    ];
    definitions.forEach(([id, label, color, dashArray]) => {
      map.addLayer({
        id,
        type: "line",
        source: PLATE_BOUNDARY_SOURCE_ID,
        minzoom: 3,
        maxzoom: 11,
        filter: ["==", ["get", "LABEL"], label],
        layout: { visibility: activeMode === "earthquake" && plateBoundaryVisible ? "visible" : "none", "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": color,
          "line-opacity": 0.86,
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.4, 6, 2.2, 10, 3.4],
          ...(dashArray ? { "line-dasharray": dashArray } : {})
        }
      }, beforeLayerId);
    });
  }

  function syncPlateDepthContourVisibility() {
    if (!map?.getSource(SAMPLE_SOURCE_ID)) return;
    const shouldShow = activeMode === "earthquake" && plateDepthContoursVisible;
    if (shouldShow) ensurePlateDepthContourLayers();
    PLATE_DEPTH_LAYERS.forEach((layerId) => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", shouldShow ? "visible" : "none");
    });
  }

  function ensurePlateDepthContourLayers() {
    if (!map || map.getSource(PLATE_DEPTH_SOURCE_ID)) return;
    const colors = MAP_THEME_COLORS[activeTheme] ?? MAP_THEME_COLORS.dark;
    const beforeLayerId = map.getLayer("sample-circle") ? "sample-circle" : undefined;
    const visibility = activeMode === "earthquake" && plateDepthContoursVisible ? "visible" : "none";
    map.addSource(PLATE_DEPTH_SOURCE_ID, {
      type: "geojson",
      data: MAP_DATA_ENDPOINTS.slab2DepthContours
    });
    map.addLayer({
      id: PLATE_DEPTH_LINE_LAYER_ID,
      type: "line",
      source: PLATE_DEPTH_SOURCE_ID,
      minzoom: 3,
      maxzoom: 12,
      layout: { visibility, "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": PLATE_DEPTH_COLOR_EXPRESSION,
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.58, 6, 0.72, 10, 0.82],
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.8, 6, 1.25, 10, 2]
      }
    }, beforeLayerId);
    map.addLayer({
      id: PLATE_DEPTH_LABEL_LAYER_ID,
      type: "symbol",
      source: PLATE_DEPTH_SOURCE_ID,
      minzoom: 5,
      maxzoom: 12,
      layout: {
        visibility,
        "symbol-placement": "line",
        "symbol-spacing": 260,
        "text-field": ["get", "label"],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, 9, 9, 11],
        "text-offset": [0, -0.72],
        "text-keep-upright": true,
        "text-allow-overlap": false
      },
      paint: {
        "text-color": PLATE_DEPTH_COLOR_EXPRESSION,
        "text-halo-color": colors.plateDepthLabelHalo,
        "text-halo-width": 1,
        "text-opacity": 0.94
      }
    }, beforeLayerId);
  }

  function renderData(mode, data) {
    if (!map || !map.getSource(SAMPLE_SOURCE_ID)) {
      pendingRender = { mode, data };
      return;
    }

    const source = map.getSource(SAMPLE_SOURCE_ID);
    const collection = createSampleFeatureCollection(mode, data);
    source.setData(collection);
    updateHypocenter3D(mode, data);
    const typhoonCollection = updateTyphoonLayers(mode, data);
    updateWarningAreaLookup(mode, data);
    updateRadarLayer(map, mode, data);
    updateWeatherChartLayer(map, mode, data);
    updateKikikuruLayer(map, mode, data);
    updateRiverFloodLayer(map, mode, data);
    updateWarningMunicipalityPaint(map, mode, data);
  }

  function showCurrentLocation(coordinates, accuracy = null) {
    const source = map?.getSource(CURRENT_LOCATION_SOURCE_ID);
    if (!source?.setData || !Array.isArray(coordinates)) return;
    source.setData({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates
        },
        properties: {
          accuracy: Number.isFinite(accuracy) ? accuracy : null
        }
      }]
    });
  }

  function flyToLocation(coordinates, options = {}) {
    if (!map || !Array.isArray(coordinates)) return;
    const minZoom = Number.isFinite(options.minZoom) ? options.minZoom : 8.2;
    const zoom = Number.isFinite(options.zoom) ? options.zoom : Math.max(map.getZoom(), minZoom);
    map.flyTo({
      center: coordinates,
      zoom,
      duration: Number.isFinite(options.duration) ? options.duration : 850,
      offset: getFocusOffset(options),
      essential: true
    });
  }

  function fitToCoordinates(coordinates, options = {}) {
    if (!map || !Array.isArray(coordinates)) return;
    const validCoordinates = coordinates.filter((point) =>
      Array.isArray(point)
      && point.length === 2
      && point.every((value) => Number.isFinite(value))
    );
    if (validCoordinates.length === 0) return;
    if (validCoordinates.length === 1) {
      flyToLocation(validCoordinates[0], options);
      return;
    }

    const bounds = validCoordinates.slice(1).reduce(
      (nextBounds, point) => nextBounds.extend(point),
      new maplibregl.LngLatBounds(validCoordinates[0], validCoordinates[0])
    );
    map.fitBounds(bounds, {
      padding: getFocusPadding(options),
      maxZoom: Number.isFinite(options.maxZoom) ? options.maxZoom : 7.2,
      duration: Number.isFinite(options.duration) ? options.duration : 850,
      essential: true
    });
  }

  function setupSampleLayers() {
    map.addSource(SAMPLE_SOURCE_ID, {
      type: "geojson",
      data: createSampleFeatureCollection(activeMode)
    });
    map.addSource(TYPHOON_SOURCE_ID, {
      type: "geojson",
      data: createEmptyFeatureCollection()
    });
    map.addSource(CURRENT_LOCATION_SOURCE_ID, {
      type: "geojson",
      data: createEmptyFeatureCollection()
    });
    map.addSource(COMMUNITY_REPORT_SOURCE_ID, {
      type: "geojson",
      data: createCommunityReportFeatureCollection(communityReports),
      cluster: true,
      clusterMaxZoom: 10,
      clusterRadius: 42
    });
    map.addSource(WEATHER_CHART_LINE_SOURCE_ID, {
      type: "geojson",
      data: createEmptyFeatureCollection()
    });
map.addSource(WEATHER_CHART_POINT_SOURCE_ID, {
      type: "geojson",
      data: createEmptyFeatureCollection()
    });
    map.addSource(RIVER_FLOOD_SOURCE_ID, {
      type: "geojson",
      data: createEmptyFeatureCollection()
    });
    map.addLayer({
      id: "jma-river-flood-casing",
      type: "line",
      source: RIVER_FLOOD_SOURCE_ID,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#f8fbff",
        "line-opacity": 0.94,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 4.8, 8, 7.2, 11, 9]
      }
    });
    map.addLayer({
      id: "jma-river-flood-line",
      type: "line",
      source: RIVER_FLOOD_SOURCE_ID,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["match", ["get", "level"], 5, "#111111", 4, "#a900d6", 3, "#ef3340", 2, "#f4d000", "#4aa8d8"],
        "line-opacity": 1,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 2.8, 8, 4.8, 11, 6.2]
      }
    });
    map.addLayer({
      id: "jma-river-flood-label",
      type: "symbol",
      source: RIVER_FLOOD_SOURCE_ID,
      minzoom: 5,
      layout: {
        "symbol-placement": "line",
        "text-field": ["coalesce", ["get", "forecastAreaName"], ["get", "RIVERNAME"]],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11, 9, 14],
        "text-allow-overlap": false,
        "text-padding": 8
      },
      paint: {
        "text-color": "#f8fbff",
        "text-halo-color": "rgba(5, 9, 20, 0.92)",
        "text-halo-width": 2
      }
    });    setupWindArrowImage(map);
    setupWarningHatchImage(map);
    setupWeatherFrontImages(map);

    map.addLayer({
      id: WARNING_HATCH_LAYER_ID,
      type: "fill",
      source: MUNICIPALITY_SOURCE_ID,
      filter: ["!", ["in", ["get", "code"], ["literal", WARNING_GEOMETRY_FIX_CODES]]],
      paint: {
        "fill-pattern": WARNING_HATCH_IMAGE_ID,
        "fill-opacity": 0
      }
    }, MUNICIPALITY_LINE_LAYER_ID);

    map.addLayer({
      id: WARNING_FIX_HATCH_LAYER_ID,
      type: "fill",
      source: MUNICIPALITY_FIX_SOURCE_ID,
      paint: {
        "fill-pattern": WARNING_HATCH_IMAGE_ID,
        "fill-opacity": 0
      }
    }, MUNICIPALITY_LINE_LAYER_ID);

    map.addLayer({
      id: "sample-fill",
      type: "fill",
      source: SAMPLE_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": ["coalesce", ["get", "fillOpacity"], 0.2]
      }
    });

    map.addLayer({
      id: "sample-line",
      type: "line",
      source: SAMPLE_SOURCE_ID,
      filter: ["all",
        ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "LineString"]],
        ["!=", ["get", "lineStyle"], "dashed"]
      ],
      paint: {
        "line-color": ["get", "color"],
        "line-opacity": 0.9,
        "line-width": ["coalesce", ["get", "lineWidth"], 2]
      }
    });

    map.addLayer({
      id: "sample-line-dashed",
      type: "line",
      source: SAMPLE_SOURCE_ID,
      filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "lineStyle"], "dashed"]],
      paint: {
        "line-color": ["get", "color"],
        "line-opacity": 0.9,
        "line-width": ["coalesce", ["get", "lineWidth"], 2],
        "line-dasharray": [2, 2]
      }
    });

    map.addLayer({
      id: "sample-circle",
      type: "circle",
      source: SAMPLE_SOURCE_ID,
      filter: ["all",
        ["==", ["geometry-type"], "Point"],
        ["!=", ["get", "markerType"], "wind"],
        ["!=", ["get", "markerType"], "cross"]
      ],
      layout: {
        "circle-sort-key": ["coalesce", ["get", "sortKey"], 0]
      },
      paint: {
        "circle-color": ["get", "color"],
        "circle-opacity": ["coalesce", ["get", "opacity"], 0.92],
        "circle-radius": SAMPLE_CIRCLE_RADIUS_EXPRESSION,
        "circle-stroke-color": "#f8fbff",
        "circle-stroke-width": SAMPLE_CIRCLE_STROKE_WIDTH_EXPRESSION
      }
    });

    map.addLayer({
      id: "sample-wind-arrow",
      type: "symbol",
      source: SAMPLE_SOURCE_ID,
      filter: ["all", ["==", ["geometry-type"], "Point"], ["==", ["get", "markerType"], "wind"]],
      layout: {
        "icon-image": WIND_ARROW_IMAGE_ID,
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          0.36,
          7,
          0.48,
          10,
          0.62
        ],
        "icon-rotate": ["get", "rotation"],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-padding": 0
      },
      paint: {
        "icon-color": ["get", "color"],
        "icon-opacity": 0.94,
        "icon-halo-color": "rgba(5, 9, 20, 0.72)",
        "icon-halo-width": 1.1
      }
    });

    map.addLayer({
      id: "sample-cross",
      type: "symbol",
      source: SAMPLE_SOURCE_ID,
      filter: ["all", ["==", ["geometry-type"], "Point"], ["==", ["get", "markerType"], "cross"]],
      layout: {
        "text-field": "×",
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          24,
          8,
          34,
          10,
          42
        ],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "symbol-sort-key": ["coalesce", ["get", "sortKey"], 0]
      },
      paint: {
        "text-color": ["coalesce", ["get", "color"], "#f8fbff"],
        "text-halo-color": "rgba(5, 9, 20, 0.82)",
        "text-halo-width": 2.4,
        "text-halo-blur": 0.4
      }
    });

    map.addLayer({
      id: "sample-label",
      type: "symbol",
      source: SAMPLE_SOURCE_ID,
      minzoom: 7,
      filter: ["all", ["==", ["geometry-type"], "Point"], ["has", "label"]],
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "symbol-sort-key": ["coalesce", ["get", "sortKey"], 0],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          7,
          10,
          10,
          13
        ],
        "text-offset": [0, 1.35],
        "text-anchor": "top",
        "text-allow-overlap": false,
        "text-ignore-placement": false,
        "text-padding": 3
      },
      paint: {
        "text-color": "#f8fbff",
        "text-halo-color": "rgba(5, 9, 20, 0.86)",
        "text-halo-width": 2,
        "text-halo-blur": 0.4
      }
    });

    AMEDAS_INTERACTIVE_LAYERS.forEach((layerId) => {
      map.on("mouseenter", layerId, () => {
        if (activeMode === "amedas") map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layerId, () => {
        if (activeMode === "amedas") map.getCanvas().style.cursor = "";
      });
      map.on("click", layerId, (event) => {
        if (activeMode !== "amedas") return;
        const stationId = event.features?.[0]?.properties?.stationId;
        if (!stationId) return;
        window.dispatchEvent(new CustomEvent("amedas-station-select", {
          detail: { stationId }
        }));
      });
    });

    addWeatherChartLayers(map);
    addCommunityReportLayers();
    try {
      map.addLayer(hypocenter3D.layer);
    } catch (error) {
      console.warn("[MeteoScope] 震央分布の立体レイヤーを初期化できませんでした", error);
    }

    map.addLayer({
      id: "current-location-halo",
      type: "circle",
      source: CURRENT_LOCATION_SOURCE_ID,
      paint: {
        "circle-radius": 17,
        "circle-color": "rgba(86, 183, 242, 0.18)",
        "circle-stroke-color": "rgba(216, 230, 247, 0.5)",
        "circle-stroke-width": 1
      }
    });

    map.addLayer({
      id: "current-location-dot",
      type: "circle",
      source: CURRENT_LOCATION_SOURCE_ID,
      paint: {
        "circle-radius": 6,
        "circle-color": "#56b7f2",
        "circle-stroke-color": "#f8fbff",
        "circle-stroke-width": 3
      }
    });

    map.addLayer({
      id: "typhoon-wind-area-fill",
      type: "fill",
      source: TYPHOON_SOURCE_ID,
      filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", ["get", "typhoonShape"], "windArea"]],
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": ["coalesce", ["get", "fillOpacity"], 0.08],
        "fill-outline-color": ["get", "color"]
      }
    });

    map.addLayer({
      id: "typhoon-wind-area-line",
      type: "line",
      source: TYPHOON_SOURCE_ID,
      filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", ["get", "typhoonShape"], "windArea"]],
      paint: {
        "line-color": ["coalesce", ["get", "lineColor"], ["get", "color"]],
        "line-opacity": 0.98,
        "line-width": ["coalesce", ["get", "lineWidth"], 2]
      }
    });

    map.addLayer({
      id: "typhoon-forecast-area-fill",
      type: "fill",
      source: TYPHOON_SOURCE_ID,
      filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", ["get", "typhoonShape"], "forecastAreaFill"]],
      paint: {
        "fill-color": "#f8fbff",
        "fill-opacity": 0.018
      }
    });

    map.addLayer({
      id: "typhoon-warning-area-fill",
      type: "fill",
      source: TYPHOON_SOURCE_ID,
      filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", ["get", "typhoonShape"], "warningAreaFill"]],
      paint: {
        "fill-color": "#ff2800",
        "fill-opacity": 0
      }
    });

    map.addLayer({
      id: "typhoon-forecast-circle-fill",
      type: "fill",
      source: TYPHOON_SOURCE_ID,
      filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", ["get", "typhoonShape"], "forecastCircle"]],
      paint: {
        "fill-color": "#f8fbff",
        "fill-opacity": 0
      }
    });

    map.addLayer({
      id: "typhoon-forecast-area",
      type: "line",
      source: TYPHOON_SOURCE_ID,
      filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "typhoonShape"], "forecastArea"]],
      paint: {
        "line-color": "#f8fbff",
        "line-opacity": 0.78,
        "line-width": 1.35
      }
    });

    map.addLayer({
      id: "typhoon-warning-area",
      type: "line",
      source: TYPHOON_SOURCE_ID,
      filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "typhoonShape"], "warningArea"]],
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": "#ff2b12",
        "line-opacity": 0.9,
        "line-width": 1.45
      }
    });

    map.addLayer({
      id: "typhoon-forecast-circle",
      type: "line",
      source: TYPHOON_SOURCE_ID,
      filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", ["get", "typhoonShape"], "forecastCircle"]],
      paint: {
        "line-color": "#f8fbff",
        "line-opacity": 0.8,
        "line-width": 1.35,
        "line-dasharray": [1.5, 1.6]
      }
    });

    map.addLayer({
      id: "layer-typhoon-past-track",
      type: "line",
      source: TYPHOON_SOURCE_ID,
      filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "type"], "pastTrack"]],
      paint: {
        "line-color": "#ffffff",
        "line-opacity": 0.6,
        "line-width": 2
      }
    });

    map.addLayer({
      id: "typhoon-forecast-route",
      type: "line",
      source: TYPHOON_SOURCE_ID,
      filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "typhoonShape"], "forecastRoute"]],
      paint: {
        "line-color": "#f8fbff",
        "line-opacity": 0.52,
        "line-width": ["coalesce", ["get", "lineWidth"], 1.1],
        "line-dasharray": [2, 2]
      }
    });

    map.addLayer({
      id: "typhoon-forecast-label",
      type: "symbol",
      source: TYPHOON_SOURCE_ID,
      minzoom: 3,
      filter: ["all", ["has", "label"], ["==", ["get", "typhoonShape"], "forecastLabel"]],
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          12,
          7,
          15
        ],
        "text-anchor": "center",
        "text-allow-overlap": true,
        "text-ignore-placement": true
      },
      paint: {
        "text-color": "#edf4ff",
        "text-halo-color": "rgba(18, 27, 64, 0.95)",
        "text-halo-width": 2.2,
        "text-halo-blur": 0
      }
    });

    map.addLayer({
      id: "typhoon-center-x",
      type: "line",
      source: TYPHOON_SOURCE_ID,
      filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "typhoonShape"], "centerX"]],
      paint: {
        "line-color": "#f8fbff",
        "line-opacity": 1,
        "line-width": 3
      }
    });

    map.addLayer({
      id: "typhoon-label",
      type: "symbol",
      source: TYPHOON_SOURCE_ID,
      minzoom: 4,
      filter: ["all", ["has", "label"], ["==", ["get", "typhoonShape"], "centerX"]],
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": 13,
        "text-offset": [0, 1.35],
        "text-anchor": "top",
        "text-allow-overlap": true
      },
      paint: {
        "text-color": "#f8fbff",
        "text-halo-color": "rgba(5, 9, 20, 0.9)",
        "text-halo-width": 2
      }
    });

    RIVER_FLOOD_LAYERS.forEach((layerId) => {
      map.on("mouseenter", layerId, () => {
        if (activeMode === "warnings") map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layerId, () => {
        if (activeMode === "warnings") map.getCanvas().style.cursor = "";
      });
      map.on("click", layerId, (event) => {
        if (activeMode !== "warnings") return;
        const properties = event.features?.[0]?.properties ?? {};
        window.dispatchEvent(new CustomEvent("river-flood-select", {
          detail: {
            reportId: properties.reportId ?? "",
            forecastAreaCode: properties.FAREACODE ?? "",
            forecastAreaName: properties.forecastAreaName ?? properties.RIVERNAME ?? "指定河川"
          }
        }));
      });
    });
    setupMapInfo();
    setupTyphoonForecastInfo();
    setupActiveFaultInfo();
    setupCommunityReportInfo();
    setupEarthquakeDistributionInfo();

    WARNING_CLICK_LAYER_IDS.forEach((layerId) => {
      map.on("mouseenter", layerId, (event) => {
        const feature = event.features?.[0];
        const area = warningAreasByCode.get(String(feature?.properties?.code ?? ""));
        if (area) map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("click", layerId, (event) => {
        const feature = event.features?.[0];
        const area = warningAreasByCode.get(String(feature?.properties?.code ?? ""));
        if (!area) return;
        const selectedAreaCode = area.displayAreaCode ?? area.areaCode;
        window.dispatchEvent(new CustomEvent("weather-warning-area-select", {
          detail: {
            areaCode: selectedAreaCode,
            areaName: area.displayAreaName ?? area.areaName
          }
        }));
      });
    });
  }

  function updateHypocenter3D(mode, data = {}) {
    const enabled = mode === "earthquake"
      && data.earthquakeView === "distribution"
      && data.distribution3DEnabled === true;
    hypocenter3D.setData(
      enabled ? data.distributionItems ?? [] : [],
      buildHypocenterDistributionPopup
    );
    hypocenter3D.setEnabled(enabled);
    updateHypocenter3DPresentation(enabled);
  }

  function updateHypocenter3DPresentation(enabled) {
    if (!map || hypocenter3DEnabled === enabled) return;
    hypocenter3DEnabled = enabled;
    map.getContainer().classList.toggle("hypocenter-3d-active", enabled);
    if (enabled) {
      previousHypocenterCamera = { pitch: map.getPitch(), bearing: map.getBearing() };
      map.easeTo({ pitch: 58, bearing: -18, duration: 650, essential: true });
      return;
    }
    const camera = previousHypocenterCamera ?? { pitch: 0, bearing: 0 };
    previousHypocenterCamera = null;
    map.easeTo({ pitch: camera.pitch, bearing: camera.bearing, duration: 500, essential: true });
  }

  function setCommunityReports(reports = []) {
    communityReports = Array.isArray(reports) ? reports : [];
    const source = map?.getSource(COMMUNITY_REPORT_SOURCE_ID);
    if (source?.setData) source.setData(createCommunityReportFeatureCollection(communityReports));
    syncCommunityReportVisibility();
  }

  function syncCommunityReportVisibility() {
    const visibility = activeMode === "radar" ? "visible" : "none";
    COMMUNITY_REPORT_LAYERS.forEach((layerID) => {
      if (map?.getLayer(layerID)) map.setLayoutProperty(layerID, "visibility", visibility);
    });
    if (activeMode !== "radar") hideMapInfo("community-report");
  }

  function addCommunityReportLayers() {
    const visibility = activeMode === "radar" ? "visible" : "none";
    map.addLayer({
      id: "community-report-cluster",
      type: "circle",
      source: COMMUNITY_REPORT_SOURCE_ID,
      filter: ["has", "point_count"],
      layout: { visibility },
      paint: {
        "circle-color": "#245f85",
        "circle-radius": ["step", ["get", "point_count"], 17, 10, 21, 30, 25],
        "circle-stroke-color": "#f8fbff",
        "circle-stroke-width": 2.5,
        "circle-opacity": 0.92
      }
    });

    map.addLayer({
      id: "community-report-cluster-count",
      type: "symbol",
      source: COMMUNITY_REPORT_SOURCE_ID,
      filter: ["has", "point_count"],
      layout: {
        visibility,
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": 12
      },
      paint: { "text-color": "#ffffff" }
    });
    map.addLayer({
      id: "community-report-point",
      type: "circle",
      source: COMMUNITY_REPORT_SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      layout: { visibility },
      paint: {
        "circle-color": ["case", [">", ["get", "hazardCount"], 0], "#e7792b", ["get", "color"]],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 5, 8, 7.5, 12, 9.5],
        "circle-stroke-color": "#f8fbff",
        "circle-stroke-width": 1.5,
        "circle-opacity": 0.95
      }
    });
  }

  function setupCommunityReportInfo() {
    map.on("click", "community-report-cluster", async (event) => {
      if (activeMode !== "radar") return;
      const feature = event.features?.[0];
      const clusterID = feature?.properties?.cluster_id;
      const source = map.getSource(COMMUNITY_REPORT_SOURCE_ID);
      if (clusterID == null || !source?.getClusterExpansionZoom) return;
      const zoom = await source.getClusterExpansionZoom(clusterID).catch(() => Math.min(map.getZoom() + 2, 12));
      map.easeTo({ center: feature.geometry.coordinates, zoom, duration: 500 });
    });
    map.on("click", "community-report-point", (event) => {
      if (activeMode !== "radar") return;
      const feature = event.features?.[0];
      if (feature) showMapInfo("community-report", event.lngLat, buildCommunityReportPopup(feature.properties));
    });
    map.on("click", (event) => {
      if (activeMode !== "radar") {
        hideMapInfo("community-report");
        return;
      }
      const layers = ["community-report-cluster", "community-report-point"]
        .filter((layerID) => map.getLayer(layerID));
      const hitReport = layers.length > 0
        && map.queryRenderedFeatures(event.point, { layers }).length > 0;
      if (!hitReport) hideMapInfo("community-report");
    });
    ["community-report-cluster", "community-report-point"].forEach((layerID) => {
      map.on("mouseenter", layerID, () => { if (activeMode === "radar") map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layerID, () => { map.getCanvas().style.cursor = ""; });
    });
  }

  function setupEarthquakeDistributionInfo() {
    map.on("click", "sample-circle", (event) => {
      if (activeMode !== "earthquake") return;
      const feature = event.features?.[0];
      const popup = feature?.properties?.popup;
      if (!popup) {
        hideMapInfo("earthquake-distribution");
        return;
      }
      showMapInfo("earthquake-distribution", event.lngLat, popup);
    });
    map.on("mouseenter", "sample-circle", (event) => {
      if (activeMode === "earthquake" && event.features?.some((feature) => feature?.properties?.popup)) {
        map.getCanvas().style.cursor = "pointer";
      }
    });
    map.on("mouseleave", "sample-circle", () => {
      if (activeMode === "earthquake") map.getCanvas().style.cursor = "";
    });
    map.on("click", (event) => {
      if (activeMode !== "earthquake") {
        hideMapInfo("earthquake-distribution");
        return;
      }
      if (hypocenter3DEnabled) {
        const point = hypocenter3D.pick(event.point);
        if (point?.popup) {
          showMapInfo("earthquake-distribution", event.lngLat, point.popup);
        } else {
          hideMapInfo("earthquake-distribution");
        }
        return;
      }
      const features = map.queryRenderedFeatures(event.point, { layers: ["sample-circle"] });
      if (!features.some((feature) => feature?.properties?.popup)) {
        hideMapInfo("earthquake-distribution");
      }
    });
    map.on("mousemove", (event) => {
      if (activeMode !== "earthquake" || !hypocenter3DEnabled) return;
      map.getCanvas().style.cursor = hypocenter3D.pick(event.point) ? "pointer" : "";
    });
  }

  function setupMapInfo() {
    mapInfoElement = document.createElement("div");
    mapInfoElement.className = "map-info-popup";
    mapInfoElement.hidden = true;
    map.getContainer().appendChild(mapInfoElement);
    map.on("move", positionMapInfo);
    map.on("resize", positionMapInfo);
  }

  function setupTyphoonForecastInfo() {
    map.on("click", (event) => {
      if (activeMode !== "typhoon") {
        hideMapInfo("typhoon");
        return;
      }
      const layers = TYPHOON_FORECAST_INFO_LAYERS.filter((layerId) => map.getLayer(layerId));
      if (layers.length === 0) {
        hideMapInfo("typhoon");
        return;
      }
      const feature = map.queryRenderedFeatures(event.point, { layers })
        .find((item) => item?.properties?.forecastPopup);
      if (!feature) {
        hideMapInfo("typhoon");
        return;
      }
      showMapInfo("typhoon", event.lngLat, feature.properties.forecastPopup);
    });

    TYPHOON_FORECAST_INFO_LAYERS.forEach((layerId) => {
      map.on("mouseenter", layerId, () => {
        if (activeMode === "typhoon") map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
      });
    });
  }

  function setupActiveFaultInfo() {
    map.on("click", (event) => {
      if (activeMode !== "earthquake" || !activeFaultVisible) {
        hideMapInfo("active-fault");
        return;
      }
      const layers = JSHIS_MAJOR_FAULT_INTERACTIVE_LAYERS.filter((layerId) => map.getLayer(layerId));
      const feature = layers.length > 0
        ? map.queryRenderedFeatures(event.point, { layers })[0]
        : null;
      if (!feature) {
        hideMapInfo("active-fault");
        return;
      }
      showMapInfo("active-fault", event.lngLat, buildJshisMajorFaultPopup(feature.properties));
    });

    map.on("zoomend", () => hideMapInfo("active-fault"));
  }

  function showMapInfo(owner, lngLat, html) {
    if (!mapInfoElement) return;
    mapInfoOwner = owner;
    mapInfoLngLat = lngLat;
    mapInfoElement.innerHTML = html;
    mapInfoElement.hidden = false;
    positionMapInfo();
  }

  function hideMapInfo(owner = null) {
    if (owner && mapInfoOwner !== owner) return;
    mapInfoOwner = null;
    mapInfoLngLat = null;
    if (mapInfoElement) {
      mapInfoElement.hidden = true;
      mapInfoElement.innerHTML = "";
    }
  }

  function positionMapInfo() {
    if (!map || !mapInfoElement || mapInfoElement.hidden || !mapInfoLngLat) return;
    const point = map.project(mapInfoLngLat);
    const container = map.getContainer();
    const width = mapInfoElement.offsetWidth || 240;
    const height = mapInfoElement.offsetHeight || 130;
    const margin = 12;
    let x = point.x + 18;
    let y = point.y - height - 14;

    if (x + width + margin > container.clientWidth) x = point.x - width - 18;
    if (y < margin) y = point.y + 18;
    x = clampNumber(x, margin, container.clientWidth - width - margin);
    y = clampNumber(y, margin, container.clientHeight - height - margin);
    mapInfoElement.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  }

  function updateWarningAreaLookup(mode, data = {}) {
    const areas = getSelectableWarningAreas(mode, data);
    warningAreasByCode = areas.length > 0
      ? new Map(areas.map((area) => [String(area.areaCode), area]))
      : new Map();
  }

  function updateTyphoonLayers(mode, data) {
    const source = map?.getSource(TYPHOON_SOURCE_ID);
    if (!source?.setData) return null;

    const collection = mode === "typhoon"
      ? {
        type: "FeatureCollection",
        features: createTyphoonFeatures(data)
      }
      : createEmptyFeatureCollection();

    source.setData(collection);
    TYPHOON_LAYERS.forEach((layerId) => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", mode === "typhoon" ? "visible" : "none");
    });
    return collection;
  }

  function resize() {
    map?.resize();
  }

  function setTheme(theme) {
    activeTheme = theme === "light" ? "light" : "dark";
    applyMapTheme(map, activeTheme);
  }

  return { initialize, setMode, setTheme, setActiveFaultVisible, setPlateBoundaryVisible, setPlateDepthContoursVisible, setCommunityReports, renderData, resize, showCurrentLocation, flyToLocation, fitToCoordinates };
}

function createCommunityReportFeatureCollection(reports = []) {
  const now = Date.now();
  const features = reports.filter((report) => Date.parse(report?.expiresAt || "") > now).flatMap((report) => {
    const longitude = Number(report?.longitude);
    const latitude = Number(report?.latitude);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];
    const meta = communityWeatherMeta(report.weather);
    return [{
      type: "Feature",
      geometry: { type: "Point", coordinates: [longitude, latitude] },
      properties: {
        id: String(report.id || ""),
        displayName: String(report.displayName || ""),
        weatherLabel: meta.label,
        comment: String(report.comment || ""),
        color: meta.color,
        sensationLabel: communitySensationLabel(report.sensation),
        temperatureText: Number.isFinite(Number(report.temperature)) ? `${Number(report.temperature).toFixed(1)}℃` : "",
        hazardsText: (Array.isArray(report.hazards) ? report.hazards : []).map(communityHazardLabel).filter(Boolean).join("・"),
        hazardCount: Array.isArray(report.hazards) ? report.hazards.length : 0,
        areaName: String(report.areaName || "現在地周辺"),
        createdText: formatCommunityReportTime(report.createdAt)
      }
    }];
  });
  return { type: "FeatureCollection", features };
}

function buildCommunityReportPopup(properties = {}) {
  const facts = [properties.temperatureText, properties.sensationLabel].filter(Boolean).map(escapeHTML).join(" / ");
  const hazard = properties.hazardsText
    ? `<p class="community-popup-hazard">周辺の危険：${escapeHTML(properties.hazardsText)}</p>`
    : "";
  const comment = properties.comment
    ? `<p class="community-popup-comment">${escapeHTML(properties.comment)}</p>`
    : "";
  return `<section class="community-map-popup">
    <span>利用者の現在地投稿</span>
    <strong>${escapeHTML(properties.weatherLabel || "天気")}</strong>
    <p>${escapeHTML(properties.areaName || "現在地周辺")}・${escapeHTML(properties.createdText || "")}</p>
    ${comment}${facts ? `<p>${facts}</p>` : ""}${hazard}
    <small>${escapeHTML(properties.displayName || "MeteoScope利用者")} / 約2km単位の位置</small>
  </section>`;
}

function communityWeatherMeta(value) {
  return ({
    sunny: { label: "晴れ", color: "#e8a52d" },
    cloudy: { label: "くもり", color: "#78899c" },
    "light-rain": { label: "弱い雨", color: "#378bc4" },
    "heavy-rain": { label: "強い雨", color: "#165ea8" },
    snow: { label: "雪", color: "#8fbfd8" },
    thunder: { label: "雷", color: "#8064b8" },
    fog: { label: "霧", color: "#6f9298" }
  })[value] || { label: "天気", color: "#457a99" };
}

function communitySensationLabel(value) {
  return ({ cold: "寒い", cool: "涼しい", comfortable: "快適", hot: "暑い", "very-hot": "非常に暑い" })[value] || "";
}

function communityHazardLabel(value) {
  return ({ "flooded-road": "道路冠水", "strong-wind": "強風", "poor-visibility": "視界不良", thunder: "雷", slippery: "路面凍結・滑りやすい" })[value] || "";
}

function formatCommunityReportTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "時刻不明";
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[character]);
}

function buildJshisMajorFaultPopup(properties = {}) {
  const faultName = formatMapInfoTitle(properties.LTENAME || "主要活断層帯");
  const magnitude = escapeMapInfoHtml(formatJshisMagnitude(properties.MAG));
  const probability = escapeMapInfoHtml(formatJshisProbability(properties.MAX_T30P));
  return `
    <article class="map-info-card active-fault-popup-card">
      <h3>${faultName}</h3>
      <div class="map-info-popup-body">
        <div class="map-info-popup-row"><span>想定規模</span><strong>${magnitude}</strong></div>
        <div class="map-info-popup-row"><span>30年確率</span><strong>${probability}</strong></div>
        <p class="map-info-popup-note">J-SHIS 2022年版・最大ケース</p>
      </div>
    </article>`;
}

function formatMapInfoTitle(value) {
  return escapeMapInfoHtml(value)
    .split(/(?=[（(])/u)
    .filter(Boolean)
    .map((segment) => `<span>${segment}</span>`)
    .join("<wbr>");
}

function formatJshisMagnitude(value) {
  const magnitude = Number(value);
  if (!Number.isFinite(magnitude) || magnitude <= -900) return "--";
  const label = magnitude < 0 ? "Mw" : "M";
  return `${label} ${Math.abs(magnitude).toFixed(1)}`;
}

function formatJshisProbability(value) {
  const probability = Number(value);
  if (!Number.isFinite(probability) || probability < 0) return "--";
  const percent = probability <= 1 ? probability * 100 : probability;
  if (percent === 0) return "0%";
  if (percent < 0.001) return "0.001%未満";
  const digits = percent < 0.1 ? 3 : percent < 1 ? 2 : 1;
  return `${percent.toFixed(digits).replace(/\.?0+$/u, "")}%`;
}

function escapeMapInfoHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getFocusOffset(options = {}) {
  if (options.offset) return options.offset;
  if (!window.matchMedia("(max-width: 800px) and (orientation: portrait)").matches) return [0, 0];

  const coveredHeight = getMobileCoveredHeight();
  const yOffset = -Math.round(Math.min(440, Math.max(150, coveredHeight * 0.48)));
  return [0, yOffset];
}

function getFocusPadding(options = {}) {
  if (options.padding) return options.padding;
  const viewportHeight = window.innerHeight || 0;
  if (window.matchMedia("(max-width: 800px) and (orientation: portrait)").matches) {
    const coveredHeight = getMobileCoveredHeight();
    const bottom = Math.round(Math.min(viewportHeight * 0.58, Math.max(180, coveredHeight + 28)));
    return { top: 92, right: 26, bottom, left: 26 };
  }
  return { top: 96, right: 96, bottom: 96, left: 96 };
}

function getMobileCoveredHeight() {
  const sidebar = document.getElementById("sidebar");
  const sidebarTop = sidebar?.getBoundingClientRect().top;
  const viewportHeight = window.innerHeight || 0;
  return Number.isFinite(sidebarTop)
    ? Math.max(0, viewportHeight - sidebarTop)
    : parseMobileVisibleHeight();
}

function clampNumber(value, min, max) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function parseMobileVisibleHeight() {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--mobile-sidebar-visible-height").trim();
  if (!value) return 0;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return 0;
  if (value.endsWith("dvh") || value.endsWith("vh")) {
    return (window.innerHeight || 0) * numeric / 100;
  }
  return numeric;
}

function createBaseStyle(theme = "dark") {
  const colors = MAP_THEME_COLORS[theme] ?? MAP_THEME_COLORS.dark;
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      "world-land": {
        type: "geojson",
        data: baseMapData.worldLand
      },
      "world-countries": {
        type: "geojson",
        data: baseMapData.worldCountries
      },
      [MUNICIPALITY_SOURCE_ID]: {
        type: "geojson",
        data: JMA_ENDPOINTS.warningMunicipalities,
        promoteId: "code"
      },
      [MUNICIPALITY_FIX_SOURCE_ID]: {
        type: "geojson",
        data: JMA_ENDPOINTS.warningMunicipalityFixes,
        promoteId: "code"
      },
      [PREFECTURE_SOURCE_ID]: {
        type: "geojson",
        data: JMA_ENDPOINTS.prefectures
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": colors.background }
      },
      {
        id: "world-land-fill",
        type: "fill",
        source: "world-land",
        paint: {
          "fill-color": colors.worldLand,
          "fill-antialias": false,
          "fill-opacity": 1
        }
      },
      {
        id: "world-country-line",
        type: "line",
        source: "world-countries",
        paint: {
          "line-color": colors.worldCountryLine,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            2,
            0.35,
            5,
            0.65,
            8,
            1
          ],
          "line-opacity": 0.42
        }
      },
      {
        id: MUNICIPALITY_FILL_LAYER_ID,
        type: "fill",
        source: MUNICIPALITY_SOURCE_ID,
        filter: ["!", ["in", ["get", "code"], ["literal", WARNING_GEOMETRY_FIX_CODES]]],
        paint: {
          "fill-color": colors.municipalityFill,
          "fill-antialias": false,
          "fill-opacity": 1
        }
      },
      {
        id: MUNICIPALITY_FIX_FILL_LAYER_ID,
        type: "fill",
        source: MUNICIPALITY_FIX_SOURCE_ID,
        paint: {
          "fill-color": colors.municipalityFill,
          "fill-antialias": false,
          "fill-opacity": 1
        }
      },
      {
        id: WARNING_OVERLAY_LAYER_ID,
        type: "fill",
        source: MUNICIPALITY_SOURCE_ID,
        filter: ["!", ["in", ["get", "code"], ["literal", WARNING_GEOMETRY_FIX_CODES]]],
        paint: {
          "fill-color": "rgba(0, 0, 0, 0)",
          "fill-antialias": true,
          "fill-opacity": 0
        }
      },
      {
        id: WARNING_FIX_OVERLAY_LAYER_ID,
        type: "fill",
        source: MUNICIPALITY_FIX_SOURCE_ID,
        paint: {
          "fill-color": "rgba(0, 0, 0, 0)",
          "fill-antialias": true,
          "fill-opacity": 0
        }
      },
      {
        id: WARNING_CLICK_LAYER_ID,
        type: "fill",
        source: MUNICIPALITY_SOURCE_ID,
        filter: ["!", ["in", ["get", "code"], ["literal", WARNING_GEOMETRY_FIX_CODES]]],
        paint: {
          "fill-color": "rgba(0, 0, 0, 0)",
          "fill-opacity": 0.001
        }
      },
      {
        id: WARNING_FIX_CLICK_LAYER_ID,
        type: "fill",
        source: MUNICIPALITY_FIX_SOURCE_ID,
        paint: {
          "fill-color": "rgba(0, 0, 0, 0)",
          "fill-opacity": 0.001
        }
      },
      {
        id: MUNICIPALITY_LINE_LAYER_ID,
        type: "line",
        source: MUNICIPALITY_SOURCE_ID,
        filter: ["!", ["in", ["get", "code"], ["literal", WARNING_GEOMETRY_FIX_CODES]]],
        paint: {
          "line-color": colors.municipalityLine,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            0.45,
            7,
            0.85,
            10,
            1.25
          ],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            0.55,
            7,
            0.82,
            10,
            0.95
          ]
        }
      },
      {
        id: MUNICIPALITY_FIX_LINE_LAYER_ID,
        type: "line",
        source: MUNICIPALITY_FIX_SOURCE_ID,
        paint: {
          "line-color": colors.municipalityLine,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            0.45,
            7,
            0.85,
            10,
            1.25
          ],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            0.55,
            7,
            0.82,
            10,
            0.95
          ]
        }
      },
      {
        id: "japan-prefecture-line",
        type: "line",
        source: PREFECTURE_SOURCE_ID,
        layout: {
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": colors.prefectureLine,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            1.45,
            7,
            2,
            10,
            2.8
          ],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            0.72,
            7,
            0.82,
            10,
            0.9
          ]
        }
      }
    ]
  };
}

function applyMapTheme(map, theme) {
  if (!map) return;
  const colors = MAP_THEME_COLORS[theme] ?? MAP_THEME_COLORS.dark;
  const paintUpdates = [
    ["background", "background-color", colors.background],
    ["world-land-fill", "fill-color", colors.worldLand],
    ["world-country-line", "line-color", colors.worldCountryLine],
    [MUNICIPALITY_FILL_LAYER_ID, "fill-color", colors.municipalityFill],
    [MUNICIPALITY_FIX_FILL_LAYER_ID, "fill-color", colors.municipalityFill],
    [MUNICIPALITY_LINE_LAYER_ID, "line-color", colors.municipalityLine],
    [MUNICIPALITY_FIX_LINE_LAYER_ID, "line-color", colors.municipalityLine],
    ["japan-prefecture-line", "line-color", colors.prefectureLine],
    ["weather-chart-isobar-line", "line-color", colors.weatherIsobar],
    ["weather-chart-isobar-label", "text-color", colors.weatherIsobarLabel],
    ["weather-chart-isobar-label", "text-halo-color", colors.weatherIsobarHalo],
    ["typhoon-forecast-area", "line-color", colors.typhoonForecastCircle],
    ["typhoon-forecast-circle", "line-color", colors.typhoonForecastCircle],
    ["typhoon-forecast-route", "line-color", colors.typhoonForecastRoute],
    ["layer-typhoon-past-track", "line-color", colors.typhoonPastTrack],
    ["typhoon-center-x", "line-color", colors.typhoonCenter],
    ["typhoon-forecast-label", "text-color", colors.typhoonLabel],
    ["typhoon-forecast-label", "text-halo-color", colors.typhoonLabelHalo],
    ["typhoon-label", "text-color", colors.typhoonLabel],
    ["typhoon-label", "text-halo-color", colors.typhoonLabelHalo],
    [JSHIS_MAJOR_FAULT_FILL_LAYER_ID, "fill-color", colors.activeFaultFill],
    [JSHIS_MAJOR_FAULT_LINE_LAYER_ID, "line-color", colors.activeFault],
    [PLATE_BOUNDARY_LAYER_IDS.convergent, "line-color", colors.plateConvergent],
    [PLATE_BOUNDARY_LAYER_IDS.transform, "line-color", colors.plateTransform],
    [PLATE_BOUNDARY_LAYER_IDS.other, "line-color", colors.plateOther],
    [PLATE_DEPTH_LABEL_LAYER_ID, "text-halo-color", colors.plateDepthLabelHalo]
  ];
  paintUpdates.forEach(([layerId, property, value]) => {
    if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, value);
  });
  map.getContainer().dataset.theme = theme;
  map.triggerRepaint();
}

function buildWorldLandWithoutJapanData() {
  const data = cloneGeoJson(worldLandGeoJson);
  data.features = data.features.filter((feature) => !isSmallNaturalEarthJapanFeature(feature));
  return data;
}

function buildWorldCountriesWithoutJapanData() {
  const data = cloneGeoJson(worldCountriesGeoJson);
  data.features = data.features
    .filter((feature) => String(feature?.properties?.ISO_A3 ?? "").toUpperCase() !== "JPN")
    .map((feature) => removeNorthernTerritoryCountryParts(feature))
    .filter(Boolean);
  return data;
}

function cloneGeoJson(data) {
  return JSON.parse(JSON.stringify(data));
}

function setupWindArrowImage(map) {
  if (map.hasImage(WIND_ARROW_IMAGE_ID)) return;

  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, size, size);
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.moveTo(32, 4);
  context.lineTo(52, 31);
  context.lineTo(40, 28);
  context.lineTo(40, 58);
  context.lineTo(24, 58);
  context.lineTo(24, 28);
  context.lineTo(12, 31);
  context.closePath();
  context.fill();

  map.addImage(WIND_ARROW_IMAGE_ID, context.getImageData(0, 0, size, size), { sdf: true });
}

function setupWarningHatchImage(map) {
  if (map.hasImage(WARNING_HATCH_IMAGE_ID)) return;

  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, size, size);
  context.strokeStyle = "rgba(0, 0, 0, 0.9)";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(-4, size + 4);
  context.lineTo(size + 4, -4);
  context.moveTo(size - 4, size + 4);
  context.lineTo(size + 4, size - 4);
  context.stroke();

  map.addImage(WARNING_HATCH_IMAGE_ID, context.getImageData(0, 0, size, size));
}

function setupWeatherFrontImages(map) {
  addWeatherFrontImage(map, WEATHER_FRONT_COLD_IMAGE_ID, "triangle-down", "#3f6dff");
  addWeatherFrontImage(map, WEATHER_FRONT_WARM_IMAGE_ID, "semicircle", "#d86c5f");
  addWeatherOccludedFrontImage(map, WEATHER_FRONT_OCCLUDED_IMAGE_ID, "#b579ff");
}

function addWeatherFrontImage(map, imageId, shape, color) {
  if (map.hasImage(imageId)) return;

  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, size, size);
  context.fillStyle = color;
  context.strokeStyle = "rgba(5, 9, 20, 0.46)";
  context.lineWidth = 1.5;

  if (shape === "triangle" || shape === "triangle-down") {
    const points = shape === "triangle-down"
      ? [[9, 16], [55, 16], [32, 56]]
      : [[32, 8], [55, 48], [9, 48]];
    context.beginPath();
    context.moveTo(points[0][0], points[0][1]);
    context.lineTo(points[1][0], points[1][1]);
    context.lineTo(points[2][0], points[2][1]);
    context.closePath();
    context.fill();
    context.stroke();
  } else {
    context.beginPath();
    context.arc(32, 46, 22, Math.PI, 0, false);
    context.lineTo(54, 46);
    context.lineTo(10, 46);
    context.closePath();
    context.fill();
    context.stroke();
  }

  map.addImage(imageId, context.getImageData(0, 0, size, size), { pixelRatio: 1.5 });
}

function addWeatherOccludedFrontImage(map, imageId, color) {
  if (map.hasImage(imageId)) return;

  const width = 80;
  const height = 64;
  const baseY = 46;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, width, height);
  context.fillStyle = color;
  context.strokeStyle = "rgba(5, 9, 20, 0.46)";
  context.lineWidth = 1.5;

  context.beginPath();
  context.arc(24, baseY, 16, Math.PI, 0, false);
  context.lineTo(40, baseY);
  context.lineTo(8, baseY);
  context.closePath();
  context.fill();
  context.stroke();

  context.beginPath();
  context.moveTo(56, baseY - 16);
  context.lineTo(72, baseY);
  context.lineTo(40, baseY);
  context.closePath();
  context.fill();
  context.stroke();

  map.addImage(imageId, context.getImageData(0, 0, width, height), { pixelRatio: 1.5 });
}

function addWeatherChartLayers(map) {
  map.addLayer({
    id: "weather-chart-isobar-line",
    type: "line",
    source: WEATHER_CHART_LINE_SOURCE_ID,
    filter: ["==", ["get", "kind"], "isobar"],
    layout: {
      visibility: "none",
      "line-cap": "round",
      "line-join": "round"
    },
    paint: {
      "line-color": MAP_THEME_COLORS.dark.weatherIsobar,
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.45, 6, 0.72, 9, 0.88],
      "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.65, 7, 1.15, 10, 1.8]
    }
  });

  map.addLayer({
    id: "weather-chart-front-line",
    type: "line",
    source: WEATHER_CHART_LINE_SOURCE_ID,
    filter: ["==", ["get", "kind"], "front"],
    layout: {
      visibility: "none",
      "line-cap": "round",
      "line-join": "round"
    },
    paint: {
      "line-color": [
        "match",
        ["get", "frontStyle"],
        "cold",
        "#416eff",
        "warm",
        "#c76a61",
        "occluded",
        "#b579ff",
        "stationary-cold",
        "#416eff",
        "stationary-warm",
        "#c76a61",
        "#f8fbff"
      ],
      "line-opacity": 0.96,
      "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.8, 6, 2.6, 8, 3.4]
    }
  });

  addWeatherFrontSymbolLayer(map, {
    id: "weather-chart-front-cold-overview-symbol",
    frontStyle: "cold",
    imageId: WEATHER_FRONT_COLD_IMAGE_ID,
    offset: [0, 12],
    iconSize: WEATHER_FRONT_COMPACT_SYMBOL_SIZE,
    spacing: 32,
    maxzoom: WEATHER_FRONT_OVERVIEW_MAX_ZOOM
  });
  addWeatherFrontSymbolLayer(map, {
    id: "weather-chart-front-warm-overview-symbol",
    frontStyle: "warm",
    imageId: WEATHER_FRONT_WARM_IMAGE_ID,
    offset: [0, -12],
    iconSize: WEATHER_FRONT_COMPACT_SYMBOL_SIZE,
    spacing: 32,
    maxzoom: WEATHER_FRONT_OVERVIEW_MAX_ZOOM
  });
  addWeatherFrontSymbolLayer(map, {
    id: "weather-chart-front-cold-symbol",
    frontStyle: "cold",
    imageId: WEATHER_FRONT_COLD_IMAGE_ID,
    offset: [0, 12],
    spacing: 90,
    minzoom: WEATHER_FRONT_OVERVIEW_MAX_ZOOM
  });
  addWeatherFrontSymbolLayer(map, {
    id: "weather-chart-front-warm-symbol",
    frontStyle: "warm",
    imageId: WEATHER_FRONT_WARM_IMAGE_ID,
    offset: [0, -12],
    spacing: 90,
    minzoom: WEATHER_FRONT_OVERVIEW_MAX_ZOOM
  });
  addWeatherFrontSymbolLayer(map, {
    id: "weather-chart-front-stationary-cold-symbol",
    frontStyle: "stationary-cold",
    imageId: WEATHER_FRONT_COLD_IMAGE_ID,
    offset: [0, 12],
    placement: "line-center",
    iconSize: WEATHER_FRONT_COMPACT_SYMBOL_SIZE
  });
  addWeatherFrontSymbolLayer(map, {
    id: "weather-chart-front-stationary-warm-symbol",
    frontStyle: "stationary-warm",
    imageId: WEATHER_FRONT_WARM_IMAGE_ID,
    offset: [0, -12],
    placement: "line-center",
    iconSize: WEATHER_FRONT_COMPACT_SYMBOL_SIZE
  });
  addWeatherFrontSymbolLayer(map, {
    id: "weather-chart-front-occluded-symbol",
    frontStyle: "occluded",
    imageId: WEATHER_FRONT_OCCLUDED_IMAGE_ID,
    offset: [0, -10],
    spacing: 112
  });

  map.addLayer({
    id: "weather-chart-pressure-point",
    type: "circle",
    source: WEATHER_CHART_POINT_SOURCE_ID,
    layout: {
      visibility: "none"
    },
    paint: {
      "circle-color": [
        "match",
        ["get", "kind"],
        "high",
        "#1b7dff",
        "low",
        "#ff3b30",
        "typhoon",
        "#ff5a36",
        "#f8fbff"
      ],
      "circle-opacity": 0.9,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 9, 7, 13, 10, 17],
      "circle-stroke-color": "#f8fbff",
      "circle-stroke-width": 1.4
    }
  });

  map.addLayer({
    id: "weather-chart-isobar-label",
    type: "symbol",
    source: WEATHER_CHART_LINE_SOURCE_ID,
    minzoom: 4.5,
    filter: ["all", ["==", ["get", "kind"], "isobar"], ["has", "label"]],
    layout: {
      visibility: "none",
      "symbol-placement": "line",
      "text-field": ["get", "label"],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 4.5, 9, 8, 11],
      "text-allow-overlap": false,
      "text-ignore-placement": false,
      "text-padding": 4
    },
    paint: {
      "text-color": MAP_THEME_COLORS.dark.weatherIsobarLabel,
      "text-halo-color": MAP_THEME_COLORS.dark.weatherIsobarHalo,
      "text-halo-width": 1.6
    }
  });

  map.addLayer({
    id: "weather-chart-pressure-label",
    type: "symbol",
    source: WEATHER_CHART_POINT_SOURCE_ID,
    minzoom: 3,
    layout: {
      visibility: "none",
      "text-field": ["get", "label"],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 3, 14, 7, 18, 10, 24],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "text-offset": [0, 0],
      "text-anchor": "center"
    },
    paint: {
      "text-color": "#f8fbff",
      "text-halo-color": "rgba(5, 9, 20, 0.92)",
      "text-halo-width": 2.2,
      "text-halo-blur": 0.25
    }
  });

  map.addLayer({
    id: "weather-chart-pressure-value-label",
    type: "symbol",
    source: WEATHER_CHART_POINT_SOURCE_ID,
    minzoom: 3,
    filter: ["all", ["has", "pressureLabel"], ["!=", ["get", "pressureLabel"], ""]],
    layout: {
      visibility: "none",
      "text-field": ["get", "pressureLabel"],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 3, 8, 7, 10, 10, 13],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "text-offset": [0, 1.25],
      "text-anchor": "top"
    },
    paint: {
      "text-color": "rgba(248, 251, 255, 0.92)",
      "text-halo-color": "rgba(5, 9, 20, 0.94)",
      "text-halo-width": 1.8,
      "text-halo-blur": 0.2
    }
  });
}

function addWeatherFrontSymbolLayer(map, options) {
  const placement = options.placement || "line";
  const layout = {
    visibility: "none",
    "symbol-placement": placement,
    "icon-image": options.imageId,
    "icon-size": options.iconSize || WEATHER_FRONT_SYMBOL_SIZE,
    "icon-offset": options.offset,
    "icon-rotation-alignment": "map",
    "icon-pitch-alignment": "map",
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
    "icon-keep-upright": false
  };
  if (placement === "line") layout["symbol-spacing"] = options.spacing;

  const layer = {
    id: options.id,
    type: "symbol",
    source: WEATHER_CHART_LINE_SOURCE_ID,
    filter: ["all", ["==", ["get", "kind"], "front"], ["==", ["get", "frontStyle"], options.frontStyle]],
    layout,
    paint: {
      "icon-opacity": 0.96
    }
  };
  if (Number.isFinite(options.minzoom)) layer.minzoom = options.minzoom;
  if (Number.isFinite(options.maxzoom)) layer.maxzoom = options.maxzoom;
  map.addLayer(layer);
}

function isSmallNaturalEarthJapanFeature(feature) {
  const bounds = computeGeometryBounds(feature?.geometry);
  if (!Number.isFinite(bounds.minLng)) return false;

  const centerLng = (bounds.minLng + bounds.maxLng) / 2;
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const spanLng = bounds.maxLng - bounds.minLng;
  const spanLat = bounds.maxLat - bounds.minLat;
  const isJapanMainRange = centerLng >= 127.0;
  const isSouthwestIslandsRange = centerLng >= 122.0 && centerLat <= 27.5;
  const isKoreanIslandRange =
    centerLng >= KOREAN_ISLANDS_NATURAL_EARTH_BOUNDS.minLng &&
    centerLng <= KOREAN_ISLANDS_NATURAL_EARTH_BOUNDS.maxLng &&
    centerLat >= KOREAN_ISLANDS_NATURAL_EARTH_BOUNDS.minLat &&
    centerLat <= KOREAN_ISLANDS_NATURAL_EARTH_BOUNDS.maxLat &&
    spanLng <= 1 &&
    spanLat <= 0.5;

  if (isKoreanIslandRange) return false;

  return (
    centerLng >= NATURAL_EARTH_JAPAN_MASK_BOUNDS.minLng &&
    centerLng <= NATURAL_EARTH_JAPAN_MASK_BOUNDS.maxLng &&
    centerLat >= NATURAL_EARTH_JAPAN_MASK_BOUNDS.minLat &&
    centerLat <= NATURAL_EARTH_JAPAN_MASK_BOUNDS.maxLat &&
    (isJapanMainRange || isSouthwestIslandsRange) &&
    spanLng <= 18 &&
    spanLat <= 14
  );
}

function computeGeometryBounds(geometry) {
  if (geometry?.type !== "GeometryCollection") {
    return computeCoordinateBounds(geometry?.coordinates);
  }

  const bounds = {
    minLng: Infinity,
    maxLng: -Infinity,
    minLat: Infinity,
    maxLat: -Infinity
  };

  geometry.geometries?.forEach((child) => {
    const childBounds = computeGeometryBounds(child);
    if (Number.isFinite(childBounds.minLng)) {
      bounds.minLng = Math.min(bounds.minLng, childBounds.minLng);
      bounds.maxLng = Math.max(bounds.maxLng, childBounds.maxLng);
      bounds.minLat = Math.min(bounds.minLat, childBounds.minLat);
      bounds.maxLat = Math.max(bounds.maxLat, childBounds.maxLat);
    }
  });

  return bounds;
}

function computeCoordinateBounds(coordinates) {
  const bounds = {
    minLng: Infinity,
    maxLng: -Infinity,
    minLat: Infinity,
    maxLat: -Infinity
  };

  function walk(coords) {
    if (!Array.isArray(coords)) return;

    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        bounds.minLng = Math.min(bounds.minLng, lng);
        bounds.maxLng = Math.max(bounds.maxLng, lng);
        bounds.minLat = Math.min(bounds.minLat, lat);
        bounds.maxLat = Math.max(bounds.maxLat, lat);
      }
      return;
    }

    coords.forEach(walk);
  }

  walk(coordinates);
  return bounds;
}

function updateRiverFloodLayer(map, mode, data = {}) {
  const source = map?.getSource(RIVER_FLOOD_SOURCE_ID);
  if (!source?.setData) return;
  const visible = mode === "warnings" && data?.activeWarningView === "river";
  source.setData(visible && data?.riverFlood?.riverFeatures
    ? data.riverFlood.riverFeatures
    : createEmptyFeatureCollection());
  RIVER_FLOOD_LAYERS.forEach((layerId) => {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  });
}
function updateWarningMunicipalityPaint(map, mode, data = {}) {
  if (!map || !WARNING_OVERLAY_LAYER_IDS.some((layerId) => map.getLayer(layerId))) return;

  if (mode !== "warnings" || ["kikikuru", "river"].includes(data?.activeWarningView)) {
    invalidateWarningFeatureStateUpdate(map);
    setWarningOverlayPaint(map, "fill-opacity", 0);
    updateWarningHatchPaint(map, []);
    return;
  }

  const activeAreas = getActiveWarningOverlayAreas(mode, data);
  void updateWarningFeatureStates(map, activeAreas);

  if (activeAreas.length === 0) {
    setWarningOverlayPaint(map, "fill-color", "rgba(0, 0, 0, 0)");
    setWarningOverlayPaint(map, "fill-opacity", 0);
    updateWarningHatchPaint(map, []);
    return;
  }

  const isEarlyWarningView = mode === "warnings" && data?.activeWarningView === "early";
  setWarningOverlayPaint(map, "fill-color", [
    "match",
    ["feature-state", "warningLevel"],
    "high",
    getEarlyWarningColor("high"),
    "middle",
    getEarlyWarningColor("middle"),
    "emergency",
    getWarningColor("emergency"),
    "danger",
    getWarningColor("danger"),
    "warning",
    getWarningColor("warning"),
    "advisory",
    getWarningColor("advisory"),
    "rgba(0, 0, 0, 0)"
  ]);
  setWarningOverlayPaint(map, "fill-opacity", [
    "interpolate",
    ["linear"],
    ["zoom"],
    4,
    isEarlyWarningView ? 0.82 : 0.92,
    8,
    isEarlyWarningView ? 0.88 : 0.96
  ]);
  updateWarningHatchPaint(map, isEarlyWarningView ? [] : activeAreas);
}

function setWarningOverlayPaint(map, property, value) {
  WARNING_OVERLAY_LAYER_IDS.forEach((layerId) => {
    if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, value);
  });
}

function getActiveWarningOverlayAreas(mode, data = {}) {
  if (mode !== "warnings" || ["kikikuru", "river"].includes(data?.activeWarningView)) return [];
  if (data?.activeWarningView === "early") {
    return Array.isArray(data?.earlyMunicipalityAreas)
      ? data.earlyMunicipalityAreas.filter((area) => area.level === "high" || area.level === "middle")
      : [];
  }
  return Array.isArray(data?.activeAreas) ? data.activeAreas : [];
}

function getSelectableWarningAreas(mode, data = {}) {
  if (mode !== "warnings" || ["kikikuru", "river"].includes(data?.activeWarningView)) return [];
  if (data?.activeWarningView === "early") {
    return Array.isArray(data?.earlyMunicipalityAreas) ? data.earlyMunicipalityAreas : [];
  }
  return [
    ...(Array.isArray(data?.outlookAreas) ? data.outlookAreas : []),
    ...(Array.isArray(data?.activeAreas) ? data.activeAreas : [])
  ];
}

function getWarningFeatureStateCache(map) {
  const cached = warningFeatureStateCache.get(map);
  if (cached) return cached;
  const next = { generation: 0, levels: new Map() };
  warningFeatureStateCache.set(map, next);
  return next;
}

function invalidateWarningFeatureStateUpdate(map) {
  if (!map) return;
  getWarningFeatureStateCache(map).generation += 1;
}

async function updateWarningFeatureStates(map, activeAreas) {
  if (!map?.getSource(MUNICIPALITY_SOURCE_ID)) return;
  const cache = getWarningFeatureStateCache(map);
  const generation = ++cache.generation;

  try {
    const { operations } = planWarningFeatureStateChanges(cache.levels, activeAreas);
    const chunkSize = 72;
    for (let offset = 0; offset < operations.length; offset += chunkSize) {
      await waitForMapUpdateTurn();
      if (cache.generation !== generation) return;

      operations.slice(offset, offset + chunkSize).forEach((operation) => {
        const feature = {
          source: warningGeometryFixCodeSet.has(operation.areaCode) ? MUNICIPALITY_FIX_SOURCE_ID : MUNICIPALITY_SOURCE_ID,
          id: operation.areaCode
        };
        if (operation.type === "remove") {
          map.removeFeatureState(feature, "warningLevel");
          cache.levels.delete(operation.areaCode);
          return;
        }
        map.setFeatureState(feature, { warningLevel: operation.level });
        cache.levels.set(operation.areaCode, operation.level);
      });
    }
    if (cache.generation === generation) map.triggerRepaint();
  } catch (error) {
    console.warn("[MeteoScope] warning municipality state update failed", error);
  }
}

function waitForMapUpdateTurn() {
  return new Promise((resolve) => {
    if (document.hidden || typeof window.requestAnimationFrame !== "function") {
      window.setTimeout(resolve, 0);
      return;
    }
    window.requestAnimationFrame(resolve);
  });
}

function removeNorthernTerritoryCountryParts(feature) {
  const iso = String(feature?.properties?.ISO_A3 ?? "").toUpperCase();
  const geometry = feature?.geometry;
  if (iso !== "RUS" || !geometry) return feature;

  if (geometry.type === "MultiPolygon") {
    const coordinates = geometry.coordinates.filter((polygon) => !isNorthernTerritoryCountryPart(polygon));
    if (coordinates.length === 0) return null;
    return { ...feature, geometry: { ...geometry, coordinates } };
  }
  if (geometry.type === "Polygon" && isNorthernTerritoryCountryPart(geometry.coordinates)) {
    return null;
  }
  return feature;
}

function isNorthernTerritoryCountryPart(polygon) {
  const bounds = computeCoordinateBounds(polygon);
  if (!Number.isFinite(bounds.minLng)) return false;
  const centerLng = (bounds.minLng + bounds.maxLng) / 2;
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const spanLng = bounds.maxLng - bounds.minLng;
  const spanLat = bounds.maxLat - bounds.minLat;
  return (
    centerLng >= 145.4 &&
    centerLng <= 149.1 &&
    centerLat >= 43.2 &&
    centerLat <= 46.2 &&
    spanLng <= 2.2 &&
    spanLat <= 1.4
  );
}

function updateWarningHatchPaint(map, activeAreas) {
  if (!map) return;

  const emergencyOpacity = activeAreas.some((area) => area.level === "emergency") ? 0.7 : 0;
  WARNING_HATCH_LAYER_IDS.forEach((layerId) => {
    if (!map.getLayer(layerId)) return;
    map.setPaintProperty(
      layerId,
      "fill-opacity",
      [
        "case",
        ["==", ["feature-state", "warningLevel"], "emergency"],
        emergencyOpacity,
        0
      ]
    );
  });
}

function updateRadarLayer(map, mode, data = {}) {
  if (mode !== "radar" || data?.weatherChartEnabled || !data?.radarTileUrl) {
    setRadarVisible(map, false);
    return;
  }

  const currentSource = map.getSource(getRadarSourceId(RADAR_ZOOM_LEVELS[0].id));
  if (currentSource && currentSource.tiles?.[0] === getRadarTileUrl(data.radarTileUrl, RADAR_ZOOM_LEVELS[0])) {
    setRadarVisible(map, true);
    return;
  }

  removeRadarLayer(map);
  RADAR_ZOOM_LEVELS.forEach((level) => {
    const { z, minzoom, maxzoom } = level;
    const sourceId = getRadarSourceId(level.id);
    const layerId = getRadarLayerId(level.id);
    map.addSource(sourceId, {
      type: "raster",
      tiles: [getRadarTileUrl(data.radarTileUrl, level)],
      tileSize: 256,
      minzoom: 0,
      maxzoom: z,
      bounds: [118, 20, 150, 48],
      attribution: "気象庁"
    });
    map.addLayer({
      id: layerId,
      type: "raster",
      source: sourceId,
      minzoom,
      maxzoom,
      paint: {
        "raster-opacity": 0.9,
        "raster-fade-duration": 0,
        "raster-resampling": "nearest"
      }
    }, "jma-municipality-line");
  });
}

function setRadarVisible(map, isVisible) {
  RADAR_ZOOM_LEVELS.forEach(({ id }) => {
    const layerId = getRadarLayerId(id);
    if (map?.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", isVisible ? "visible" : "none");
    }
  });
}

function removeRadarLayer(map) {
  [...RADAR_ZOOM_LEVELS].reverse().forEach(({ id }) => {
    const layerId = getRadarLayerId(id);
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  });
  [...RADAR_ZOOM_LEVELS].reverse().forEach(({ id }) => {
    const sourceId = getRadarSourceId(id);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  });
}

function getRadarSourceId(id) {
  return `${RADAR_SOURCE_PREFIX}${id}`;
}

function getRadarLayerId(id) {
  return `${RADAR_LAYER_PREFIX}${id}`;
}

function getRadarTileUrl(tileUrl, level) {
  return tileUrl.replace("{z}", String(level.z));
}

function updateWeatherChartLayer(map, mode, data = {}) {
  const shouldShow = mode === "radar" && data?.weatherChartEnabled && data?.weatherChart?.featureCount > 0;
  if (!shouldShow) {
    setWeatherChartVisible(map, false);
    return;
  }

  map.getSource(WEATHER_CHART_LINE_SOURCE_ID)?.setData(data.weatherChart.lines ?? createEmptyFeatureCollection());
  map.getSource(WEATHER_CHART_POINT_SOURCE_ID)?.setData(data.weatherChart.points ?? createEmptyFeatureCollection());
  setWeatherChartVisible(map, true);
}

function setWeatherChartVisible(map, isVisible) {
  WEATHER_CHART_LAYERS.forEach((layerId) => {
    if (map?.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", isVisible ? "visible" : "none");
    }
  });
  setWeatherChartZoomLimit(map, isVisible);
}

function setWeatherChartZoomLimit(map, shouldLimit) {
  if (!map?.setMaxZoom) return;

  const isLimited = weatherChartZoomLimitCache.get(map) === true;
  if (isLimited === shouldLimit) return;

  weatherChartZoomLimitCache.set(map, shouldLimit);
  const maxZoom = shouldLimit ? WEATHER_CHART_MAX_ZOOM : DEFAULT_VIEW.maxZoom;
  map.setMaxZoom(maxZoom);

  if (shouldLimit && map.getZoom() > maxZoom) {
    map.easeTo({
      zoom: maxZoom,
      duration: 260,
      essential: true
    });
  }
}

function updateKikikuruLayer(map, mode, data = {}) {
  const isVisible = mode === "warnings" && data?.activeWarningView === "kikikuru";
  const tileUrls = data?.kikikuru?.tileUrls ?? {};
  const activeLayerIds = getActiveKikikuruLayerIds(data?.activeKikikuruLayer);

  if (!isVisible || Object.keys(tileUrls).length === 0) {
    setKikikuruVisible(map, false);
    return;
  }

  KIKIKURU_ELEMENTS.forEach((element) => {
    const tileUrl = tileUrls[element.id];
    if (!activeLayerIds.has(element.id)) {
      setKikikuruElementVisible(map, element.id, false);
      return;
    }
    if (!tileUrl) return;
    KIKIKURU_ZOOM_LEVELS.forEach((level) => {
      ensureKikikuruRasterLayer(map, element, level, getKikikuruTileUrl(tileUrl, level));
    });
  });

  setKikikuruVisible(map, true, activeLayerIds);
}

function ensureKikikuruRasterLayer(map, element, level, tileUrl) {
  const sourceId = getKikikuruSourceId(element.id, level.id);
  const layerId = getKikikuruLayerId(element.id, level.id);
  const cachedTileUrl = kikikuruTileUrlCache.get(sourceId);

  if (!map.getSource(sourceId)) {
    addKikikuruRasterSourceAndLayer(map, element, level, tileUrl);
    kikikuruTileUrlCache.set(sourceId, tileUrl);
    return;
  }

  if (!map.getLayer(layerId)) {
    addKikikuruRasterLayer(map, element, level);
  }

  if (!cachedTileUrl) {
    kikikuruTileUrlCache.set(sourceId, tileUrl);
    return;
  }

  if (cachedTileUrl && cachedTileUrl !== tileUrl && !map.isMoving()) {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    map.removeSource(sourceId);
    addKikikuruRasterSourceAndLayer(map, element, level, tileUrl);
    kikikuruTileUrlCache.set(sourceId, tileUrl);
  }
}

function addKikikuruRasterSourceAndLayer(map, element, level, tileUrl) {
  const sourceId = getKikikuruSourceId(element.id, level.id);
  map.addSource(sourceId, {
    type: "raster",
    tiles: [tileUrl],
    tileSize: 256,
    minzoom: level.z,
    maxzoom: level.z,
    bounds: [118, 20, 150, 48],
    attribution: "気象庁"
  });
  addKikikuruRasterLayer(map, element, level);
}

function addKikikuruRasterLayer(map, element, level) {
  const layerId = getKikikuruLayerId(element.id, level.id);
  if (map.getLayer(layerId)) return;
  map.addLayer({
    id: layerId,
    type: "raster",
    source: getKikikuruSourceId(element.id, level.id),
    minzoom: level.minzoom,
    maxzoom: level.maxzoom,
    paint: {
      "raster-opacity": element.opacity ?? 0.8,
      "raster-fade-duration": 0,
      "raster-resampling": "nearest"
    }
  }, "jma-municipality-line");
}

function setKikikuruVisible(map, isVisible, activeLayerIds = null) {
  KIKIKURU_ELEMENTS.forEach((element) => {
    const shouldShow = isVisible && (!activeLayerIds || activeLayerIds.has(element.id));
    setKikikuruElementVisible(map, element.id, shouldShow);
  });
}

function setKikikuruElementVisible(map, elementId, isVisible) {
  KIKIKURU_ZOOM_LEVELS.forEach((level) => {
    const layerId = getKikikuruLayerId(elementId, level.id);
    if (map?.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", isVisible ? "visible" : "none");
    }
  });
}

function getActiveKikikuruLayerIds(activeLayer) {
  return new Set([activeLayer === "inund" ? "inund" : "land"]);
}

function getKikikuruSourceId(id, zoomId) {
  return `${KIKIKURU_SOURCE_PREFIX}-${id}-${zoomId}`;
}

function getKikikuruLayerId(id, zoomId) {
  return `${KIKIKURU_LAYER_PREFIX}-${id}-${zoomId}`;
}

function getKikikuruTileUrl(tileUrl, level) {
  return tileUrl.replace("{z}", String(level.z));
}

function getWarningColor(level) {
  if (level === "emergency") return "#b400ff";
  if (level === "danger") return "#b400ff";
  if (level === "warning") return "#ff2b12";
  return "#fff000";
}

function getEarlyWarningColor(level) {
  if (level === "high") return "#ff6b73";
  if (level === "middle") return "#ffc8b8";
  return "rgba(0, 0, 0, 0)";
}

function createEmptyFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: []
  };
}

function createSampleFeatureCollection(mode, data = {}) {
  if (mode === "typhoon") return createEmptyFeatureCollection();

  const builders = {
    radar: createRadarFeatures,
    amedas: createAmedasFeatures,
    warnings: createWarningFeatures,
    typhoon: createTyphoonFeatures,
    earthquake: createEarthquakeFeatures
  };

  return {
    type: "FeatureCollection",
    features: builders[mode]?.(data) ?? []
  };
}

function createRadarFeatures(data) {
  return [];
}

function createAmedasFeatures(data) {
  const metric = AMEDAS_METRICS.find((item) => item.id === data?.activeMetric) ?? AMEDAS_METRICS[0];
  return (data?.points ?? []).flatMap((point) => {
    const value = point.values?.[metric.id];
    if (!Number.isFinite(value)) return [];
    if (metric.id === "precipitation" && value < 0.1) return [];
    if (metric.id === "snow" && value < 1) return [];
    if (metric.id === "wind" && !Number.isFinite(point.windDirection)) return [];

    return [{
      type: "Feature",
      geometry: { type: "Point", coordinates: point.coordinates },
      properties: {
        color: getAmedasColor(metric.id, value),
        markerType: metric.id === "wind" ? "wind" : "circle",
        markerScaleMode: metric.id === "wind" ? "fixed" : "amedas-zoom",
        rotation: metric.id === "wind" ? getWindArrowRotation(point.windDirection) : 0,
        radius: getAmedasRadius(metric.id, value),
        sortKey: getAmedasSortKey(metric.id, value),
        stationId: point.id,
        label: `${point.name} ${formatAmedasValue(value)}${metric.unit}`,
        popup: buildAmedasPopup(point, metric, value, data?.latestTime)
      }
    }];
  });
}

function getAmedasSortKey(metricId, value) {
  return metricId === "temperature" || metricId === "precipitation" ? value : 0;
}

function buildCircleZoomExpression({
  zoomStops,
  fallbackValue,
  createValue,
  overrideProperty = null
}) {
  const scaleMode = ["get", "markerScaleMode"];
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    ...zoomStops.flatMap(([zoom, amedasValue, earthquakeValue]) => [
      zoom,
      overrideProperty ? [
        "case",
        ["has", overrideProperty],
        ["get", overrideProperty],
        [
          "case",
          ["==", scaleMode, "amedas-zoom"],
          createValue(amedasValue),
          ["==", scaleMode, "earthquake-zoom"],
          createValue(earthquakeValue),
          fallbackValue
        ]
      ] : [
        "case",
        ["==", scaleMode, "amedas-zoom"],
        createValue(amedasValue),
        ["==", scaleMode, "earthquake-zoom"],
        createValue(earthquakeValue),
        fallbackValue
      ]
    ])
  ];
}

function createWarningFeatures(data) {
  return [];
}

function createEarthquakeFeatures(data) {
  if (data?.earthquakeView === "distribution") {
    const is3D = data?.distribution3DEnabled === true;
    return (data?.distributionItems ?? []).flatMap((item) => {
      const longitude = Number(item.longitude);
      const latitude = Number(item.latitude);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];
      const magnitude = Number(item.magnitude);
      const depth = Number(item.depthKm);
      return [{
        type: "Feature",
        geometry: { type: "Point", coordinates: [longitude, latitude] },
        properties: {
          color: getHypocenterDepthColor(Number.isFinite(depth) ? depth : null),
          opacity: is3D ? 0.2 : 0.68,
          strokeWidth: 0,
          markerType: "circle",
          markerScaleMode: "fixed",
          radius: is3D
            ? 2.5
            : (Number.isFinite(magnitude) ? Math.max(3.5, Math.min(11, 3 + magnitude * 1.2)) : 4),
          sortKey: Number.isFinite(magnitude) ? magnitude : -10,
          label: "",
          popup: buildHypocenterDistributionPopup(item)
        }
      }];
    });
  }
  const tsunamiFeatures = (data?.tsunami?.mapFeatures ?? []).map((feature) => ({
    ...feature,
    properties: {
      ...(feature.properties ?? {}),
      color: feature.properties?.color ?? "#168bd2",
      lineWidth: feature.properties?.lineWidth ?? 3
    }
  }));
  const earthquakes = data?.earthquakes ?? [];
  const selectedId = String(data?.selectedEarthquakeId ?? "");
  const earthquake = data?.selectedEarthquake
    ?? earthquakes.find((item) => String(item.id) === selectedId)
    ?? earthquakes[0];
  if (!earthquake) return tsunamiFeatures;

  const areaFeatures = (earthquake.intensityAreaFeatures ?? []).map((feature) => ({
    ...feature,
    properties: {
      ...(feature.properties ?? {}),
      color: feature.properties?.color ?? getEarthquakeIntensityColor(feature.properties?.intensity),
      fillOpacity: feature.properties?.fillOpacity ?? 0.48,
      lineWidth: feature.properties?.lineWidth ?? 1.3
    }
  }));

  const stationFeatures = (earthquake.intensityStations ?? []).flatMap((station) => {
    if (!Array.isArray(station.coordinates) || !station.intensity) return [];
    return [{
      type: "Feature",
      geometry: { type: "Point", coordinates: station.coordinates },
      properties: {
        color: getEarthquakeIntensityColor(station.intensity),
        markerType: "circle",
        markerScaleMode: "earthquake-zoom",
        radius: getEarthquakeIntensityRadius(station.intensity),
        sortKey: getEarthquakeIntensityRank(station.intensity),
        label: getEarthquakeStationLabel(station),
        popup: buildEarthquakeStationPopup(station, earthquake)
      }
    }];
  });

  const epicenterFeature = Array.isArray(earthquake.coordinates)
    ? [{
      type: "Feature",
      geometry: { type: "Point", coordinates: earthquake.coordinates },
      properties: {
        color: "#ff2b12",
        markerType: "cross",
        sortKey: 1000,
        label: "",
        popup: buildEarthquakePopup(earthquake)
      }
    }]
    : [];

  return [...tsunamiFeatures, ...areaFeatures, ...stationFeatures, ...epicenterFeature];
}

function getHypocenterDepthColor(depthKm) {
  if (depthKm === null) return "#687487";
  const depth = Math.max(0, Math.min(700, Number(depthKm)));
  const stops = [
    [0, [239, 54, 43]],
    [30, [255, 218, 71]],
    [100, [75, 224, 91]],
    [300, [69, 211, 238]],
    [700, [28, 68, 210]]
  ];
  const upperIndex = stops.findIndex(([stopDepth]) => depth <= stopDepth);
  if (upperIndex <= 0) return rgbToHex(stops[0][1]);
  const [lowerDepth, lowerColor] = stops[upperIndex - 1];
  const [upperDepth, upperColor] = stops[upperIndex];
  const progress = (depth - lowerDepth) / (upperDepth - lowerDepth);
  return rgbToHex(lowerColor.map((channel, index) => (
    Math.round(channel + (upperColor[index] - channel) * progress)
  )));
}

function rgbToHex(channels) {
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function buildHypocenterDistributionPopup(item) {
  const magnitude = Number.isFinite(Number(item.magnitude)) ? `M${Number(item.magnitude).toFixed(1)}` : "M不明";
  const depth = Number.isFinite(Number(item.depthKm)) ? `${Number(item.depthKm)}km` : "不明";
  return `
    <strong>${escapePopup(item.place ?? "震央地名不明")}</strong><br>
    <span>${escapePopup(formatDistributionOriginTime(item.originTime))}</span><br>
    <span>${escapePopup(magnitude)}・深さ ${escapePopup(depth)}</span><br>
    <small>気象庁の暫定値</small>
  `;
}

function formatDistributionOriginTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value ?? "時刻不明");
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function getEarthquakeIntensityRadius(value) {
  const rank = getEarthquakeIntensityRank(value);
  return Math.max(6, Math.min(15, 5 + rank));
}

function getEarthquakeStationLabel(station) {
  if (getEarthquakeIntensityRank(station.intensity) < 4) return "";
  return `${station.stationName ?? "観測点"} ${station.intensityShort ?? ""}`;
}

function buildEarthquakePopup(earthquake) {
  return `
    <strong>${escapePopup(earthquake.hypocenterName ?? "地震情報")}</strong><br>
    <span>${escapePopup(earthquake.maxIntensityLabel ?? "震度不明")}</span><br>
    <span>発生: ${escapePopup(earthquake.eventTime ?? "--")}</span><br>
    <span>規模: ${escapePopup(earthquake.magnitude ?? "--")}</span><br>
    <span>深さ: ${escapePopup(formatEarthquakeDepthText(earthquake.depth))}</span>
  `;
}

function buildEarthquakeStationPopup(station, earthquake) {
  return `
    <strong>${escapePopup(station.stationName ?? "観測点")}</strong><br>
    <span>${escapePopup([station.prefecture, station.areaName, station.cityName].filter(Boolean).join(" "))}</span><br>
    <span>${escapePopup(station.intensityLabel ?? "震度不明")}</span><br>
    <span>${escapePopup(earthquake.eventTime ?? "--")} 発生</span>
  `;
}

function createTyphoonFeatures(data) {
  if (!data?.hasTyphoon) return [];

  return (data.typhoons ?? []).flatMap((typhoon) => {
    const features = [];
    features.push(...createTyphoonRadiusFeatures(typhoon));

    const pastTrack = typhoon.pastTrack?.length ? typhoon.pastTrack : typhoon.track;
    if (pastTrack?.length >= 2) {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: pastTrack
        },
        properties: {
          type: "pastTrack",
          typhoonShape: "pastTrack",
          popup: buildTyphoonPopup(typhoon, "過去の経路")
        }
      });
    }

    if (typhoon.forecastTrack?.length >= 2) {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: typhoon.forecastTrack
        },
        properties: {
          color: "#f8fbff",
          typhoonShape: "forecastRoute",
          lineWidth: 2,
          popup: buildTyphoonPopup(typhoon, "予報経路")
        }
      });
    }

    features.push(...createTyphoonForecastAreaFeatures(typhoon));

    (typhoon.forecastCircles ?? []).forEach((circle) => {
      const feature = createTyphoonCircleFeature(circle.center, circle.radius, {
        color: "#f8fbff",
        typhoonShape: "forecastCircle",
        fillOpacity: 0.1,
        lineWidth: 1.4,
        popup: buildTyphoonPopup(typhoon, circle.label ? `予報円 ${circle.label}` : "予報円"),
        forecastPopup: buildTyphoonForecastCirclePopup(typhoon, circle)
      });
      if (feature) features.push(feature);
      if (circle.center?.length === 2 && circle.label) {
        features.push(createTyphoonForecastLabelFeature(circle, typhoon));
      }
    });

    if (typhoon.stormWarningAreaShape) {
      features.push(...createTyphoonStormWarningShapeFeatures(typhoon));
    } else if (hasStormWarningCircleGroups(typhoon)) {
      features.push(...createTyphoonStormWarningFeatures(typhoon));
    } else if (hasCircleSet(typhoon.stormWarningArea)) {
      features.push(...createTyphoonStormWarningFeatures(typhoon));
    } else if (typhoon.stormWarningArea?.length >= 3) {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: closeLine(typhoon.stormWarningArea)
        },
        properties: {
          color: "#ff2b12",
          typhoonShape: "warningArea",
          popup: buildTyphoonPopup(typhoon, "暴風警戒域")
        }
      });
    }

    if (typhoon.center?.length === 2) {
      features.push(...createTyphoonCenterXFeatures(typhoon));
    }

    return features;
  });
}

function buildTyphoonPopup(typhoon, label) {
  const details = typhoon.details ?? {};
  return `
    <strong>${escapePopup(typhoon.name ?? "台風情報")}</strong><br>
    <span>${escapePopup(label)}</span><br>
    <span>中心気圧: ${escapePopup(details.pressure ?? "未取得")}</span><br>
    <span>最大風速: ${escapePopup(details.maxWind ?? "未取得")}</span><br>
    <span>最大瞬間風速: ${escapePopup(details.maxGust ?? "未取得")}</span><br>
    <span>移動: ${escapePopup(details.direction ?? "未取得")} ${escapePopup(details.speed ?? "")}</span><br>
    <span>更新: ${escapePopup(typhoon.updatedAt ?? "未取得")}</span>
  `;
}

function buildTyphoonForecastCirclePopup(typhoon, circle) {
  const details = resolveTyphoonForecastDetails(circle.details ?? {});
  const rows = [
    ["強さ", details.strength],
    ["中心気圧", details.pressure],
    ["最大風速", details.maxWind],
    ["最大瞬間風速", details.maxGust]
  ].filter(([label, value]) => isKnownTyphoonDetail(value) || isZeroWindTyphoonRow(label, value));
  const body = rows.length > 0
    ? rows.map(([label, value]) => `
      <div class="typhoon-forecast-popup-row">
        <span>${escapePopup(label)}</span>
        <strong>${escapePopup(value)}</strong>
      </div>
    `).join("")
    : `<p class="typhoon-forecast-popup-empty">この予報円の詳細値は未取得です。</p>`;

  return `
    <section class="typhoon-forecast-popup-card" aria-label="台風予報円の情報">
      <h3>${escapePopup(formatTyphoonForecastPopupTitle(circle.label))}</h3>
      <div class="typhoon-forecast-popup-body">
        ${body}
      </div>
    </section>
  `;
}

function resolveTyphoonForecastDetails(forecastDetails) {
  return {
    strength: pickKnownTyphoonDetail(forecastDetails.strength),
    pressure: pickKnownTyphoonDetail(forecastDetails.pressure),
    maxWind: pickWindTyphoonForecastDetail(forecastDetails.maxWind),
    maxGust: pickWindTyphoonForecastDetail(forecastDetails.maxGust)
  };
}

function pickWindTyphoonForecastDetail(forecastValue) {
  return String(forecastValue ?? "").trim() === "-"
    ? "-"
    : pickKnownTyphoonDetail(forecastValue);
}

function pickKnownTyphoonDetail(...values) {
  return values.find(isKnownTyphoonDetail) ?? "未取得";
}

function isKnownTyphoonDetail(value) {
  return value !== null
    && value !== undefined
    && String(value).trim() !== ""
    && String(value).trim() !== "未取得"
    && String(value).trim() !== "-";
}

function isZeroWindTyphoonRow(label, value) {
  return (label === "最大風速" || label === "最大瞬間風速")
    && String(value ?? "").trim() === "-";
}

function formatTyphoonForecastPopupTitle(label) {
  const text = String(label ?? "").trim();
  if (!text) return "予報円";
  return text.includes("予報") ? text : `${text}予報`;
}

function createTyphoonCircleFeature(center, radiusKm, properties) {
  if (!center || !Number.isFinite(radiusKm) || radiusKm <= 0) return null;
  const points = createMercatorCircleCoordinates(center, radiusKm, 128);

  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [points]
    },
    properties
  };
}

function createMercatorCircleCoordinates(center, radiusKm, steps = 128) {
  const { pixelCenter, pixelRadius } = projectCircleForTangents({ center, radius: radiusKm });
  const points = [];

  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    points.push(unprojectMercatorPixel({
      x: pixelCenter.x + pixelRadius * Math.cos(angle),
      y: pixelCenter.y + pixelRadius * Math.sin(angle)
    }));
  }

  return points;
}

function createTyphoonCircleLineFeature(center, radiusKm, properties) {
  const polygon = createTyphoonCircleFeature(center, radiusKm, properties);
  if (!polygon) return null;
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: polygon.geometry.coordinates[0]
    },
    properties
  };
}

function createTyphoonStormWarningFeatures(typhoon) {
  const groups = buildStormWarningCircleGroups(typhoon);
  const features = groups.flatMap((circles) => createStormWarningCircleGroupFeatures(typhoon, circles));
  if (features.length) return features;

  const circles = buildStormWarningCircles(typhoon);
  return circles
    .map((circle) => createTyphoonCircleLineFeature(circle.center, circle.radius, {
      color: "#ff2b12",
      typhoonShape: "warningArea",
      popup: buildTyphoonPopup(typhoon, circle.label ? `暴風警戒域 ${circle.label}` : "暴風警戒域")
    }))
    .filter(Boolean);
}

function createStormWarningCircleGroupFeatures(typhoon, circles) {
  const outerCircles = removeContainedCircles(circles);

  if (outerCircles.length >= 2) {
    return createOuterTangentAreaFeatures(outerCircles, {
      fillShape: "warningAreaFill",
      lineShape: "warningArea",
      color: "#ff2800",
      popup: buildTyphoonPopup(typhoon, "暴風警戒域"),
      useAdjacentTangents: true,
      startRingAtEndArc: true
    });
  }

  return outerCircles
    .map((circle) => createTyphoonCircleLineFeature(circle.center, circle.radius, {
      color: "#ff2b12",
      typhoonShape: "warningArea",
      popup: buildTyphoonPopup(typhoon, circle.label ? `暴風警戒域 ${circle.label}` : "暴風警戒域")
    }))
    .filter(Boolean);
}

function removeContainedCircles(circles) {
  return circles.filter((circle, index) => !circles.some((other, otherIndex) => {
    if (index === otherIndex) return false;
    if (!circle?.center || !other?.center) return false;
    const current = projectCircleForTangents(circle);
    const candidate = projectCircleForTangents(other);
    const dx = current.pixelCenter.x - candidate.pixelCenter.x;
    const dy = current.pixelCenter.y - candidate.pixelCenter.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance + current.pixelRadius <= candidate.pixelRadius + 1.5;
  }));
}

function buildStormWarningCircleGroups(typhoon) {
  if (Array.isArray(typhoon.stormWarningGroups)) {
    return typhoon.stormWarningGroups
      .map((group) => group.filter((circle) => circle?.center && Number.isFinite(circle.radius)))
      .filter((group) => group.length > 0);
  }

  const circles = buildStormWarningCircles(typhoon);
  return circles.length ? [circles] : [];
}

function buildStormWarningCircles(typhoon) {
  const circles = [];
  const stormRadius = readRadiusKm(typhoon, ["stormRadius", "wind25mRadius", "violentWindRadius"]);
  const stormCenter = typhoon.stormCenter?.length === 2 ? typhoon.stormCenter : typhoon.center;
  if (stormCenter?.length === 2 && Number.isFinite(stormRadius)) {
    circles.push({ center: stormCenter, radius: stormRadius, label: "暴風域" });
  }

  (typhoon.stormWarningArea ?? []).forEach((circle) => {
    if (!circle?.center || !Number.isFinite(circle.radius)) return;
    const sameAsCurrentCenter = typhoon.center?.length === 2
      && getPointDistanceSq(circle.center, typhoon.center) < 0.0001;
    if (!(sameAsCurrentCenter && Number.isFinite(stormRadius))) circles.push(circle);
  });

  return circles;
}

function hasStormWarningCircleGroups(typhoon) {
  return Array.isArray(typhoon.stormWarningGroups)
    && typhoon.stormWarningGroups.some((group) =>
      Array.isArray(group)
        && group.some((circle) => circle?.center?.length === 2 && Number.isFinite(circle.radius))
    );
}

function createTyphoonStormWarningShapeFeatures(typhoon) {
  const linePaths = buildStormWarningAreaDrawableSegments(typhoon.stormWarningAreaShape);
  if (linePaths.length === 0) return [];

  const properties = {
    color: "#ff2800",
    popup: buildTyphoonPopup(typhoon, "暴風警戒域")
  };

  const features = [];

  linePaths
    .filter((coordinates) => coordinates?.length >= 2)
    .forEach((coordinates) => {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates
        },
        properties: {
          ...properties,
          typhoonShape: "warningArea"
        }
      });
    });

  return features;
}

function buildStormWarningAreaDrawableSegments(stormWarningArea) {
  const segments = removeDuplicateStormWarningSegments(
    buildStormWarningAreaLineSegments(stormWarningArea)
      .map((segment) => normalizeStormWarningLine(segment))
      .filter((segment) => segment.length >= 2)
  );
  const snappedSegments = snapStormWarningSegmentEndpoints(segments);
  const stitchedPaths = stitchStormWarningAreaSegments(snappedSegments);
  return stitchedPaths.length > 0 ? stitchedPaths : snappedSegments;
}

function normalizeStormWarningLine(points) {
  const normalized = [];
  points.forEach((point) => {
    if (!point?.length) return;
    const last = normalized.at(-1);
    if (!last || getMercatorPixelDistanceSq(last, point) > 1) normalized.push(point);
  });
  return normalized;
}

function removeDuplicateStormWarningSegments(segments) {
  const unique = [];
  segments.forEach((segment) => {
    const isDuplicate = unique.some((existing) => areStormWarningSegmentsDuplicate(existing, segment));
    if (!isDuplicate) unique.push(segment);
  });
  return unique;
}

function areStormWarningSegmentsDuplicate(a, b) {
  const aLength = getStormWarningLineLengthPx(a);
  const bLength = getStormWarningLineLengthPx(b);
  const direct = getMercatorPixelDistanceSq(a[0], b[0])
    + getMercatorPixelDistanceSq(a.at(-1), b.at(-1));
  const reversed = getMercatorPixelDistanceSq(a[0], b.at(-1))
    + getMercatorPixelDistanceSq(a.at(-1), b[0]);
  const threshold = STORM_WARNING_DUPLICATE_SEGMENT_PX * STORM_WARNING_DUPLICATE_SEGMENT_PX * 2;
  if (Math.min(direct, reversed) <= threshold) return true;

  const aMiddle = a[Math.floor(a.length / 2)];
  const bMiddle = b[Math.floor(b.length / 2)];
  const lengthDelta = Math.abs(aLength - bLength) / Math.max(aLength, bLength, 1);
  return lengthDelta < 0.04
    && getMercatorPixelDistanceSq(aMiddle, bMiddle) <= STORM_WARNING_DUPLICATE_SEGMENT_PX * STORM_WARNING_DUPLICATE_SEGMENT_PX;
}

function getStormWarningLineLengthPx(points) {
  return points.slice(1).reduce((sum, point, index) =>
    sum + Math.sqrt(getMercatorPixelDistanceSq(points[index], point))
  , 0);
}

function snapStormWarningSegmentEndpoints(segments) {
  const endpointRefs = segments.flatMap((segment, segmentIndex) => [
    { point: segment[0], segmentIndex, pointIndex: 0 },
    { point: segment.at(-1), segmentIndex, pointIndex: segment.length - 1 }
  ]);
  const clusters = [];

  endpointRefs.forEach((ref) => {
    const target = projectMercatorPixel(ref.point);
    const cluster = clusters.find((candidate) => {
      const distanceSq = (candidate.x - target.x) ** 2 + (candidate.y - target.y) ** 2;
      return distanceSq < STORM_WARNING_ENDPOINT_SNAP_PX * STORM_WARNING_ENDPOINT_SNAP_PX;
    });
    if (cluster) {
      cluster.refs.push(ref);
      cluster.x = (cluster.x * (cluster.refs.length - 1) + target.x) / cluster.refs.length;
      cluster.y = (cluster.y * (cluster.refs.length - 1) + target.y) / cluster.refs.length;
    } else {
      clusters.push({ x: target.x, y: target.y, refs: [ref] });
    }
  });

  const snapped = segments.map((segment) => segment.slice());
  clusters
    .filter((cluster) => cluster.refs.length >= 2)
    .forEach((cluster) => {
      const snappedPoint = unprojectMercatorPixel({ x: cluster.x, y: cluster.y });
      cluster.refs.forEach(({ segmentIndex, pointIndex }) => {
        snapped[segmentIndex][pointIndex] = snappedPoint;
      });
    });

  return snapped;
}

function stitchStormWarningAreaSegments(segments) {
  const sourceSegments = segments
    .filter((segment) => segment.length >= 2)
    .map((segment) => segment.slice());
  const nodes = [];
  const edges = [];

  sourceSegments.forEach((segment) => {
    const startNode = getStormWarningEndpointNode(nodes, segment[0]);
    const endNode = getStormWarningEndpointNode(nodes, segment.at(-1));
    if (startNode === endNode) return;

    const coordinates = segment.slice();
    coordinates[0] = nodes[startNode].point;
    coordinates[coordinates.length - 1] = nodes[endNode].point;
    const edgeIndex = edges.length;
    edges.push({ startNode, endNode, coordinates });
    nodes[startNode].edges.push(edgeIndex);
    nodes[endNode].edges.push(edgeIndex);
  });

  const used = new Set();
  const paths = [];

  edges.forEach((edge, edgeIndex) => {
    if (used.has(edgeIndex)) return;

    used.add(edgeIndex);
    const path = edge.coordinates.slice();
    const startNode = edge.startNode;
    let currentNode = edge.endNode;

    while (currentNode !== startNode) {
      const nextEdgeIndex = chooseNextStormWarningEdge(path, currentNode, edges, nodes, used);
      if (nextEdgeIndex == null) break;

      used.add(nextEdgeIndex);
      const nextEdge = orientStormWarningEdge(edges[nextEdgeIndex], currentNode);
      path.push(...nextEdge.coordinates.slice(1));
      currentNode = nextEdge.endNode;
    }

    const closedPath = getMercatorPixelDistanceSq(path[0], path.at(-1)) < 4
      ? closeLine(path.slice(0, -1))
      : path;
    paths.push(closedPath);
  });

  const sortedPaths = paths
    .filter((path) => path.length >= 2)
    .sort((a, b) => getStormWarningLineLengthPx(b) - getStormWarningLineLengthPx(a));

  const closedPaths = sortedPaths.filter((path) =>
    path.length >= 4 && getMercatorPixelDistanceSq(path[0], path.at(-1)) < 4
  );
  return closedPaths.length > 0 ? closedPaths : sortedPaths;
}

function getStormWarningEndpointNode(nodes, point) {
  const projectedPoint = projectMercatorPixel(point);
  const thresholdSq = STORM_WARNING_ENDPOINT_SNAP_PX * STORM_WARNING_ENDPOINT_SNAP_PX;
  let targetIndex = -1;
  let targetDistanceSq = Infinity;

  nodes.forEach((node, nodeIndex) => {
    const distanceSq = (node.x - projectedPoint.x) ** 2 + (node.y - projectedPoint.y) ** 2;
    if (distanceSq < thresholdSq && distanceSq < targetDistanceSq) {
      targetIndex = nodeIndex;
      targetDistanceSq = distanceSq;
    }
  });

  if (targetIndex >= 0) {
    const node = nodes[targetIndex];
    node.x = (node.x * node.count + projectedPoint.x) / (node.count + 1);
    node.y = (node.y * node.count + projectedPoint.y) / (node.count + 1);
    node.count += 1;
    node.point = unprojectMercatorPixel({ x: node.x, y: node.y });
    return targetIndex;
  }

  nodes.push({
    x: projectedPoint.x,
    y: projectedPoint.y,
    point,
    count: 1,
    edges: []
  });
  return nodes.length - 1;
}

function chooseNextStormWarningEdge(path, currentNode, edges, nodes, used) {
  const candidates = nodes[currentNode].edges.filter((edgeIndex) => !used.has(edgeIndex));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const previous = projectMercatorPixel(path.at(-2));
  const current = projectMercatorPixel(path.at(-1));
  const incoming = { x: current.x - previous.x, y: current.y - previous.y };

  return candidates
    .map((edgeIndex) => {
      const oriented = orientStormWarningEdge(edges[edgeIndex], currentNode);
      const next = projectMercatorPixel(oriented.coordinates[Math.min(1, oriented.coordinates.length - 1)]);
      const outgoing = { x: next.x - current.x, y: next.y - current.y };
      return {
        edgeIndex,
        score: getStormWarningVectorCosine(incoming, outgoing),
        length: getStormWarningLineLengthPx(oriented.coordinates)
      };
    })
    .sort((a, b) => b.score - a.score || b.length - a.length)[0].edgeIndex;
}

function orientStormWarningEdge(edge, currentNode) {
  if (edge.startNode === currentNode) {
    return {
      endNode: edge.endNode,
      coordinates: edge.coordinates
    };
  }
  return {
    endNode: edge.startNode,
    coordinates: edge.coordinates.slice().reverse()
  };
}

function getStormWarningVectorCosine(a, b) {
  const aLength = Math.hypot(a.x, a.y);
  const bLength = Math.hypot(b.x, b.y);
  if (!aLength || !bLength) return -1;
  return (a.x * b.x + a.y * b.y) / (aLength * bLength);
}

function buildStormWarningAreaLineSegments(stormWarningArea) {
  const segments = [];

  (stormWarningArea?.arc ?? []).forEach((arc) => {
    const segment = makeStormWarningArcSegment(arc);
    if (segment?.length >= 2) segments.push(segment);
  });

  (stormWarningArea?.line ?? []).forEach((line) => {
    const segment = line.filter((point) => point?.length === 2);
    if (segment.length >= 2) segments.push(segment);
  });

  return segments;
}

function makeStormWarningArcSegment(arc) {
  const { center, radius } = arc ?? {};
  if (!center || !Number.isFinite(radius)) return null;
  let start = Number(arc.start);
  let end = Number(arc.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end < start) end += 360;

  const span = Math.max(1, end - start);
  const steps = Math.max(8, Math.ceil(span / 5));
  const coordinates = [];
  for (let index = 0; index <= steps; index += 1) {
    const bearing = start + (span * index / steps);
    coordinates.push(destinationPoint(center, radius, bearing));
  }
  return coordinates;
}

function createTyphoonForecastAreaFeatures(typhoon) {
  if (!typhoon.center?.length || !typhoon.forecastCircles?.length) return [];

  const circles = [
    { center: typhoon.center, radius: 0 },
    ...typhoon.forecastCircles
      .filter((circle) => circle?.center?.length === 2 && Number.isFinite(circle.radius))
  ];
  if (circles.length < 2) return [];

  return createOuterTangentAreaFeatures(circles, {
    fillShape: "forecastAreaFill",
    lineShape: "forecastArea",
    color: "#f8fbff",
    popup: buildTyphoonPopup(typhoon, "予報領域"),
    skipEndArc: true
  });
}

function createOuterTangentAreaFeatures(circles, options) {
  const ring = options.useAdjacentTangents
    ? createOuterTangentMergedPolygonRing(circles, options)
    : createCircleHullRing(circles);
  if (!ring) return [];

  const properties = {
    color: options.color,
    popup: options.popup
  };

  const features = [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [ring]
      },
      properties: {
        ...properties,
        typhoonShape: options.fillShape
      }
    }
  ];

  if (options.skipEndArc) {
    features.push(...createAdjacentOuterTangentLineFeatures(circles, options, properties));
    return features;
  }

  features.push(
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: ring
      },
      properties: {
        ...properties,
        typhoonShape: options.lineShape
      }
    }
  );
  return features;
}

function createCircleHullRing(circles) {
  const points = circles.flatMap((circle, circleIndex) =>
    createCircleHullSamplePoints(circle, circleIndex)
  );
  const hull = convexHull(points);
  if (hull.length < 3) return null;
  return closeLine(hull.map((point) => point.lngLat));
}

function createAdjacentOuterTangentLineFeatures(circles, options, properties) {
  const projectedCircles = createProjectedTangentCircles(circles);
  const features = [];

  for (let index = 0; index < projectedCircles.length - 1; index += 1) {
    const tangents = calcCircleTangents(projectedCircles[index], projectedCircles[index + 1]);
    tangents.forEach((coordinates) => {
      if (coordinates.length < 2) return;
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates
        },
        properties: {
          ...properties,
          typhoonShape: options.lineShape
        }
      });
    });
  }

  return features;
}

function createCircleHullSamplePoints(circle, circleIndex) {
  if (Array.isArray(circle.axes) && circle.axes.length >= 2) {
    return createDirectionalRadiusHullSamplePoints(circle, circleIndex);
  }

  const projected = projectCircleForTangents(circle);
  if (!Number.isFinite(projected.pixelRadius) || projected.pixelRadius <= 0) {
    return [{
      x: projected.pixelCenter.x,
      y: projected.pixelCenter.y,
      lngLat: circle.center,
      circleIndex
    }];
  }

  const steps = 144;
  return Array.from({ length: steps }, (_, index) => {
    const angle = (index / steps) * Math.PI * 2;
    const point = {
      x: projected.pixelCenter.x + projected.pixelRadius * Math.cos(angle),
      y: projected.pixelCenter.y + projected.pixelRadius * Math.sin(angle)
    };
    return {
      ...point,
      lngLat: unprojectMercatorPixel(point),
      circleIndex
    };
  });
}

function createDirectionalRadiusHullSamplePoints(circle, circleIndex) {
  const steps = 144;
  return Array.from({ length: steps }, (_, index) => {
    const bearing = (index / steps) * 360;
    const radius = interpolateDirectionalRadius(circle.axes, bearing, circle.radius);
    const lngLat = destinationPoint(circle.center, radius, bearing);
    const point = projectMercatorPixel(lngLat);
    return {
      ...point,
      lngLat,
      circleIndex
    };
  });
}

function interpolateDirectionalRadius(axes, bearing, fallbackRadius) {
  const samples = axes
    .filter((axis) => Number.isFinite(axis.bearing) && Number.isFinite(axis.radius))
    .sort((a, b) => a.bearing - b.bearing);
  if (samples.length === 0) return fallbackRadius;
  if (samples.length === 1) return samples[0].radius;

  const normalizedBearing = ((bearing % 360) + 360) % 360;
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index];
    const next = samples[(index + 1) % samples.length];
    const start = current.bearing;
    const end = next.bearing > start ? next.bearing : next.bearing + 360;
    const target = normalizedBearing >= start ? normalizedBearing : normalizedBearing + 360;
    if (target >= start && target <= end) {
      const ratio = (target - start) / Math.max(end - start, 1);
      return current.radius + (next.radius - current.radius) * ratio;
    }
  }

  return fallbackRadius;
}

function convexHull(points) {
  const sorted = [...points]
    .sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x)
    .filter((point, index, array) => index === 0 || point.x !== array[index - 1].x || point.y !== array[index - 1].y);
  if (sorted.length <= 1) return sorted;

  const lower = [];
  sorted.forEach((point) => {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  });

  const upper = [];
  [...sorted].reverse().forEach((point) => {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  });

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function cross(origin, a, b) {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

function hasSelfIntersection(ring) {
  const projected = ring.map((point) => projectMercatorPixel(point));
  for (let i = 0; i < projected.length - 1; i += 1) {
    for (let j = i + 2; j < projected.length - 1; j += 1) {
      if (i === 0 && j === projected.length - 2) continue;
      if (segmentsIntersect(projected[i], projected[i + 1], projected[j], projected[j + 1])) return true;
    }
  }
  return false;
}

function segmentsIntersect(a, b, c, d) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

function createOuterTangentMergedPolygonRing(circles, options = {}) {
  const parts = createOuterTangentParts(circles, options);
  if (!parts) return null;

  const endArc = options.skipEndArc
    ? [parts.sideA.at(-1), parts.sideB.at(-1)]
    : parts.endArc;
  const sideB = parts.sideB;
  const startArc = parts.startArc;
  const sideA = parts.sideA.slice(1, -1);
  const sideBReverse = sideB.slice(1, -1).reverse();
  let ringPoints = [
    ...startArc,
    ...sideA,
    ...endArc,
    ...sideBReverse
  ];
  if (options.startRingAtEndArc && !options.skipEndArc) {
    ringPoints = rotateOpenLine(ringPoints, startArc.length + sideA.length);
  }
  let ring = closeLine(ringPoints);
  if (hasSelfIntersection(ring)) {
    const sideA = parts.straightSideA;
    ringPoints = [
      ...parts.startArc.slice().reverse(),
      ...sideB.slice(1, -1),
      ...endArc.slice().reverse(),
      ...sideA.slice(1, -1).reverse()
    ];
    if (options.startRingAtEndArc && !options.skipEndArc) {
      ringPoints = rotateOpenLine(ringPoints, parts.startArc.length + sideB.slice(1, -1).length);
    }
    ring = closeLine(ringPoints);
  }

  if (hasSelfIntersection(ring)) {
    const hullRing = createCircleHullRing(circles);
    if (hullRing && !hasSelfIntersection(hullRing)) return hullRing;
  }

  return ring.length >= 4 ? ring : null;
}

function rotateOpenLine(points, startIndex) {
  if (!Array.isArray(points) || points.length < 2) return points;
  const index = Math.max(0, Math.min(points.length - 1, startIndex));
  return [
    ...points.slice(index),
    ...points.slice(0, index)
  ];
}

function createOpenOuterTangentLineFeatures(circles, options, properties) {
  const parts = createOuterTangentParts(circles, options);
  if (!parts) return [];

  return [parts.startArc, parts.straightSideA, parts.straightSideB]
    .filter((coordinates) => coordinates.length >= 2)
    .map((coordinates) => ({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates
      },
      properties: {
        ...properties,
        typhoonShape: options.lineShape
      }
    }));
}

function createOuterTangentParts(circles) {
  if (circles.length < 2) return null;

  const projectedCircles = createProjectedTangentCircles(circles);
  const tangentPairs = [];
  const firstCircle = circles[0];
  const lastCircle = circles.at(-1);

  for (let index = 0; index < projectedCircles.length - 1; index += 1) {
    let tangents = sortTangentsByCenterLineSide(
      calcCircleTangents(projectedCircles[index], projectedCircles[index + 1]),
      projectedCircles[index],
      projectedCircles[index + 1]
    );
    if (tangentPairs.length > 0) {
      tangents = alignTangentPairWithPrevious(tangentPairs.at(-1), tangents);
    }
    if (tangents.length < 2) return null;
    tangentPairs.push(tangents);
  }

  const sideA = buildOuterTangentSide(tangentPairs, circles, 0);
  const sideB = buildOuterTangentSide(tangentPairs, circles, 1);
  const straightSideA = buildOuterTangentStraightSide(tangentPairs, 0);
  const straightSideB = buildOuterTangentStraightSide(tangentPairs, 1);
  const startArc = chooseOuterCircleArc(firstCircle, sideB[0], sideA[0], circles[1].center);
  const endArc = chooseOuterCircleArc(lastCircle, sideA.at(-1), sideB.at(-1), circles.at(-2).center);
  return { sideA, sideB, straightSideA, straightSideB, startArc, endArc };
}

function sortTangentsByCenterLineSide(tangents, circleA, circleB) {
  if (tangents.length < 2) return tangents;
  const a = circleA.pixelCenter;
  const b = circleB.pixelCenter;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const centerMid = {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };

  return [...tangents].sort((left, right) =>
    tangentSideScore(right, centerMid, dx, dy) - tangentSideScore(left, centerMid, dx, dy)
  );
}

function tangentSideScore(tangent, centerMid, dx, dy) {
  const p1 = projectMercatorPixel(tangent[0]);
  const p2 = projectMercatorPixel(tangent[1]);
  const tangentMid = {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2
  };
  return dx * (tangentMid.y - centerMid.y) - dy * (tangentMid.x - centerMid.x);
}

function alignTangentPairWithPrevious(previousPair, currentPair) {
  if (previousPair.length < 2 || currentPair.length < 2) return currentPair;

  const keepOrderDistance =
    getMercatorPixelDistanceSq(previousPair[0][1], currentPair[0][0])
    + getMercatorPixelDistanceSq(previousPair[1][1], currentPair[1][0]);
  const swappedOrderDistance =
    getMercatorPixelDistanceSq(previousPair[0][1], currentPair[1][0])
    + getMercatorPixelDistanceSq(previousPair[1][1], currentPair[0][0]);

  return swappedOrderDistance < keepOrderDistance
    ? [currentPair[1], currentPair[0]]
    : currentPair;
}

function buildOuterTangentSide(tangentPairs, circles, tangentIndex) {
  const points = [tangentPairs[0][tangentIndex][0], tangentPairs[0][tangentIndex][1]];

  for (let index = 1; index < tangentPairs.length; index += 1) {
    const previousPoint = tangentPairs[index - 1][tangentIndex][1];
    const nextPoint = tangentPairs[index][tangentIndex][0];
    const oppositePoint = tangentPairs[index][tangentIndex === 0 ? 1 : 0][0];
    const arc = chooseOuterCircleArc(circles[index], previousPoint, nextPoint, oppositePoint);
    points.push(...arc.slice(1), tangentPairs[index][tangentIndex][1]);
  }

  return points;
}

function buildOuterTangentStraightSide(tangentPairs, tangentIndex) {
  return [
    tangentPairs[0][tangentIndex][0],
    ...tangentPairs.map((tangents) => tangents[tangentIndex][1])
  ];
}

function chooseOuterCircleArc(circle, from, to, oppositeCenter) {
  const clockwise = createCircleArc(circle, from, to, true);
  const counterClockwise = createCircleArc(circle, from, to, false);
  return getArcDistanceFromCenter(clockwise, oppositeCenter) > getArcDistanceFromCenter(counterClockwise, oppositeCenter)
    ? clockwise
    : counterClockwise;
}

function createCircleArc(circle, from, to, clockwise) {
  const steps = 32;
  const { pixelCenter, pixelRadius } = projectCircleForTangents(circle);
  const fromPoint = projectMercatorPixel(from);
  const toPoint = projectMercatorPixel(to);
  const start = Math.atan2(fromPoint.y - pixelCenter.y, fromPoint.x - pixelCenter.x);
  let end = Math.atan2(toPoint.y - pixelCenter.y, toPoint.x - pixelCenter.x);

  if (clockwise) {
    while (end > start) end -= Math.PI * 2;
  } else {
    while (end < start) end += Math.PI * 2;
  }

  const points = [];
  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps;
    const angle = start + (end - start) * ratio;
    points.push(unprojectMercatorPixel({
      x: pixelCenter.x + pixelRadius * Math.cos(angle),
      y: pixelCenter.y + pixelRadius * Math.sin(angle)
    }));
  }
  return points;
}

function getArcDistanceFromCenter(points, centerLngLat) {
  const target = projectMercatorPixel(centerLngLat);
  const total = points.reduce((sum, point) => {
    const projected = projectMercatorPixel(point);
    const dx = projected.x - target.x;
    const dy = projected.y - target.y;
    return sum + Math.sqrt(dx * dx + dy * dy);
  }, 0);
  return total / Math.max(points.length, 1);
}

function createTyphoonRadiusFeatures(typhoon) {
  const radiusFeatures = [];
  const strongRadius = readRadiusKm(typhoon, ["strongWindRadius", "wind15mRadius", "galeRadius"]);
  const stormRadius = readRadiusKm(typhoon, ["stormRadius", "wind25mRadius", "violentWindRadius"]);
  const strongCenter = typhoon.strongWindCenter?.length === 2 ? typhoon.strongWindCenter : typhoon.center;

  const strongFeature = createTyphoonCircleFeature(strongCenter, strongRadius, {
    color: "#ffeb1a",
    typhoonShape: "windArea",
    fillOpacity: 0.24,
    lineWidth: 1.25,
    popup: buildTyphoonPopup(typhoon, "強風域")
  });
  const stormCenter = typhoon.stormCenter?.length === 2 ? typhoon.stormCenter : typhoon.center;
  const stormFeature = createTyphoonCircleFeature(stormCenter, stormRadius, {
    color: "#ff2800",
    lineColor: "#ff2b12",
    typhoonShape: "windArea",
    fillOpacity: 0.3,
    lineWidth: 1.35,
    popup: buildTyphoonPopup(typhoon, "暴風域")
  });

  if (strongFeature) radiusFeatures.push(strongFeature);
  if (stormFeature) radiusFeatures.push(stormFeature);
  return radiusFeatures;
}

function createTyphoonForecastLabelFeature(circle, typhoon) {
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: circle.center
    },
    properties: {
      label: circle.label,
      typhoonShape: "forecastLabel",
      popup: buildTyphoonPopup(typhoon, `予報円 ${circle.label}`),
      forecastPopup: buildTyphoonForecastCirclePopup(typhoon, circle)
    }
  };
}

function createTyphoonCenterXFeatures(typhoon) {
  const [lng, lat] = typhoon.center;
  const size = 0.13;
  const popup = buildTyphoonPopup(typhoon, "中心位置");
  const properties = {
    color: "#f8fbff",
    typhoonShape: "centerX",
    popup
  };

  return [
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [[lng - size, lat - size], [lng + size, lat + size]]
      },
      properties
    },
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [[lng - size, lat + size], [lng + size, lat - size]]
      },
      properties: {
        ...properties,
        label: typhoon.name
      }
    }
  ];
}

function closeLine(points) {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return points;
  if (first[0] === last[0] && first[1] === last[1]) return points;
  return [...points, first];
}

function hasCircleSet(value) {
  return Array.isArray(value) && value.some((item) =>
    item?.center && Number.isFinite(item.radius)
  );
}

function calcCircleTangents(circleA, circleB) {
  const a = circleA.pixelCenter ?? projectCircleForTangents(circleA).pixelCenter;
  const b = circleB.pixelCenter ?? projectCircleForTangents(circleB).pixelCenter;
  const radiusA = circleA.pixelRadius ?? projectCircleForTangents(circleA).pixelRadius;
  const radiusB = circleB.pixelRadius ?? projectCircleForTangents(circleB).pixelRadius;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distanceSq = dx * dx + dy * dy;
  const radiusDiff = radiusA - radiusB;
  const tangentSq = distanceSq - radiusDiff * radiusDiff;
  if (distanceSq <= 0 || tangentSq <= 0) return [];

  const distance = Math.sqrt(distanceSq);
  const tangent = Math.sqrt(tangentSq);

  return [-1, 1].map((side) => {
    const normal = {
      x: (dx * radiusDiff - side * dy * tangent) / distanceSq,
      y: (dy * radiusDiff + side * dx * tangent) / distanceSq
    };
    const p1 = {
      x: a.x + normal.x * radiusA,
      y: a.y + normal.y * radiusA
    };
    const p2 = {
      x: b.x + normal.x * radiusB,
      y: b.y + normal.y * radiusB
    };
    return [
      unprojectMercatorPixel(p1),
      unprojectMercatorPixel(p2)
    ];
  });
}

function createProjectedTangentCircles(circles) {
  return circles.map((circle) => ({
    ...circle,
    ...projectCircleForTangents(circle)
  }));
}

function projectCircleForTangents(circle) {
  const pixelCenter = projectMercatorPixel(circle.center);
  const edge = destinationPoint(circle.center, Number(circle.radius) || 0, 90);
  const pixelEdge = projectMercatorPixel(edge);
  const dx = pixelEdge.x - pixelCenter.x;
  const dy = pixelEdge.y - pixelCenter.y;
  return {
    pixelCenter,
    pixelRadius: Math.sqrt(dx * dx + dy * dy)
  };
}

function projectMercatorPixel([lng, lat]) {
  const worldSize = 512 * 2 ** 8;
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sin = Math.sin(clampedLat * Math.PI / 180);
  return {
    x: (lng + 180) / 360 * worldSize,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * worldSize
  };
}

function unprojectMercatorPixel(point) {
  const worldSize = 512 * 2 ** 8;
  const lng = point.x / worldSize * 360 - 180;
  const y = 0.5 - point.y / worldSize;
  const lat = 90 - 360 * Math.atan(Math.exp(-y * 2 * Math.PI)) / Math.PI;
  return [lng, lat];
}

function destinationPoint([lng, lat], distanceKm, bearingDeg) {
  const earthRadiusKm = 6371.0088;
  const angularDistance = distanceKm / earthRadiusKm;
  const bearing = bearingDeg * Math.PI / 180;
  const lat1 = lat * Math.PI / 180;
  const lng1 = lng * Math.PI / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance)
    + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
  );

  return [
    ((lng2 * 180 / Math.PI + 540) % 360) - 180,
    lat2 * 180 / Math.PI
  ];
}

function getPointDistanceSq(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function getMercatorPixelDistanceSq(a, b) {
  const pointA = projectMercatorPixel(a);
  const pointB = projectMercatorPixel(b);
  const dx = pointA.x - pointB.x;
  const dy = pointA.y - pointB.y;
  return dx * dx + dy * dy;
}

function readRadiusKm(typhoon, keys) {
  for (const key of keys) {
    const value = Number(typhoon?.[key]);
    if (Number.isFinite(value)) return value > 1000 ? value / 1000 : value;
  }
  return null;
}

function buildAmedasPopup(point, metric, value, latestTime) {
  const windDirection = Number.isFinite(point.windDirection)
    ? `<br>風向: ${getWindDirectionLabel(point.windDirection)}から`
    : "";
  const metricLabel = metric.id === "pressure" ? "海面気圧" : metric.label;
  return `${escapePopup(point.name)}<br>${metricLabel}: ${formatAmedasValue(value)} ${metric.unit}${windDirection}<br>アメダス最新時刻: ${latestTime ?? "未取得"}`;
}

function getAmedasColor(metricId, value) {
  return getAmedasObservationColor(metricId, value);
}

function getAmedasRadius(metricId, value) {
  if (metricId === "precipitation") return Math.min(14, 5 + value / 6);
  if (metricId === "wind") return Math.min(13, 5 + value / 4);
  if (metricId === "snow") return Math.min(13, 5 + value / 30);
  return 7;
}

function getWindDirectionLabel(value) {
  const labels = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];
  const index = Math.round(Number(value)) % 16;
  return labels[index] ?? `${value}`;
}

function getWindArrowRotation(value) {
  if (!Number.isFinite(value)) return 0;
  return ((Math.round(Number(value)) % 16) * 22.5 + 180) % 360;
}

function formatAmedasValue(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function escapePopup(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[char]));
}

