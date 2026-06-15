import L from "leaflet";
import { DEFAULT_VIEW } from "../config.js";

const MODE_CLASS = {
  radar: "mode-radar",
  amedas: "mode-amedas",
  warnings: "mode-warnings",
  typhoon: "mode-typhoon"
};

export function createWeatherMap(elementId) {
  let map = null;
  let modeLayer = null;
  let sampleLayer = null;

  function initialize() {
    map = L.map(elementId, {
      zoomControl: false,
      attributionControl: false,
      minZoom: DEFAULT_VIEW.minZoom,
      maxZoom: DEFAULT_VIEW.maxZoom
    }).setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
      maxZoom: 18,
      opacity: 0.92
    }).addTo(map);

    sampleLayer = L.layerGroup().addTo(map);
    setMode("radar");
  }

  function setMode(mode) {
    const container = map?.getContainer();
    if (!container) return;
    Object.values(MODE_CLASS).forEach((className) => container.classList.remove(className));
    container.classList.add(MODE_CLASS[mode] ?? MODE_CLASS.radar);
    sampleLayer?.clearLayers();
  }

  function renderData(mode, data) {
    if (!map || !sampleLayer) return;
    sampleLayer.clearLayers();

    if (mode === "radar") {
      renderRadarPlaceholder(data);
    } else if (mode === "amedas") {
      renderAmedasPlaceholder(data);
    } else if (mode === "warnings") {
      renderWarningPlaceholder(data);
    } else if (mode === "typhoon") {
      renderTyphoonPlaceholder(data);
    }
  }

  function renderRadarPlaceholder(data) {
    L.circle([35.6812, 139.7671], {
      radius: 90000,
      weight: 2,
      fillOpacity: 0.18
    }).bindPopup(`雨雲レーダー<br>${data?.latestTime ?? "時刻未取得"}`).addTo(sampleLayer);
  }

  function renderAmedasPlaceholder(data) {
    const points = [
      [43.0642, 141.3469, "札幌"],
      [35.6812, 139.7671, "東京"],
      [34.6937, 135.5023, "大阪"],
      [33.5902, 130.4017, "福岡"]
    ];

    points.forEach(([lat, lng, name]) => {
      L.circleMarker([lat, lng], {
        radius: 8,
        weight: 2,
        fillOpacity: 0.75
      }).bindPopup(`${name}<br>アメダス最新時刻: ${data?.latestTime ?? "未取得"}`).addTo(sampleLayer);
    });
  }

  function renderWarningPlaceholder(data) {
    L.rectangle([[34.2, 135.0], [35.1, 136.2]], {
      weight: 2,
      fillOpacity: 0.22
    }).bindPopup(`警報・注意報<br>${data?.summary ?? "市区町村GeoJSON接続待ち"}`).addTo(sampleLayer);
  }

  function renderTyphoonPlaceholder(data) {
    const line = L.polyline([
      [20.5, 132.0],
      [23.5, 134.0],
      [27.0, 136.0],
      [31.0, 138.0]
    ], { weight: 3 }).bindPopup(`台風情報<br>${data?.summary ?? "台風データ接続待ち"}`);
    line.addTo(sampleLayer);
  }

  return { initialize, setMode, renderData };
}
