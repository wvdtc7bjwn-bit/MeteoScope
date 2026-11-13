// Local-only fixture. It imports the real weather-map module, observes its real
// MapLibre instance, and never logs in, posts, or changes production data.
import maplibre from "maplibre-gl";
import { createWeatherMap } from "../../src/map/weatherMap.js";
import { WARNING_GEOMETRY_FIX_CODES } from "../../src/map/warningGeometryFixCodes.js";
import { municipalityStateTarget } from "../../src/map/baseMapTiles.js";

const scenario = new URLSearchParams(location.search).get("case");
const nativeFetch = window.fetch.bind(window);
let tilePending = 0;
window.fetch = async (input, options) => {
  if (!String(input).endsWith(".pbf")) return nativeFetch(input, options);
  tilePending++;
  try {
    if (scenario === "slow" || scenario === "timeout") {
      await new Promise(resolve => setTimeout(resolve, scenario === "slow" ? 2500 : 12000));
    }
    if (scenario === "fail") return new Response("QA tile failure", {status: 503});
    return await nativeFetch(input, options);
  } finally { tilePending--; }
};

const OriginalMap = maplibre.Map;
let engine;
maplibre.Map = class extends OriginalMap {
  constructor(options) {
    super(options);
    engine = this;
    if (scenario === "optional") this.once("style.load", () => {
      this.addSource("qa-optional", {type: "geojson", data: "/qa-optional.geojson"});
      this.addLayer({id: "qa-optional", type: "fill", source: "qa-optional"});
    });
  }
};
const optionalPending = () => !!engine.getSource("qa-optional") && !engine.isSourceLoaded("qa-optional");
const renderedCount = () => engine.queryRenderedFeatures({layers: ["jma-municipality-fill"]}).length;
const view = createWeatherMap("map");
view.initialize();
let ready = null;
let readySnapshot = null;
view.whenReady().then(value => {
  ready = value;
  readySnapshot = {at: Math.round(performance.now()), tilePending, optionalPending: optionalPending(), rendered: renderedCount()};
  document.querySelector("#loading").hidden = value;
  document.querySelector("#loading").textContent = value ? "" : "読み込み失敗";
});

const areas = WARNING_GEOMETRY_FIX_CODES.map(areaCode => ({areaCode, areaName: areaCode, level: "warning"}));
function renderWarningData(early = false, clear = false) {
  view.setMode("warnings");
  view.renderData("warnings", {
    activeAreas: clear ? [] : areas,
    earlyMunicipalityAreas: clear ? [] : areas.map(area => ({...area, level: "high"})),
    activeWarningView: early ? "early" : "status"
  });
  if (clear) view.prepareWarningData({activeAreas: [], earlyMunicipalityAreas: []});
}
let selected = "";
window.addEventListener("weather-warning-area-select", event => { selected = event.detail.areaCode; });
document.querySelector("#aomori").onclick = () => engine.jumpTo({center: [140.74, 40.82], zoom: 10});
document.querySelector("#warn").onclick = () => renderWarningData();
document.querySelector("#early").onclick = () => renderWarningData(true);
document.querySelector("#clear").onclick = () => renderWarningData(false, true);
let light = false;
document.querySelector("#theme").onclick = () => view.setTheme((light = !light) ? "light" : "dark");
document.querySelector("#tabs").onclick = () => {
  view.setMode("earthquake");
  setTimeout(() => view.setMode("warnings"), 400);
};
const interval = setInterval(() => {
  document.querySelector("#result").textContent = JSON.stringify({
    ready, state: document.querySelector("#map").dataset.initialGeometryState,
    tilePending, optionalPending: optionalPending(), readySnapshot, selected,
    fixSource: !!engine.getSource("jma-weather-warning-municipality-fixes"), rendered: renderedCount(),
    states: WARNING_GEOMETRY_FIX_CODES.map(id => [id, engine.getFeatureState(municipalityStateTarget(id, true))]),
    marks: performance.getEntriesByType("mark").map(mark => [mark.name, Math.round(mark.startTime)])
  });
}, 250);
window.addEventListener("pagehide", () => { clearInterval(interval); engine.remove(); }, {once: true});
