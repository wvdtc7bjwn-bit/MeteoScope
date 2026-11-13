import { VECTOR_BASE_MAP_ENABLED, registerBaseMapProtocol, createMunicipalitySource, baseMapSourceLayer, municipalityStateTarget } from "./baseMapTiles.js";
import { waitForInitialMapGeometry } from "./initialMapReadiness.js";
import {
  formatTyphoonForecastCenter,
  buildTyphoonPopup,
  buildTyphoonForecastCirclePopup,
  createTyphoonCircleFeature,
  createTyphoonStormWarningFeatures,
  hasStormWarningCircleGroups,
  createTyphoonStormWarningShapeFeatures,
  createTyphoonForecastAreaFeatures,
  createTyphoonRadiusFeatures,
  createTyphoonForecastLabelFeature,
  createTyphoonCenterXFeatures,
  closeLine,
  hasCircleSet
} from "./typhoonFeatures.js";
import { escapeHtml as escapeHTML, escapeHtml as escapeMapInfoHtml, escapeHtmlString as escapePopup } from "../utils/html.js";
import maplibregl from "maplibre-gl";
import { getCurrentLanguage, localizeText } from "../ui/locale.js";
import "maplibre-gl/dist/maplibre-gl.css";
import { prepareWorldMapData } from "./worldLandFilter.js";
import {
  AMEDAS_METRICS,
  EARTHQUAKE_INTENSITY_LEVELS,
  DEFAULT_VIEW,
  getAmedasObservationColor,
  getEarthquakeIntensityColor,
  getEarthquakeIntensityRank,
  formatEarthquakeIntensityMarkerText,
  getEarthquakeIntensityMarkerTextColor,
  JMA_ENDPOINTS,
  KIKIKURU_ELEMENTS,
  MAP_DATA_ENDPOINTS
} from "../config.js";
import {
  formatEarthquakeDepthText,
  formatEarthquakeHypocenterText,
  getEarthquakeUnknownText
} from "../earthquakeFormat.js";
import {
  planWarningFeatureStateChanges,
  runWarningFeatureStateOperations
} from "./warningFeatureState.js";
import { WARNING_GEOMETRY_FIX_CODES } from "./warningGeometryFixCodes.js";
import { createHypocenter3DLayer } from "./hypocenter3DLayer.js";
import { createPlateDepth3DLayer } from "./plateDepth3DLayer.js";
import { createPlateDepthSurface3DLayer } from "./plateDepthSurface3DLayer.js";
import { getHypocenterDepthColor } from "./hypocenterDepthStyle.js";
import {
  splitLineAtAntimeridian,
  splitPolygonRingAtAntimeridian
} from "./geoLine.js";
import {
  formatCommunityReportTime,
  formatDistributionOriginTime,
  formatWorldForecastMapTime
} from "./dateFormatters.js";
import { getVolcanoLevelColor, VOLCANO_UNKNOWN_LEVEL_COLOR } from "../volcanoLevels.js";
import {
  getAvailableVolcanoAshForecasts,
  getHighestPriorityVolcanoReport
} from "../jma/volcanoXml.js";
import { groupHypocenterItemsByCoordinate } from "../domain/hypocenterDistribution.js";
import { formatCommunityReportTemperature } from "../domain/communityReportFormatting.js";
import { getRecoloredEstimatedIntensityImageData } from "../jma/estimatedIntensity.js";
import {
  getVolcanoAshfallLevel,
  VOLCANO_SMALL_CINDERS_STYLE
} from "../volcanoAshfall.js";
import { WORLD_TYPHOON_MODELS, isWorldTyphoonControlMember } from "../worldTyphoon.js";
import {
  destinationPoint
} from "../typhoonGeometry.js";
import { getEarlyWarningColor, getWarningColor } from "../warningMapColors.js";
import { mergeRiverFloodWarningsIntoGroups } from "../warningRiverMerge.js";
import {
  buildEewForecastAreaFeatureCollection,
  createEewForecastAreaSignature
} from "../eew/eewForecastAreas.js";

const MODE_CLASS = {
  radar: "mode-radar",
  amedas: "mode-amedas",
  warnings: "mode-warnings",
  typhoon: "mode-typhoon",
  earthquake: "mode-earthquake"
};

const SAMPLE_SOURCE_ID = "weather-samples";
const EARTHQUAKE_SHAPE_SOURCE_ID = "earthquake-shapes";
const EARTHQUAKE_SHAPE_LAYERS = new Set(["sample-fill", "sample-tsunami-area-fill", "sample-line", "sample-tsunami-area-line", "sample-line-dashed"]);
const earthquakeCollectionPartsCache = new WeakMap();

function splitEarthquakeCollection(collection) {
  let parts = earthquakeCollectionPartsCache.get(collection);
  if (!parts) {
    const points = [], shapes = [];
    for (const feature of collection.features) {
      (feature.geometry?.type === "Point" ? points : shapes).push(feature);
    }
    parts = {
      points: { type: "FeatureCollection", features: points },
      shapes: { type: "FeatureCollection", features: shapes }
    };
    earthquakeCollectionPartsCache.set(collection, parts);
  }
  return parts;
}
const HYPOCENTER_AREA_SOURCE_ID = "hypocenter-area-selection";
const HYPOCENTER_AREA_FILL_LAYER_ID = "hypocenter-area-selection-fill";
const HYPOCENTER_AREA_LINE_LAYER_ID = "hypocenter-area-selection-line";
const EEW_SOURCE_ID = "wolfx-emergency-earthquake-warning";
const EEW_AREA_SOURCE_ID = "wolfx-eew-forecast-areas";
const EEW_AREA_FILL_LAYER_ID = "eew-forecast-area-fill";
const EEW_AREA_LINE_LAYER_ID = "eew-forecast-area-line";
const EEW_LAYER_IDS = [EEW_AREA_FILL_LAYER_ID, EEW_AREA_LINE_LAYER_ID, "eew-wave-fill", "eew-wave-line", "eew-hypocenter-cross"];
const EEW_P_WAVE_COLOR = "#1769c2";
const EEW_S_WAVE_COLOR = "#ff6a3d";
const EEW_HYPOCENTER_BLINK_INTERVAL_MS = 1800;
const EEW_HYPOCENTER_DIMMED_OPACITY = 0.24;
const HYPOCENTER_CROSS_TEXT_SIZE = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  24,
  8,
  34,
  10,
  42
];
const HYPOCENTER_CROSS_PAINT = {
  "text-color": "#e3342f",
  "text-halo-color": "#b8860b",
  "text-halo-width": 2.4,
  "text-halo-blur": 0.4
};
let jma2001WaveDistanceCalculator = null;
let jma2001WaveDistanceLoadPromise = null;
const SAMPLE_LAYERS = ["sample-fill", "sample-tsunami-area-fill", "sample-line", "sample-tsunami-area-line", "sample-line-dashed", "sample-circle", "sample-tsunami-coastal", "sample-amedas-value", "hypocenter-distribution-count", "earthquake-area-intensity-marker", "earthquake-station-intensity-marker", "sample-tsunami-offshore", "sample-wind-arrow", "sample-cross", "sample-volcano", "sample-label"];
const AMEDAS_INTERACTIVE_LAYERS = ["sample-circle", "sample-wind-arrow", "sample-label"];
const EARTHQUAKE_INTERACTIVE_LAYERS = [EEW_AREA_FILL_LAYER_ID, "sample-circle", "sample-tsunami-coastal", "sample-cross", "earthquake-station-intensity-marker", "sample-tsunami-offshore", "sample-volcano", "sample-fill", "sample-tsunami-area-fill", "sample-line", "sample-tsunami-area-line"];
const TSUNAMI_BLINK_INTERVAL_MS = 1800;
const TSUNAMI_DIMMED_OPACITY_FACTOR = 0.38;
const EARTHQUAKE_STATION_RADIUS = 10;
const EARTHQUAKE_STATION_STROKE_WIDTH = 1;
const SAMPLE_CIRCLE_BASE_RADIUS = ["coalesce", ["get", "radius"], 8];
const SAMPLE_CIRCLE_RADIUS_EXPRESSION = buildCircleZoomExpression({
  zoomStops: [
    [3, 0.34, 0.3],
    [5, 0.5, 0.42],
    [7, 0.78, 0.65],
    [9, 1.2, 0.85],
    [10, 1.38, 1],
    [12, 1.55, 1]
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
const WORLD_TYPHOON_POSITION_SOURCE_ID = "world-typhoon-position";
const WORLD_TYPHOON_POSITION_LAYERS = [
  "typhoon-world-forecast-member-position",
  "typhoon-world-forecast-position-halo",
  "typhoon-world-forecast-position",
  "typhoon-world-forecast-position-anchor",
  "typhoon-world-forecast-time-label"
];
const WORLD_TYPHOON_MODEL_STYLES = {
  ecmwf: {
    palette: [WORLD_TYPHOON_MODELS.ecmwf.color],
    control: WORLD_TYPHOON_MODELS.ecmwf.color,
    positionRadius: 4,
    genesisEnsemble: WORLD_TYPHOON_MODELS.ecmwf.color,
    genesisControl: WORLD_TYPHOON_MODELS.ecmwf.color
  },
  "ifs-hres": {
    palette: [WORLD_TYPHOON_MODELS["ifs-hres"].color],
    control: WORLD_TYPHOON_MODELS["ifs-hres"].color,
    positionRadius: 5.4,
    genesisEnsemble: WORLD_TYPHOON_MODELS["ifs-hres"].color,
    genesisControl: WORLD_TYPHOON_MODELS["ifs-hres"].color
  },
  "aifs-ens": {
    palette: [WORLD_TYPHOON_MODELS["aifs-ens"].color],
    control: WORLD_TYPHOON_MODELS["aifs-ens"].color,
    positionRadius: 6.8,
    genesisEnsemble: WORLD_TYPHOON_MODELS["aifs-ens"].color,
    genesisControl: WORLD_TYPHOON_MODELS["aifs-ens"].color
  },
  "aifs-single": {
    palette: [WORLD_TYPHOON_MODELS["aifs-single"].color],
    control: WORLD_TYPHOON_MODELS["aifs-single"].color,
    positionRadius: 8.2,
    genesisEnsemble: WORLD_TYPHOON_MODELS["aifs-single"].color,
    genesisControl: WORLD_TYPHOON_MODELS["aifs-single"].color
  },
  gefs: {
    palette: [WORLD_TYPHOON_MODELS.gefs.color],
    control: WORLD_TYPHOON_MODELS.gefs.color,
    positionRadius: 9.6,
    genesisEnsemble: WORLD_TYPHOON_MODELS.gefs.color,
    genesisControl: WORLD_TYPHOON_MODELS.gefs.color
  },
  "gefs-mean": {
    palette: [WORLD_TYPHOON_MODELS["gefs-mean"].color],
    control: WORLD_TYPHOON_MODELS["gefs-mean"].color,
    positionRadius: 11,
    genesisEnsemble: WORLD_TYPHOON_MODELS["gefs-mean"].color,
    genesisControl: WORLD_TYPHOON_MODELS["gefs-mean"].color
  }
};
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
  "typhoon-world-ensemble",
  "typhoon-world-control",
  "typhoon-world-genesis-ensemble",
  "typhoon-world-genesis-control",
  ...WORLD_TYPHOON_POSITION_LAYERS,
  "typhoon-center-x",
  "typhoon-forecast-label",
  "typhoon-label"
];
const TYPHOON_FORECAST_INFO_LAYERS = [
  "typhoon-forecast-circle-fill",
  "typhoon-forecast-circle",
  "typhoon-forecast-label",
  ...WORLD_TYPHOON_POSITION_LAYERS
];
const WIND_ARROW_IMAGE_ID = "amedas-wind-arrow";
const VOLCANO_MARKER_IMAGE_ID = "volcano-filled-triangle";
const EARTHQUAKE_AREA_INTENSITY_MARKER_IMAGE_ID = "earthquake-area-intensity-square";
const EARTHQUAKE_STATION_INTENSITY_MARKER_IMAGE_ID = "earthquake-station-intensity-round";
const RADAR_SOURCE_PREFIX = "jma-nowcast-radar-z";
const RADAR_LAYER_PREFIX = "jma-nowcast-radar-z";
const LIGHTNING_SOURCE_PREFIX = "jma-nowcast-lightning-z";
const LIGHTNING_LAYER_PREFIX = "jma-nowcast-lightning-z";
const LIGHTNING_OBSERVATION_SOURCE_ID = "jma-lightning-observations";
const LIGHTNING_OBSERVATION_LAYER_IDS = [
  "lightning-observation-ground",
  "lightning-observation-cloud"
];
const ESTIMATED_INTENSITY_SOURCE_PREFIX = "jma-estimated-intensity-source";
const ESTIMATED_INTENSITY_LAYER_PREFIX = "jma-estimated-intensity-layer";
const ESTIMATED_INTENSITY_PROTOCOL = "meteoscope-estimated-intensity";
const estimatedIntensityImageDataByKey = new Map();
let estimatedIntensityProtocolRegistered = false;
const estimatedIntensityLayerStateByMap = new WeakMap();
const lightningObservationUrlByMap = new WeakMap();
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
const HIMAWARI_SATELLITE_SOURCE_ID = "jma-himawari-satellite";
const HIMAWARI_SATELLITE_LAYER_ID = "jma-himawari-satellite-raster";
const himawariSatelliteLayerStateByMap = new WeakMap();
const GSI_RELIEF_SOURCE_ID = "gsi-relief";
const GSI_HILLSHADE_SOURCE_ID = "gsi-hillshade";
const GSI_RELIEF_LAYER_ID = "gsi-relief-raster";
const GSI_HILLSHADE_LAYER_ID = "gsi-hillshade-raster";
const TERRAIN_LAYER_IDS = [GSI_RELIEF_LAYER_ID, GSI_HILLSHADE_LAYER_ID];
const DEFAULT_TERRAIN_OPACITY = 0.48;
const LIGHTNING_MAX_ZOOM = 8.9;
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
const GSJ_ACTIVE_FAULT_SOURCE_ID = "gsj-active-faults";
const GSJ_ACTIVE_FAULT_LINE_LAYER_ID = "gsj-active-fault-line";
const ACTIVE_FAULT_LAYERS = [
  JSHIS_MAJOR_FAULT_FILL_LAYER_ID,
  JSHIS_MAJOR_FAULT_LINE_LAYER_ID,
  GSJ_ACTIVE_FAULT_LINE_LAYER_ID
];
const JSHIS_MAJOR_FAULT_INTERACTIVE_LAYERS = [JSHIS_MAJOR_FAULT_FILL_LAYER_ID, JSHIS_MAJOR_FAULT_LINE_LAYER_ID];
const GSJ_ACTIVE_FAULT_INTERACTIVE_LAYERS = [GSJ_ACTIVE_FAULT_LINE_LAYER_ID];
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
const CURRENT_LOCATION_LAYER_IDS = ["current-location-halo", "current-location-dot"];
const COMMUNITY_REPORT_SOURCE_ID = "community-weather-reports";
const COMMUNITY_REPORT_LAYERS = [
  "community-report-cluster",
  "community-report-cluster-count",
  "community-report-point",
  "community-report-seasonal-icon"
];
const MUNICIPALITY_FILL_LAYER_ID = "jma-municipality-fill";
const MUNICIPALITY_FIX_FILL_LAYER_ID = "jma-municipality-fix-fill";
const WARNING_OVERLAY_LAYER_ID = "jma-warning-overlay";
const WARNING_FIX_OVERLAY_LAYER_ID = "jma-warning-fix-overlay";
const WARNING_EARLY_OVERLAY_LAYER_ID = "jma-warning-early-overlay";
const WARNING_EARLY_FIX_OVERLAY_LAYER_ID = "jma-warning-early-fix-overlay";
const WARNING_CLICK_LAYER_ID = "jma-warning-click-target";
const WARNING_FIX_CLICK_LAYER_ID = "jma-warning-fix-click-target";
const WARNING_HATCH_LAYER_ID = "jma-warning-emergency-hatch";
const WARNING_FIX_HATCH_LAYER_ID = "jma-warning-fix-emergency-hatch";
const MUNICIPALITY_LINE_LAYER_ID = "jma-municipality-line";
const MUNICIPALITY_FIX_LINE_LAYER_ID = "jma-municipality-fix-line";
const INITIAL_GEOMETRY_LAYER_IDS = [
  MUNICIPALITY_FILL_LAYER_ID,
  MUNICIPALITY_LINE_LAYER_ID,
  ...(!VECTOR_BASE_MAP_ENABLED ? [MUNICIPALITY_FIX_FILL_LAYER_ID, MUNICIPALITY_FIX_LINE_LAYER_ID] : []),
  "japan-prefecture-line"
];
const INITIAL_GEOMETRY_SOURCE_IDS = [MUNICIPALITY_SOURCE_ID, ...(!VECTOR_BASE_MAP_ENABLED ? [MUNICIPALITY_FIX_SOURCE_ID, PREFECTURE_SOURCE_ID] : [])];
const WARNING_STATUS_OVERLAY_LAYER_IDS = [WARNING_OVERLAY_LAYER_ID, ...(!VECTOR_BASE_MAP_ENABLED ? [WARNING_FIX_OVERLAY_LAYER_ID] : [])];
const WARNING_EARLY_OVERLAY_LAYER_IDS = [WARNING_EARLY_OVERLAY_LAYER_ID, ...(!VECTOR_BASE_MAP_ENABLED ? [WARNING_EARLY_FIX_OVERLAY_LAYER_ID] : [])];
const WARNING_OVERLAY_LAYER_IDS = [...WARNING_STATUS_OVERLAY_LAYER_IDS, ...WARNING_EARLY_OVERLAY_LAYER_IDS];
const WARNING_CLICK_LAYER_IDS = [WARNING_CLICK_LAYER_ID, ...(!VECTOR_BASE_MAP_ENABLED ? [WARNING_FIX_CLICK_LAYER_ID] : [])];
const WARNING_HATCH_LAYER_IDS = [WARNING_HATCH_LAYER_ID, ...(!VECTOR_BASE_MAP_ENABLED ? [WARNING_FIX_HATCH_LAYER_ID] : [])];
const WARNING_HATCH_IMAGE_ID = "jma-warning-emergency-hatch-pattern";
const WARNING_FEATURE_STATE_KEYS = {
  status: "warningStatusLevel",
  early: "warningEarlyLevel"
};
const warningGeometryFixCodeSet = new Set(WARNING_GEOMETRY_FIX_CODES);
const MAP_THEME_COLORS = {
  dark: {
    background: "#0c1326",
    worldLand: "#252a33",
    worldCountryLine: "#5e6672",
    municipalityFill: "#3c3d40",
    municipalityLine: "#848a94",
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
    plateDepthLabelHalo: "rgba(5, 9, 20, 0.9)",
    volcanoLevel1: "#f0f0f8",
    volcanoBaseHalo: "rgba(5, 9, 20, 0.42)",
    volcanoBaseHaloWidth: 0.65
  },
  light: {
    background: "#e3edf6",
    worldLand: "#cbd6e0",
    worldCountryLine: "#7f8d9b",
    municipalityFill: "#f8fafc",
    municipalityLine: "#788797",
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
    plateDepthLabelHalo: "rgba(248, 252, 255, 0.94)",
    volcanoLevel1: "#8fa5b9",
    volcanoBaseHalo: "rgba(0, 0, 0, 0)",
    volcanoBaseHaloWidth: 0
  }
};

const EMPTY_GEOJSON = { type: "FeatureCollection", features: [] };
let worldGeometryPromise = null;
const warningFeatureStateCache = new WeakMap();
const kikikuruTileUrlCache = new Map();
const radarOverlayZoomLimitCache = new WeakMap();
const geoJsonSourceDataCache = new WeakMap();
const amedasFeatureCollectionCache = new WeakMap();

export function createWeatherMap(elementId) {
  let map = null;
  let pendingRender = null;
  let lastRenderedMode = null;
  let lastRenderedData = null;
  let modeApplyPending = false;
  let activeMode = "radar";
  let activeEews = [];
  let sampleDataMode = null;
  let recentEarthquakeCollectionCache = null;
  let eewAreaSignature = "";
  let eewAreaLoadGeneration = 0;
  let eewAreaGeometryPromise = null;
  let activeTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  let terrainLayerVisible = false;
  let terrainLayerOpacity = DEFAULT_TERRAIN_OPACITY;
  let terrainSyncPending = false;
  let tsunamiBlinkTimer = 0;
  let tsunamiBlinkVisible = true;
  let eewHypocenterBlinkTimer = 0;
  let eewHypocenterBlinkVisible = true;
  let activeFaultVisible = true;
  let activeFaultDataSource = "jshis";
  let gsjActiveFaultData = EMPTY_GEOJSON;
  let plateBoundaryVisible = true;
  let plateDepthContoursVisible = true;
  let plateDepthSource = "slab2";
  let plateDepthLoadGeneration = 0;
  const plateDepthUrl = () => plateDepthSource === "mri" ? MAP_DATA_ENDPOINTS.mriPlateDepthContours : MAP_DATA_ENDPOINTS.slab2DepthContours;
  let warningAreasByCode = new Map();
  let mapInfoElement = null;
  let mapInfoConnectorElement = null;
  let mapInfoLngLat = null;
  let mapInfoAnchorLngLat = null;
  let mapInfoOwner = null;
  let lastTyphoonForecastMode = null;
  let communityReports = [];
  let communityReportsVisible = false;
  let communityReportDeleteHandler = null;
  let currentLocationVisible = true;
  let hypocenterAreaPolygon = [];
  let hypocenterAreaOverlay = null;
  let hypocenter3DEnabled = false;
  let previousHypocenterCamera = null;
  let plateDepth3DLayerAvailable = false;
  let plateDepthSurface3DLayerAvailable = false;
  let plateDepth3DReady = false;
  let plateDepthSurface3DReady = false;
  let plateDepth3DLoadPromise = null;
  const hypocenter3D = createHypocenter3DLayer(maplibregl, getHypocenterDepthColor);
  const plateDepth3D = createPlateDepth3DLayer(maplibregl, getHypocenterDepthColor);
  const plateDepthSurface3D = createPlateDepthSurface3DLayer(maplibregl, getHypocenterDepthColor);

  let initialMapReady = null;
  function whenReady() { return initialMapReady ?? Promise.resolve(false); }

  function initialize() {
    performance.mark("meteoscope:map:init");
    registerBaseMapProtocol(maplibregl);
    map = new maplibregl.Map({
      container: elementId,
      center: [DEFAULT_VIEW.center[1], DEFAULT_VIEW.center[0]],
      zoom: DEFAULT_VIEW.zoom,
      minZoom: DEFAULT_VIEW.minZoom,
      maxZoom: DEFAULT_VIEW.maxZoom,
      renderWorldCopies: true,
      dragRotate: true,
      pitchWithRotate: false,
      localIdeographFontFamily: '"Noto Sans JP", sans-serif',
      attributionControl: false,
      style: createBaseStyle(activeTheme)
    });
    map.getContainer().dataset.theme = activeTheme;
    map.touchZoomRotate.enableRotation();
    initialMapReady = waitForInitialMapGeometry(map, {
      sourceIds: INITIAL_GEOMETRY_SOURCE_IDS,
      layerIds: INITIAL_GEOMETRY_LAYER_IDS,
      onState(state) {
        map.getContainer().dataset.initialGeometryState = state;
        performance.mark(`meteoscope:map:${state}`);
      }
    });

    map.on("load", () => {
      setupSampleLayers();
      syncEewForecastAreas({ force: true });
      applyMapTheme(map, activeTheme);
      syncTerrainLayer();
      setMode(activeMode);
      scheduleWorldGeometryLoad();
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
    if (!map.isStyleLoaded?.()) {
      if (!modeApplyPending) {
        modeApplyPending = true;
        map.once("idle", () => {
          modeApplyPending = false;
          setMode(activeMode);
        });
      }
      return;
    }
    setRadarVisible(map, mode === "radar");
    if (mode !== "radar") {
      setWeatherChartVisible(map, false);
      setRadarOverlayZoomLimit(map, mode);
    }
    if (mode !== "warnings") {
      setKikikuruVisible(map, false);
    }
    if (mode !== "warnings") updateWarningMunicipalityPaint(map, mode);
    syncPlateDepthContourVisibility();
    syncPlateBoundaryVisibility();
    syncActiveFaultVisibility();
    syncCommunityReportVisibility();
    syncEewVisibility();
    if (activeMode !== "earthquake") updateHypocenter3DPresentation(false);
    if (mode === "typhoon") void ensureWorldGeometryLoaded();
  }

  function setTerrainLayer({ visible, opacity } = {}) {
    terrainLayerVisible = Boolean(visible);
    terrainLayerOpacity = normalizeTerrainOpacity(opacity);
    syncTerrainLayer();
  }

  function syncTerrainLayer() {
    if (!map) return;
    if (!map.isStyleLoaded?.()) {
      if (!terrainSyncPending) {
        terrainSyncPending = true;
        map.once("idle", () => {
          terrainSyncPending = false;
          syncTerrainLayer();
        });
      }
      return;
    }
    terrainSyncPending = false;
    if (terrainLayerVisible) ensureTerrainLayers();
    const reliefOpacity = terrainLayerOpacity;
    const hillshadeOpacity = Math.min(0.52, terrainLayerOpacity * 0.72);
    TERRAIN_LAYER_IDS.forEach((layerId) => {
      if (!map.getLayer(layerId)) return;
      map.setLayoutProperty(layerId, "visibility", terrainLayerVisible ? "visible" : "none");
    });
    if (map.getLayer(GSI_RELIEF_LAYER_ID)) {
      map.setPaintProperty(GSI_RELIEF_LAYER_ID, "raster-opacity", reliefOpacity);
    }
    if (map.getLayer(GSI_HILLSHADE_LAYER_ID)) {
      map.setPaintProperty(GSI_HILLSHADE_LAYER_ID, "raster-opacity", hillshadeOpacity);
    }
  }

  function ensureTerrainLayers() {
    if (!map || map.getSource(GSI_RELIEF_SOURCE_ID)) return;
    // Keep operational overlays and administrative borders readable, but place
    // terrain above the opaque municipality base fills so land relief is visible.
    const beforeLayerId = map.getLayer(WARNING_OVERLAY_LAYER_ID)
      ? WARNING_OVERLAY_LAYER_ID
      : undefined;
    map.addSource(GSI_RELIEF_SOURCE_ID, {
      type: "raster",
      tiles: [MAP_DATA_ENDPOINTS.gsiReliefTiles],
      tileSize: 256,
      minzoom: 5,
      maxzoom: 15,
      attribution: "国土地理院"
    });
    map.addSource(GSI_HILLSHADE_SOURCE_ID, {
      type: "raster",
      tiles: [MAP_DATA_ENDPOINTS.gsiHillshadeTiles],
      tileSize: 256,
      minzoom: 2,
      maxzoom: 16,
      attribution: "国土地理院"
    });
    map.addLayer({
      id: GSI_RELIEF_LAYER_ID,
      type: "raster",
      source: GSI_RELIEF_SOURCE_ID,
      layout: { visibility: "visible" },
      paint: {
        "raster-opacity": terrainLayerOpacity,
        "raster-saturation": -0.08,
        "raster-fade-duration": 0
      }
    }, beforeLayerId);
    map.addLayer({
      id: GSI_HILLSHADE_LAYER_ID,
      type: "raster",
      source: GSI_HILLSHADE_SOURCE_ID,
      layout: { visibility: "visible" },
      paint: {
        "raster-opacity": Math.min(0.52, terrainLayerOpacity * 0.72),
        "raster-fade-duration": 0
      }
    }, beforeLayerId);
  }

  function scheduleWorldGeometryLoad() {
    const run = () => void ensureWorldGeometryLoaded();
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run, { timeout: 4500 });
    } else {
      window.setTimeout(run, 1800);
    }
  }

  async function ensureWorldGeometryLoaded() {
    const landSource = map?.getSource("world-land");
    if (!landSource?.setData) return;
    worldGeometryPromise ??= import("./data/worldLandGeoJson.js")
      .then((landModule) => prepareWorldMapData(landModule.worldLandGeoJson));
    try {
      const geometry = await worldGeometryPromise;
      setGeoJsonSourceData(map?.getSource("world-land"), geometry);
    } catch (error) {
      worldGeometryPromise = null;
      console.warn("[MeteoScope] world geometry load failed", error);
    }
  }

  function prepareWarningData(data) {
    if (!map?.getSource(MUNICIPALITY_SOURCE_ID) || !data) return;
    const statusAreas = getActiveWarningOverlayAreas("warnings", {
      ...data,
      activeWarningView: "status"
    });
    const earlyAreas = getActiveWarningOverlayAreas("warnings", {
      ...data,
      activeWarningView: "early"
    });
    void updateWarningFeatureStates(map, statusAreas, "status");
    void updateWarningFeatureStates(map, earlyAreas, "early");
  }

  function setActiveFaultVisible(visible) {
    activeFaultVisible = Boolean(visible);
    if (!activeFaultVisible) hideMapInfo("active-fault");
    syncActiveFaultVisibility();
  }

  function setActiveFaultDataSource(source) {
    const nextSource = source === "gsj" ? "gsj" : "jshis";
    if (activeFaultDataSource === nextSource) {
      syncActiveFaultVisibility();
      return;
    }
    activeFaultDataSource = nextSource;
    hideMapInfo("active-fault");
    syncActiveFaultVisibility();
  }

  function setGsjActiveFaultData(data) {
    gsjActiveFaultData = data?.type === "FeatureCollection" && Array.isArray(data.features)
      ? data
      : EMPTY_GEOJSON;
    const source = map?.getSource(GSJ_ACTIVE_FAULT_SOURCE_ID);
    if (source?.setData) source.setData(gsjActiveFaultData);
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

  function setPlateDepthSource(source) {
    const next = source === "mri" ? "mri" : "slab2";
    if (next === plateDepthSource) return;
    plateDepthSource = next;
    plateDepthLoadGeneration++;
    plateDepth3DReady = false;
    plateDepthSurface3DReady = false;
    plateDepth3DLoadPromise = null;
    map?.getSource(PLATE_DEPTH_SOURCE_ID)?.setData(plateDepthUrl());
    syncPlateDepthContourVisibility();
  }

  function syncActiveFaultVisibility() {
    if (!map?.getSource(SAMPLE_SOURCE_ID)) return;
    const shouldShow = activeMode === "earthquake" && activeFaultVisible;
    if (shouldShow) ensureActiveFaultLayers();
    ACTIVE_FAULT_LAYERS.forEach((layerId) => {
      if (!map.getLayer(layerId)) return;
      const matchesSource = activeFaultDataSource === "gsj"
        ? layerId === GSJ_ACTIVE_FAULT_LINE_LAYER_ID
        : layerId !== GSJ_ACTIVE_FAULT_LINE_LAYER_ID;
      map.setLayoutProperty(layerId, "visibility", shouldShow && matchesSource ? "visible" : "none");
    });
  }

  function ensureActiveFaultLayers() {
    if (!map) return;
    ensureJshisActiveFaultLayers();
    ensureGsjActiveFaultLayers();
  }

  function ensureJshisActiveFaultLayers() {
    if (map.getSource(JSHIS_MAJOR_FAULT_SOURCE_ID)) return;
    const colors = MAP_THEME_COLORS[activeTheme] ?? MAP_THEME_COLORS.dark;
    const beforeLayerId = map.getLayer("sample-circle") ? "sample-circle" : undefined;
    const visibility = activeMode === "earthquake"
      && activeFaultVisible
      && activeFaultDataSource === "jshis"
      ? "visible"
      : "none";
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

  function ensureGsjActiveFaultLayers() {
    if (map.getSource(GSJ_ACTIVE_FAULT_SOURCE_ID)) return;
    const colors = MAP_THEME_COLORS[activeTheme] ?? MAP_THEME_COLORS.dark;
    const beforeLayerId = map.getLayer("sample-circle") ? "sample-circle" : undefined;
    map.addSource(GSJ_ACTIVE_FAULT_SOURCE_ID, {
      type: "geojson",
      data: gsjActiveFaultData
    });
    map.addLayer({
      id: GSJ_ACTIVE_FAULT_LINE_LAYER_ID,
      type: "line",
      source: GSJ_ACTIVE_FAULT_SOURCE_ID,
      minzoom: 4,
      maxzoom: 16,
      layout: {
        visibility: activeMode === "earthquake"
          && activeFaultVisible
          && activeFaultDataSource === "gsj"
          ? "visible"
          : "none",
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": colors.activeFault,
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.76, 8, 0.9, 12, 0.98],
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.2, 8, 2.1, 12, 3.4]
      }
    }, beforeLayerId);
    GSJ_ACTIVE_FAULT_INTERACTIVE_LAYERS.forEach((layerId) => {
      map.on("mouseenter", layerId, () => {
        if (
          activeMode === "earthquake"
          && activeFaultVisible
          && activeFaultDataSource === "gsj"
        ) map.getCanvas().style.cursor = "pointer";
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
    const wantsSpatialContours = shouldShow && hypocenter3DEnabled && plateDepthSource === "slab2";
    if (wantsSpatialContours && !plateDepth3DReady) void ensurePlateDepth3DData();
    const showSpatialContours = wantsSpatialContours
      && plateDepth3DLayerAvailable
      && plateDepth3DReady;
    PLATE_DEPTH_LAYERS.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", shouldShow && !showSpatialContours ? "visible" : "none");
      }
    });
    plateDepthSurface3D.setEnabled(
      showSpatialContours && plateDepthSurface3DLayerAvailable && plateDepthSurface3DReady
    );
    plateDepth3D.setEnabled(showSpatialContours);
  }

  async function ensurePlateDepth3DData() {
    if (plateDepth3DReady || plateDepth3DLoadPromise) return plateDepth3DLoadPromise;
    const generation = plateDepthLoadGeneration;
    const surfaceRequest = fetch(MAP_DATA_ENDPOINTS.slab2Surface, { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) {
          console.warn(`[MeteoScope] Plate surface request failed: ${response.status}`);
          return null;
        }
        return response.json();
      })
      .catch((error) => {
        console.warn("[MeteoScope] プレート面データを取得できませんでした", error);
        return null;
      });
    plateDepth3DLoadPromise = Promise.all([
      fetch(plateDepthUrl(), { cache: "force-cache" }),
      surfaceRequest
    ])
      .then(async ([contourResponse, surface]) => {
        if (!contourResponse.ok) throw new Error(`USGS Slab2 contour request failed: ${contourResponse.status}`);
        const contours = await contourResponse.json();
        if (generation !== plateDepthLoadGeneration) return;
        plateDepth3D.setData(contours);
        plateDepth3DReady = true;
        if (surface) {
          plateDepthSurface3D.setData(surface);
          plateDepthSurface3DReady = true;
        }
        syncPlateDepthContourVisibility();
      })
      .catch((error) => {
        if (generation === plateDepthLoadGeneration) plateDepth3DLoadPromise = null;
        console.warn("[MeteoScope] プレート等深線の立体表示を準備できませんでした", error);
      });
    return plateDepth3DLoadPromise;
  }

  function ensurePlateDepthContourLayers() {
    if (!map || map.getSource(PLATE_DEPTH_SOURCE_ID)) return;
    const colors = MAP_THEME_COLORS[activeTheme] ?? MAP_THEME_COLORS.dark;
    const beforeLayerId = map.getLayer("sample-circle") ? "sample-circle" : undefined;
    const visibility = activeMode === "earthquake" && plateDepthContoursVisible ? "visible" : "none";
    map.addSource(PLATE_DEPTH_SOURCE_ID, {
      type: "geojson",
      data: plateDepthUrl()
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
      "text-font": ["Noto Sans JP"],
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
    lastRenderedMode = mode;
    lastRenderedData = data;
    if (mode === "earthquake" && data?.historicalEarthquakeDetailVisible === true) {
      hideMapInfo("earthquake-distribution");
    }

    const source = map.getSource(SAMPLE_SOURCE_ID);
    const areaVisible = mode === "earthquake"
      && activeEews.length === 0
      && ["distribution", "history"].includes(data?.earthquakeMapView);
    const areaPolygon = data?.earthquakeMapView === "history"
      ? data?.earthquakeArchiveFilters?.areaPolygon : data?.distributionFilters?.areaPolygon;
    if (JSON.stringify(hypocenterAreaPolygon) !== JSON.stringify(areaPolygon ?? [])) {
      setHypocenterAreaSelection(areaPolygon ?? []);
    }
    for (const layerId of [HYPOCENTER_AREA_FILL_LAYER_ID, HYPOCENTER_AREA_LINE_LAYER_ID]) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", areaVisible ? "visible" : "none");
      }
    }
    let collection = EMPTY_GEOJSON;
    if (mode === "earthquake" || mode === "amedas") {
      if (mode === "earthquake" && getEarthquakeMapView(data) === "recent"
        && data?.earthquakeContentMode !== "volcano") {
        const earthquake = data.selectedEarthquake
          ?? data.earthquakes?.find((item) => String(item.id) === String(data.selectedEarthquakeId ?? ""))
          ?? data.earthquakes?.[0];
        const inputs = [
          earthquake?.id, earthquake?.coordinates, earthquake?.intensityStations,
          earthquake?.intensityAreaFeatures, Boolean(earthquake?.estimatedIntensity?.images?.length),
          earthquake ? buildEarthquakePopup(earthquake) : "",
          data.tsunami?.mapFeatures, data.tideStationsVisible,
          data.tideStationsVisible ? data.tideStations : null,
          data.tideStationsVisible ? data.selectedTideStationCode : null
        ];
        if (recentEarthquakeCollectionCache?.inputs.every((value, index) => value === inputs[index])) {
          collection = recentEarthquakeCollectionCache.collection;
        } else {
          collection = createSampleFeatureCollection(mode, data);
          recentEarthquakeCollectionCache = { inputs, collection };
        }
      } else {
        collection = createSampleFeatureCollection(mode, data);
      }
      if (mode === "earthquake") {
        const parts = splitEarthquakeCollection(collection);
        setGeoJsonSourceData(map.getSource(EARTHQUAKE_SHAPE_SOURCE_ID), parts.shapes);
        setGeoJsonSourceData(source, parts.points);
      } else {
        setGeoJsonSourceData(source, collection);
      }
      sampleDataMode = mode;
    }
    syncSampleVisibility();
    syncTsunamiBlink(mode, collection);
    updateHypocenter3D(mode, data);
    const typhoonCollection = updateTyphoonLayers(mode, data);
    updateWarningAreaLookup(mode, data);
    updateRadarLayer(map, mode, data);
    updateWeatherDistributionLayer(map, mode, data);
    updateLightningLayer(map, mode, data);
    updateLightningObservationLayer(map, mode, data);
    updateWeatherChartSatelliteLayer(map, mode, data);
    updateWeatherChartLayer(map, mode, data);
    setRadarOverlayZoomLimit(map, mode, data);
    updateKikikuruLayer(map, mode, data);
    updateEstimatedIntensityLayer(map, mode, data);
    updateRiverFloodLayer(map, mode, data);
    updateWarningMunicipalityPaint(map, mode, data);
  }

  function syncTsunamiBlink(mode, collection) {
    const hasTsunami = mode === "earthquake"
      && activeEews.length === 0
      && (collection?.features ?? []).some((feature) => (
        feature?.properties?.tsunamiLevel
        || ["tsunami-coastal", "tsunami-offshore"].includes(feature?.properties?.markerType)
      ));
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    if (!hasTsunami || prefersReducedMotion) {
      const needsReset = Boolean(tsunamiBlinkTimer) || !tsunamiBlinkVisible;
      if (tsunamiBlinkTimer) window.clearInterval(tsunamiBlinkTimer);
      tsunamiBlinkTimer = 0;
      tsunamiBlinkVisible = true;
      if (needsReset) setTsunamiMapOpacity(1);
      return;
    }
    if (tsunamiBlinkTimer) return;

    tsunamiBlinkVisible = true;
    setTsunamiMapOpacity(1);
    tsunamiBlinkTimer = window.setInterval(() => {
      if (!map?.isStyleLoaded?.() || document.hidden) return;
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true) {
        window.clearInterval(tsunamiBlinkTimer);
        tsunamiBlinkTimer = 0;
        tsunamiBlinkVisible = true;
        setTsunamiMapOpacity(1);
        return;
      }
      tsunamiBlinkVisible = !tsunamiBlinkVisible;
      setTsunamiMapOpacity(tsunamiBlinkVisible ? 1 : TSUNAMI_DIMMED_OPACITY_FACTOR);
    }, TSUNAMI_BLINK_INTERVAL_MS);
  }

  function setTsunamiMapOpacity(factor) {
    if (!map?.isStyleLoaded?.()) return;
    const updates = [
      ["sample-tsunami-area-fill", "fill-opacity", ["*", ["coalesce", ["get", "fillOpacity"], 0.2], factor]],
      ["sample-tsunami-area-line", "line-opacity", ["*", ["coalesce", ["get", "lineOpacity"], 0.9], factor]],
      ["sample-tsunami-coastal", "circle-opacity", ["*", ["coalesce", ["get", "opacity"], 0.92], factor]],
      ["sample-tsunami-offshore", "text-opacity", factor]
    ];
    updates.forEach(([layerId, property, value]) => {
      if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, value);
    });
  }

  function setCurrentLocationVisible(visible) {
    currentLocationVisible = Boolean(visible);
    for (const layerId of CURRENT_LOCATION_LAYER_IDS) {
      if (map?.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", currentLocationVisible ? "visible" : "none");
      }
    }
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

  function whenCameraIdle() {
    if (!map?.isMoving()) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        map.off("moveend", finish);
        map.off("remove", finish);
        resolve();
      };
      map.on("moveend", finish);
      map.on("remove", finish);
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
    map.addSource(EARTHQUAKE_SHAPE_SOURCE_ID, { type: "geojson", data: EMPTY_GEOJSON });
    map.addSource(HYPOCENTER_AREA_SOURCE_ID, {
      type: "geojson",
      data: createEmptyFeatureCollection()
    });
    map.addSource(EEW_SOURCE_ID, {
      type: "geojson",
      data: createEmptyFeatureCollection()
    });
    map.addSource(EEW_AREA_SOURCE_ID, {
      type: "geojson",
      data: createEmptyFeatureCollection()
    });
    map.addSource(TYPHOON_SOURCE_ID, {
      type: "geojson",
      data: createEmptyFeatureCollection()
    });
    map.addSource(WORLD_TYPHOON_POSITION_SOURCE_ID, {
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
      id: HYPOCENTER_AREA_FILL_LAYER_ID,
      type: "fill",
      source: HYPOCENTER_AREA_SOURCE_ID,
      paint: {
        "fill-color": "#24b7f2",
        "fill-opacity": 0.13
      }
    });
    map.addLayer({
      id: HYPOCENTER_AREA_LINE_LAYER_ID,
      type: "line",
      source: HYPOCENTER_AREA_SOURCE_ID,
      paint: {
        "line-color": "#43c8ff",
        "line-width": 2.5,
        "line-dasharray": [1.5, 1]
      }
    });
    map.addLayer({
      id: EEW_AREA_FILL_LAYER_ID,
      type: "fill",
      source: EEW_AREA_SOURCE_ID,
      layout: { visibility: "none" },
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": ["coalesce", ["get", "fillOpacity"], 0.46]
      }
    });
    map.addLayer({
      id: EEW_AREA_LINE_LAYER_ID,
      type: "line",
      source: EEW_AREA_SOURCE_ID,
      layout: { visibility: "none", "line-join": "round" },
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["coalesce", ["get", "lineWidth"], 1.5],
        "line-opacity": 0.96
      }
    });
    map.addLayer({
      id: "eew-wave-fill",
      type: "fill",
      source: EEW_SOURCE_ID,
      filter: ["==", ["get", "featureType"], "wave"],
      layout: { visibility: "none" },
      paint: {
        "fill-color": ["match", ["get", "waveType"], "P", EEW_P_WAVE_COLOR, EEW_S_WAVE_COLOR],
        "fill-opacity": ["match", ["get", "waveType"], "P", 0.055, 0.065]
      }
    });
    map.addLayer({
      id: "eew-wave-line",
      type: "line",
      source: EEW_SOURCE_ID,
      filter: ["==", ["get", "featureType"], "wave"],
      layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["match", ["get", "waveType"], "P", EEW_P_WAVE_COLOR, EEW_S_WAVE_COLOR],
        "line-width": ["match", ["get", "waveType"], "P", 2.6, 2.8],
        "line-opacity": 0.96
      }
    });
    map.addLayer({
      id: "eew-hypocenter-cross",
      type: "symbol",
      source: EEW_SOURCE_ID,
      filter: ["==", ["get", "featureType"], "hypocenter"],
      layout: {
        visibility: "none",
        "text-field": ["case", ["==", ["get", "uncertain"], true], "◌", "×"],
        "text-font": ["Noto Sans JP"],
        "text-size": HYPOCENTER_CROSS_TEXT_SIZE,
        "text-allow-overlap": true,
        "text-ignore-placement": true
      },
      paint: {
        ...HYPOCENTER_CROSS_PAINT,
        "text-color": ["case", ["==", ["get", "uncertain"], true], "#f2b84b", "#e3342f"],
        "text-opacity": 1,
        "text-opacity-transition": { duration: 1400, delay: 0 }
      }
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
      "text-font": ["Noto Sans JP"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11, 9, 14],
        "text-allow-overlap": false,
        "text-padding": 8
      },
      paint: {
        "text-color": "#f8fbff",
        "text-halo-color": "rgba(5, 9, 20, 0.92)",
        "text-halo-width": 2
      }
    });
    setupWindArrowImage(map);
    setupVolcanoMarkerImage(map);
    setupEarthquakeAreaIntensityMarkerImage(map);
    setupEarthquakeStationIntensityMarkerImage(map);
    setupWarningHatchImage(map);
    setupWeatherFrontImages(map);

    map.addLayer({
      id: WARNING_HATCH_LAYER_ID,
      type: "fill",
      source: MUNICIPALITY_SOURCE_ID,
        ...baseMapSourceLayer("municipalities"),
      ...(!VECTOR_BASE_MAP_ENABLED ? { filter: ["!", ["in", ["get", "code"], ["literal", WARNING_GEOMETRY_FIX_CODES]]] } : {}),
      layout: { visibility: "none" },
      paint: {
        "fill-pattern": WARNING_HATCH_IMAGE_ID,
        "fill-opacity": getWarningEmergencyHatchOpacityExpression()
      }
    }, MUNICIPALITY_LINE_LAYER_ID);

    if (!VECTOR_BASE_MAP_ENABLED) map.addLayer({
      id: WARNING_FIX_HATCH_LAYER_ID,
      type: "fill",
      source: MUNICIPALITY_FIX_SOURCE_ID,
      layout: { visibility: "none" },
      paint: {
        "fill-pattern": WARNING_HATCH_IMAGE_ID,
        "fill-opacity": getWarningEmergencyHatchOpacityExpression()
      }
    }, MUNICIPALITY_LINE_LAYER_ID);

    map.addLayer({
      id: "sample-fill",
      type: "fill",
      source: EARTHQUAKE_SHAPE_SOURCE_ID,
      filter: ["all", ["==", ["geometry-type"], "Polygon"], ["!", ["has", "tsunamiLevel"]]],
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": ["coalesce", ["get", "fillOpacity"], 0.2]
      }
    });

    map.addLayer({
      id: "sample-tsunami-area-fill",
      type: "fill",
      source: EARTHQUAKE_SHAPE_SOURCE_ID,
      filter: ["all", ["==", ["geometry-type"], "Polygon"], ["has", "tsunamiLevel"]],
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": ["coalesce", ["get", "fillOpacity"], 0.2],
        "fill-opacity-transition": { duration: 750, delay: 0 }
      }
    });

    map.addLayer({
      id: "sample-line",
      type: "line",
      source: EARTHQUAKE_SHAPE_SOURCE_ID,
      filter: ["all",
        ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "LineString"]],
        ["!", ["has", "tsunamiLevel"]],
        ["!=", ["get", "lineStyle"], "dashed"]
      ],
      paint: {
        "line-color": ["get", "color"],
        "line-opacity": 0.9,
        "line-width": ["coalesce", ["get", "lineWidth"], 2]
      }
    });

    map.addLayer({
      id: "sample-tsunami-area-line",
      type: "line",
      source: EARTHQUAKE_SHAPE_SOURCE_ID,
      filter: ["all",
        ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "LineString"]],
        ["has", "tsunamiLevel"]
      ],
      paint: {
        "line-color": ["get", "color"],
        "line-opacity": 0.9,
        "line-width": ["coalesce", ["get", "lineWidth"], 2],
        "line-opacity-transition": { duration: 750, delay: 0 }
      }
    });

    map.addLayer({
      id: "sample-line-dashed",
      type: "line",
      source: EARTHQUAKE_SHAPE_SOURCE_ID,
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
        ["!=", ["get", "markerType"], "cross"],
        ["!=", ["get", "markerType"], "volcano"],
        ["!=", ["get", "markerType"], "tsunami-coastal"],
        ["!=", ["get", "markerType"], "tsunami-offshore"],
        ["!=", ["get", "markerType"], "earthquake-area-intensity"],
        ["!=", ["get", "markerType"], "earthquake-station"]
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
      id: "sample-tsunami-coastal",
      type: "circle",
      source: SAMPLE_SOURCE_ID,
      filter: ["all",
        ["==", ["geometry-type"], "Point"],
        ["==", ["get", "markerType"], "tsunami-coastal"]
      ],
      layout: {
        "circle-sort-key": ["coalesce", ["get", "sortKey"], 0]
      },
      paint: {
        "circle-color": ["get", "color"],
        "circle-opacity": ["coalesce", ["get", "opacity"], 0.92],
        "circle-opacity-transition": { duration: 750, delay: 0 },
        "circle-radius": SAMPLE_CIRCLE_RADIUS_EXPRESSION,
        "circle-stroke-color": "#050505",
        "circle-stroke-width": SAMPLE_CIRCLE_STROKE_WIDTH_EXPRESSION
      }
    });

    map.addLayer({
      id: "sample-amedas-value",
      type: "symbol",
      source: SAMPLE_SOURCE_ID,
      minzoom: 8.5,
      filter: ["all",
        ["==", ["geometry-type"], "Point"],
        ["==", ["get", "markerType"], "amedas"],
        ["has", "amedasValueLabel"]
      ],
      layout: {
        "text-field": ["get", "amedasValueLabel"],
        "text-font": ["Noto Sans JP"],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8.5,
          7.5,
          10,
          8.5,
          12,
          9.5
        ],
        "text-letter-spacing": -0.04,
        "text-anchor": "center",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "symbol-sort-key": ["coalesce", ["get", "sortKey"], 0]
      },
      paint: {
        "text-color": ["get", "amedasTextColor"],
        "text-halo-width": 0
      }
    });

    map.addLayer({
      id: "hypocenter-distribution-count",
      type: "symbol",
      source: SAMPLE_SOURCE_ID,
      filter: ["all",
        ["==", ["geometry-type"], "Point"],
        ["==", ["get", "markerType"], "hypocenter-distribution"],
        ["==", ["get", "showCoordinateEventCount"], true],
        [">", ["get", "coordinateEventCount"], 1]
      ],
      layout: {
        "text-field": ["to-string", ["get", "coordinateEventCount"]],
        "text-font": ["Noto Sans JP"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 9, 7, 11],
        "text-anchor": "center",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "symbol-sort-key": ["coalesce", ["get", "sortKey"], 0]
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(5, 9, 20, 0.9)",
        "text-halo-width": 1.2
      }
    });

    map.addLayer({
      id: "earthquake-area-intensity-marker",
      type: "symbol",
      source: SAMPLE_SOURCE_ID,
      maxzoom: 6.5,
      filter: ["all",
        ["==", ["geometry-type"], "Point"],
        ["==", ["get", "markerType"], "earthquake-area-intensity"]
      ],
      layout: {
        "icon-image": EARTHQUAKE_AREA_INTENSITY_MARKER_IMAGE_ID,
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          0.44,
          7,
          0.64
        ],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "text-field": ["get", "intensityText"],
        "text-font": ["Noto Sans JP"],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          7,
          7,
          9
        ],
        "text-anchor": "center",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "symbol-sort-key": ["coalesce", ["get", "sortKey"], 0]
      },
      paint: {
        "icon-color": ["get", "color"],
        "text-color": ["get", "textColor"],
        "text-halo-width": 0
      }
    });

    // Draw every observation point; use smaller symbols at wider zoom levels.
    map.addLayer({
      id: "earthquake-station-intensity-marker",
      type: "symbol",
      source: SAMPLE_SOURCE_ID,
      minzoom: 6.5,
      filter: ["all",
        ["==", ["geometry-type"], "Point"],
        ["==", ["get", "markerType"], "earthquake-station"]
      ],
      layout: {
        "icon-image": ["concat", EARTHQUAKE_STATION_INTENSITY_MARKER_IMAGE_ID, ["get", "intensityKey"]],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.09, 5, 0.13, 7, 0.20, 9, 0.26, 10, 0.32, 12, 0.3845],
        "icon-padding": 1,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "symbol-sort-key": ["coalesce", ["get", "sortKey"], 0]
      },
      paint: {
        "icon-opacity": 1
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
      "text-font": ["Noto Sans JP"],
        "text-size": HYPOCENTER_CROSS_TEXT_SIZE,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "symbol-sort-key": ["coalesce", ["get", "sortKey"], 0]
      },
      paint: {
        ...HYPOCENTER_CROSS_PAINT
      }
    });

    map.addLayer({
      id: "sample-tsunami-offshore",
      type: "symbol",
      source: SAMPLE_SOURCE_ID,
      filter: ["all",
        ["==", ["geometry-type"], "Point"],
        ["==", ["get", "markerType"], "tsunami-offshore"]
      ],
      layout: {
        "text-field": "◆",
        "text-font": ["Noto Sans JP"],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          10,
          7,
          14,
          10,
          17
        ],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "symbol-sort-key": ["coalesce", ["get", "sortKey"], 0]
      },
      paint: {
        "text-color": ["coalesce", ["get", "color"], "#ff2b12"],
        "text-opacity": 1,
        "text-opacity-transition": { duration: 750, delay: 0 },
        "text-halo-color": "#050505",
        "text-halo-width": 2
      }
    });

    map.addLayer({
      id: "sample-volcano",
      type: "symbol",
      source: SAMPLE_SOURCE_ID,
      filter: ["all", ["==", ["geometry-type"], "Point"], ["==", ["get", "markerType"], "volcano"]],
      layout: {
        "icon-image": VOLCANO_MARKER_IMAGE_ID,
        "icon-size": buildVolcanoIconSizeExpression(activeTheme),
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-padding": 0,
        "symbol-sort-key": ["coalesce", ["get", "sortKey"], 0]
      },
      paint: {
        "icon-color": buildVolcanoIconColorExpression(activeTheme),
        "icon-opacity": 0.96,
        "icon-halo-color": (MAP_THEME_COLORS[activeTheme] ?? MAP_THEME_COLORS.dark).volcanoBaseHalo,
        "icon-halo-width": (MAP_THEME_COLORS[activeTheme] ?? MAP_THEME_COLORS.dark).volcanoBaseHaloWidth
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
      "text-font": ["Noto Sans JP"],
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
      map.addLayer(plateDepthSurface3D.layer);
      plateDepthSurface3DLayerAvailable = true;
    } catch (error) {
      console.warn("[MeteoScope] プレート面の立体レイヤーを初期化できませんでした", error);
    }
    try {
      map.addLayer(plateDepth3D.layer);
      plateDepth3DLayerAvailable = true;
    } catch (error) {
      console.warn("[MeteoScope] プレート等深線の立体レイヤーを初期化できませんでした", error);
    }
    try {
      map.addLayer(hypocenter3D.layer);
    } catch (error) {
      console.warn("[MeteoScope] 震央分布の立体レイヤーを初期化できませんでした", error);
    }

    map.addLayer({
      id: "current-location-halo",
      type: "circle",
      source: CURRENT_LOCATION_SOURCE_ID,
      layout: { visibility: currentLocationVisible ? "visible" : "none" },
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
      layout: { visibility: currentLocationVisible ? "visible" : "none" },
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
      filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", ["get", "typhoonShape"], "windAreaFill"]],
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": ["coalesce", ["get", "fillOpacity"], 0.08],
        "fill-antialias": false
      }
    });

    map.addLayer({
      id: "typhoon-wind-area-line",
      type: "line",
      source: TYPHOON_SOURCE_ID,
      filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "typhoonShape"], "windAreaLine"]],
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
      id: "typhoon-world-ensemble",
      type: "line",
      source: TYPHOON_SOURCE_ID,
      filter: ["==", ["get", "typhoonShape"], "worldEnsemble"],
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": ["get", "color"],
        "line-opacity": 0.34,
        "line-width": 1
      }
    });

    map.addLayer({
      id: "typhoon-world-control",
      type: "line",
      source: TYPHOON_SOURCE_ID,
      filter: ["==", ["get", "typhoonShape"], "worldControl"],
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": ["coalesce", ["get", "color"], "#008c54"],
        "line-opacity": 0.34,
        "line-width": 1
      }
    });

    map.addLayer({
      id: "typhoon-world-genesis-ensemble",
      type: "line",
      source: TYPHOON_SOURCE_ID,
      filter: ["==", ["get", "typhoonShape"], "worldGenesisEnsemble"],
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": ["coalesce", ["get", "color"], "#f3a33c"],
        "line-opacity": 0.34,
        "line-width": 1
      }
    });

    map.addLayer({
      id: "typhoon-world-genesis-control",
      type: "line",
      source: TYPHOON_SOURCE_ID,
      filter: ["==", ["get", "typhoonShape"], "worldGenesisControl"],
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": ["coalesce", ["get", "color"], "#ff8c18"],
        "line-opacity": 0.34,
        "line-width": 1,
        "line-dasharray": [1.5, 1.25]
      }
    });

    const worldForecastMarkerRadius = ["coalesce", ["get", "markerRadius"], 6];
    const worldForecastPositionRadius = [
      "interpolate",
      ["linear"],
      ["zoom"],
      2,
      ["*", worldForecastMarkerRadius, 0.78],
      6,
      worldForecastMarkerRadius,
      9,
      ["*", worldForecastMarkerRadius, 1.16]
    ];

    map.addLayer({
      id: "typhoon-world-forecast-member-position",
      type: "circle",
      source: WORLD_TYPHOON_POSITION_SOURCE_ID,
      filter: [
        "all",
        ["==", ["get", "typhoonShape"], "worldForecastPosition"],
        ["==", ["get", "positionRole"], "member"]
      ],
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          2,
          2.4,
          6,
          3.4,
          9,
          4.2
        ],
        "circle-color": ["get", "color"],
        "circle-opacity": 0.96,
        "circle-stroke-color": "rgba(255, 255, 255, 0.96)",
        "circle-stroke-width": 1.4
      }
    });

    map.addLayer({
      id: "typhoon-world-forecast-position-halo",
      type: "circle",
      source: WORLD_TYPHOON_POSITION_SOURCE_ID,
      filter: [
        "all",
        ["==", ["get", "typhoonShape"], "worldForecastPosition"],
        ["!=", ["get", "positionRole"], "member"]
      ],
      paint: {
        "circle-radius": worldForecastPositionRadius,
        "circle-color": "rgba(255, 255, 255, 0.04)",
        "circle-stroke-color": "rgba(2, 5, 12, 0.96)",
        "circle-stroke-width": 3.8
      }
    });

    map.addLayer({
      id: "typhoon-world-forecast-position",
      type: "circle",
      source: WORLD_TYPHOON_POSITION_SOURCE_ID,
      filter: [
        "all",
        ["==", ["get", "typhoonShape"], "worldForecastPosition"],
        ["!=", ["get", "positionRole"], "member"]
      ],
      paint: {
        "circle-radius": worldForecastPositionRadius,
        "circle-color": ["get", "color"],
        "circle-opacity": 0.12,
        "circle-stroke-color": ["get", "color"],
        "circle-stroke-width": 2.4
      }
    });

    map.addLayer({
      id: "typhoon-world-forecast-position-anchor",
      type: "circle",
      source: WORLD_TYPHOON_POSITION_SOURCE_ID,
      filter: [
        "all",
        ["==", ["get", "typhoonShape"], "worldForecastPosition"],
        ["!=", ["get", "positionRole"], "member"]
      ],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 1.8, 7, 2.8],
        "circle-color": "#f8fbff",
        "circle-stroke-color": "#050505",
        "circle-stroke-width": 1.5
      }
    });

    map.addLayer({
      id: "typhoon-world-forecast-time-label",
      type: "symbol",
      source: WORLD_TYPHOON_POSITION_SOURCE_ID,
      minzoom: 3,
      filter: [
        "all",
        ["==", ["get", "typhoonShape"], "worldForecastPosition"],
        ["!=", ["get", "positionRole"], "member"]
      ],
      layout: {
        "text-field": ["get", "timeLabel"],
        "text-font": ["Noto Sans JP"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 9, 7, 12],
        "text-offset": [0, -2],
        "text-anchor": "bottom",
        "text-allow-overlap": false,
        "text-padding": 4
      },
      paint: {
        "text-color": "#f8fbff",
        "text-halo-color": "rgba(5, 9, 20, 0.94)",
        "text-halo-width": 1.8
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
        "text-font": ["Noto Sans JP"],
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
        "text-font": ["Noto Sans JP"],
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
      && activeEews.length === 0
      && getEarthquakeMapView(data) === "distribution"
      && data.distribution3DEnabled === true;
    hypocenter3D.setData(
      enabled ? data.distributionItems ?? [] : [],
      buildHypocenterDistributionPopup
    );
    hypocenter3D.setEnabled(enabled);
    updateHypocenter3DPresentation(enabled);
    syncPlateDepthContourVisibility();
  }

  function updateHypocenter3DPresentation(enabled) {
    if (!map || hypocenter3DEnabled === enabled) return;
    hypocenter3DEnabled = enabled;
    map.getContainer().classList.toggle("hypocenter-3d-active", enabled);
    syncPlateDepthContourVisibility();
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

  function setCommunityReportsVisible(visible) {
    communityReportsVisible = Boolean(visible);
    syncCommunityReportVisibility();
  }

  function setCommunityReportDeleteHandler(handler) {
    communityReportDeleteHandler = typeof handler === "function" ? handler : null;
  }

  function syncCommunityReportVisibility() {
    const visibility = activeMode === "radar" && communityReportsVisible ? "visible" : "none";
    COMMUNITY_REPORT_LAYERS.forEach((layerID) => {
      if (map?.getLayer(layerID)) map.setLayoutProperty(layerID, "visibility", visibility);
    });
    if (visibility === "none") hideMapInfo("community-report");
  }

  function addCommunityReportLayers() {
    const visibility = activeMode === "radar" && communityReportsVisible ? "visible" : "none";
    registerCommunityReportIcons(map);
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
        "text-font": ["Noto Sans JP"],
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
        "circle-color": ["case", ["all", [">", ["get", "hazardCount"], 0], ["==", ["get", "seasonalIcon"], ""]], "#e7792b", ["get", "color"]],
        "circle-radius": ["interpolate", ["linear"], ["zoom"],
          4, ["case", ["!=", ["get", "seasonalIcon"], ""], 7, 5],
          8, ["case", ["!=", ["get", "seasonalIcon"], ""], 9, 7.5],
          12, ["case", ["!=", ["get", "seasonalIcon"], ""], 11, 9.5]],
        "circle-stroke-color": "#f8fbff",
        "circle-stroke-width": 1.5,
        "circle-opacity": 0.95
      }
    });
    map.addLayer({
      id: "community-report-seasonal-icon",
      type: "symbol",
      source: COMMUNITY_REPORT_SOURCE_ID,
      filter: ["all", ["!", ["has", "point_count"]], ["!=", ["get", "seasonalIcon"], ""]],
      layout: {
        visibility,
        "icon-image": ["get", "seasonalIcon"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.5, 8, 0.65, 12, 0.8],
        "icon-allow-overlap": true
      }
    });
  }

  function setupCommunityReportInfo() {
    map.on("click", "community-report-cluster", async (event) => {
      if (activeMode !== "radar") return;
      const feature = event.features?.[0];
      const clusterID = feature?.properties?.cluster_id;
      const source = map.getSource(COMMUNITY_REPORT_SOURCE_ID);
      if (clusterID == null || !source?.getClusterLeaves) return;
      try {
        const count = Number(feature.properties.point_count) || 0;
        const reports = await source.getClusterLeaves(clusterID, count, 0);
        if (activeMode !== "radar" || !communityReportsVisible) return;
        showMapInfo(
          "community-report",
          event.lngLat,
          buildCommunityReportClusterPopup(reports)
        );
      } catch (error) {
        console.warn("[MeteoScope] community report cluster could not be opened", error);
      }
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
    EARTHQUAKE_INTERACTIVE_LAYERS.forEach((layerID) => {
      map.on("click", layerID, (event) => {
        if (activeMode !== "earthquake") return;
        const feature = layerID === "sample-circle"
          ? (event.features?.find((item) => item?.properties?.tideStationCode) ?? event.features?.[0])
          : event.features?.[0];
        if (layerID === "sample-fill" && feature?.properties?.markerType !== "ashfall") return;
        const historicalEventId = String(feature?.properties?.earthquakeHistoryId ?? "").trim();
        if (historicalEventId) {
          window.dispatchEvent(new CustomEvent("earthquake-history-select", {
            detail: { eventId: historicalEventId }
          }));
        }
        if (feature?.properties?.isHistoricalEarthquake === true) {
          hideMapInfo("earthquake-distribution");
          return;
        }
        const tideStationCode = String(feature?.properties?.tideStationCode ?? "").trim();
        if (layerID === "sample-circle" && tideStationCode) {
          window.dispatchEvent(new CustomEvent("tide-station-select", {
            detail: { stationCode: tideStationCode }
          }));
          hideMapInfo("earthquake-distribution");
          return;
        }
        const volcanoCode = String(feature?.properties?.volcanoCode ?? "").trim();
        if (layerID === "sample-volcano" && volcanoCode) {
          window.dispatchEvent(new CustomEvent("volcano-select", {
            detail: { volcanoCode }
          }));
          hideMapInfo("earthquake-distribution");
          return;
        }
        const popup = feature?.properties?.popup
          ?? (feature?.properties?.markerType === "hypocenter-distribution"
            ? buildHypocenterDistributionPopup({
                place: feature.properties.distributionPlace,
                originTime: feature.properties.distributionOriginTime,
                magnitude: feature.properties.distributionMagnitude,
                depthKm: feature.properties.distributionDepthKm,
                coordinateEventCount: feature.properties.coordinateEventCount
              })
            : "");
        if (!popup) {
          hideMapInfo("earthquake-distribution");
          return;
        }
        showMapInfo(
          "earthquake-distribution",
          event.lngLat,
          popup,
          (layerID === "sample-volcano" || feature?.properties?.markerType === "ashfall") ? "volcano" : ""
        );
      });
      map.on("mouseenter", layerID, (event) => {
        if (activeMode === "earthquake" && (
          layerID === "sample-volcano"
          || event.features?.some((feature) => feature?.properties?.tideStationCode)
          || event.features?.some((feature) =>
            feature?.properties?.popup && (layerID !== "sample-fill" || feature?.properties?.markerType === "ashfall")
          )
        )) {
          map.getCanvas().style.cursor = "pointer";
        }
      });
      map.on("mouseleave", layerID, () => {
        if (activeMode === "earthquake") map.getCanvas().style.cursor = "";
      });
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
      const features = map.queryRenderedFeatures(event.point, { layers: EARTHQUAKE_INTERACTIVE_LAYERS });
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
    mapInfoConnectorElement = document.createElement("div");
    mapInfoConnectorElement.className = "map-info-connector";
    mapInfoConnectorElement.hidden = true;
    map.getContainer().appendChild(mapInfoConnectorElement);

    mapInfoElement = document.createElement("div");
    mapInfoElement.className = "map-info-popup";
    mapInfoElement.hidden = true;
    mapInfoElement.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-community-report-delete]");
      if (!button || !communityReportDeleteHandler) return;
      event.stopPropagation();
      if (!window.confirm("この投稿を削除しますか？")) return;
      button.disabled = true;
      button.textContent = "削除中…";
      try {
        await communityReportDeleteHandler(button.dataset.communityReportDelete);
        hideMapInfo("community-report");
      } catch (error) {
        button.textContent = error.message || "削除できませんでした。再試行";
        button.disabled = false;
      }
    });
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
      showMapInfo(
        "typhoon",
        event.lngLat,
        feature.properties.forecastPopup,
        "",
        parseTyphoonForecastCenter(feature.properties?.forecastCenter)
      );
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
      const interactiveLayers = activeFaultDataSource === "gsj"
        ? GSJ_ACTIVE_FAULT_INTERACTIVE_LAYERS
        : JSHIS_MAJOR_FAULT_INTERACTIVE_LAYERS;
      const layers = interactiveLayers.filter((layerId) => map.getLayer(layerId));
      const feature = layers.length > 0
        ? map.queryRenderedFeatures(event.point, { layers })[0]
        : null;
      if (!feature) {
        hideMapInfo("active-fault");
        return;
      }
      const popup = activeFaultDataSource === "gsj"
        ? buildGsjActiveFaultPopup(feature.properties)
        : buildJshisMajorFaultPopup(feature.properties);
      showMapInfo("active-fault", event.lngLat, popup);
    });

    map.on("zoomend", () => hideMapInfo("active-fault"));
  }

  function showMapInfo(owner, lngLat, html, variant = "", anchorLngLat = null) {
    if (!mapInfoElement) return;
    mapInfoOwner = owner;
    mapInfoLngLat = lngLat;
    mapInfoAnchorLngLat = anchorLngLat;
    mapInfoElement.dataset.variant = variant;
    mapInfoElement.innerHTML = html;
    mapInfoElement.hidden = false;
    positionMapInfo();
  }

  function hideMapInfo(owner = null) {
    if (owner && mapInfoOwner !== owner) return;
    mapInfoOwner = null;
    mapInfoLngLat = null;
    mapInfoAnchorLngLat = null;
    if (mapInfoConnectorElement) mapInfoConnectorElement.hidden = true;
    if (mapInfoElement) {
      mapInfoElement.hidden = true;
      delete mapInfoElement.dataset.variant;
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
    positionMapInfoConnector({ x, y, width, height });
  }

  function positionMapInfoConnector(cardRect) {
    if (!mapInfoConnectorElement) return;
    const connectorPoint = mapInfoOwner === "typhoon" && mapInfoAnchorLngLat
      ? map.project(mapInfoAnchorLngLat)
      : null;
    if (!connectorPoint) {
      mapInfoConnectorElement.hidden = true;
      return;
    }

    const end = getClosestPointOnRect(connectorPoint, cardRect);
    const dx = end.x - connectorPoint.x;
    const dy = end.y - connectorPoint.y;
    const length = Math.hypot(dx, dy);
    if (length < 2) {
      mapInfoConnectorElement.hidden = true;
      return;
    }

    mapInfoConnectorElement.hidden = false;
    mapInfoConnectorElement.style.width = `${Math.round(length)}px`;
    mapInfoConnectorElement.style.transform = `translate3d(${Math.round(connectorPoint.x)}px, ${Math.round(connectorPoint.y)}px, 0) rotate(${Math.atan2(dy, dx)}rad)`;
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

    const nextTyphoonForecastMode = data?.worldForecastMode === true;
    if (
      mode === "typhoon"
      && lastTyphoonForecastMode !== null
      && lastTyphoonForecastMode !== nextTyphoonForecastMode
    ) {
      hideMapInfo("typhoon");
    }
    lastTyphoonForecastMode = nextTyphoonForecastMode;

    const collection = mode === "typhoon"
      ? {
        type: "FeatureCollection",
        features: createTyphoonFeatures(data)
      }
      : EMPTY_GEOJSON;

    setGeoJsonSourceData(source, collection);
    TYPHOON_LAYERS.forEach((layerId) => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", mode === "typhoon" ? "visible" : "none");
    });
    updateWorldTyphoonForecastPositions(mode === "typhoon" ? data : {});
    return collection;
  }

  function updateWorldTyphoonForecastPositions(data = {}) {
    const source = map?.getSource(WORLD_TYPHOON_POSITION_SOURCE_ID);
    if (!source?.setData) return null;
    const visible = activeMode === "typhoon" && data?.worldForecastMode === true;
    const collection = visible
      ? {
        type: "FeatureCollection",
        features: createWorldTyphoonPositionFeatures(data)
      }
      : createEmptyFeatureCollection();
    source.setData(collection);
    WORLD_TYPHOON_POSITION_LAYERS.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
      }
    });
    return collection;
  }

  function resize() {
    map?.resize();
    // Resume may leave the canvas compositor stale even at the same size.
    map?.triggerRepaint();
  }

  function getVisibleBounds() {
    if (!map) return null;
    const bounds = map.getBounds();
    const west = Math.max(120, bounds.getWest());
    const south = Math.max(20, bounds.getSouth());
    const east = Math.min(155, bounds.getEast());
    const north = Math.min(50, bounds.getNorth());
    if (![west, south, east, north].every(Number.isFinite) || west >= east || south >= north) return null;
    return [west, south, east, north].map((value) => Number(value.toFixed(4)));
  }

  function setHypocenterAreaSelection(polygon = []) {
    hypocenterAreaPolygon = normalizeAreaPolygon(polygon);
    const source = map?.getSource(HYPOCENTER_AREA_SOURCE_ID);
    if (!source?.setData) return;
    source.setData(hypocenterAreaPolygon.length >= 3
      ? {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[...hypocenterAreaPolygon, hypocenterAreaPolygon[0]]]
          }
        }]
      }
      : createEmptyFeatureCollection());
  }

  function clearHypocenterAreaSelection() {
    cancelHypocenterAreaDrawing();
    setHypocenterAreaSelection([]);
  }

  function startHypocenterAreaSelection(onComplete) {
    if (!map) return false;
    cancelHypocenterAreaDrawing();
    const container = map.getContainer();
    const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    overlay.classList.add("hypocenter-area-draw-overlay");
    overlay.setAttribute("aria-label", "地震の検索範囲を囲む");
    const shape = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    overlay.append(shape);
    container.append(overlay);
    hypocenterAreaOverlay = overlay;
    const points = [];
    let drawing = false;
    let activePointerId = null;
    const screenPoint = (event) => {
      const rect = overlay.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const updateShape = () => {
      shape.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));
    };
    const finish = (event) => {
      if (hypocenterAreaOverlay !== overlay || !drawing || event.pointerId !== activePointerId) return;
      drawing = false;
      overlay.releasePointerCapture?.(event.pointerId);
      map.dragPan.enable();
      const polygon = simplifyScreenPolygon(points)
        .map((point) => map.unproject([point.x, point.y]))
        .map((coordinate) => [
          Number(coordinate.lng.toFixed(5)),
          Number(coordinate.lat.toFixed(5))
        ]);
      overlay.remove();
      hypocenterAreaOverlay = null;
      if (polygon.length < 3) {
        onComplete?.([]);
        return;
      }
      setHypocenterAreaSelection(polygon);
      onComplete?.(polygon);
    };
    overlay.addEventListener("pointerdown", (event) => {
      if (hypocenterAreaOverlay !== overlay || drawing || event.button !== 0) return;
      event.preventDefault();
      activePointerId = event.pointerId;
      drawing = true;
      points.length = 0;
      points.push(screenPoint(event));
      overlay.setPointerCapture?.(event.pointerId);
      map.dragPan.disable();
      updateShape();
    });
    overlay.addEventListener("pointermove", (event) => {
      if (hypocenterAreaOverlay !== overlay || !drawing || event.pointerId !== activePointerId) return;
      const next = screenPoint(event);
      const previous = points.at(-1);
      if (previous && Math.hypot(next.x - previous.x, next.y - previous.y) < 5) return;
      points.push(next);
      updateShape();
    });
    overlay.addEventListener("pointerup", finish);
    overlay.addEventListener("pointercancel", (event) => {
      if (hypocenterAreaOverlay !== overlay || !drawing || event.pointerId !== activePointerId) return;
      drawing = false;
      cancelHypocenterAreaDrawing();
      onComplete?.([]);
    });
    return true;
  }

  function cancelHypocenterAreaDrawing() {
    if (!hypocenterAreaOverlay) return;
    hypocenterAreaOverlay.remove();
    hypocenterAreaOverlay = null;
    map?.dragPan.enable();
  }

  function setEmergencyEarthquakeWarnings(events = []) {
    activeEews = (Array.isArray(events) ? events : [events]).filter((eew) => (
      eew && !eew.isCancel
    ));
    const source = map?.getSource(EEW_SOURCE_ID);
    if (source?.setData) source.setData(createEewFeatureCollection(activeEews));
    syncEewForecastAreas();
    syncEewVisibility();
  }

  function syncEewForecastAreas({ force = false } = {}) {
    const nextSignature = createEewForecastAreaSignature(activeEews);
    if (!force && nextSignature === eewAreaSignature) return;
    eewAreaSignature = nextSignature;
    const generation = ++eewAreaLoadGeneration;
    const source = map?.getSource(EEW_AREA_SOURCE_ID);
    if (!nextSignature) {
      source?.setData?.(createEmptyFeatureCollection());
      return;
    }

    loadEewAreaGeometry().then((areaGeoJson) => {
      if (generation !== eewAreaLoadGeneration || nextSignature !== eewAreaSignature) return;
      const featureCollection = buildEewForecastAreaFeatureCollection(areaGeoJson, activeEews);
      featureCollection.features = featureCollection.features.map((feature) => ({
        ...feature,
        properties: {
          ...(feature.properties ?? {}),
          popup: `<strong>${escapePopup(feature.properties?.areaName ?? "EEW予報区")}</strong><br>予想震度 ${escapePopup(feature.properties?.intensityRange ?? feature.properties?.intensity ?? "不明")}<br><small>緊急地震速報（予報・警報）の予測値</small>`
        }
      }));
      map?.getSource(EEW_AREA_SOURCE_ID)?.setData?.(featureCollection);
    }).catch((error) => {
      if (generation !== eewAreaLoadGeneration) return;
      console.warn("[MeteoScope] EEW forecast-area geometry load failed", error);
    });
  }

  function loadEewAreaGeometry() {
    if (!eewAreaGeometryPromise) {
      eewAreaGeometryPromise = fetch(JMA_ENDPOINTS.earthquakeAreas, { cache: "force-cache" })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .catch((error) => {
          eewAreaGeometryPromise = null;
          throw error;
        });
    }
    return eewAreaGeometryPromise;
  }

  function syncSampleVisibility() {
    const visible = activeMode === sampleDataMode
      && !(activeMode === "earthquake" && activeEews.length > 0);
    SAMPLE_LAYERS.forEach((layerId) => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility",
        visible && (!EARTHQUAKE_SHAPE_LAYERS.has(layerId) || activeMode === "earthquake") ? "visible" : "none");
    });
  }

  function syncEewVisibility() {
    if (!map?.getSource(EEW_SOURCE_ID)) return;
    const visible = activeMode === "earthquake" && activeEews.length > 0;
    EEW_LAYER_IDS.forEach((layerId) => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
    });
    syncEewHypocenterBlink(visible);
    syncSampleVisibility();
    const areaVisible = !visible
      && activeMode === "earthquake"
      && lastRenderedMode === "earthquake"
      && ["distribution", "history"].includes(lastRenderedData?.earthquakeMapView);
    for (const layerId of [HYPOCENTER_AREA_FILL_LAYER_ID, HYPOCENTER_AREA_LINE_LAYER_ID]) {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", areaVisible ? "visible" : "none");
    }
    updateHypocenter3D(activeMode, lastRenderedData ?? {});
  }

  function syncEewHypocenterBlink(visible) {
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    if (!visible || prefersReducedMotion) {
      if (eewHypocenterBlinkTimer) window.clearInterval(eewHypocenterBlinkTimer);
      eewHypocenterBlinkTimer = 0;
      eewHypocenterBlinkVisible = true;
      setEewHypocenterOpacity(1);
      return;
    }
    if (eewHypocenterBlinkTimer) return;

    eewHypocenterBlinkVisible = true;
    setEewHypocenterOpacity(1);
    eewHypocenterBlinkTimer = window.setInterval(() => {
      if (!map?.isStyleLoaded?.() || document.hidden) return;
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true) {
        syncEewHypocenterBlink(false);
        return;
      }
      eewHypocenterBlinkVisible = !eewHypocenterBlinkVisible;
      setEewHypocenterOpacity(eewHypocenterBlinkVisible ? 1 : EEW_HYPOCENTER_DIMMED_OPACITY);
    }, EEW_HYPOCENTER_BLINK_INTERVAL_MS);
  }

  function setEewHypocenterOpacity(opacity) {
    if (!map?.isStyleLoaded?.() || !map.getLayer("eew-hypocenter-cross")) return;
    map.setPaintProperty("eew-hypocenter-cross", "text-opacity", opacity);
  }

  function setTheme(theme) {
    activeTheme = theme === "light" ? "light" : "dark";
    applyMapTheme(map, activeTheme);
  }

  return { initialize, whenReady, setMode, prepareWarningData, setTheme, setTerrainLayer, setActiveFaultVisible, setActiveFaultDataSource, setGsjActiveFaultData, setPlateBoundaryVisible, setPlateDepthContoursVisible, setPlateDepthSource, setCommunityReports, setCommunityReportsVisible, setCommunityReportDeleteHandler, getVisibleBounds, renderData, updateWorldTyphoonForecastPositions, setEmergencyEarthquakeWarnings, whenCameraIdle, resize, showCurrentLocation, setCurrentLocationVisible, flyToLocation, fitToCoordinates, startHypocenterAreaSelection, cancelHypocenterAreaDrawing, setHypocenterAreaSelection, clearHypocenterAreaSelection };
}

function normalizeTerrainOpacity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_TERRAIN_OPACITY;
  return Math.max(0.24, Math.min(0.72, numeric));
}

function normalizeAreaPolygon(polygon) {
  if (!Array.isArray(polygon)) return [];
  return polygon
    .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
    .map((coordinate) => [Number(coordinate[0]), Number(coordinate[1])])
    .filter((coordinate) => coordinate.every(Number.isFinite));
}

function simplifyScreenPolygon(points) {
  if (!Array.isArray(points) || points.length < 3) return [];
  const step = Math.max(1, Math.floor(points.length / 80));
  const simplified = points.filter((point, index) => (
    index === 0 || index === points.length - 1 || index % step === 0
  ));
  return simplified.length >= 3 ? simplified : points;
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
        isOwn: report.isOwn === true,
        displayName: String(report.displayName || ""),
        weatherLabel: meta.label,
        categoryLabel: meta.category || "天気の投稿",
        seasonalIcon: meta.icon || "",
        comment: String(report.comment || ""),
        color: meta.color,
        sensationLabel: communitySensationLabel(report.sensation),
        temperatureText: formatCommunityReportTemperature(report.temperature),
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
    <span>${escapeHTML(properties.categoryLabel || "利用者の投稿")}</span>
    <strong>${escapeHTML(properties.weatherLabel || "天気")}</strong>
    <p>${escapeHTML(properties.areaName || "現在地周辺")}・${escapeHTML(properties.createdText || "")}</p>
    ${comment}${facts ? `<p>${facts}</p>` : ""}${hazard}
    <small>${escapeHTML(properties.displayName || "MeteoScope利用者")} / 約2km単位の位置</small>
    ${properties.isOwn === true && properties.id ? `<button type="button" class="community-popup-delete" data-community-report-delete="${escapeHTML(properties.id)}">投稿を削除</button>` : ""}
  </section>`;
}

function buildCommunityReportClusterPopup(features = []) {
  const reports = features.map((feature) => feature?.properties).filter(Boolean);
  return `<div class="community-report-cluster-popup">
    <p class="community-report-cluster-heading">この付近の投稿 ${reports.length}件</p>
    <div class="community-report-cluster-list">${reports.map(buildCommunityReportPopup).join("")}</div>
  </div>`;
}

function communityWeatherMeta(value) {
  return ({
    sunny: { label: "晴れ", color: "#e8a52d" },
    cloudy: { label: "くもり", color: "#78899c" },
    "light-rain": { label: "弱い雨", color: "#378bc4" },
    "heavy-rain": { label: "強い雨", color: "#165ea8" },
    snow: { label: "雪", color: "#8fbfd8" },
    thunder: { label: "雷", color: "#8064b8" },
    fog: { label: "霧", color: "#6f9298" },
    "cherry-buds": { label: "桜・つぼみ", category: "季節の便り・桜", icon: "community-cherry-petal", color: "#a66c88" },
    "cherry-start": { label: "桜・咲き始め", category: "季節の便り・桜", icon: "community-cherry-petal", color: "#bd6e91" },
    "cherry-peak": { label: "桜・見頃", category: "季節の便り・桜", icon: "community-cherry-petal", color: "#cf668f" },
    "cherry-falling": { label: "桜・散り始め", category: "季節の便り・桜", icon: "community-cherry-petal", color: "#a5778e" },
    "autumn-start": { label: "紅葉・色づき始め", category: "季節の便り・紅葉", icon: "community-maple-leaf", color: "#b96832" },
    "autumn-peak": { label: "紅葉・見頃", category: "季節の便り・紅葉", icon: "community-maple-leaf", color: "#b83e30" },
    "autumn-falling": { label: "紅葉・落葉が進む", category: "季節の便り・紅葉", icon: "community-maple-leaf", color: "#865938" },
    "snow-cover-start": { label: "積雪・積もり始め", category: "季節の便り・積雪", icon: "community-snow-crystal", color: "#4b9eba" },
    "snow-cover-present": { label: "積雪・雪が積もっている", category: "季節の便り・積雪", icon: "community-snow-crystal", color: "#317ca4" },
    "snow-cover-melting": { label: "積雪・雪解け", category: "季節の便り・積雪", icon: "community-snow-crystal", color: "#5a8f97" }
  })[value] || { label: "天気", color: "#457a99" };
}

function registerCommunityReportIcons(map) {
  const size = 48;
  for (const [imageId, shape] of [
    ["community-cherry-petal", "petal"],
    ["community-maple-leaf", "maple"],
    ["community-snow-crystal", "snowflake"]
  ]) {
    if (map.hasImage(imageId)) continue;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) continue;
    context.scale(2, 2);
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#ffffff";
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    if (shape === "petal") {
      context.moveTo(12, 21);
      context.bezierCurveTo(8, 18, 4.5, 14, 4.5, 9);
      context.bezierCurveTo(4.5, 5.5, 7, 4, 9.5, 4);
      context.lineTo(12, 6);
      context.lineTo(14.5, 4);
      context.bezierCurveTo(17, 4, 19.5, 5.5, 19.5, 9);
      context.bezierCurveTo(19.5, 14, 16, 18, 12, 21);
      context.closePath();
      context.fill();
    } else if (shape === "maple") {
      [[12, 2], [14, 7], [18, 4], [17.7, 8], [21.5, 9], [18.5, 12],
        [20, 15], [14, 14.5], [13, 21], [11, 21], [10, 14.5], [4, 15],
        [5.5, 12], [2.5, 9], [6.3, 8], [6, 4], [10, 7]].forEach(([x, y], index) => {
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.fill();
    } else {
      context.lineWidth = 2;
      for (let arm = 0; arm < 3; arm += 1) {
        context.save();
        context.translate(12, 12);
        context.rotate(arm * Math.PI / 3);
        context.beginPath();
        context.moveTo(0, -9);
        context.lineTo(0, 9);
        context.moveTo(0, -5);
        context.lineTo(-3, -7);
        context.moveTo(0, -5);
        context.lineTo(3, -7);
        context.moveTo(0, 5);
        context.lineTo(-3, 7);
        context.moveTo(0, 5);
        context.lineTo(3, 7);
        context.stroke();
        context.restore();
      }
    }
    map.addImage(imageId, context.getImageData(0, 0, size, size), { pixelRatio: 2 });
  }
}

function communitySensationLabel(value) {
  return ({ cold: "寒い", cool: "涼しい", comfortable: "快適", hot: "暑い", "very-hot": "非常に暑い" })[value] || "";
}

function communityHazardLabel(value) {
  return ({ "flooded-road": "道路冠水", "strong-wind": "強風", "poor-visibility": "視界不良", thunder: "雷", slippery: "路面凍結・滑りやすい" })[value] || "";
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
  const style = {
    version: 8,
    sources: {
      "world-land": {
        type: "geojson",
        data: EMPTY_GEOJSON
      },
      [MUNICIPALITY_SOURCE_ID]: createMunicipalitySource(),
      [MUNICIPALITY_FIX_SOURCE_ID]: {
        type: "geojson",
        data: JMA_ENDPOINTS.warningMunicipalityFixes,
        promoteId: "code"
      },
      ...(!VECTOR_BASE_MAP_ENABLED ? { [PREFECTURE_SOURCE_ID]: {
        type: "geojson", data: JMA_ENDPOINTS.prefecturesMap
      } } : {}),
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
        source: "world-land",
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
        ...baseMapSourceLayer("municipalities"),
        ...(!VECTOR_BASE_MAP_ENABLED ? { filter: ["!", ["in", ["get", "code"], ["literal", WARNING_GEOMETRY_FIX_CODES]]] } : {}),
        layout: { visibility: "none" },
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
        layout: { visibility: "none" },
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
        ...baseMapSourceLayer("municipalities"),
        ...(!VECTOR_BASE_MAP_ENABLED ? { filter: ["!", ["in", ["get", "code"], ["literal", WARNING_GEOMETRY_FIX_CODES]]] } : {}),
        layout: { visibility: "none" },
        paint: {
          "fill-color": getWarningOverlayColorExpression(WARNING_FEATURE_STATE_KEYS.status),
          "fill-antialias": true,
          "fill-opacity": getWarningOverlayOpacityExpression("status")
        }
      },
      {
        id: WARNING_FIX_OVERLAY_LAYER_ID,
        type: "fill",
        source: MUNICIPALITY_FIX_SOURCE_ID,
        layout: { visibility: "none" },
        paint: {
          "fill-color": getWarningOverlayColorExpression(WARNING_FEATURE_STATE_KEYS.status),
          "fill-antialias": true,
          "fill-opacity": getWarningOverlayOpacityExpression("status")
        }
      },
      {
        id: WARNING_EARLY_OVERLAY_LAYER_ID,
        type: "fill",
        source: MUNICIPALITY_SOURCE_ID,
        ...baseMapSourceLayer("municipalities"),
        ...(!VECTOR_BASE_MAP_ENABLED ? { filter: ["!", ["in", ["get", "code"], ["literal", WARNING_GEOMETRY_FIX_CODES]]] } : {}),
        layout: { visibility: "none" },
        paint: {
          "fill-color": getWarningOverlayColorExpression(WARNING_FEATURE_STATE_KEYS.early),
          "fill-antialias": true,
          "fill-opacity": getWarningOverlayOpacityExpression("early")
        }
      },
      {
        id: WARNING_EARLY_FIX_OVERLAY_LAYER_ID,
        type: "fill",
        source: MUNICIPALITY_FIX_SOURCE_ID,
        layout: { visibility: "none" },
        paint: {
          "fill-color": getWarningOverlayColorExpression(WARNING_FEATURE_STATE_KEYS.early),
          "fill-antialias": true,
          "fill-opacity": getWarningOverlayOpacityExpression("early")
        }
      },
      {
        id: WARNING_CLICK_LAYER_ID,
        type: "fill",
        source: MUNICIPALITY_SOURCE_ID,
        ...baseMapSourceLayer("municipalities"),
        ...(!VECTOR_BASE_MAP_ENABLED ? { filter: ["!", ["in", ["get", "code"], ["literal", WARNING_GEOMETRY_FIX_CODES]]] } : {}),
        layout: { visibility: "none" },
        paint: {
          "fill-color": "rgba(0, 0, 0, 0)",
          "fill-opacity": 0.001
        }
      },
      {
        id: WARNING_FIX_CLICK_LAYER_ID,
        type: "fill",
        source: MUNICIPALITY_FIX_SOURCE_ID,
        layout: { visibility: "none" },
        paint: {
          "fill-color": "rgba(0, 0, 0, 0)",
          "fill-opacity": 0.001
        }
      },
      {
        id: MUNICIPALITY_LINE_LAYER_ID,
        type: "line",
        source: MUNICIPALITY_SOURCE_ID,
        ...baseMapSourceLayer("municipalities"),
        ...(!VECTOR_BASE_MAP_ENABLED ? { filter: ["!", ["in", ["get", "code"], ["literal", WARNING_GEOMETRY_FIX_CODES]]] } : {}),
        layout: { visibility: "none" },
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
        layout: { visibility: "none" },
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
        source: VECTOR_BASE_MAP_ENABLED ? MUNICIPALITY_SOURCE_ID : PREFECTURE_SOURCE_ID,
        ...baseMapSourceLayer("prefectures"),
        layout: {
          visibility: "none",
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": colors.municipalityLine,
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
  if (VECTOR_BASE_MAP_ENABLED) {
    delete style.sources[MUNICIPALITY_FIX_SOURCE_ID];
    style.layers = style.layers.filter(layer => layer.source !== MUNICIPALITY_FIX_SOURCE_ID);
  }
  // Keep layers active while the app-level loading screen hides the map. Visible
  // style layers start tile acquisition immediately; hiding the DOM does not.
  for (const layer of style.layers) {
    if (INITIAL_GEOMETRY_LAYER_IDS.includes(layer.id) || WARNING_CLICK_LAYER_IDS.includes(layer.id)) {
      layer.layout = { ...layer.layout, visibility: "visible" };
    }
  }
  return style;
}

function buildGsjActiveFaultPopup(properties = {}) {
  const faultName = formatMapInfoTitle(
    properties.segment_name
    || properties.name
    || "活断層"
  );
  const description = escapeMapInfoHtml(properties.description || "産総研 活断層データベース収録区間");
  return `
    <article class="map-info-card active-fault-popup-card">
      <h3>${faultName}</h3>
      <div class="map-info-popup-body">
        <p>${description}</p>
        <p class="map-info-popup-note">産総研 地質調査総合センター 活断層データベース</p>
      </div>
    </article>`;
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
    ["japan-prefecture-line", "line-color", colors.municipalityLine],
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
    ["sample-volcano", "icon-color", buildVolcanoIconColorExpression(theme)],
    ["sample-volcano", "icon-halo-color", colors.volcanoBaseHalo],
    ["sample-volcano", "icon-halo-width", colors.volcanoBaseHaloWidth],
    [JSHIS_MAJOR_FAULT_FILL_LAYER_ID, "fill-color", colors.activeFaultFill],
    [JSHIS_MAJOR_FAULT_LINE_LAYER_ID, "line-color", colors.activeFault],
    [GSJ_ACTIVE_FAULT_LINE_LAYER_ID, "line-color", colors.activeFault],
    [PLATE_BOUNDARY_LAYER_IDS.convergent, "line-color", colors.plateConvergent],
    [PLATE_BOUNDARY_LAYER_IDS.transform, "line-color", colors.plateTransform],
    [PLATE_BOUNDARY_LAYER_IDS.other, "line-color", colors.plateOther],
    [PLATE_DEPTH_LABEL_LAYER_ID, "text-halo-color", colors.plateDepthLabelHalo]
  ];
  paintUpdates.forEach(([layerId, property, value]) => {
    if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, value);
  });
  if (map.getLayer("sample-volcano")) {
    map.setLayoutProperty("sample-volcano", "icon-size", buildVolcanoIconSizeExpression(theme));
  }
  map.getContainer().dataset.theme = theme;
  map.triggerRepaint();
}

function buildVolcanoIconSizeExpression(theme) {
  const levelOneScale = theme === "light" ? 1.15 : 1;
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    4,
    ["case", buildVolcanoLevelOneCondition(), 0.34 * levelOneScale, 0.34],
    8,
    ["case", buildVolcanoLevelOneCondition(), 0.46 * levelOneScale, 0.46],
    11,
    ["case", buildVolcanoLevelOneCondition(), 0.56 * levelOneScale, 0.56]
  ];
}

function buildVolcanoIconColorExpression(theme) {
  const colors = MAP_THEME_COLORS[theme] ?? MAP_THEME_COLORS.dark;
  return [
    "case",
    buildVolcanoLevelOneCondition(),
    colors.volcanoLevel1,
    ["coalesce", ["get", "color"], VOLCANO_UNKNOWN_LEVEL_COLOR]
  ];
}

function buildVolcanoLevelOneCondition() {
  return ["==", ["to-number", ["get", "level"], 0], 1];
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

function setupVolcanoMarkerImage(map) {
  if (map.hasImage(VOLCANO_MARKER_IMAGE_ID)) return;

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
  context.lineTo(60, 57);
  context.lineTo(4, 57);
  context.closePath();
  context.fill();

  map.addImage(VOLCANO_MARKER_IMAGE_ID, context.getImageData(0, 0, size, size), { sdf: true });
}

function setupEarthquakeAreaIntensityMarkerImage(map) {
  if (map.hasImage(EARTHQUAKE_AREA_INTENSITY_MARKER_IMAGE_ID)) return;

  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.fillStyle = "#ffffff";
  const inset = 3;
  const radius = 3;
  const edge = size - inset;
  context.beginPath();
  context.moveTo(inset + radius, inset);
  context.lineTo(edge - radius, inset);
  context.quadraticCurveTo(edge, inset, edge, inset + radius);
  context.lineTo(edge, edge - radius);
  context.quadraticCurveTo(edge, edge, edge - radius, edge);
  context.lineTo(inset + radius, edge);
  context.quadraticCurveTo(inset, edge, inset, edge - radius);
  context.lineTo(inset, inset + radius);
  context.quadraticCurveTo(inset, inset, inset + radius, inset);
  context.closePath();
  context.fill();
  map.addImage(
    EARTHQUAKE_AREA_INTENSITY_MARKER_IMAGE_ID,
    context.getImageData(0, 0, size, size),
    { sdf: true }
  );
}

function setupEarthquakeStationIntensityMarkerImage(map) {
  const levels = [...EARTHQUAKE_INTENSITY_LEVELS, { value: "unknown", color: "#4b5563" }];
  for (const level of levels) {
    const imageId = `${EARTHQUAKE_STATION_INTENSITY_MARKER_IMAGE_ID}${level.value}`;
    if (map.hasImage(imageId)) continue;
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.beginPath();
    context.arc(size / 2, size / 2, 26, 0, Math.PI * 2);
    context.fillStyle = level.color;
    context.fill();
    context.strokeStyle = "#f8fbff";
    context.lineWidth = 3;
    context.stroke();
    if (level.value !== "unknown") {
      context.fillStyle = getEarthquakeIntensityMarkerTextColor(level.value);
      context.font = `600 ${level.value.length > 1 ? 30 : 38}px sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(formatEarthquakeIntensityMarkerText(level.value), size / 2, size / 2, 48);
    }
    map.addImage(imageId, context.getImageData(0, 0, size, size));
  }
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
        "text-font": ["Noto Sans JP"],
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
        "text-font": ["Noto Sans JP"],
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
        "text-font": ["Noto Sans JP"],
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

function updateRiverFloodLayer(map, mode, data = {}) {
  const source = map?.getSource(RIVER_FLOOD_SOURCE_ID);
  if (!source?.setData) return;
  const visible = mode === "warnings" && data?.activeWarningView === "river";
  setGeoJsonSourceData(source, visible && data?.riverFlood?.riverFeatures
    ? data.riverFlood.riverFeatures
    : EMPTY_GEOJSON);
  RIVER_FLOOD_LAYERS.forEach((layerId) => {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  });
}
function updateWarningMunicipalityPaint(map, mode, data = {}) {
  if (!map || !WARNING_OVERLAY_LAYER_IDS.some((layerId) => map.getLayer(layerId))) return;

  if (mode !== "warnings" || ["kikikuru", "river"].includes(data?.activeWarningView)) {
    invalidateWarningFeatureStateUpdate(map);
    setWarningOverlayVisibility(map, null);
    getWarningFeatureStateCache(map).visibleChannel = null;
    setWarningHatchVisibility(map, false);
    return;
  }

  const activeAreas = getActiveWarningOverlayAreas(mode, data);
  const warningView = data?.activeWarningView === "early" ? "early" : "status";
  const cache = getWarningFeatureStateCache(map);
  const displayGeneration = ++cache.displayGeneration;

  if (activeAreas.length === 0) {
    void updateWarningFeatureStates(map, activeAreas, warningView).then((applied) => {
      if (!applied || getWarningFeatureStateCache(map).displayGeneration !== displayGeneration) return;
      setWarningOverlayVisibility(map, null);
      cache.visibleChannel = null;
      setWarningHatchVisibility(map, false);
    });
    return;
  }

  if (!cache.visibleChannel) {
    setWarningOverlayVisibility(map, warningView);
    cache.visibleChannel = warningView;
  }

  void updateWarningFeatureStates(map, activeAreas, warningView).then((applied) => {
    if (!applied || getWarningFeatureStateCache(map).displayGeneration !== displayGeneration) return;
    setWarningOverlayVisibility(map, warningView);
    cache.visibleChannel = warningView;
    setWarningHatchVisibility(
      map,
      warningView === "status" && activeAreas.some((area) => area.level === "emergency")
    );
    map.triggerRepaint();
  });
}

function getWarningOverlayColorExpression(stateKey) {
  return [
    "match",
    ["feature-state", stateKey],
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
  ];
}

function getWarningOverlayOpacityExpression(warningView = "status") {
  const isEarly = warningView === "early";
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    4,
    isEarly ? 0.82 : 0.92,
    8,
    isEarly ? 0.88 : 0.96
  ];
}

function getWarningEmergencyHatchOpacityExpression() {
  return [
    "case",
    ["==", ["feature-state", WARNING_FEATURE_STATE_KEYS.status], "emergency"],
    0.7,
    0
  ];
}

function setWarningOverlayVisibility(map, warningView = null) {
  const visibleLayerIds = warningView === "early"
    ? WARNING_EARLY_OVERLAY_LAYER_IDS
    : warningView === "status"
      ? WARNING_STATUS_OVERLAY_LAYER_IDS
      : [];
  WARNING_OVERLAY_LAYER_IDS.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibleLayerIds.includes(layerId) ? "visible" : "none");
    }
  });
}

function getActiveWarningOverlayAreas(mode, data = {}) {
  if (mode !== "warnings" || ["kikikuru", "river"].includes(data?.activeWarningView)) return [];
  if (data?.activeWarningView === "early") {
    return Array.isArray(data?.earlyMunicipalityAreas)
      ? data.earlyMunicipalityAreas.filter((area) => area.level === "high" || area.level === "middle")
      : [];
  }
  const activeAreas = Array.isArray(data?.activeAreas) ? data.activeAreas : [];
  const riverReports = data?.riverFlood?.status === "ok" && Array.isArray(data.riverFlood.reports)
    ? data.riverFlood.reports
    : [];
  if (riverReports.length === 0) return activeAreas;

  const groupsByPrefecture = new Map();
  activeAreas.forEach((area) => {
    const prefecture = String(area?.prefecture ?? "");
    if (!groupsByPrefecture.has(prefecture)) groupsByPrefecture.set(prefecture, []);
    groupsByPrefecture.get(prefecture).push(area);
  });
  const groups = [...groupsByPrefecture.entries()].map(([prefecture, areas]) => ({ prefecture, areas }));
  return mergeRiverFloodWarningsIntoGroups(groups, riverReports).flatMap((group) => group.areas);
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
  const next = {
    displayGeneration: 0,
    visibleChannel: null,
    generations: { status: 0, early: 0 },
    levels: { status: new Map(), early: new Map() }
  };
  warningFeatureStateCache.set(map, next);
  return next;
}

function invalidateWarningFeatureStateUpdate(map) {
  if (!map) return;
  const cache = getWarningFeatureStateCache(map);
  cache.displayGeneration += 1;
  cache.generations.status += 1;
  cache.generations.early += 1;
}

async function updateWarningFeatureStates(map, activeAreas, warningView = "status") {
  if (!map?.getSource(MUNICIPALITY_SOURCE_ID)) return false;
  const cache = getWarningFeatureStateCache(map);
  const channel = warningView === "early" ? "early" : "status";
  const stateKey = getWarningFeatureStateKey(channel);
  const generation = ++cache.generations[channel];
  const currentLevels = cache.levels[channel];

  try {
    const { operations } = planWarningFeatureStateChanges(currentLevels, activeAreas);
    const result = await runWarningFeatureStateOperations(operations, {
      budgetMs: 7,
      maxPerFrame: getWarningFeatureStateBatchLimit(),
      yieldFrame: waitForMapUpdateTurn,
      isCurrent: () => cache.generations[channel] === generation,
      apply: (operation) => {
        const feature = municipalityStateTarget(operation.areaCode, warningGeometryFixCodeSet.has(operation.areaCode));
        if (operation.type === "remove") {
          map.removeFeatureState(feature, stateKey);
          currentLevels.delete(operation.areaCode);
          return;
        }
        map.setFeatureState(feature, { [stateKey]: operation.level });
        currentLevels.set(operation.areaCode, operation.level);
      }
    });
    if (!result.applied || cache.generations[channel] !== generation) return false;
    map.triggerRepaint();
    return true;
  } catch (error) {
    console.warn("[MeteoScope] warning municipality state update failed", error);
    return false;
  }
}

function getWarningFeatureStateBatchLimit() {
  const deviceMemory = Number(globalThis.navigator?.deviceMemory);
  if (Number.isFinite(deviceMemory) && deviceMemory <= 2) return 32;
  if (Number.isFinite(deviceMemory) && deviceMemory >= 8) return 64;
  return 48;
}

function getWarningFeatureStateKey(warningView = "status") {
  return WARNING_FEATURE_STATE_KEYS[warningView === "early" ? "early" : "status"];
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

function setWarningHatchVisibility(map, visible) {
  if (!map) return;
  WARNING_HATCH_LAYER_IDS.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
    }
  });
}

function updateRadarLayer(map, mode, data = {}) {
  const radarTabVisible = mode === "radar"
    && !data?.weatherChartEnabled
    && !data?.lightningEnabled
    && !data?.weatherDistributionMode;
  const typhoonBulletinRadarVisible = mode === "typhoon"
    && data?.forecastMode !== "world"
    && data?.typhoonRadarOverlay?.visible === true;
  const shouldShow = (radarTabVisible || typhoonBulletinRadarVisible)
    && Boolean(data?.radarTileUrl);
  updateNowcastRasterLayer(map, {
    shouldShow,
    tileUrl: data?.radarTileUrl,
    sourcePrefix: RADAR_SOURCE_PREFIX,
    layerPrefix: RADAR_LAYER_PREFIX,
    opacity: typhoonBulletinRadarVisible ? 0.78 : 0.9
  });
}

function updateWeatherDistributionLayer(map, mode, data = {}) {
  const shouldShow = mode === "radar"
    && Boolean(data?.weatherDistributionMode)
    && Boolean(data?.weatherDistributionTileUrl);
  updateNowcastRasterLayer(map, {
    shouldShow,
    tileUrl: data?.weatherDistributionTileUrl,
    sourcePrefix: "weather-distribution-source-",
    layerPrefix: "weather-distribution-layer-",
    opacity: 0.88
  });
}

function setRadarVisible(map, isVisible) {
  setNowcastRasterVisible(map, RADAR_LAYER_PREFIX, isVisible);
}

function updateEstimatedIntensityLayer(map, mode, data = {}) {
  const earthquakes = data?.earthquakes ?? [];
  const selectedId = String(data?.selectedEarthquakeId ?? "");
  const earthquake = data?.selectedEarthquake
    ?? earthquakes.find((item) => String(item.id) === selectedId)
    ?? earthquakes[0];
  const images = earthquake?.estimatedIntensity?.images ?? [];
  const shouldShow = mode === "earthquake"
    && data?.earthquakeContentMode !== "volcano"
    && getEarthquakeMapView(data) === "recent"
    && data?.estimatedIntensityVisible !== false
    && images.length > 0;
  const key = images.length > 0
    ? `${earthquake.estimatedIntensity.id}:${images.map((image) => image.meshCode).join(",")}:palette-v1`
    : "";
  const current = estimatedIntensityLayerStateByMap.get(map);

  if (
    current?.key === key
    && current.entries.length === images.length
    && current.entries.every(({ layerId }) => map.getLayer(layerId))
  ) {
    current.visible = shouldShow;
    current.entries.forEach(({ layerId }) => {
      map.setLayoutProperty(layerId, "visibility", shouldShow ? "visible" : "none");
    });
    return;
  }

  removeEstimatedIntensityLayers(map, current?.entries ?? []);
  estimatedIntensityLayerStateByMap.delete(map);
  if (!shouldShow || !key || images.length === 0) return;

  const state = { key, entries: [], visible: shouldShow };
  estimatedIntensityLayerStateByMap.set(map, state);
  ensureEstimatedIntensityProtocol();
  void Promise.all(images.map((image) => getRecoloredEstimatedIntensityImageData(image.url)))
    .then((recoloredImages) => {
      if (estimatedIntensityLayerStateByMap.get(map) !== state) return;
      recoloredImages.forEach((imageData, index) => {
        if (!imageData) return;
        const image = images[index];
        const sourceId = `${ESTIMATED_INTENSITY_SOURCE_PREFIX}-${index}`;
        const layerId = `${ESTIMATED_INTENSITY_LAYER_PREFIX}-${index}`;
        const protocolKey = encodeURIComponent(image.url);
        const protocolUrl = `${ESTIMATED_INTENSITY_PROTOCOL}://${protocolKey}`;
        estimatedIntensityImageDataByKey.set(protocolKey, imageData);
        removeMapLayerAndSource(map, layerId, sourceId);
        map.addSource(sourceId, {
          type: "image",
          url: protocolUrl,
          coordinates: image.coordinates
        });
        map.addLayer({
          id: layerId,
          type: "raster",
          source: sourceId,
          layout: {
            visibility: state.visible ? "visible" : "none"
          },
          paint: {
            "raster-opacity": 0.88,
            "raster-fade-duration": 0,
            "raster-resampling": "nearest"
          }
        }, map.getLayer("sample-line") ? "sample-line" : undefined);
        state.entries.push({ sourceId, layerId });
      });
      if (state.entries.length === 0 && estimatedIntensityLayerStateByMap.get(map) === state) {
        estimatedIntensityLayerStateByMap.delete(map);
      }
    })
    .catch(() => {
      if (estimatedIntensityLayerStateByMap.get(map) === state) {
        estimatedIntensityLayerStateByMap.delete(map);
      }
    });
}

function ensureEstimatedIntensityProtocol() {
  if (estimatedIntensityProtocolRegistered) return;
  maplibregl.addProtocol(ESTIMATED_INTENSITY_PROTOCOL, async ({ url }) => {
    const prefix = `${ESTIMATED_INTENSITY_PROTOCOL}://`;
    const protocolKey = String(url ?? "").startsWith(prefix)
      ? String(url).slice(prefix.length)
      : "";
    const imageData = estimatedIntensityImageDataByKey.get(protocolKey);
    if (!imageData) {
      throw new Error("Estimated intensity image data is unavailable.");
    }
    return { data: imageData.slice(0) };
  });
  estimatedIntensityProtocolRegistered = true;
}

function removeEstimatedIntensityLayers(map, entries) {
  [...entries].reverse().forEach(({ layerId, sourceId }) => {
    removeMapLayerAndSource(map, layerId, sourceId);
  });
}

function removeMapLayerAndSource(map, layerId, sourceId) {
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

function updateLightningLayer(map, mode, data = {}) {
  const shouldShow = mode === "radar"
    && data?.lightningEnabled
    && Boolean(data?.lightningTileUrl);
  updateNowcastRasterLayer(map, {
    shouldShow,
    tileUrl: data?.lightningTileUrl,
    sourcePrefix: LIGHTNING_SOURCE_PREFIX,
    layerPrefix: LIGHTNING_LAYER_PREFIX,
    opacity: 0.92
  });
}

function updateLightningObservationLayer(map, mode, data = {}) {
  const shouldShow = mode === "radar"
    && data?.lightningEnabled
    && Boolean(data?.lightningObservationUrl);
  const source = map.getSource(LIGHTNING_OBSERVATION_SOURCE_ID);

  if (!shouldShow) {
    setLightningObservationVisible(map, false);
    return;
  }

  if (source?.setData) {
    if (lightningObservationUrlByMap.get(map) !== data.lightningObservationUrl) {
      source.setData(data.lightningObservationUrl);
      lightningObservationUrlByMap.set(map, data.lightningObservationUrl);
    }
    setLightningObservationVisible(map, true);
    moveLightningObservationLayersToFront(map);
    return;
  }

  map.addSource(LIGHTNING_OBSERVATION_SOURCE_ID, {
    type: "geojson",
    data: data.lightningObservationUrl,
    attribution: "気象庁"
  });
  lightningObservationUrlByMap.set(map, data.lightningObservationUrl);
  map.addLayer({
    id: LIGHTNING_OBSERVATION_LAYER_IDS[0],
    type: "symbol",
    source: LIGHTNING_OBSERVATION_SOURCE_ID,
    minzoom: 4,
    layout: {
      "text-field": "×",
        "text-font": ["Noto Sans JP"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 4, 12, 10, 22],
      "text-allow-overlap": true,
      "text-ignore-placement": true
    },
    paint: {
      "text-color": "#faf500",
      "text-halo-color": "#303030",
      "text-halo-width": 1.5
    },
    filter: ["==", ["get", "type"], 4]
  });
  map.addLayer({
    id: LIGHTNING_OBSERVATION_LAYER_IDS[1],
    type: "circle",
    source: LIGHTNING_OBSERVATION_SOURCE_ID,
    minzoom: 4,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2.2, 10, 3.8],
      "circle-color": "#faf500",
      "circle-stroke-color": "#303030",
      "circle-stroke-width": 1.1
    },
    filter: ["!=", ["get", "type"], 4]
  });
  moveLightningObservationLayersToFront(map);
}

function setLightningObservationVisible(map, isVisible) {
  LIGHTNING_OBSERVATION_LAYER_IDS.forEach((layerId) => {
    if (map?.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", isVisible ? "visible" : "none");
    }
  });
}

function moveLightningObservationLayersToFront(map) {
  LIGHTNING_OBSERVATION_LAYER_IDS.forEach((layerId) => {
    if (map?.getLayer(layerId)) map.moveLayer(layerId);
  });
}

function updateNowcastRasterLayer(map, {
  shouldShow,
  tileUrl,
  sourcePrefix,
  layerPrefix,
  opacity
}) {
  if (!shouldShow || !tileUrl) {
    setNowcastRasterVisible(map, layerPrefix, false);
    return;
  }

  const firstLevel = RADAR_ZOOM_LEVELS[0];
  const sourceId = getNowcastSourceId(sourcePrefix, firstLevel.id);
  const expectedTileUrl = getRadarTileUrl(tileUrl, firstLevel);
  const currentSource = map.getSource(sourceId);
  if (currentSource && currentSource.tiles?.[0] === expectedTileUrl) {
    setNowcastRasterVisible(map, layerPrefix, true);
    return;
  }

  removeNowcastRasterLayer(map, sourcePrefix, layerPrefix);
  RADAR_ZOOM_LEVELS.forEach((level) => {
    const { z, minzoom, maxzoom } = level;
    const levelSourceId = getNowcastSourceId(sourcePrefix, level.id);
    const layerId = getNowcastLayerId(layerPrefix, level.id);
    map.addSource(levelSourceId, {
      type: "raster",
      tiles: [getRadarTileUrl(tileUrl, level)],
      tileSize: 256,
      minzoom: 0,
      maxzoom: z,
      bounds: [118, 20, 150, 48],
      attribution: "気象庁"
    });
    map.addLayer({
      id: layerId,
      type: "raster",
      source: levelSourceId,
      minzoom,
      maxzoom,
      paint: {
        "raster-opacity": opacity,
        "raster-fade-duration": 0,
        "raster-resampling": "nearest"
      }
    }, "jma-municipality-line");
  });
}

function setNowcastRasterVisible(map, layerPrefix, isVisible) {
  RADAR_ZOOM_LEVELS.forEach(({ id }) => {
    const layerId = getNowcastLayerId(layerPrefix, id);
    if (map?.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", isVisible ? "visible" : "none");
    }
  });
}

function removeNowcastRasterLayer(map, sourcePrefix, layerPrefix) {
  [...RADAR_ZOOM_LEVELS].reverse().forEach(({ id }) => {
    const layerId = getNowcastLayerId(layerPrefix, id);
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  });
  [...RADAR_ZOOM_LEVELS].reverse().forEach(({ id }) => {
    const sourceId = getNowcastSourceId(sourcePrefix, id);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  });
}

function getNowcastSourceId(prefix, id) {
  return `${prefix}${id}`;
}

function getNowcastLayerId(prefix, id) {
  return `${prefix}${id}`;
}

function getRadarTileUrl(tileUrl, level) {
  return tileUrl.replace("{z}", String(level.z));
}

function updateWeatherChartSatelliteLayer(map, mode, data = {}) {
  const satellite = data?.weatherChartSatellite;
  const frame = satellite?.frame;
  const shouldShow = mode === "radar"
    && Boolean(satellite?.enabled)
    && Boolean(frame?.tileUrl);
  const current = himawariSatelliteLayerStateByMap.get(map);

  if (!shouldShow) {
    if (map.getLayer(HIMAWARI_SATELLITE_LAYER_ID)) {
      map.setLayoutProperty(HIMAWARI_SATELLITE_LAYER_ID, "visibility", "none");
    }
    return;
  }

  if (!current || current.tileUrl !== frame.tileUrl || !map.getSource(HIMAWARI_SATELLITE_SOURCE_ID)) {
    removeMapLayerAndSource(map, HIMAWARI_SATELLITE_LAYER_ID, HIMAWARI_SATELLITE_SOURCE_ID);
    map.addSource(HIMAWARI_SATELLITE_SOURCE_ID, {
      type: "raster",
      tiles: [frame.tileUrl],
      tileSize: 256,
      minzoom: 1,
      maxzoom: 10
    });
    map.addLayer({
      id: HIMAWARI_SATELLITE_LAYER_ID,
      type: "raster",
      source: HIMAWARI_SATELLITE_SOURCE_ID,
      layout: { visibility: "visible" },
      paint: {
        "raster-opacity": 0.58,
        "raster-saturation": -0.22,
        "raster-contrast": 0.06,
        "raster-fade-duration": 0
      }
    }, map.getLayer("weather-chart-isobar-line") ? "weather-chart-isobar-line" : undefined);
    himawariSatelliteLayerStateByMap.set(map, { tileUrl: frame.tileUrl });
    return;
  }

  if (map.getLayer(HIMAWARI_SATELLITE_LAYER_ID)) {
    map.setLayoutProperty(HIMAWARI_SATELLITE_LAYER_ID, "visibility", "visible");
  }
}

function updateWeatherChartLayer(map, mode, data = {}) {
  const satellite = data?.weatherChartSatellite;
  const satelliteWeatherChart = satellite?.enabled && satellite.weatherChartOverlayEnabled
    ? satellite.weatherChartFrame
    : null;
  const weatherChart = data?.weatherChartEnabled ? data.weatherChart : satelliteWeatherChart;
  const shouldShow = mode === "radar" && weatherChart?.featureCount > 0;
  if (!shouldShow) {
    setWeatherChartVisible(map, false);
    return;
  }

  setGeoJsonSourceData(map.getSource(WEATHER_CHART_LINE_SOURCE_ID), weatherChart.lines ?? EMPTY_GEOJSON);
  setGeoJsonSourceData(map.getSource(WEATHER_CHART_POINT_SOURCE_ID), weatherChart.points ?? EMPTY_GEOJSON);
  setWeatherChartVisible(map, true);
}

function setWeatherChartVisible(map, isVisible) {
  WEATHER_CHART_LAYERS.forEach((layerId) => {
    if (map?.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", isVisible ? "visible" : "none");
    }
  });
}

function setRadarOverlayZoomLimit(map, mode, data = {}) {
  if (!map?.setMaxZoom) return;

  const weatherChartVisible = mode === "radar"
    && (data?.weatherChartEnabled
      ? data?.weatherChart?.featureCount > 0
      : data?.weatherChartSatellite?.enabled
        && data?.weatherChartSatellite?.weatherChartOverlayEnabled
        && data?.weatherChartSatellite?.weatherChartFrame?.featureCount > 0);
  const satelliteVisible = mode === "radar"
    && Boolean(data?.weatherChartSatellite?.enabled)
    && Boolean(data?.weatherChartSatellite?.frame?.tileUrl);
  const lightningVisible = mode === "radar"
    && data?.lightningEnabled
    && Boolean(data?.lightningTileUrl);
  const weatherDistributionVisible = mode === "radar"
    && Boolean(data?.weatherDistributionMode)
    && Boolean(data?.weatherDistributionTileUrl);
  const maxZoom = weatherChartVisible || satelliteVisible
    ? WEATHER_CHART_MAX_ZOOM
    : lightningVisible
      ? LIGHTNING_MAX_ZOOM
      : weatherDistributionVisible
        ? 10
      : DEFAULT_VIEW.maxZoom;
  if (radarOverlayZoomLimitCache.get(map) === maxZoom) return;

  radarOverlayZoomLimitCache.set(map, maxZoom);
  map.setMaxZoom(maxZoom);

  if (map.getZoom() > maxZoom) {
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

function createEmptyFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: []
  };
}

function createEewFeatureCollection(events, now = Date.now()) {
  const features = [];
  (Array.isArray(events) ? events : [events]).forEach((eew) => {
    if (!eew || eew.isCancel || !Array.isArray(eew.coordinates) || eew.coordinates.length !== 2) return;
    if (eew.coordinates.some(value => value == null || String(value).trim() === "")) return;
    const [longitude, latitude] = eew.coordinates.map(Number);
    const originTimestamp = Date.parse(eew.originTime ?? "");
    const depthKm = Number(eew.depth);
    if (![longitude, latitude].every(Number.isFinite)) return;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [longitude, latitude] },
      properties: {
        featureType: "hypocenter",
        eventId: eew.eventId,
        uncertain: Boolean(eew.isAssumption),
        reliability: eew.hypocenterReliability ?? "unknown"
      }
    });
    if (!eew.canRenderWaves || !Number.isFinite(originTimestamp) || !Number.isFinite(depthKm)) return;
    const elapsedSeconds = Math.max(0, (now - originTimestamp) / 1000);
    const waveDistances = getJma2001WaveDistances(depthKm, elapsedSeconds);
    if (!waveDistances) return;
    const { pDistanceKm, sDistanceKm } = waveDistances;
    const waveDefinitions = [
      { type: "P", surfaceRadiusKm: pDistanceKm },
      { type: "S", surfaceRadiusKm: sDistanceKm }
    ];

    waveDefinitions.forEach(({ type, surfaceRadiusKm }) => {
      if (surfaceRadiusKm < 1 || surfaceRadiusKm > 2_500) return;
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [createGeodesicCircle([longitude, latitude], surfaceRadiusKm)] },
        properties: { featureType: "wave", waveType: type, eventId: eew.eventId }
      });
    });
  });

  return { type: "FeatureCollection", features };
}

function getJma2001WaveDistances(depthKm, elapsedSeconds) {
  if (jma2001WaveDistanceCalculator) {
    return jma2001WaveDistanceCalculator(depthKm, elapsedSeconds);
  }

  if (!jma2001WaveDistanceLoadPromise) {
    jma2001WaveDistanceLoadPromise = import("../eew/jma2001TravelTime.js")
      .then((module) => {
        jma2001WaveDistanceCalculator = module.getWaveDistancesByJma2001;
        return jma2001WaveDistanceCalculator;
      })
      .catch((error) => {
        console.warn("[MeteoScope] JMA2001 travel-time table load failed", error);
        jma2001WaveDistanceLoadPromise = null;
        return null;
      });
  }

  return null;
}

function createGeodesicCircle(center, radiusKm, steps = 96) {
  const coordinates = Array.from({ length: steps }, (_, index) => (
    destinationPoint(center, radiusKm, index * (360 / steps))
  ));
  coordinates.push(coordinates[0]);
  return coordinates;
}

function createSampleFeatureCollection(mode, data = {}) {
  if (mode === "amedas") return createAmedasFeatureCollection(data);
  if (mode === "earthquake") {
    return {
      type: "FeatureCollection",
      features: createEarthquakeFeatures(data)
    };
  }
  return EMPTY_GEOJSON;
}

function createAmedasFeatureCollection(data = {}) {
  const points = data?.points;
  if (!Array.isArray(points)) return EMPTY_GEOJSON;

  const metricId = data.activeMetric ?? "temperature";
  const cacheKey = `${metricId}|${data.precipitationPeriod ?? ""}|${data.latestTime ?? ""}`;
  let collections = amedasFeatureCollectionCache.get(points);
  const cached = collections?.get(cacheKey);
  if (cached) return cached;

  const collection = {
    type: "FeatureCollection",
    features: createAmedasFeatures(data)
  };
  collections ??= new Map();
  collections.set(cacheKey, collection);
  amedasFeatureCollectionCache.set(points, collections);
  return collection;
}

function setGeoJsonSourceData(source, data) {
  if (!source?.setData || geoJsonSourceDataCache.get(source) === data) return;
  source.setData(data);
  geoJsonSourceDataCache.set(source, data);
}

function createAmedasFeatures(data) {
  const metric = AMEDAS_METRICS.find((item) => item.id === data?.activeMetric) ?? AMEDAS_METRICS[0];
  return (data?.points ?? []).flatMap((point) => {
    const value = point.values?.[metric.id];
    if (!Number.isFinite(value)) return [];
    if (metric.id === "precipitation" && value < 0.1) return [];
    if (metric.id === "snow" && value < 1) return [];
    if (metric.id === "wind" && !Number.isFinite(point.windDirection)) return [];
    const color = getAmedasColor(metric.id, value, data?.precipitationPeriod);
    const isWind = metric.id === "wind";
    const stationName = getCurrentLanguage() === "en" ? (point.nameEn || localizeText(point.name)) : point.name;

    return [{
      type: "Feature",
      geometry: { type: "Point", coordinates: point.coordinates },
      properties: {
        color,
        markerType: isWind ? "wind" : "amedas",
        markerScaleMode: isWind ? "fixed" : "amedas-zoom",
        rotation: isWind ? getWindArrowRotation(point.windDirection) : 0,
        radius: getAmedasRadius(metric.id, value),
        strokeWidth: 0,
        sortKey: getAmedasSortKey(metric.id, value),
        stationId: point.id,
        label: isWind
          ? `${stationName} ${formatAmedasValue(value)}${metric.unit}`
          : stationName,
        amedasValueLabel: isWind ? "" : formatAmedasValue(value),
        amedasTextColor: getAmedasTextColor(color),
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

function createEarthquakeFeatures(data) {
  if (data?.earthquakeContentMode === "volcano") {
    const reports = [...(data?.mapVolcanoes ?? data?.reports ?? [])];
    const selectedVolcanoCode = String(data?.selectedVolcanoCode ?? "");
    const selectedVolcano = reports.find((report) =>
      String(report?.volcanoCode ?? report?.code ?? "") === selectedVolcanoCode
    ) ?? getHighestPriorityVolcanoReport(reports);
    const activeVolcanoCode = String(selectedVolcano?.volcanoCode ?? selectedVolcano?.code ?? "");
    const ashForecasts = getAvailableVolcanoAshForecasts(selectedVolcano);
    const ashForecastIndex = Math.max(0, Math.min(
      ashForecasts.length - 1,
      Number(data?.selectedVolcanoAshForecastIndex) || 0
    ));
    const ashForecast = ashForecasts[ashForecastIndex];
    const ashFeatures = ashForecast?.areas.map((area) => ({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [area.polygon, ...(Array.isArray(area.holes) ? area.holes : [])]
      },
      properties: {
        color: ashfallColor(area),
        fillOpacity: area.category === "small-cinders"
          ? VOLCANO_SMALL_CINDERS_STYLE.opacity
          : getVolcanoAshfallLevel(area.amount).opacity,
        lineWidth: area.category === "small-cinders" ? VOLCANO_SMALL_CINDERS_STYLE.lineWidth : 1.4,
        markerType: "ashfall",
        volcanoCode: activeVolcanoCode
      }
    })) ?? [];
    const volcanoFeatures = reports
      .sort((left, right) => (Number(left.alertPriority || left.level) || 0) - (Number(right.alertPriority || right.level) || 0))
      .flatMap((report) => {
      if (!Array.isArray(report?.coordinates)) return [];
      const level = Math.max(0, Math.min(5, Number(report.level) || 0));
      const priority = Math.max(0, Math.min(5, Number(report.alertPriority || level) || 0));
      return [{
        type: "Feature",
        geometry: { type: "Point", coordinates: report.coordinates },
        properties: {
          color: getVolcanoMarkerColor(priority),
          opacity: 0.9,
          strokeWidth: 1.5,
          markerType: "volcano",
          level: priority,
          volcanoCode: String(report.volcanoCode ?? report.code ?? ""),
          markerScaleMode: "fixed",
          radius: 7 + Math.max(0, level - 1),
          sortKey: 100 + priority,
          label: ""
        }
      }];
    });
    return [...ashFeatures, ...volcanoFeatures];
  }
  if (getEarthquakeMapView(data) === "distribution") {
    const is3D = data?.distribution3DEnabled === true;
    const showCoordinateEventCount = !is3D
      && data?.distribution?.selectedSource === "jma-xml"
      && data?.distribution?.rangeMode !== true;
    const distributionItems = is3D
      ? (data?.distributionItems ?? [])
      : groupHypocenterItemsByCoordinate(data?.distributionItems ?? []);
    const distributionFeatures = distributionItems.flatMap((item) => {
      const longitude = Number(item.longitude);
      const latitude = Number(item.latitude);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];
      const magnitude = Number(item.maximumMagnitude ?? item.magnitude);
      const depth = Number(item.depthKm);
      const coordinateEventCount = Math.max(1, Number(item.coordinateEventCount) || 1);
      const magnitudeRadius = Number.isFinite(magnitude)
        ? Math.max(3.5, Math.min(11, 3 + magnitude * 1.2))
        : 4;
      return [{
        type: "Feature",
        geometry: { type: "Point", coordinates: [longitude, latitude] },
        properties: {
          color: getHypocenterDepthColor(Number.isFinite(depth) ? depth : null),
          opacity: is3D ? 0.2 : 0.68,
          strokeWidth: 0,
          markerType: "hypocenter-distribution",
          markerScaleMode: "fixed",
          radius: is3D
            ? 2.5
            : Math.max(
              magnitudeRadius,
              coordinateEventCount > 1
                ? Math.min(16, 6 + Math.sqrt(coordinateEventCount) * 1.65)
                : magnitudeRadius
            ),
          sortKey: Number.isFinite(magnitude) ? magnitude : -10,
          label: "",
          coordinateEventCount,
          showCoordinateEventCount,
          distributionPlace: String(item.place ?? ""),
          distributionOriginTime: String(item.originTime ?? ""),
          distributionMagnitude: Number.isFinite(Number(item.magnitude))
            ? Number(item.magnitude)
            : null,
          distributionDepthKm: Number.isFinite(depth) ? depth : null
        }
      }];
    });
    return [...createTideStationFeatures(data), ...distributionFeatures];
  }
  if (getEarthquakeMapView(data) === "history") {
    const selectedId = String(data?.selectedHistoricalEarthquakeId ?? "");
    const detailVisible = data?.historicalEarthquakeDetailVisible === true;
    const eventDetail = data?.selectedHistoricalEarthquakeDetail;
    const stations = detailVisible && eventDetail?.id === selectedId && eventDetail?.status === "ok"
      ? eventDetail.event?.stations ?? []
      : [];
    const historicalAreaFeatures = detailVisible && eventDetail?.id === selectedId && eventDetail?.status === "ok"
      ? (eventDetail.event?.intensityAreaFeatures ?? []).map((feature) => ({
        ...feature,
        properties: {
          ...(feature.properties ?? {}),
          popup: `<strong>${escapePopup(feature.properties?.areaName ?? "細分区域")}</strong><br>最大震度 ${escapePopup(feature.properties?.intensityLabel ?? "不明")}`
        }
      }))
      : [];
    const historicalAreaMarkers = createEarthquakeAreaIntensityMarkers(historicalAreaFeatures);
    const historyItems = (data?.earthquakeArchiveItems ?? []).filter((item) => (
      !detailVisible || String(item.id) === selectedId
    ));
    const historyFeatures = historyItems.flatMap((item) => {
      const longitude = Number(item.longitude);
      const latitude = Number(item.latitude);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];
      const selected = String(item.id) === selectedId;
      const magnitude = item?.magnitude == null ? Number.NaN : Number(item.magnitude);
      return [{
        type: "Feature",
        geometry: { type: "Point", coordinates: [longitude, latitude] },
        properties: {
          color: getEarthquakeIntensityColor(item.maxIntensity === "felt" ? "1" : item.maxIntensity),
          opacity: selected ? 1 : 0.64,
          strokeWidth: selected ? 2.5 : 0.7,
          markerType: detailVisible && selected ? "cross" : "hypocenter-distribution",
          isHistoricalEarthquake: true,
          earthquakeHistoryId: String(item.id),
          markerScaleMode: "fixed",
          radius: selected
            ? 10
            : Number.isFinite(magnitude) ? Math.max(4, Math.min(9, 2.5 + magnitude)) : 4,
          sortKey: selected ? 2_000 : (Number.isFinite(magnitude) ? magnitude : 0),
          label: "",
          popup: buildHistoricalEarthquakePopup(item)
        }
      }];
    });
    const observationFeatures = stations.flatMap((station) => {
      if (!Array.isArray(station.coordinates) || !station.intensity) return [];
      const rank = getEarthquakeIntensityRank(station.intensity);
      return [{
        type: "Feature",
        geometry: { type: "Point", coordinates: station.coordinates },
        properties: {
          color: getEarthquakeIntensityColor(station.intensity),
          markerType: "earthquake-station",
          isHistoricalEarthquake: true,
          markerScaleMode: "earthquake-zoom",
          radius: EARTHQUAKE_STATION_RADIUS,
          strokeWidth: EARTHQUAKE_STATION_STROKE_WIDTH,
          sortKey: rank,
          intensityKey: getStationIntensityKey(station.intensity),
          popup: buildHistoricalEarthquakeStationPopup(station, eventDetail.event.hypocenter)
        }
      }];
    });
    return [
      ...createTideStationFeatures(data),
      ...historyFeatures,
      ...historicalAreaFeatures,
      ...historicalAreaMarkers,
      ...observationFeatures
    ];
  }
  const tsunamiFeatures = (data?.tsunami?.mapFeatures ?? [])
    .filter((feature) => (
      data?.tideStationsVisible !== true
      || !["tsunami-coastal", "tsunami-offshore"].includes(feature?.properties?.markerType)
    ))
    .map((feature) => ({
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
  const tideStationFeatures = createTideStationFeatures(data);
  if (!earthquake) return [...tideStationFeatures, ...tsunamiFeatures];

  const hasEstimatedIntensity = (earthquake.estimatedIntensity?.images ?? []).length > 0;
  const areaFeatures = (hasEstimatedIntensity ? [] : (earthquake.intensityAreaFeatures ?? [])).map((feature) => ({
    ...feature,
    properties: {
      ...(feature.properties ?? {}),
      color: feature.properties?.color ?? getEarthquakeIntensityColor(feature.properties?.intensity),
      fillOpacity: feature.properties?.fillOpacity ?? 0.48,
      lineWidth: feature.properties?.lineWidth ?? 1.3
    }
  }));
  const areaIntensityMarkers = createEarthquakeAreaIntensityMarkers(
    earthquake.intensityAreaFeatures ?? []
  );

  const stationFeatures = (earthquake.intensityStations ?? []).flatMap((station) => {
    if (!Array.isArray(station.coordinates) || !station.intensity) return [];
    return [{
      type: "Feature",
      geometry: { type: "Point", coordinates: station.coordinates },
      properties: {
        color: getEarthquakeIntensityColor(station.intensity),
        markerType: "earthquake-station",
        markerScaleMode: "earthquake-zoom",
        radius: EARTHQUAKE_STATION_RADIUS,
        strokeWidth: EARTHQUAKE_STATION_STROKE_WIDTH,
        sortKey: getEarthquakeIntensityRank(station.intensity),
        intensityKey: getStationIntensityKey(station.intensity),
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

  return [
    ...tideStationFeatures,
    ...tsunamiFeatures,
    ...areaFeatures,
    ...areaIntensityMarkers,
    ...stationFeatures,
    ...epicenterFeature
  ];
}

function createEarthquakeAreaIntensityMarkers(features) {
  const markersByArea = new Map();
  for (const feature of features ?? []) {
    const intensity = feature?.properties?.intensity;
    const anchor = getEarthquakeAreaIntensityAnchor(feature?.geometry);
    if (!intensity || !anchor) continue;
    const areaKey = String(
      feature.properties?.areaCode
      ?? feature.properties?.areaName
      ?? feature.properties?.featureIndex
      ?? markersByArea.size
    );
    const current = markersByArea.get(areaKey);
    if (current && current.anchorArea >= anchor.area) continue;
    markersByArea.set(areaKey, {
      feature: {
        type: "Feature",
        geometry: { type: "Point", coordinates: anchor.coordinates },
        properties: {
          color: getEarthquakeIntensityColor(intensity),
          markerType: "earthquake-area-intensity",
          intensityText: formatEarthquakeIntensityMarkerText(intensity),
          textColor: getEarthquakeIntensityMarkerTextColor(intensity),
          sortKey: getEarthquakeIntensityRank(intensity),
          popup: feature.properties?.popup ?? ""
        }
      },
      anchorArea: anchor.area
    });
  }
  return [...markersByArea.values()].map((entry) => entry.feature);
}

// Administrative geometry is immutable; keep the expensive vertex scan across
// tab switches without retaining old datasets once their geometry is released.
const earthquakeAreaAnchorCache = new WeakMap();
function getEarthquakeAreaIntensityAnchor(geometry) {
  if (!geometry || typeof geometry !== "object") return null;
  if (earthquakeAreaAnchorCache.has(geometry)) return earthquakeAreaAnchorCache.get(geometry);
  const rings = geometry?.type === "Polygon"
    ? [geometry.coordinates?.[0]]
    : geometry?.type === "MultiPolygon"
      ? geometry.coordinates?.map((polygon) => polygon?.[0])
      : [];
  let largest = null;
  for (const ring of rings ?? []) {
    const candidate = getPolygonRingCentroid(ring);
    if (candidate && (!largest || candidate.area > largest.area)) largest = candidate;
  }
  earthquakeAreaAnchorCache.set(geometry, largest);
  return largest;
}

function getPolygonRingCentroid(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  let crossSum = 0;
  let longitudeSum = 0;
  let latitudeSum = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    const x1 = Number(current?.[0]);
    const y1 = Number(current?.[1]);
    const x2 = Number(next?.[0]);
    const y2 = Number(next?.[1]);
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
    const cross = (x1 * y2) - (x2 * y1);
    crossSum += cross;
    longitudeSum += (x1 + x2) * cross;
    latitudeSum += (y1 + y2) * cross;
  }
  if (Math.abs(crossSum) < Number.EPSILON) {
    const coordinates = ring
      .map((point) => [Number(point?.[0]), Number(point?.[1])])
      .filter((point) => point.every(Number.isFinite));
    if (coordinates.length === 0) return null;
    return {
      coordinates: [
        coordinates.reduce((sum, point) => sum + point[0], 0) / coordinates.length,
        coordinates.reduce((sum, point) => sum + point[1], 0) / coordinates.length
      ],
      area: 0
    };
  }
  return {
    coordinates: [
      longitudeSum / (3 * crossSum),
      latitudeSum / (3 * crossSum)
    ],
    area: Math.abs(crossSum / 2)
  };
}

function getStationIntensityKey(value) {
  const key = String(value ?? "");
  return EARTHQUAKE_INTENSITY_LEVELS.some((level) => level.value === key) ? key : "unknown";
}

function getEarthquakeMapView(data) {
  return data?.earthquakeMapView ?? data?.earthquakeView ?? "recent";
}

function createTideStationFeatures(data) {
  if (data?.tideStationsVisible !== true) return [];
  const selectedCode = String(data?.selectedTideStationCode ?? "");
  return (data?.tideStations ?? []).flatMap((station) => {
    if (!Array.isArray(station?.coordinates) || station.coordinates.length !== 2) return [];
    const selected = String(station.code) === selectedCode;
    return [{
      type: "Feature",
      geometry: { type: "Point", coordinates: station.coordinates },
      properties: {
        color: selected ? "#38bdf8" : "#5e93ad",
        opacity: selected ? 1 : 0.7,
        markerType: "tide-station",
        markerScaleMode: "fixed",
        radius: selected ? 6.2 : 3.7,
        strokeWidth: selected ? 2.4 : 1.2,
        sortKey: selected ? 1900 : 120,
        tideStationCode: String(station.code),
        label: ""
      }
    }];
  });
}

function ashfallColor(area) {
  if (area?.category === "small-cinders") return VOLCANO_SMALL_CINDERS_STYLE.color;
  return getVolcanoAshfallLevel(area?.amount).color;
}

function getVolcanoMarkerColor(level) {
  return getVolcanoLevelColor(level);
}

function buildHypocenterDistributionPopup(item) {
  const magnitudeValue = item?.magnitude;
  const magnitudeNumber = magnitudeValue !== null
    && magnitudeValue !== undefined
    && String(magnitudeValue).trim() !== ""
    ? Number(magnitudeValue)
    : Number.NaN;
  const depthValue = item?.depthKm;
  const depthNumber = depthValue !== null
    && depthValue !== undefined
    && String(depthValue).trim() !== ""
    ? Number(depthValue)
    : Number.NaN;
  const magnitude = Number.isFinite(magnitudeNumber) ? `M${magnitudeNumber.toFixed(1)}` : "M不明";
  const depth = Number.isFinite(depthNumber) ? `${depthNumber}km` : "不明";
  const coordinateEventCount = Math.max(1, Number(item.coordinateEventCount) || 1);
  const overlap = coordinateEventCount > 1
    ? `<br><strong>同一発表座標に ${coordinateEventCount}件</strong>`
    : "";
  return `
    <strong>${escapePopup(item.place ?? "震央地名不明")}</strong><br>
    <span>${escapePopup(formatDistributionOriginTime(item.originTime))}</span><br>
    <span>${escapePopup(magnitude)}・深さ ${escapePopup(depth)}</span>${overlap}<br>
    <small>気象庁の暫定値</small>
  `;
}

function buildEarthquakePopup(earthquake) {
  const unknownText = getEarthquakeUnknownText(earthquake);
  const intensity = String(
    earthquake.maxIntensityLabel ?? earthquake.maxIntensityShort ?? ""
  ).trim();
  return `
    <strong>${escapePopup(formatEarthquakeHypocenterText(earthquake, "地震情報"))}</strong><br>
    <span>${escapePopup(!intensity || intensity === "震度不明" ? unknownText : intensity)}</span><br>
    <span>発生: ${escapePopup(earthquake.eventTime ?? "--")}</span><br>
    <span>規模: ${escapePopup(earthquake.magnitude && earthquake.magnitude !== "--" ? earthquake.magnitude : unknownText)}</span><br>
    <span>深さ: ${escapePopup(formatEarthquakeDepthText(earthquake.depth, { unknownText }))}</span>
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
  if (data?.worldForecastMode) {
    return (data.worldForecastLayers ?? []).flatMap((layer) => {
      const systems = layer.systems?.length
        ? layer.systems
        : [layer.system, ...(layer.candidates ?? [])].filter(Boolean);
      return systems.flatMap((system) => createWorldTyphoonFeatures(
        system,
        layer.modelInfo,
        layer.source
      ));
    });
  }
  if (!data?.hasTyphoon) return [];

  return (data.typhoons ?? []).flatMap((typhoon) => {
    const features = [];
    features.push(...createTyphoonRadiusFeatures(typhoon));

    const pastTrack = typhoon.pastTrack?.length ? typhoon.pastTrack : typhoon.track;
    if (pastTrack?.length >= 2) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: pastTrack },
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
        geometry: { type: "LineString", coordinates: typhoon.forecastTrack },
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
        forecastCenter: formatTyphoonForecastCenter(circle.center),
        popup: buildTyphoonPopup(typhoon, circle.label ? `予報円 ${circle.label}` : "予報円"),
        forecastPopup: buildTyphoonForecastCirclePopup(typhoon, circle)
      });
      if (feature) features.push(feature);
      if (circle.center?.length === 2 && circle.label) {
        features.push(createTyphoonForecastLabelFeature(circle, typhoon));
      }
    });

    const stormWarningShapeFeatures = typhoon.stormWarningAreaShape
      ? createTyphoonStormWarningShapeFeatures(typhoon)
      : [];
    if (stormWarningShapeFeatures.length > 0) {
      features.push(...stormWarningShapeFeatures);
    } else if (hasStormWarningCircleGroups(typhoon) || hasCircleSet(typhoon.stormWarningArea)) {
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

    return features.flatMap((feature) => {
      if (feature.geometry?.type === "LineString") {
        return createWorldLineFeatures(feature.geometry.coordinates, { properties: feature.properties });
      }
      if (feature.geometry?.type === "Polygon") {
        const sourceRing = feature.geometry.coordinates?.[0];
        const fillFeatures = splitPolygonRingAtAntimeridian(sourceRing).map((ring) => ({
          ...feature,
          properties: feature.properties?.typhoonShape === "windArea"
            ? { ...feature.properties, typhoonShape: "windAreaFill" }
            : feature.properties,
          geometry: { type: "Polygon", coordinates: [ring] }
        }));
        if (feature.properties?.typhoonShape !== "windArea") return fillFeatures;
        const outlineProperties = { ...feature.properties, typhoonShape: "windAreaLine" };
        return [
          ...fillFeatures,
          ...createWorldLineFeatures(sourceRing, { properties: outlineProperties })
        ];
      }
      return [feature];
    });
  });
}

function createWorldTyphoonFeatures(
  system,
  modelInfo = {},
  source = {}
) {
  const features = [];
  const style = WORLD_TYPHOON_MODEL_STYLES[modelInfo.id] ?? WORLD_TYPHOON_MODEL_STYLES.ecmwf;
  const controlColor = style.control;
  const genesisEnsembleColor = style.genesisEnsemble;
  const genesisControlColor = style.genesisControl;
  const isGenesis = system?.kind === "genesis";
  const memberShape = isGenesis ? "worldGenesisEnsemble" : "worldEnsemble";
  const memberPopup = isGenesis
    ? buildWorldGenesisPopup(system, modelInfo, source)
    : null;
  const memberLineGroups = new Map();
  (system?.members ?? []).forEach((member) => {
    const duplicatesControl = isWorldTyphoonControlMember(system, member);
    if (duplicatesControl || member.coordinates?.length < 2) return;
    const color = isGenesis ? genesisEnsembleColor : controlColor;
    const lineGroup = memberLineGroups.get(color) ?? [];
    lineGroup.push(...splitLineAtAntimeridian(member.coordinates));
    memberLineGroups.set(color, lineGroup);
  });
  memberLineGroups.forEach((lineCoordinates, color) => {
    if (!lineCoordinates.length) return;
    features.push({
      type: "Feature",
      geometry: {
        type: "MultiLineString",
        coordinates: lineCoordinates
      },
      properties: {
        color,
        typhoonShape: memberShape,
        popup: memberPopup
          ?? buildWorldTyphoonPopup(system, "アンサンブル進路分布", modelInfo, source)
      }
    });
  });
  if (system?.controlCoordinates?.length >= 2) {
    features.push(...createWorldLineFeatures(system.controlCoordinates, {
      properties: {
        color: isGenesis ? genesisControlColor : controlColor,
        typhoonShape: isGenesis ? "worldGenesisControl" : "worldControl",
        popup: isGenesis
          ? buildWorldGenesisPopup(system, modelInfo, source)
          : buildWorldTyphoonPopup(system, "コントロールメンバー", modelInfo, source)
      }
    }));
  }
  return features;
}

function createWorldTyphoonPositionFeatures(data = {}) {
  return (data.worldForecastLayers ?? []).flatMap((layer) => {
    const style = WORLD_TYPHOON_MODEL_STYLES[layer.modelInfo?.id]
      ?? WORLD_TYPHOON_MODEL_STYLES.ecmwf;
    return (layer.forecastPositions ?? []).flatMap(({
      system,
      position,
      trackType = "representative",
      memberId = null,
      memberIndex = null
    }) => {
      if (!Array.isArray(position?.coordinates) || position.coordinates.length !== 2) return [];
      const isMember = trackType === "member";
      const paletteIndex = Number.isFinite(Number(memberIndex))
        ? Math.abs(Number(memberIndex)) % style.palette.length
        : 0;
      const trackLabel = isMember ? `Member ${memberId}` : trackType;
      const color = isMember
        ? (system?.kind === "genesis" ? style.genesisEnsemble : style.palette[paletteIndex])
        : (system?.kind === "genesis" ? style.genesisControl : style.control);
      return [{
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: position.coordinates
        },
        properties: {
          color,
          positionRole: trackType,
          memberId: Number.isFinite(Number(memberId)) ? Number(memberId) : "",
          modelId: layer.modelInfo?.id ?? "",
          modelLabel: layer.modelInfo?.shortLabel ?? layer.modelInfo?.label ?? "",
          markerRadius: style.positionRadius,
          typhoonShape: "worldForecastPosition",
          timeLabel: formatWorldForecastMapTime(position.validTime),
          forecastPopup: buildWorldTyphoonPositionPopup(
            system,
            position,
            layer.modelInfo,
            layer.source,
            trackLabel
          )
        }
      }];
    });
  });
}

function createWorldLineFeatures(coordinates, { properties }) {
  return splitLineAtAntimeridian(coordinates).map((segment) => ({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: segment
    },
    properties
  }));
}

function buildWorldTyphoonPopup(system, label, modelInfo = {}, source = {}) {
  const modelLabel = modelInfo.label ?? source.model ?? "各国予想";
  const licenceLabel = source.license ? ` / ${source.license}` : "";
  return `
    <strong>${escapePopup(system.name ?? `${modelLabel} 各国予想`)}</strong><br>
    <span>${escapePopup(label)}</span><br>
    <small>${escapePopup(`${modelLabel}${licenceLabel}`)}（加工済み）</small>
  `;
}

function buildWorldTyphoonPositionPopup(
  system,
  position,
  modelInfo = {},
  source = {},
  trackLabel = ""
) {
  const [longitude, latitude] = position.coordinates ?? [];
  const details = "";
  const modelLabel = modelInfo.label ?? source.model ?? "各国予想";
  const licenceLabel = source.license ? ` / ${source.license}` : "";
  return `
    <strong>${escapePopup(system?.name ?? modelLabel)}</strong><br>
    ${trackLabel ? `<span>${escapePopup(trackLabel)}</span><br>` : ""}
    <span>${escapePopup(formatWorldForecastMapTime(position.validTime, true))}</span><br>
    <span>${escapePopup(formatWorldForecastCoordinates(latitude, longitude))}</span>
    ${details ? `<br><span>${escapePopup(details)}</span>` : ""}
    <br><small>${escapePopup(`${modelLabel}${licenceLabel}`)}（代表進路・加工済み）</small>
  `;
}

function formatWorldForecastCoordinates(latitude, longitude) {
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return "位置未取得";
  const latitudeLabel = `${Math.abs(Number(latitude)).toFixed(1)}°${Number(latitude) >= 0 ? "N" : "S"}`;
  const longitudeLabel = `${Math.abs(Number(longitude)).toFixed(1)}°${Number(longitude) >= 0 ? "E" : "W"}`;
  return `${latitudeLabel} / ${longitudeLabel}`;
}

function buildWorldGenesisPopup(system, modelInfo = {}, source = {}) {
  const modelLabel = modelInfo.label ?? source.model ?? "各国予想";
  const licenceLabel = source.license ? ` / ${source.license}` : "";
  return `
    <strong>熱帯擾乱の発達候補 ${escapePopup(system.name ?? "")}</strong><br>
    <small>台風の発生を確定する情報ではありません。${escapePopup(`${modelLabel}${licenceLabel}`)}（加工済み）</small>
  `;
}

function parseTyphoonForecastCenter(value) {
  const [longitude, latitude] = String(value ?? "").split(",").map(Number);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return [longitude, latitude];
}

function getClosestPointOnRect(point, { x, y, width, height }) {
  return {
    x: clampNumber(point.x, x, x + width),
    y: clampNumber(point.y, y, y + height)
  };
}

function buildHistoricalEarthquakePopup(item) {
  const magnitudeNumber = item?.magnitude == null ? Number.NaN : Number(item.magnitude);
  const depthNumber = item?.depthKm == null ? Number.NaN : Number(item.depthKm);
  const magnitude = Number.isFinite(magnitudeNumber) ? `M${magnitudeNumber.toFixed(1)}` : "M不明";
  const depth = Number.isFinite(depthNumber) ? `${depthNumber}km` : "不明";
  const intensity = item?.maxIntensity === "felt"
    ? "有感"
    : `震度${String(item?.maxIntensity ?? "不明").replace("-", "弱").replace("+", "強")}`;
  const sourceLink = item?.sourceUrl
    ? `<br><a href="${escapePopup(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">気象庁で確認 ↗</a>`
    : "";
  return `
    <strong>${escapePopup(item?.place ?? "震央地名不明")}</strong><br>
    <span>${escapePopup(formatDistributionOriginTime(item?.originTime, true))}</span><br>
    <span>${escapePopup(intensity)}・${escapePopup(magnitude)}・深さ ${escapePopup(depth)}</span>
    <br><small>タップすると観測点ごとの震度を地図に表示</small>
    ${sourceLink}
  `;
}

function buildHistoricalEarthquakeStationPopup(station, hypocenter = {}) {
  return `
    <strong>${escapePopup(station?.name ?? "震度観測点")}</strong><br>
    <span>${escapePopup(station?.intensityLabel ?? "震度不明")}</span><br>
    <span>${escapePopup(hypocenter?.place ?? "")}</span><br>
    <span>${escapePopup(formatDistributionOriginTime(hypocenter?.originTime, true))} 発生</span>
  `;
}

function buildAmedasPopup(point, metric, value, latestTime) {
  const windDirection = Number.isFinite(point.windDirection)
    ? `<br>風向: ${getWindDirectionLabel(point.windDirection)}から`
    : "";
  const metricLabel = metric.id === "pressure" ? "海面気圧" : metric.label;
  return `${escapePopup(point.name)}<br>${metricLabel}: ${formatAmedasValue(value)} ${metric.unit}${windDirection}<br>アメダス最新時刻: ${latestTime ?? "未取得"}`;
}

function getAmedasColor(metricId, value, precipitationPeriodId) {
  return getAmedasObservationColor(metricId, value, precipitationPeriodId);
}

function getAmedasRadius(metricId, value) {
  if (metricId === "precipitation") return 8.5;
  if (metricId === "wind") return Math.min(13, 5 + value / 4);
  return 8.5;
}

function getAmedasTextColor(backgroundColor) {
  const hex = String(backgroundColor ?? "").replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#071426";
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const luminance = channels.reduce((sum, channel, index) => {
    const linear = channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
  return luminance > 0.42 ? "#071426" : "#ffffff";
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
