import {
  UPPER_AIR_STATIONS,
  analyzeUpperAirProfile,
  buildMoistAdiabat,
  buildUpperAirProfile,
  formatJmaObservationTime,
  parseUpperAirTemperatureHumidityHtml,
  summarizeUpperAirProfile,
  temperatureAlongDryAdiabat,
  temperatureForSaturationMixingRatio
} from "../jma/upperAir.js";
import { getEarlyAccessToken } from "./earlyAccess.js";
import { buildModalLoadingState } from "./modalLoadingState.js";

const SVG_NS = "http://www.w3.org/2000/svg";
let initialized = false;
let options = {};
let requestId = 0;
let selectedStationId = "47646";
let selectedMode = "observation";
let isModelMapOpen = false;
let selectedModelCoordinates = { latitude: 35.75, longitude: 139.75 };
let modelMapGeoJsonPromise = null;

function createElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function pressureToY(pressure, { top, height }) {
  return top + (Math.log(pressure) - Math.log(100)) / (Math.log(1000) - Math.log(100)) * height;
}

function temperatureToX(temperature, { left, width }) {
  return left + ((temperature + 90) / 140) * width;
}

function appendPath(svg, points, attributes) {
  if (points.length < 2) return;
  const path = createElement("path", {
    d: points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" "),
    fill: "none",
    ...attributes
  });
  svg.append(path);
}

export function buildEmagramSvg(profile) {
  const width = 740;
  const height = 530;
  const plot = { left: 62, top: 22, width: 640, height: 452 };
  const svg = createElement("svg", {
    class: "upper-air-emagram",
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "気温を赤、露点温度を青緑で示した高層気象観測のエマグラム"
  });

  svg.append(createElement("rect", { x: plot.left, y: plot.top, width: plot.width, height: plot.height, class: "upper-air-emagram-frame" }));
  [1000, 925, 850, 700, 500, 400, 300, 200, 100].forEach((pressure) => {
    const y = pressureToY(pressure, plot);
    svg.append(createElement("line", { x1: plot.left, y1: y, x2: plot.left + plot.width, y2: y, class: "upper-air-emagram-isobar" }));
    const label = createElement("text", { x: plot.left - 10, y: y + 4, class: "upper-air-emagram-axis-label", "text-anchor": "end" });
    label.textContent = pressure;
    svg.append(label);
  });
  for (let temperature = -80; temperature <= 40; temperature += 10) {
    const x = temperatureToX(temperature, plot);
    svg.append(createElement("line", { x1: x, y1: plot.top, x2: x, y2: plot.top + plot.height, class: "upper-air-emagram-isotherm" }));
    const label = createElement("text", { x, y: plot.top + plot.height + 21, class: "upper-air-emagram-axis-label", "text-anchor": "middle" });
    label.textContent = temperature;
    svg.append(label);
  }
  const definitions = createElement("defs");
  const clipPath = createElement("clipPath", { id: "upper-air-emagram-plot" });
  clipPath.append(createElement("rect", { x: plot.left, y: plot.top, width: plot.width, height: plot.height }));
  definitions.append(clipPath);
  svg.append(definitions);
  const curves = createElement("g", { "clip-path": "url(#upper-air-emagram-plot)" });
  svg.append(curves);
  for (let potentialTemperature = 0; potentialTemperature <= 60; potentialTemperature += 10) {
    const points = [];
    for (let pressure = 1000; pressure >= 100; pressure -= 1) {
      const temperature = temperatureAlongDryAdiabat(potentialTemperature, pressure);
      points.push({ x: temperatureToX(temperature, plot), y: pressureToY(pressure, plot) });
    }
    appendPath(curves, points, { class: "upper-air-emagram-dry-adiabat" });
  }
  [0.4, 1, 2, 4, 7, 10, 16, 24].forEach((mixingRatio) => {
    const points = [];
    for (let pressure = 1000; pressure >= 100; pressure -= 1) {
      const temperature = temperatureForSaturationMixingRatio(mixingRatio, pressure);
      if (Number.isFinite(temperature)) points.push({ x: temperatureToX(temperature, plot), y: pressureToY(pressure, plot) });
    }
    appendPath(curves, points, { class: "upper-air-emagram-mixing-ratio" });
  });
  [-30, -20, -10, 0, 10, 20, 30, 40].forEach((temperature) => {
    const points = buildMoistAdiabat(temperature, { step: 1 }).map((row) => ({
      x: temperatureToX(row.temperature, plot),
      y: pressureToY(row.pressure, plot)
    }));
    appendPath(curves, points, { class: "upper-air-emagram-moist-adiabat" });
  });
  const temperaturePoints = profile.map((row) => ({ x: temperatureToX(row.temperature, plot), y: pressureToY(row.pressure, plot) }));
  const dewPointPoints = profile.filter((row) => Number.isFinite(row.dewPoint)).map((row) => ({ x: temperatureToX(row.dewPoint, plot), y: pressureToY(row.pressure, plot) }));
  appendPath(curves, temperaturePoints, { class: "upper-air-emagram-temperature" });
  appendPath(curves, dewPointPoints, { class: "upper-air-emagram-dewpoint" });
  const xLabel = createElement("text", { x: plot.left + plot.width / 2, y: height - 8, class: "upper-air-emagram-axis-title", "text-anchor": "middle" });
  xLabel.textContent = "気温（℃）";
  svg.append(xLabel);
  const yLabel = createElement("text", { x: 16, y: plot.top + plot.height / 2, class: "upper-air-emagram-axis-title", transform: `rotate(-90 16 ${plot.top + plot.height / 2})`, "text-anchor": "middle" });
  yLabel.textContent = "気圧（hPa）";
  svg.append(yLabel);
  return svg;
}

function makeStat(label, value, unit = "") {
  const stat = document.createElement("div");
  stat.className = "upper-air-stat";
  const statLabel = document.createElement("span");
  statLabel.textContent = label;
  const statValue = document.createElement("strong");
  statValue.textContent = value ?? "—";
  if (unit) {
    const statUnit = document.createElement("small");
    statUnit.textContent = unit;
    statValue.append(" ", statUnit);
  }
  stat.append(statLabel, statValue);
  return stat;
}

function formatTemperature(value) {
  return Number.isFinite(value) ? value.toFixed(1) : null;
}

function formatHeight(value) {
  return Number.isFinite(value) ? `${Math.round(value).toLocaleString("ja-JP")} m` : "--";
}

function createInsight(title, value, description) {
  const item = document.createElement("article");
  item.className = "upper-air-insight";
  const heading = document.createElement("div");
  const label = document.createElement("span");
  label.textContent = title;
  const reading = document.createElement("strong");
  reading.textContent = value;
  heading.append(label, reading);
  const detail = document.createElement("p");
  detail.textContent = description;
  item.append(heading, detail);
  return item;
}

function buildObservationInsights(analysis, { isModel = false } = {}) {
  const section = document.createElement("section");
  section.className = "upper-air-insights";
  section.setAttribute("aria-label", "このエマグラムから読み取れること");
  const heading = document.createElement("div");
  heading.className = "upper-air-insights-heading";
  const title = document.createElement("h3");
  title.textContent = isModel ? "このモデルから読み取れること" : "この観測から読み取れること";
  const caption = document.createElement("p");
  caption.textContent = isModel
    ? "GFSの格子点予報に基づく目安です。地点の実況・警報の判断には使用しません。"
    : "観測時点の鉛直分布に基づく目安です。予報や警報の判断には使用しません。";
  heading.append(title, caption);
  const grid = document.createElement("div");
  grid.className = "upper-air-insight-grid";

  const surfaceHumidity = Number.isFinite(analysis.surface.humidity)
    ? `相対湿度 ${Math.round(analysis.surface.humidity)}%`
    : "湿度は欠測";
  const surfaceSpread = Number.isFinite(analysis.surfaceDewPointDepression)
    ? `露点差 ${analysis.surfaceDewPointDepression.toFixed(1)}℃`
    : "露点温度は欠測";
  grid.append(createInsight(
    "地上付近の湿り",
    surfaceHumidity,
    `地上気温 ${formatTemperature(analysis.surface.temperature)}℃、${surfaceSpread}です。露点差が小さいほど、地上付近の空気は湿っています。`
  ));

  const cloudBase = Number.isFinite(analysis.estimatedCloudBase)
    ? `約 ${formatHeight(analysis.estimatedCloudBase)}`
    : "算出できません";
  grid.append(createInsight(
    "雲底の目安（LCL）",
    cloudBase,
    Number.isFinite(analysis.estimatedCloudBase)
      ? "地上気温と露点温度から求めた簡易的な持ち上げ凝結高度です。雲の実際の底の高さとは一致しない場合があります。"
      : "地上の露点温度が不足しているため、目安を算出できません。"
  ));

  const lapseRate = Number.isFinite(analysis.lapseRate)
    ? `${analysis.lapseRate.toFixed(1)} ℃/km`
    : "算出できません";
  const lapseDescription = !Number.isFinite(analysis.lapseRate)
    ? "地上または500 hPaの観測値が不足しているため、平均気温減率を算出できません。"
    : analysis.lapseRate >= 6.5
      ? "地上から500 hPaまで、気温は高さとともに比較的急に下がっています。対流の発達しやすさをみるための基礎指標です。"
      : analysis.lapseRate <= 4
        ? "地上から500 hPaまでの気温の下がり方は緩やかです。鉛直方向の混合は起こりにくい傾向を示します。"
        : "地上から500 hPaまでの平均的な気温の下がり方です。周辺の湿りや風とあわせて確認します。";
  grid.append(createInsight("地上〜500 hPaの気温減率", lapseRate, lapseDescription));

  const upperMoisture = Number.isFinite(analysis.dewPointDepression850)
    ? `露点差 ${analysis.dewPointDepression850.toFixed(1)}℃`
    : "算出できません";
  grid.append(createInsight(
    "850 hPa付近の湿り",
    upperMoisture,
    Number.isFinite(analysis.dewPointDepression850)
      ? `約 ${formatHeight(analysis.at850?.height)} の湿りの目安です。露点差が小さいほど、この高度で飽和に近い状態を示します。`
      : "850 hPa付近の露点温度が不足しているため、湿りを数値化できません。"
  ));

  const freezing = Number.isFinite(analysis.freezingHeight)
    ? formatHeight(analysis.freezingHeight)
    : "算出できません";
  grid.append(createInsight(
    "0℃高度",
    freezing,
    Number.isFinite(analysis.freezingHeight)
      ? "気温が0℃を横切る高度です。降水の相変化を考える際の参考値で、地上の降水種は下層の気温分布にも左右されます。"
      : "観測範囲内に0℃を横切る層がないか、観測値が不足しています。"
  ));

  const inversion = analysis.inversion;
  grid.append(createInsight(
    "下層の逆転層",
    inversion ? `約 ${formatHeight(inversion.baseHeight)}〜${formatHeight(inversion.topHeight)}` : "明瞭な逆転層なし",
    inversion
      ? `この層では高度とともに気温が ${inversion.temperatureChange.toFixed(1)}℃ 上がっています。霧・低い雲・煙霧などをみる際の一材料になります。`
      : "今回の観測の隣り合う層では、0.5℃以上の明瞭な昇温層を検出していません。"
  ));

  const coverage = Number.isFinite(analysis.topPressure) && Number.isFinite(analysis.topHeight)
    ? `${analysis.observedLevelCount}層・${Math.round(analysis.topPressure)} hPaまで`
    : `${analysis.observedLevelCount}層`;
  grid.append(createInsight(
    "観測範囲",
    coverage,
    Number.isFinite(analysis.topHeight)
      ? `地上付近から約 ${formatHeight(analysis.topHeight)} までの観測をエマグラムに表示しています。欠測層は線で補間していません。`
      : "利用できる観測層をエマグラムに表示しています。"
  ));

  section.append(heading, grid);
  return section;
}

function formatCoordinates({ latitude, longitude }) {
  const displayLongitude = longitude > 180 ? longitude - 360 : longitude;
  return `${latitude.toFixed(2)}°N / ${displayLongitude.toFixed(2)}°E`;
}

function buildModeSwitch(body) {
  const switcher = document.createElement("div");
  switcher.className = "upper-air-mode-switch";
  switcher.setAttribute("role", "tablist");
  const modes = [
    ["observation", "高層観測"],
    ["model", "GFS地点モデル"]
  ];
  modes.forEach(([mode, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.classList.toggle("is-active", selectedMode === mode);
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(selectedMode === mode));
    button.addEventListener("click", () => {
      if (selectedMode === mode) return;
      selectedMode = mode;
      if (mode === "model") void loadModelProfile();
      else void loadObservation();
    });
    switcher.append(button);
  });
  const content = document.createElement("div");
  content.className = "upper-air-mode-content";
  body.replaceChildren(switcher, content);
  return content;
}

function buildModelPicker(content) {
  const controls = document.createElement("div");
  controls.className = "upper-air-model-controls";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "upper-air-location-picker";
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.25"/></svg><span>地図で地点を選択</span>';
  button.setAttribute("aria-expanded", String(isModelMapOpen));
  button.addEventListener("click", () => {
    isModelMapOpen = !isModelMapOpen;
    void loadModelProfile();
  });
  const coordinate = document.createElement("p");
  coordinate.className = "upper-air-model-coordinate";
  coordinate.textContent = `選択地点 ${formatCoordinates(selectedModelCoordinates)}`;
  controls.append(button, coordinate);
  content.append(controls);
  if (isModelMapOpen) content.append(buildModelMap());
}

// The viewbox ratio follows the east-west / north-south ground-distance ratio
// around Japan, so the independent picker map is not visually stretched.
const MODEL_MAP_BOUNDS = Object.freeze({ minLongitude: 122, maxLongitude: 150, minLatitude: 23, maxLatitude: 48 });
const MODEL_MAP_VIEWBOX = Object.freeze({ width: 360, height: 392, left: 18, right: 342, top: 18, bottom: 374 });

function projectMiniMap({ latitude, longitude }) {
  const bounds = MODEL_MAP_BOUNDS;
  const viewbox = MODEL_MAP_VIEWBOX;
  return {
    x: viewbox.left + ((longitude - bounds.minLongitude) / (bounds.maxLongitude - bounds.minLongitude)) * (viewbox.right - viewbox.left),
    y: viewbox.bottom - ((latitude - bounds.minLatitude) / (bounds.maxLatitude - bounds.minLatitude)) * (viewbox.bottom - viewbox.top)
  };
}

function coordinatesToMiniMapPath(coordinates, closePath = true) {
  const points = coordinates.map(([longitude, latitude]) => {
    const point = projectMiniMap({ latitude, longitude });
    return `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  });
  return points.length ? `M${points.join(" L")}${closePath ? " Z" : ""}` : "";
}

function geometryToMiniMapPath(geometry) {
  if (!geometry) return "";
  if (geometry.type === "Polygon") return geometry.coordinates.map((ring) => coordinatesToMiniMapPath(ring)).join(" ");
  if (geometry.type === "MultiPolygon") return geometry.coordinates
    .flatMap((polygon) => polygon.map((ring) => coordinatesToMiniMapPath(ring)))
    .join(" ");
  return "";
}

async function getModelMapGeoJson() {
  if (!modelMapGeoJsonPromise) {
    modelMapGeoJsonPromise = fetch("/data/japan-prefectures-map.geojson", { headers: { Accept: "application/geo+json,application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error(`Japan map request failed: ${response.status}`);
        return response.json();
      });
  }
  return modelMapGeoJsonPromise;
}

async function populateModelMap(svg) {
  try {
    const geoJson = await getModelMapGeoJson();
    if (!svg.isConnected) return;
    const land = createElement("g", { class: "upper-air-model-japan" });
    (geoJson.features ?? []).forEach((feature) => {
      const path = geometryToMiniMapPath(feature.geometry);
      if (path) land.append(createElement("path", { d: path }));
    });
    const canvas = svg.querySelector(".upper-air-model-map-content");
    canvas?.insertBefore(land, canvas.querySelector(".upper-air-model-marker-halo"));
  } catch (error) {
    console.warn("[MeteoScope] model picker map unavailable", error);
  }
}

function buildModelMap() {
  const section = document.createElement("section");
  section.className = "upper-air-model-map";
  section.setAttribute("aria-label", "GFS地点選択用の日本周辺地図");
  const hint = document.createElement("p");
  hint.textContent = "タップで地点を選択します。ドラッグで移動、ピンチまたはボタンで拡大できます。最寄りのGFS 0.25°格子を使用します。";
  const toolbar = document.createElement("div");
  toolbar.className = "upper-air-model-map-toolbar";
  const svg = createElement("svg", { viewBox: "0 0 360 392", role: "img", "aria-label": "日本周辺の地点選択地図" });
  svg.classList.add("upper-air-model-map-canvas");
  const mapContent = createElement("g", { class: "upper-air-model-map-content" });
  const mapView = { zoom: 1, panX: 0, panY: 0 };
  const mapCenter = { x: MODEL_MAP_VIEWBOX.width / 2, y: MODEL_MAP_VIEWBOX.height / 2 };
  const applyMapTransform = () => {
    mapContent.setAttribute("transform", `translate(${mapView.panX.toFixed(2)} ${mapView.panY.toFixed(2)}) translate(${mapCenter.x} ${mapCenter.y}) scale(${mapView.zoom.toFixed(3)}) translate(${-mapCenter.x} ${-mapCenter.y})`);
  };
  const clampMapView = () => {
    const maximumPanX = ((mapView.zoom - 1) * MODEL_MAP_VIEWBOX.width) / 2;
    const maximumPanY = ((mapView.zoom - 1) * MODEL_MAP_VIEWBOX.height) / 2;
    mapView.panX = Math.max(-maximumPanX, Math.min(maximumPanX, mapView.panX));
    mapView.panY = Math.max(-maximumPanY, Math.min(maximumPanY, mapView.panY));
  };
  const zoomMap = (nextZoom, anchor = mapCenter) => {
    const currentZoom = mapView.zoom;
    const zoom = Math.max(1, Math.min(4, nextZoom));
    if (zoom === currentZoom) return;
    const ratio = zoom / currentZoom;
    mapView.panX = anchor.x - mapCenter.x - ratio * (anchor.x - mapCenter.x - mapView.panX);
    mapView.panY = anchor.y - mapCenter.y - ratio * (anchor.y - mapCenter.y - mapView.panY);
    mapView.zoom = zoom;
    clampMapView();
    applyMapTransform();
  };
  const mapButton = (label, action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "upper-air-model-map-button";
    button.textContent = label;
    button.setAttribute("aria-label", label === "+" ? "地図を拡大" : "地図を縮小");
    button.addEventListener("click", action);
    return button;
  };
  toolbar.append(mapButton("−", () => zoomMap(mapView.zoom / 1.5)), mapButton("+", () => zoomMap(mapView.zoom * 1.5)));
  [125, 130, 135, 140, 145].forEach((longitude) => {
    const { x } = projectMiniMap({ latitude: MODEL_MAP_BOUNDS.minLatitude, longitude });
    mapContent.append(createElement("line", { x1: x, y1: MODEL_MAP_VIEWBOX.top, x2: x, y2: MODEL_MAP_VIEWBOX.bottom, class: "upper-air-model-grid" }));
  });
  [25, 30, 35, 40, 45].forEach((latitude) => {
    const { y } = projectMiniMap({ latitude, longitude: 122 });
    mapContent.append(createElement("line", { x1: MODEL_MAP_VIEWBOX.left, y1: y, x2: MODEL_MAP_VIEWBOX.right, y2: y, class: "upper-air-model-grid" }));
  });
  const markerPosition = projectMiniMap(selectedModelCoordinates);
  mapContent.append(createElement("circle", { cx: markerPosition.x, cy: markerPosition.y, r: 7, class: "upper-air-model-marker-halo" }));
  mapContent.append(createElement("circle", { cx: markerPosition.x, cy: markerPosition.y, r: 3.5, class: "upper-air-model-marker" }));
  svg.append(mapContent);
  const getMapPoint = (event) => {
    const rectangle = svg.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(MODEL_MAP_VIEWBOX.width, ((event.clientX - rectangle.left) / rectangle.width) * MODEL_MAP_VIEWBOX.width)),
      y: Math.max(0, Math.min(MODEL_MAP_VIEWBOX.height, ((event.clientY - rectangle.top) / rectangle.height) * MODEL_MAP_VIEWBOX.height))
    };
  };
  const selectPoint = (point) => {
    const basePoint = {
      x: mapCenter.x + (point.x - mapCenter.x - mapView.panX) / mapView.zoom,
      y: mapCenter.y + (point.y - mapCenter.y - mapView.panY) / mapView.zoom
    };
    selectedModelCoordinates = {
      longitude: Math.round((MODEL_MAP_BOUNDS.minLongitude + (basePoint.x / MODEL_MAP_VIEWBOX.width) * (MODEL_MAP_BOUNDS.maxLongitude - MODEL_MAP_BOUNDS.minLongitude)) * 4) / 4,
      latitude: Math.round((MODEL_MAP_BOUNDS.maxLatitude - (basePoint.y / MODEL_MAP_VIEWBOX.height) * (MODEL_MAP_BOUNDS.maxLatitude - MODEL_MAP_BOUNDS.minLatitude)) * 4) / 4
    };
    void loadModelProfile();
  };
  const pointers = new Map();
  let gesture = null;
  const beginGesture = () => {
    const points = [...pointers.values()];
    if (points.length === 1) {
      gesture = { type: "pan", point: points[0], panX: mapView.panX, panY: mapView.panY, moved: false };
    } else if (points.length >= 2) {
      const [first, second] = points;
      gesture = {
        type: "pinch",
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        midpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
        zoom: mapView.zoom,
        panX: mapView.panX,
        panY: mapView.panY,
        moved: true
      };
    }
  };
  svg.addEventListener("pointerdown", (event) => {
    svg.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, getMapPoint(event));
    beginGesture();
  });
  svg.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, getMapPoint(event));
    const points = [...pointers.values()];
    if (points.length === 1 && gesture.type === "pan") {
      const point = points[0];
      const deltaX = point.x - gesture.point.x;
      const deltaY = point.y - gesture.point.y;
      if (Math.hypot(deltaX, deltaY) > 2) gesture.moved = true;
      mapView.panX = gesture.panX + deltaX;
      mapView.panY = gesture.panY + deltaY;
      clampMapView();
      applyMapTransform();
    } else if (points.length >= 2 && gesture.type === "pinch") {
      const [first, second] = points;
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const nextZoom = Math.max(1, Math.min(4, gesture.zoom * (distance / Math.max(1, gesture.distance))));
      mapView.zoom = nextZoom;
      mapView.panX = gesture.panX + midpoint.x - gesture.midpoint.x;
      mapView.panY = gesture.panY + midpoint.y - gesture.midpoint.y;
      clampMapView();
      applyMapTransform();
    }
  });
  const endGesture = (event) => {
    const point = getMapPoint(event);
    const wasTap = pointers.size === 1 && gesture?.type === "pan" && !gesture.moved;
    pointers.delete(event.pointerId);
    if (wasTap) selectPoint(point);
    else if (pointers.size) beginGesture();
    else gesture = null;
  };
  svg.addEventListener("pointerup", endGesture);
  svg.addEventListener("pointercancel", endGesture);
  svg.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomMap(mapView.zoom * (event.deltaY < 0 ? 1.18 : 1 / 1.18), getMapPoint(event));
  }, { passive: false });
  applyMapTransform();
  section.append(hint, toolbar, svg);
  void populateModelMap(svg);
  return section;
}

function renderObservation(body, observation) {
  const rows = parseUpperAirTemperatureHumidityHtml(observation.html);
  const profile = buildUpperAirProfile(rows);
  if (profile.length < 8) {
    renderError(body, "気温・湿度の観測データを十分に取得できませんでした。別の地点または次回の観測をお試しください。");
    return;
  }
  const station = UPPER_AIR_STATIONS.find((entry) => entry.id === observation.station);
  const summary = summarizeUpperAirProfile(profile);
  const analysis = analyzeUpperAirProfile(profile);
  const heading = document.createElement("div");
  heading.className = "upper-air-observation-heading";
  const title = document.createElement("div");
  const stationName = document.createElement("strong");
  stationName.textContent = station?.name ?? "観測地点";
  const time = document.createElement("time");
  time.textContent = formatJmaObservationTime(observation.date, observation.hour);
  title.append(stationName, time);
  const source = document.createElement("a");
  source.href = observation.sourceUrl;
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  source.textContent = "気象庁の元データ ↗";
  heading.append(title, source);

  const legend = document.createElement("div");
  legend.className = "upper-air-chart-legend";
  legend.innerHTML = '<span class="upper-air-chart-legend-temperature">気温</span><span class="upper-air-chart-legend-dewpoint">露点温度</span><span class="upper-air-chart-legend-dry">乾燥断熱線</span><span class="upper-air-chart-legend-moist">湿潤断熱線</span><span class="upper-air-chart-legend-mixing">飽和混合比線</span>';

  const chart = document.createElement("div");
  chart.className = "upper-air-chart-wrap";
  chart.append(buildEmagramSvg(profile));

  const stats = document.createElement("section");
  stats.className = "upper-air-stats";
  stats.setAttribute("aria-label", "代表的な観測値");
  stats.append(
    makeStat("地上気温", formatTemperature(summary?.surface.temperature), "℃"),
    makeStat("850 hPa", formatTemperature(summary?.at850?.temperature), "℃"),
    makeStat("500 hPa", formatTemperature(summary?.at500?.temperature), "℃"),
    makeStat("0℃高度", Number.isFinite(summary?.freezingHeight) ? Math.round(summary.freezingHeight).toLocaleString("ja-JP") : null, "m")
  );

  const note = document.createElement("p");
  note.className = "upper-air-note";
  note.textContent = "気温・相対湿度から露点温度を算出して表示しています。背景の断熱線・飽和混合比線は標準大気の計算値です。図は観測時刻の鉛直構造を読むための補助で、危険度の判定や予報ではありません。";
  body.replaceChildren(heading, legend, chart, stats, buildObservationInsights(analysis), note);
}

function renderModelProfile(content, model) {
  const profile = buildUpperAirProfile(model.rows);
  if (profile.length < 8) {
    renderModelError(content, "選択地点のGFS気圧面データを十分に取得できませんでした。別の地点または時間をおいて再度お試しください。");
    return;
  }
  const summary = summarizeUpperAirProfile(profile);
  const analysis = analyzeUpperAirProfile(profile);
  const heading = document.createElement("div");
  heading.className = "upper-air-observation-heading";
  const title = document.createElement("div");
  const place = document.createElement("strong");
  place.textContent = `地点モデル ${formatCoordinates(model.coordinates)}`;
  const time = document.createElement("time");
  const cycleDate = /^\d{8}$/u.test(model.cycle?.date ?? "")
    ? `${model.cycle.date.slice(0, 4)}年${Number(model.cycle.date.slice(4, 6))}月${Number(model.cycle.date.slice(6, 8))}日`
    : "初期時刻を確認中";
  time.textContent = /^\d{2}$/u.test(model.cycle?.hour ?? "")
    ? `${cycleDate} ${model.cycle.hour}時初期値・解析時刻（UTC）`
    : cycleDate;
  title.append(place, time);
  const source = document.createElement("a");
  source.href = model.sourceUrl;
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  source.textContent = "NOAA GFSの元データ ↗";
  heading.append(title, source);

  const legend = document.createElement("div");
  legend.className = "upper-air-chart-legend";
  legend.innerHTML = '<span class="upper-air-chart-legend-temperature">気温</span><span class="upper-air-chart-legend-dewpoint">露点温度</span><span class="upper-air-chart-legend-dry">乾燥断熱線</span><span class="upper-air-chart-legend-moist">湿潤断熱線</span><span class="upper-air-chart-legend-mixing">飽和混合比線</span>';
  const chart = document.createElement("div");
  chart.className = "upper-air-chart-wrap";
  chart.append(buildEmagramSvg(profile));

  const stats = document.createElement("section");
  stats.className = "upper-air-stats";
  stats.setAttribute("aria-label", "代表的なGFS予報値");
  stats.append(
    makeStat("地上付近", formatTemperature(summary?.surface.temperature), "℃"),
    makeStat("850 hPa", formatTemperature(summary?.at850?.temperature), "℃"),
    makeStat("500 hPa", formatTemperature(summary?.at500?.temperature), "℃"),
    makeStat("0℃高度", Number.isFinite(summary?.freezingHeight) ? Math.round(summary.freezingHeight).toLocaleString("ja-JP") : null, "m")
  );
  const note = document.createElement("p");
  note.className = "upper-air-note";
  note.textContent = "NOAA GFS 0.25°の最寄り格子点における解析時刻の数値モデルです。気温・相対湿度から露点温度を算出して表示しています。地点の実測値ではありません。";
  content.replaceChildren();
  buildModelPicker(content);
  content.append(heading, legend, chart, stats, buildObservationInsights(analysis, { isModel: true }), note);
}

function renderError(body, message) {
  const state = document.createElement("div");
  state.className = "upper-air-state";
  const title = document.createElement("strong");
  title.textContent = "高層観測を表示できません";
  const detail = document.createElement("p");
  detail.textContent = message;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "再読み込み";
  retry.addEventListener("click", () => void loadObservation());
  state.append(title, detail, retry);
  body.replaceChildren(state);
}

function renderModelError(content, message) {
  const state = document.createElement("div");
  state.className = "upper-air-state";
  const title = document.createElement("strong");
  title.textContent = "地点モデルを表示できません";
  const detail = document.createElement("p");
  detail.textContent = message;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "再読み込み";
  retry.addEventListener("click", () => void loadModelProfile());
  state.append(title, detail, retry);
  content.replaceChildren();
  buildModelPicker(content);
  content.append(state);
}

function renderLocked(body) {
  const state = document.createElement("div");
  state.className = "upper-air-state upper-air-state-locked";
  const title = document.createElement("strong");
  title.textContent = "アーリーアクセス機能です";
  const detail = document.createElement("p");
  detail.textContent = "エマグラムは試験提供中です。設定でアーリーアクセスを有効にすると、気象庁の高層観測データを表示できます。";
  const settings = document.createElement("button");
  settings.type = "button";
  settings.textContent = "設定を開く";
  settings.addEventListener("click", () => {
    closeUpperAirModal();
    options.onOpenSettings?.();
  });
  state.append(title, detail, settings);
  body.replaceChildren(state);
}

function renderControls(body) {
  const content = buildModeSwitch(body);
  const controls = document.createElement("div");
  controls.className = "upper-air-controls";
  const label = document.createElement("label");
  label.htmlFor = "upper-air-station-select";
  label.textContent = "観測地点";
  const select = document.createElement("select");
  select.id = "upper-air-station-select";
  UPPER_AIR_STATIONS.forEach((station) => {
    const option = document.createElement("option");
    option.value = station.id;
    option.textContent = station.name;
    option.selected = station.id === selectedStationId;
    select.append(option);
  });
  select.addEventListener("change", () => {
    selectedStationId = select.value;
    void loadObservation();
  });
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "upper-air-refresh";
  refresh.setAttribute("aria-label", "高層観測を再読み込み");
  refresh.title = "再読み込み";
  refresh.innerHTML = '<svg class="disaster-dashboard-refresh-icon" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><path d="M20 12a8 8 0 1 1-2.34-5.66L20 8" /><path d="M20 3v5h-5" /></svg>';
  refresh.addEventListener("click", () => void loadObservation());
  controls.append(label, select, refresh);
  content.append(controls);
  return content;
}

function renderModelControls(body) {
  const content = buildModeSwitch(body);
  buildModelPicker(content);
  return content;
}

async function loadObservation() {
  const body = document.getElementById("upper-air-body");
  if (!body) return;
  if (!options.isEarlyAccessEnabled?.()) {
    renderLocked(body);
    return;
  }
  const content = renderControls(body);
  const loading = buildModalLoadingState({
    title: "高層観測を読み込んでいます",
    detail: "気象庁の観測データを確認中です"
  });
  content.innerHTML = loading;
  const currentRequest = ++requestId;
  try {
    const token = getEarlyAccessToken();
    const response = await fetch(`/api/upper-air?station=${encodeURIComponent(selectedStationId)}`, {
      headers: { Accept: "application/json", "X-MeteoScope-Early-Access": token }
    });
    if (!response.ok) throw new Error(`upper-air request failed: ${response.status}`);
    const observation = await response.json();
    if (currentRequest !== requestId) return;
    renderObservation(content, observation);
  } catch (error) {
    console.warn("[MeteoScope] upper-air observation unavailable", error);
    if (currentRequest === requestId) renderError(content, "気象庁の高層観測データに接続できませんでした。時間をおいて再度お試しください。");
  }
}

async function loadModelProfile() {
  const body = document.getElementById("upper-air-body");
  if (!body) return;
  if (!options.isEarlyAccessEnabled?.()) {
    renderLocked(body);
    return;
  }
  const content = renderModelControls(body);
  const loading = buildModalLoadingState({
    title: "GFS地点モデルを読み込んでいます",
    detail: "NOAAの気圧面データを確認中です"
  });
  const state = document.createElement("div");
  state.className = "upper-air-model-loading";
  state.innerHTML = loading;
  content.append(state);
  const currentRequest = ++requestId;
  try {
    const token = getEarlyAccessToken();
    const response = await fetch(`/api/gfs-profile?lat=${encodeURIComponent(selectedModelCoordinates.latitude)}&lon=${encodeURIComponent(selectedModelCoordinates.longitude)}`, {
      headers: { Accept: "application/json", "X-MeteoScope-Early-Access": token }
    });
    if (!response.ok) throw new Error(`GFS profile request failed: ${response.status}`);
    const model = await response.json();
    if (currentRequest !== requestId) return;
    renderModelProfile(content, model);
  } catch (error) {
    console.warn("[MeteoScope] GFS point profile unavailable", error);
    if (currentRequest === requestId) renderModelError(content, "NOAA GFSの地点モデルデータに接続できませんでした。時間をおいて再度お試しください。");
  }
}

export function openUpperAirModal() {
  const modal = document.getElementById("upper-air-modal");
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  document.getElementById("upper-air-button")?.setAttribute("aria-expanded", "true");
  if (selectedMode === "model") void loadModelProfile();
  else void loadObservation();
}

export function closeUpperAirModal() {
  const modal = document.getElementById("upper-air-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.getElementById("upper-air-button")?.setAttribute("aria-expanded", "false");
  if (!document.querySelector(".warning-modal:not([hidden])")) document.body.classList.remove("modal-open");
}

export function setupUpperAirModal(nextOptions = {}) {
  options = nextOptions;
  if (initialized) return;
  initialized = true;
  const button = document.getElementById("upper-air-button");
  const modal = document.getElementById("upper-air-modal");
  if (!button || !modal) return;
  button.addEventListener("click", openUpperAirModal);
  modal.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("[data-upper-air-close]")) closeUpperAirModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeUpperAirModal();
  });
  document.addEventListener("meteoscope:early-access-change", () => {
    const active = Boolean(options.isEarlyAccessEnabled?.());
    button.classList.toggle("is-early-access-locked", !active);
    button.setAttribute("aria-label", active ? "高層気象観測のエマグラムを開く" : "高層気象観測のエマグラムを開く（アーリーアクセス）");
    button.title = active ? "高層気象（エマグラム）" : "高層気象（アーリーアクセス）";
    if (!modal.hidden) {
      if (selectedMode === "model") void loadModelProfile();
      else void loadObservation();
    }
  });
  document.dispatchEvent(new CustomEvent("meteoscope:early-access-change"));
}
