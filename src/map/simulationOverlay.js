import { escapeHtmlPadded as escapeHtml } from "../utils/html.js";
import { EARTHQUAKE_STATION_INTENSITY_MARKER_IMAGE_ID } from "./earthquakeMarkerIds.js";
import { localizeText, getCurrentLanguage } from "../ui/locale.js";

const STATIONS = "earthquake-simulation-stations";
const FAULT = "earthquake-simulation-fault";
const LAYERS = ["simulation-fault-area", "simulation-rupture-points", "simulation-station-points", "simulation-station-labels"];
const EMPTY = { type: "FeatureCollection", features: [] };

export function createSimulationMapOverlay(getMap, showInfo, hideInfo) {
  let active = false;
  let pickHandler = null;
  let previousCursor = "";
  const cancelPick = () => {
    const map = getMap();
    if (map && pickHandler) {
      map.off("click", pickHandler);
      map.getCanvas().style.cursor = previousCursor;
    }
    pickHandler = null;
  };
  const ensureLayers = () => {
    const map = getMap();
    if (!map?.getLayer("eew-wave-fill")) return false;
    if (map.getSource(STATIONS)) return true;
    map.addSource(STATIONS, { type: "geojson", data: EMPTY });
    map.addSource(FAULT, { type: "geojson", data: EMPTY });
    const before = map.getLayer("eew-wave-fill") ? "eew-wave-fill" : undefined;
    map.addLayer({ id: LAYERS[0], type: "fill", source: FAULT, filter: ["==", ["get", "kind"], "area"], paint: { "fill-color": "#c68bff", "fill-opacity": .14, "fill-outline-color": "#b861ed" } }, before);
    map.addLayer({ id: LAYERS[1], type: "circle", source: FAULT, filter: ["==", ["get", "kind"], "rupture"], paint: { "circle-radius": 4, "circle-color": ["case", ["get", "ruptured"], "#ff6a3d", "#a28cb1"], "circle-stroke-width": 1, "circle-stroke-color": "#ffffff" } });
    const currentArrival = ["all", ["get", "arrived"], ["!", ["get", "settled"]]];
    map.addLayer({ id: LAYERS[2], type: "circle", source: STATIONS, filter: ["==", ["get", "intensity"], "0"], paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, ["case", currentArrival, 3, 1.5], 7, ["case", currentArrival, 7, 2.5], 10, ["case", currentArrival, 10, 3]],
      "circle-color": ["get", "color"], "circle-opacity": ["case", currentArrival, 1, .25],
      "circle-stroke-width": 1, "circle-stroke-color": "#26374a", "circle-color-transition": { duration: 0 }, "circle-radius-transition": { duration: 0 }, "circle-opacity-transition": { duration: 0 }
    } });
    // Reuse the normal earthquake sprites: circle and numeral are one image,
    // so dense markers cannot show another feature's text over a neighboring circle.
    map.addLayer({ id: LAYERS[3], type: "symbol", source: STATIONS, filter: ["!=", ["get", "intensity"], "0"], layout: {
      "icon-image": ["concat", EARTHQUAKE_STATION_INTENSITY_MARKER_IMAGE_ID, ["get", "intensity"]],
      "icon-anchor": "center", "icon-offset": [0, 0],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 3, .115, 7, .269, 10, .385],
      "icon-allow-overlap": true, "icon-ignore-placement": true, "icon-padding": 0,
      "symbol-sort-key": ["coalesce", ["get", "intensityRank"], 0]
    } });
    const onStationClick = event => {
      if (!active || pickHandler) return;
      const feature = event.features?.[0];
      if (!feature) return;
      const p = feature.properties;
      const seconds = value => value != null && Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} s` : "—";
      const ground = Number.isFinite(Number(p.groundArv)) && Number(p.groundArv) > 0 ? `ARV ${escapeHtml(p.groundArv)} · J-SHIS / WE-Simulator (1 km)` : escapeHtml(localizeText("地盤補正なし"));
      const english = getCurrentLanguage() === "en";
      const known = p.intensityEstimateAvailable !== false;
      const availability = !known ? `<br>${english ? "Deep approximation unavailable: intensity not estimated" : "深発近似データ未取得：震度推定なし"}`
        : p.deepApproximation ? `<br>${english ? "Educational deep approximation" : "深発近似（学習用・異常震域は概算）"}` : "";
      showInfo(event.lngLat, `<strong>${escapeHtml(p.name)}</strong><br>SIMULATION · ${english ? "Current shaking" : "現在の揺れ"}: ${escapeHtml(known ? p.intensity : "—")}<br>${english ? "Recorded maximum" : "記録最大"}: ${escapeHtml(known ? p.recordedIntensity ?? p.intensity : "—")}${availability}<br>P: ${seconds(p.pArrivalSec)} / S: ${seconds(p.sArrivalSec)}<br><small>${ground}</small>`);
    };
    map.on("click", LAYERS[2], onStationClick);
    map.on("click", LAYERS[3], onStationClick);
    return true;
  };
  return {
    get active() { return active; },
    render(frame) {
      if (!ensureLayers()) return false;
      const map = getMap();
      active = true;
      map.getSource(STATIONS).setData(frame.stations);
      map.getSource(FAULT).setData(frame.fault);
      LAYERS.forEach(id => map.setLayoutProperty(id, "visibility", "visible"));
      return true;
    },
    clear() {
      active = false;
      cancelPick();
      hideInfo();
      const map = getMap();
      if (!map?.getSource(STATIONS)) return;
      map.getSource(STATIONS).setData(EMPTY);
      map.getSource(FAULT).setData(EMPTY);
      LAYERS.forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none"); });
    },
    pick(onPick) {
      cancelPick();
      const map = getMap();
      if (!map) return false;
      previousCursor = map.getCanvas().style.cursor;
      map.getCanvas().style.cursor = "crosshair";
      pickHandler = event => {
        const coordinates = [((event.lngLat.lng + 540) % 360) - 180, event.lngLat.lat];
        cancelPick();
        onPick(coordinates);
      };
      map.on("click", pickHandler);
      return true;
    },
    cancelPick
  };
}
