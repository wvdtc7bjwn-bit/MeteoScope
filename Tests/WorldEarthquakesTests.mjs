import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { formatWorldEarthquakeDepth, getWorldEarthquakePlace, normalizeWorldEarthquakes } from "../src/earthquake/worldEarthquakes.js";
import japanesePlaces from "../src/earthquake/worldEarthquakePlacesJa.generated.js";
import { escapeHtmlString as escapeHtml } from "../src/utils/html.js";
import { buildRecentEarthquakeScopeToggle, buildWorldEarthquakesList, getWorldEarthquakeStatusText } from "../src/ui/panels/worldEarthquakesPanel.js";

const time = Date.parse("2026-11-27T15:05:00Z");
function event(id, properties = {}, coordinates = [179.5, 52.2, 0]) {
  return {
    type: "Feature",
    id,
    properties: { type: "earthquake", mag: 4.5, time, ...properties },
    geometry: { type: "Point", coordinates }
  };
}

const events = normalizeWorldEarthquakes({
  type: "FeatureCollection",
  features: [
    event("us01", { place: "Old name", updated: time + 1000 }),
    event("us02", { time: time + 2000, mag: 6.3, place: "<img>", mmi: 5.2 }, [-179.5, -32, null]),
    event("us01", { place: "Revised name", updated: time + 3000 }),
    event("small", { mag: 4.49 }),
    event("missing", { time: null }),
    event("invalid", {}, [0, 91, 9]),
    event("other", { type: "quarry blast", mag: 4.8 }),
    event("deleted", { status: "deleted" })
  ]
});

assert.deepEqual(events.map(({ id }) => id), ["us02", "us01"]);
assert.equal(events[1].place, "Revised name");
assert.equal(events[1].depthKm, 0);
assert.equal(events[0].depthKm, null);
assert.deepEqual(events[0].coordinates, [-179.5, -32]);
assert.match(events[0].eventTime, /2026\/11\/28.*00:05/u, "display uses JST across midnight");
assert.equal(events[0].datetime, "2026-11-27T15:05:02.000Z");
assert.throws(() => normalizeWorldEarthquakes({ features: [] }), /Invalid USGS/u);

const translatedPlaces = [
  ["62 km NNW of Yelizovo, Russia", "ロシア・エリゾボの北北西62km"],
  ["26 km NNW of Cuya, Chile", "チリ・クヤの北北西26km"],
  ["off the coast of Chile", "チリ沖"],
  ["northeast of Taiwan", "台湾の北東方"],
  ["Kermadec Islands, New Zealand region", "ニュージーランド・ケルマデック諸島周辺"],
  ["Mauritius - Reunion region", "モーリシャス・レユニオン周辺"],
  ["10 km W of Cuya, Fiji", "フィジー・Cuyaの西10km"],
  ["52 km E of made-up locality, Chile", "チリ・made-up localityの東52km"],
  ["Unknown River", "Unknown River"]
];
const localizedEvents = normalizeWorldEarthquakes({
  type: "FeatureCollection",
  features: translatedPlaces.map(([place], index) => event(`place${index}`, { place }))
}, japanesePlaces);
for (const [index, [english, japanese]] of translatedPlaces.entries()) {
  assert.equal(getWorldEarthquakePlace(localizedEvents[index], true), english);
  assert.equal(getWorldEarthquakePlace(localizedEvents[index], false), japanese);
}

const list = buildWorldEarthquakesList({ status: "ok", events }, "us02");
assert.match(list, /data-world-earthquake-id="us02" aria-pressed="true"/u);
assert.match(list, /https:\/\/earthquake\.usgs\.gov\/earthquakes\/eventpage\/us02\/executive/u);
assert.match(list, /MMI<\/abbr> 5\.2/u);
assert.match(list, /&lt;img&gt;/u);
assert.match(buildWorldEarthquakesList({ status: "error", events: [] }), /data-world-earthquakes-retry/u);
const localizedState = { status: "ok", events: localizedEvents };
assert.match(buildWorldEarthquakesList(localizedState, "place0"), /ロシア・エリゾボの北北西62km/u);
const compactScope = buildRecentEarthquakeScopeToggle("japan", true);
assert.match(compactScope, /aria-pressed="true">JMA<\/button>/u);
assert.match(compactScope, /aria-pressed="false">USGS<\/button>/u);
const detailScope = buildRecentEarthquakeScopeToggle("world");
assert.match(detailScope, /aria-pressed="false">JMA<\/button>/u);
assert.match(detailScope, /aria-pressed="true">USGS<\/button>/u);

const panel = readFileSync(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8");
const context = vm.createContext({
  escapeHtml, formatWorldEarthquakeDepth, getWorldEarthquakePlace, getWorldEarthquakeStatusText,
  getCurrentLanguage: () => "ja", localizeText: (text) => text, formatMobileEarthquakeTime: (text) => text
});
vm.runInContext(panel.slice(panel.indexOf("function buildMobileDockLoadingStatus("),
  panel.indexOf("function getActiveTyphoonSelection(")), context);
vm.runInContext(panel.slice(panel.indexOf("function buildMobileEarthquakeEventText("),
  panel.indexOf("function buildEarthquakeMobileRecentContent(")), context);
const summary = context.buildWorldEarthquakeEventSummary({ status: "ok", events }, "us01");
assert.match(summary, /発生時刻：[^]*Revised name[^]*M4\.5[^]*深さ0km/u);
assert.doesNotMatch(summary, /最大震度|mobile-dock-earthquake-intensity|MMI/u);
assert.match(context.buildWorldEarthquakeEventSummary(localizedState, "place0"), /ロシア・エリゾボの北北西62km/u);
assert.match(context.buildWorldEarthquakeEventSummary({ status: "loading" }),
  /mobile-dock-loading-status[^]*USGSの地震情報を読み込み中/u);
assert.doesNotMatch(context.buildWorldEarthquakeEventSummary({ status: "error" }), /mobile-dock-loading-status/u);
assert.doesNotMatch(context.buildWorldEarthquakeEventSummary({ status: "ok", events: [] }), /mobile-dock-loading-status/u);
assert.match(context.buildWorldEarthquakeEventSummary({ ...localizedState, status: "refreshing" }), /エリゾボ/u);

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const map = readFileSync(new URL("../src/map/weatherMap.js", import.meta.url), "utf8");
const cameraMoves = [];
const refreshedSelections = [];
let mapClick;
const selection = vm.createContext({
  window: new EventTarget(), CustomEvent,
  isWorldEarthquakeView: () => true,
  worldEarthquakeState: { events }, selectedWorldEarthquakeId: "us02",
  refreshWorldEarthquakeView() { refreshedSelections.push(selection.selectedWorldEarthquakeId); },
  weatherMap: { flyToLocation: (coordinates) => cameraMoves.push(coordinates) },
  customization: { controls: { earthquakeZoom: 7.4 } },
  activeMode: "earthquake", EARTHQUAKE_INTERACTIVE_LAYERS: ["sample-circle"],
  map: { on(type, layer, listener) { if (type === "click" && layer === "sample-circle") mapClick = listener; } },
  showMapInfo() {}
});
vm.runInContext(app.slice(app.indexOf("  function selectWorldEarthquake("),
  app.indexOf("  async function ensureEarthquakeDistributionPlateData(")), selection);
vm.runInContext(app.slice(app.indexOf('    window.addEventListener("world-earthquake-select"'),
  app.indexOf('    window.addEventListener("earthquake-history-select"')), selection);
vm.runInContext(map.slice(map.indexOf("  function setupEarthquakeDistributionInfo("),
  map.indexOf("  function setupMapInfo(")), selection);
selection.setupEarthquakeDistributionInfo();
mapClick({ features: [{ properties: { markerType: "world-earthquake", worldEarthquakeId: "us01", popup: "USGS" } }] });
assert.deepEqual(refreshedSelections, ["us01"], "map clicks refresh the summary and selection");
assert.deepEqual(cameraMoves, [], "map clicks keep the current viewport");
selection.selectWorldEarthquake("us01");
assert.deepEqual(cameraMoves, [[179.5, 52.2]], "list selection still focuses an already-selected epicenter");

console.log("World earthquakes: data, presentation and map-to-summary selection tests passed");
