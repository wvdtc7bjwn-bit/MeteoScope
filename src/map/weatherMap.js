import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  AMEDAS_METRICS,
  DEFAULT_VIEW,
  getAmedasObservationColor,
  getEarthquakeIntensityColor,
  getEarthquakeIntensityRank,
  JMA_ENDPOINTS,
  KIKIKURU_ELEMENTS
} from "../config.js";
import { formatEarthquakeDepthText } from "../earthquakeFormat.js";
import { worldLandGeoJson } from "./data/worldLandGeoJson.js";
import { worldCountriesGeoJson } from "./data/worldCountriesGeoJson.js";

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
const AMEDAS_CIRCLE_RADIUS_EXPRESSION = buildAmedasZoomExpression(
  [[3, 0.55], [5, 0.72], [7, 0.92], [9, 1.12], [10, 1.22]],
  SAMPLE_CIRCLE_BASE_RADIUS,
  (scale) => ["*", SAMPLE_CIRCLE_BASE_RADIUS, scale]
);
const AMEDAS_CIRCLE_STROKE_WIDTH_EXPRESSION = buildAmedasZoomExpression(
  [[3, 0.9], [5, 1.2], [7, 1.6], [10, 2.2]],
  2,
  (width) => width
);
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
  "weather-chart-front-cold-symbol",
  "weather-chart-front-warm-symbol",
  "weather-chart-front-occluded-triangle-symbol",
  "weather-chart-front-occluded-semicircle-symbol",
  "weather-chart-pressure-point",
  "weather-chart-isobar-label",
  "weather-chart-pressure-label",
  "weather-chart-pressure-value-label"
];
const WEATHER_CHART_MAX_ZOOM = 6.4;
const WEATHER_FRONT_COLD_IMAGE_ID = "weather-front-cold-triangle";
const WEATHER_FRONT_WARM_IMAGE_ID = "weather-front-warm-semicircle";
const WEATHER_FRONT_OCCLUDED_TRIANGLE_IMAGE_ID = "weather-front-occluded-triangle";
const WEATHER_FRONT_OCCLUDED_SEMICIRCLE_IMAGE_ID = "weather-front-occluded-semicircle";
const KIKIKURU_SOURCE_PREFIX = "jma-kikikuru";
const KIKIKURU_LAYER_PREFIX = "jma-kikikuru";
const RIVER_FLOOD_SOURCE_ID = "jma-river-flood";
const RIVER_FLOOD_LAYERS = ["jma-river-flood-casing", "jma-river-flood-line", "jma-river-flood-label"];
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
const PREFECTURE_SOURCE_ID = "japan-prefectures";
const WARNING_SOURCE_ID = "jma-active-warning-municipalities";
const CURRENT_LOCATION_SOURCE_ID = "current-location";
const MUNICIPALITY_FILL_LAYER_ID = "jma-municipality-fill";
const WARNING_OVERLAY_LAYER_ID = "jma-warning-overlay";
const WARNING_CLICK_LAYER_ID = "jma-warning-click-target";
const WARNING_HATCH_LAYER_ID = "jma-warning-emergency-hatch";
const WARNING_HATCH_IMAGE_ID = "jma-warning-emergency-hatch-pattern";
const STORM_WARNING_ENDPOINT_SNAP_PX = 48;
const STORM_WARNING_DUPLICATE_SEGMENT_PX = 18;
const WARNING_GEOMETRY_FIX_CODES = new Set([
  "0220100", // 青森市
  "3820600", // 西条市
  "4420200" // 別府市
]);
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
    typhoonLabelHalo: "rgba(5, 9, 20, 0.9)"
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
    typhoonLabelHalo: "rgba(248, 252, 255, 0.94)"
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
let warningMunicipalityDataPromise = null;
let prefectureDataPromise = null;
const baseMunicipalitySourceCache = new WeakMap();
const warningFeatureCollectionCache = new WeakMap();
const kikikuruTileUrlCache = new Map();
const weatherChartZoomLimitCache = new WeakMap();

export function createWeatherMap(elementId) {
  let map = null;
  let pendingRender = null;
  let activeMode = "radar";
  let activeTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  let warningAreasByCode = new Map();
  let typhoonForecastInfoElement = null;
  let typhoonForecastInfoLngLat = null;

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
      void updateBaseMunicipalitySource(map);
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
    if (mode !== "typhoon") hideTyphoonForecastInfo();
    Object.values(MODE_CLASS).forEach((className) => container.classList.remove(className));
    container.classList.add(MODE_CLASS[mode] ?? MODE_CLASS.radar);
    setRadarVisible(map, mode === "radar");
    if (mode !== "radar") setWeatherChartVisible(map, false);
    if (mode !== "warnings") {
      setKikikuruVisible(map, false);
    }
    if (mode !== "warnings") updateWarningMunicipalityPaint(map, mode);
  }

  function renderData(mode, data) {
    if (!map || !map.getSource(SAMPLE_SOURCE_ID)) {
      pendingRender = { mode, data };
      return;
    }

    const source = map.getSource(SAMPLE_SOURCE_ID);
    const collection = createSampleFeatureCollection(mode, data);
    source.setData(collection);
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
      source: WARNING_SOURCE_ID,
      paint: {
        "fill-pattern": WARNING_HATCH_IMAGE_ID,
        "fill-opacity": 0
      }
    }, "jma-municipality-line");

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
        "circle-opacity": 0.92,
        "circle-radius": AMEDAS_CIRCLE_RADIUS_EXPRESSION,
        "circle-stroke-color": "#f8fbff",
        "circle-stroke-width": AMEDAS_CIRCLE_STROKE_WIDTH_EXPRESSION
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
    setupTyphoonForecastInfo();

    map.on("mouseenter", WARNING_CLICK_LAYER_ID, (event) => {
      const feature = event.features?.[0];
      const area = warningAreasByCode.get(String(feature?.properties?.code ?? ""));
      if (area) map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", WARNING_CLICK_LAYER_ID, () => {
      map.getCanvas().style.cursor = "";
    });
    map.on("click", WARNING_CLICK_LAYER_ID, (event) => {
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
  }

  function setupTyphoonForecastInfo() {
    typhoonForecastInfoElement = document.createElement("div");
    typhoonForecastInfoElement.className = "typhoon-forecast-info-popup";
    typhoonForecastInfoElement.hidden = true;
    map.getContainer().appendChild(typhoonForecastInfoElement);

    map.on("click", (event) => {
      if (activeMode !== "typhoon") {
        hideTyphoonForecastInfo();
        return;
      }
      const layers = TYPHOON_FORECAST_INFO_LAYERS.filter((layerId) => map.getLayer(layerId));
      if (layers.length === 0) {
        hideTyphoonForecastInfo();
        return;
      }
      const feature = map.queryRenderedFeatures(event.point, { layers })
        .find((item) => item?.properties?.forecastPopup);
      if (!feature) {
        hideTyphoonForecastInfo();
        return;
      }
      showTyphoonForecastInfo(event.lngLat, feature.properties.forecastPopup);
    });

    TYPHOON_FORECAST_INFO_LAYERS.forEach((layerId) => {
      map.on("mouseenter", layerId, () => {
        if (activeMode === "typhoon") map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
      });
    });

    map.on("move", positionTyphoonForecastInfo);
    map.on("resize", positionTyphoonForecastInfo);
  }

  function showTyphoonForecastInfo(lngLat, html) {
    if (!typhoonForecastInfoElement) return;
    typhoonForecastInfoLngLat = lngLat;
    typhoonForecastInfoElement.innerHTML = html;
    typhoonForecastInfoElement.hidden = false;
    positionTyphoonForecastInfo();
  }

  function hideTyphoonForecastInfo() {
    typhoonForecastInfoLngLat = null;
    if (typhoonForecastInfoElement) {
      typhoonForecastInfoElement.hidden = true;
      typhoonForecastInfoElement.innerHTML = "";
    }
  }

  function positionTyphoonForecastInfo() {
    if (!map || !typhoonForecastInfoElement || typhoonForecastInfoElement.hidden || !typhoonForecastInfoLngLat) return;
    const point = map.project(typhoonForecastInfoLngLat);
    const container = map.getContainer();
    const width = typhoonForecastInfoElement.offsetWidth || 240;
    const height = typhoonForecastInfoElement.offsetHeight || 130;
    const margin = 12;
    let x = point.x + 18;
    let y = point.y - height - 14;

    if (x + width + margin > container.clientWidth) x = point.x - width - 18;
    if (y < margin) y = point.y + 18;
    x = clampNumber(x, margin, container.clientWidth - width - margin);
    y = clampNumber(y, margin, container.clientHeight - height - margin);
    typhoonForecastInfoElement.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
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

  return { initialize, setMode, setTheme, renderData, resize, showCurrentLocation, flyToLocation, fitToCoordinates };
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
        data: createEmptyFeatureCollection(),
        promoteId: "code"
      },
      [PREFECTURE_SOURCE_ID]: {
        type: "geojson",
        data: createEmptyFeatureCollection()
      },
      [WARNING_SOURCE_ID]: {
        type: "geojson",
        data: createEmptyFeatureCollection(),
        promoteId: "code"
      }
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
        paint: {
          "fill-color": colors.municipalityFill,
          "fill-antialias": false,
          "fill-opacity": 1
        }
      },
      {
        id: WARNING_OVERLAY_LAYER_ID,
        type: "fill",
        source: WARNING_SOURCE_ID,
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
        paint: {
          "fill-color": "rgba(0, 0, 0, 0)",
          "fill-opacity": 0.001
        }
      },
      {
        id: "jma-municipality-line",
        type: "line",
        source: MUNICIPALITY_SOURCE_ID,
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
    ["jma-municipality-line", "line-color", colors.municipalityLine],
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
    ["typhoon-label", "text-halo-color", colors.typhoonLabelHalo]
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
  addWeatherFrontImage(map, WEATHER_FRONT_OCCLUDED_TRIANGLE_IMAGE_ID, "triangle", "#b579ff");
  addWeatherFrontImage(map, WEATHER_FRONT_OCCLUDED_SEMICIRCLE_IMAGE_ID, "semicircle", "#b579ff");
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
    id: "weather-chart-front-cold-symbol",
    frontSymbol: "cold",
    imageId: WEATHER_FRONT_COLD_IMAGE_ID,
    offset: [0, 12],
    spacing: 90
  });
  addWeatherFrontSymbolLayer(map, {
    id: "weather-chart-front-warm-symbol",
    frontSymbol: "warm",
    imageId: WEATHER_FRONT_WARM_IMAGE_ID,
    offset: [0, -12],
    spacing: 90
  });
  addWeatherFrontSymbolLayer(map, {
    id: "weather-chart-front-occluded-triangle-symbol",
    frontSymbol: "occluded",
    imageId: WEATHER_FRONT_OCCLUDED_TRIANGLE_IMAGE_ID,
    offset: [0, 12],
    spacing: 104
  });
  addWeatherFrontSymbolLayer(map, {
    id: "weather-chart-front-occluded-semicircle-symbol",
    frontSymbol: "occluded",
    imageId: WEATHER_FRONT_OCCLUDED_SEMICIRCLE_IMAGE_ID,
    offset: [0, -10],
    spacing: 104
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
  map.addLayer({
    id: options.id,
    type: "symbol",
    source: WEATHER_CHART_LINE_SOURCE_ID,
    filter: ["all", ["==", ["get", "kind"], "front"], ["==", ["get", "frontSymbol"], options.frontSymbol]],
    layout: {
      visibility: "none",
      "symbol-placement": "line",
      "symbol-spacing": options.spacing,
      "icon-image": options.imageId,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.42, 6, 0.58, 8, 0.72],
      "icon-offset": options.offset,
      "icon-rotation-alignment": "map",
      "icon-pitch-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-keep-upright": false
    },
    paint: {
      "icon-opacity": 0.96
    }
  });
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
  if (!map?.getLayer(WARNING_OVERLAY_LAYER_ID)) return;

  if (mode !== "warnings" || ["kikikuru", "river"].includes(data?.activeWarningView)) {
    map.setPaintProperty(WARNING_OVERLAY_LAYER_ID, "fill-opacity", 0);
    updateWarningHatchPaint(map, []);
    return;
  }

  const activeAreas = getActiveWarningOverlayAreas(mode, data);
  void updateWarningMunicipalitySource(map, activeAreas);

  if (activeAreas.length === 0) {
    map.setPaintProperty(WARNING_OVERLAY_LAYER_ID, "fill-color", "rgba(0, 0, 0, 0)");
    map.setPaintProperty(WARNING_OVERLAY_LAYER_ID, "fill-opacity", 0);
    updateWarningHatchPaint(map, []);
    return;
  }

  const isEarlyWarningView = mode === "warnings" && data?.activeWarningView === "early";
  map.setPaintProperty(WARNING_OVERLAY_LAYER_ID, "fill-color", [
    "match",
    ["get", "warningLevel"],
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
  map.setPaintProperty(WARNING_OVERLAY_LAYER_ID, "fill-opacity", [
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

async function updateWarningMunicipalitySource(map, activeAreas) {
  const source = map?.getSource(WARNING_SOURCE_ID);
  if (!source?.setData) return;

  try {
    const signature = createWarningAreaSignature(activeAreas);
    const cached = warningFeatureCollectionCache.get(map);
    if (cached?.signature === signature) return;

    if (activeAreas.length === 0) {
      const empty = createEmptyFeatureCollection();
      warningFeatureCollectionCache.set(map, { signature, collection: empty });
      source.setData(empty);
      return;
    }

    const municipalityData = await loadWarningMunicipalityData();
    const activeAreasByCode = new Map(activeAreas.map((area) => [String(area.areaCode), area]));
    const collection = {
      type: "FeatureCollection",
      features: municipalityData.features
        .map((feature) => {
          const code = String(feature?.properties?.code ?? "");
          const activeArea = activeAreasByCode.get(code);
          if (!activeArea?.level) return null;
          return {
            ...feature,
            properties: {
              ...feature.properties,
              warningLevel: activeArea.level
            }
          };
        })
        .filter(Boolean)
    };
    warningFeatureCollectionCache.set(map, { signature, collection });
    source.setData(collection);
    map.triggerRepaint();
  } catch (error) {
    console.warn("[MeteoScope] warning municipality source update failed", error);
  }
}

async function updateBaseMunicipalitySource(map) {
  const source = map?.getSource(MUNICIPALITY_SOURCE_ID);
  const prefectureSource = map?.getSource(PREFECTURE_SOURCE_ID);
  if (!source?.setData) return;

  const cached = baseMunicipalitySourceCache.get(map);
  if (cached?.loaded) return;
  baseMunicipalitySourceCache.set(map, { loaded: true });

  try {
    const [municipalityData, prefectureData] = await Promise.all([
      loadWarningMunicipalityData(),
      loadPrefectureData()
    ]);
    source.setData(municipalityData);
    if (prefectureSource?.setData) {
      prefectureSource.setData(prefectureData);
    }
    map.triggerRepaint();
  } catch (error) {
    baseMunicipalitySourceCache.delete(map);
    console.warn("[MeteoScope] base municipality source update failed", error);
  }
}

function loadWarningMunicipalityData() {
  if (!warningMunicipalityDataPromise) {
    warningMunicipalityDataPromise = fetch(JMA_ENDPOINTS.warningMunicipalities)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => normalizeWarningMunicipalityData(data));
  }
  return warningMunicipalityDataPromise;
}

function loadPrefectureData() {
  if (!prefectureDataPromise) {
    prefectureDataPromise = fetch(JMA_ENDPOINTS.prefectures).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    });
  }
  return prefectureDataPromise;
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

function normalizeWarningMunicipalityData(data) {
  if (!data || data.type !== "FeatureCollection" || !Array.isArray(data.features)) return data;
  return {
    ...data,
    features: data.features.map((feature) => {
      const code = String(feature?.properties?.code ?? "");
      if (!WARNING_GEOMETRY_FIX_CODES.has(code)) return feature;
      const geometry = normalizeWarningGeometry(feature?.geometry);
      return geometry === feature?.geometry
        ? feature
        : { ...feature, geometry };
    })
  };
}

function normalizeWarningGeometry(geometry) {
  if (!geometry?.coordinates) return geometry;
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.type === "MultiPolygon"
      ? geometry.coordinates
      : null;
  if (!polygons) return geometry;

  const normalizedPolygons = polygons.flatMap((polygon) => normalizeWarningPolygonParts(polygon));
  if (geometry.type === "Polygon") {
    if (normalizedPolygons.length <= 1) {
      return { ...geometry, coordinates: normalizedPolygons[0] ?? [] };
    }
    return { type: "MultiPolygon", coordinates: normalizedPolygons };
  }
  return { ...geometry, coordinates: normalizedPolygons };
}

function normalizeWarningPolygonParts(polygon) {
  if (!Array.isArray(polygon)) return [];
  const rings = polygon
    .map((ring) => normalizeWarningRing(ring))
    .filter((ring) => ring.length >= 4 && Math.abs(getRingArea(ring)) > 1e-12);
  if (rings.length <= 1) return rings.length === 1 ? [[rings[0]]] : [];

  const ringInfos = rings
    .map((ring) => ({
      ring,
      area: Math.abs(getRingArea(ring)),
      point: getRingSamplePoint(ring)
    }))
    .sort((a, b) => b.area - a.area);

  const outerInfos = [];
  ringInfos.forEach((info) => {
    const containingOuter = outerInfos
      .filter((outer) => pointInRing(info.point, outer.ring))
      .sort((a, b) => a.area - b.area)[0];
    if (!containingOuter) {
      outerInfos.push({ ...info, holes: [] });
      return;
    }
    containingOuter.holes.push(info.ring);
  });

  return outerInfos.map((outer) => [outer.ring, ...outer.holes]);
}

function normalizeWarningRing(ring) {
  let normalized = closeWarningRing(ring);
  if (normalized.length < 4) return normalized;

  for (let attempts = 0; attempts < 32; attempts += 1) {
    const intersection = findLocalRingIntersection(normalized);
    if (!intersection) break;
    const next = [
      ...normalized.slice(0, intersection.start),
      ...normalized.slice(intersection.end)
    ];
    if (next.length < 4) break;
    normalized = closeWarningRing(next);
  }
  if (hasStrictSelfIntersection(normalized) && Math.abs(getRingArea(normalized)) < 1e-5) {
    const hull = createConvexHullRing(normalized);
    if (hull.length >= 4 && Math.abs(getRingArea(hull)) > 1e-12) return hull;
  }
  return normalized;
}

function closeWarningRing(ring) {
  if (!Array.isArray(ring)) return [];
  const normalized = [];
  ring.forEach((point) => {
    if (!Array.isArray(point) || point.length < 2) return;
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    const last = normalized.at(-1);
    if (!last || last[0] !== lng || last[1] !== lat) normalized.push([lng, lat]);
  });
  if (normalized.length > 0) {
    const first = normalized[0];
    const last = normalized.at(-1);
    if (first[0] !== last[0] || first[1] !== last[1]) normalized.push([...first]);
  }
  return normalized;
}

function findLocalRingIntersection(ring) {
  const maxSegmentGap = 6;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const limit = Math.min(ring.length - 2, i + maxSegmentGap);
    for (let j = i + 2; j <= limit; j += 1) {
      if (i === 0 && j === ring.length - 2) continue;
      if (segmentsCrossStrictly(ring[i], ring[i + 1], ring[j], ring[j + 1])) {
        return { start: i + 1, end: j + 1 };
      }
    }
  }
  return null;
}

function hasStrictSelfIntersection(ring) {
  for (let i = 0; i < ring.length - 1; i += 1) {
    for (let j = i + 2; j < ring.length - 1; j += 1) {
      if (i === 0 && j === ring.length - 2) continue;
      if (segmentsCrossStrictly(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}

function createConvexHullRing(ring) {
  const points = [...new Map(
    ring
      .slice(0, -1)
      .map((point) => [`${point[0]},${point[1]}`, point])
  ).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (points.length < 3) return [];

  const lower = [];
  points.forEach((point) => {
    while (lower.length >= 2 && orientPoints(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  });

  const upper = [];
  [...points].reverse().forEach((point) => {
    while (upper.length >= 2 && orientPoints(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  });

  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return closeWarningRing(hull);
}

function getRingSamplePoint(ring) {
  return ring.find((point, index) => index < ring.length - 1) ?? ring[0] ?? [0, 0];
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = (yi > point[1]) !== (yj > point[1])
      && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function segmentsCrossStrictly(a, b, c, d) {
  if (samePoint(a, c) || samePoint(a, d) || samePoint(b, c) || samePoint(b, d)) return false;
  const abC = orientPoints(a, b, c);
  const abD = orientPoints(a, b, d);
  const cdA = orientPoints(c, d, a);
  const cdB = orientPoints(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

function orientPoints(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function samePoint(a, b) {
  return a?.[0] === b?.[0] && a?.[1] === b?.[1];
}

function getRingArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return area / 2;
}

function createWarningAreaSignature(activeAreas) {
  if (!activeAreas.length) return "";
  return activeAreas
    .map((area) => `${String(area.areaCode)}:${area.level ?? ""}`)
    .sort()
    .join("|");
}

function updateWarningHatchPaint(map, activeAreas) {
  if (!map?.getLayer(WARNING_HATCH_LAYER_ID)) return;

  map.setFilter(WARNING_HATCH_LAYER_ID, [
    "==",
    ["get", "warningLevel"],
    "emergency"
  ]);
  map.setPaintProperty(
    WARNING_HATCH_LAYER_ID,
    "fill-opacity",
    activeAreas.some((area) => area.level === "emergency") ? 0.7 : 0
  );
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

function buildAmedasZoomExpression(stops, fallbackValue, createAmedasValue) {
  const isAmedasCircle = ["==", ["get", "markerScaleMode"], "amedas-zoom"];
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    ...stops.flatMap(([zoom, value]) => [
      zoom,
      ["case", isAmedasCircle, createAmedasValue(value), fallbackValue]
    ])
  ];
}

function createWarningFeatures(data) {
  return [];
}

function createEarthquakeFeatures(data) {
  const earthquakes = data?.earthquakes ?? [];
  const selectedId = String(data?.selectedEarthquakeId ?? "");
  const earthquake = data?.selectedEarthquake
    ?? earthquakes.find((item) => String(item.id) === selectedId)
    ?? earthquakes[0];
  if (!earthquake) return [];

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

  return [...areaFeatures, ...stationFeatures, ...epicenterFeature];
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

