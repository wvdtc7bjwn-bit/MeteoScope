import { escapeHtmlPadded as escapeHtml } from "../utils/html.js";

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
    map.addLayer({ id: LAYERS[2], type: "circle", source: STATIONS, paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, ["case", ["get", "arrived"], 3, 1.5], 7, ["case", ["get", "arrived"], 7, 2.5], 10, ["case", ["get", "arrived"], 10, 3]],
      "circle-color": ["get", "color"], "circle-opacity": ["case", ["get", "arrived"], 1, .25],
      "circle-stroke-width": 1, "circle-stroke-color": "#26374a", "circle-color-transition": { duration: 0 }, "circle-radius-transition": { duration: 0 }, "circle-opacity-transition": { duration: 0 }
    } });
    map.addLayer({ id: LAYERS[3], type: "symbol", source: STATIONS, minzoom: 6, filter: ["!=", ["get", "intensity"], "0"], layout: {
      "text-field": ["get", "intensity"], "text-font": ["Noto Sans JP"], "text-size": 10, "text-allow-overlap": false
    }, paint: { "text-color": ["get", "textColor"] } });
    map.on("click", LAYERS[2], event => {
      if (!active || pickHandler) return;
      const feature = event.features?.[0];
      if (!feature) return;
      const p = feature.properties;
      const seconds = value => value != null && Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} s` : "—";
      showInfo(event.lngLat, `<strong>${escapeHtml(p.name)}</strong><br>SIMULATION · ${escapeHtml(p.intensity)}<br>P: ${seconds(p.pArrivalSec)} / S: ${seconds(p.sArrivalSec)}<br><small>WE-Simulator / MeteoScope</small>`);
    });
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
