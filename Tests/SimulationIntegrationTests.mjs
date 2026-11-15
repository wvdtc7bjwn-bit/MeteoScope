import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { getWaveDistancesByJma2001 } from "../src/eew/jma2001TravelTime.js";
import { createSimulationMapOverlay } from "../src/map/simulationOverlay.js";
import { exposedWavefrontArcs } from "../src/simulation/wavefrontGeometry.js";
import { destinationPoint } from "../src/typhoonGeometry.js";
import { unwrapLineAtAntimeridian } from "../src/map/geoLine.js";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const displayed = app.slice(app.indexOf("  function getDisplayedEewEvents("), app.indexOf("  function requestEewWaveFrame("));
const fake = { eventId: "simulation", isSimulation: true };
const real = { eventId: "real" };
const ctx = vm.createContext({ simulationEewEvent: fake, localEewTestEvent: null, eewState: { activeEvents: [] } });
vm.runInContext(displayed, ctx);
assert.equal(ctx.getDisplayedEewEvents()[0], fake);
ctx.eewState.activeEvents = [real]; assert.equal(ctx.getDisplayedEewEvents()[0], real, "real EEW takes precedence immediately");
let stops = 0;
Object.assign(ctx, { earlyAccessEnabled: true, activeTab: "radar", selectedEewEventId: "", simulationController: { active: true, stop() { stops++; ctx.simulationEewEvent = null; } },
  syncEewConnectionIndicator() {}, syncEewAlertIndicator() {}, syncEewWaveAnimation() {}, showMobileEarthquakeSummaryPage() {} });
const handler = app.slice(app.indexOf("  function handleEewUpdate("), app.indexOf("  function syncEewEarlyAccess("));
vm.runInContext(handler, ctx);
ctx.handleEewUpdate({ activeEvents: [real] });
assert.equal(stops, 1); assert.equal(ctx.getDisplayedEewEvents()[0], real);

const mapSource = readFileSync(new URL("../src/map/weatherMap.js", import.meta.url), "utf8");
const featureBuilder = mapSource.slice(mapSource.indexOf("function createEewFeatureCollection("), mapSource.indexOf("function getJma2001WaveDistances("));
const mapCtx = vm.createContext({ getJma2001WaveDistances: getWaveDistancesByJma2001, exposedWavefrontArcs, unwrapLineAtAntimeridian, createGeodesicCircle: (center, radius) => { const ring = Array.from({length: 96}, (_, i) => destinationPoint(center, radius, i * 360 / 96)); return [...ring, ring[0]]; } });
vm.runInContext(featureBuilder, mapCtx);
const simulationEvent = { coordinates: [140, 36], eventId: "s", isSimulation: true, canRenderWaves: true, depth: 20, simulationElapsedSeconds: 30, simulationWaveSources: [{ coordinates: [140, 36], ruptureDelaySec: 0 }, { coordinates: [141, 37], ruptureDelaySec: 40 }] };
const paused1 = mapCtx.createEewFeatureCollection([simulationEvent], 1);
const paused2 = mapCtx.createEewFeatureCollection([simulationEvent], Date.now());
assert.equal(JSON.stringify(paused1), JSON.stringify(paused2), "paused wave fronts ignore real clock");
assert.equal(paused1.features.filter(f => f.properties.featureType === "wave-fill").length, 2, "unruptured source emits no waves");
simulationEvent.simulationWaveDepthKm = 20;
simulationEvent.depth = 70;
assert.equal(JSON.stringify(mapCtx.createEewFeatureCollection([simulationEvent], 1)), JSON.stringify(paused1), "EEW depth revisions never move simulated wave fronts");
simulationEvent.simulationElapsedSeconds = 60;
assert.equal(mapCtx.createEewFeatureCollection([simulationEvent]).features.filter(f => f.properties.featureType === "wave-fill").length, 4, "ruptured sources emit P and S waves");
const live = { coordinates: [140, 36], eventId: "real", canRenderWaves: true, depth: 20, originTime: new Date(100000).toISOString() };
assert.notEqual(JSON.stringify(mapCtx.createEewFeatureCollection([live], 130000)), JSON.stringify(mapCtx.createEewFeatureCollection([live], 160000)), "real EEW clock is unchanged");

const sources = new Map(); const layers = new Map([["eew-wave-fill", {}]]); const listeners = new Map();
const canvas = { style: { cursor: "" } };
const map = {
  getLayer: id => layers.get(id), getSource: id => sources.get(id), getCanvas: () => canvas,
  addSource(id, source) { sources.set(id, { data: source.data, setData(data) { this.data = data; } }); },
  addLayer(layer) { layers.set(layer.id, { ...layer, visibility: "visible" }); },
  setPaintProperty() {}, setLayoutProperty(id, prop, value) { layers.get(id)[prop] = value; },
  on(type, ...args) { listeners.set(`${type}:${args.length === 2 ? args[0] : "map"}`, args.at(-1)); },
  off(type, fn) { if (listeners.get(`${type}:map`) === fn) listeners.delete(`${type}:map`); }
};
const overlay = createSimulationMapOverlay(() => map, () => {}, () => {});
assert.equal(sources.size, 0, "simulation sources do not delay initial map loading");
const frame = { elapsed: 3, stations: { type: "FeatureCollection", features: [] }, fault: { type: "FeatureCollection", features: [] } };
overlay.render(frame); assert.equal(overlay.active, true); assert.equal(sources.size, 2);
assert.equal(layers.has("simulation-station-pulse"), false, "no decorative station halo or pulsing layer");
assert.equal(layers.get("simulation-station-labels").layout["text-field"], undefined, "circle and number are a single sprite, not independently positioned layers");
assert.deepEqual(layers.get("simulation-station-labels").layout["icon-offset"], [0, 0]);
overlay.render(frame); assert.equal(sources.size, 2, "no duplicate source or layer on subsequent frames");
let chosen;
overlay.pick(point => { chosen = point; }); assert.equal(canvas.style.cursor, "crosshair");
listeners.get("click:map")({ lngLat: { lng: 140.1, lat: 36.2 } });
assert.ok(Math.abs(chosen[0] - 140.1) < 1e-8); assert.equal(chosen[1], 36.2); assert.equal(canvas.style.cursor, "");
overlay.pick(() => { throw new Error("canceled pick"); }); overlay.clear();
assert.equal(listeners.has("click:map"), false); assert.equal(overlay.active, false);
assert.ok([...layers].filter(([id]) => id.startsWith("simulation-")).every(([, layer]) => layer.visibility === "none"));
assert.ok([...sources.values()].every(source => source.data.features.length === 0));
console.log("Simulation integration: real EEW priority, virtual waves, map cleanup and one-shot selection passed");
