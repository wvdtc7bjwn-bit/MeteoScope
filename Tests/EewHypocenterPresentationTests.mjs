import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createExpression } from "@maplibre/maplibre-gl-style-spec";
import { createLocalEewTestEvent } from "../src/eew/localEewTest.js";
import { normalizeWolfxEew } from "../src/eew/wolfxEew.js";
import { localizeText } from "../src/ui/locale.js";

const now = Date.parse("2026-11-15T12:00:00+09:00");
const source = readFileSync(new URL("../src/map/weatherMap.js", import.meta.url), "utf8");
const layers = new Map();
let waveCalls = 0;
let language = "ja";
const context = vm.createContext({ map: { addLayer: layer => layers.set(layer.id, layer) }, EEW_SOURCE_ID: "eew", localizeText: value => localizeText(value, language),
  getJma2001WaveDistances: () => { waveCalls++; return { pDistanceKm: 10, sDistanceKm: 5 }; },
  createGeodesicCircle: () => [[0, 0], [1, 0], [1, 1], [0, 0]] });
vm.runInContext(source.slice(source.indexOf("const HYPOCENTER_CROSS_TEXT_SIZE ="), source.indexOf("let jma2001WaveDistanceCalculator")), context);
for (const id of ["eew-hypocenter-cross", "eew-hypocenter-note"]) {
  const position = source.indexOf(`id: "${id}"`);
  const start = source.lastIndexOf("    map.addLayer({", position);
  vm.runInContext(source.slice(start, source.indexOf("\n    });", position) + 8), context);
}
vm.runInContext(source.slice(source.indexOf("function createEewFeatureCollection("), source.indexOf("function getJma2001WaveDistances(")), context);
const frame = event => context.createEewFeatureCollection([event], now);
const style = (expression, feature) => {
  const compiled = createExpression(expression);
  assert.equal(compiled.result, "success");
  return compiled.value.evaluate({ zoom: 6 }, feature);
};
const marker = layers.get("eew-hypocenter-cross"), note = layers.get("eew-hypocenter-note");
const one = createLocalEewTestEvent("transition-one", { now });
const first = frame(one).features[0];
assert.equal(one.isAssumption, false, "one-point estimates retain the reported M/depth rather than becoming assumed values");
assert.equal(one.canRenderWaves, false);
assert.equal(first.properties.positionLabel, "1点検知・初期推定");
assert.equal(style(marker.layout["text-field"], first), "◌");
assert.equal(style(marker.paint["text-color"], first), "#f2b84b");
assert.equal(style(note.filter, first), true);
assert.equal(waveCalls, 0, "one-point cases do not enter wave rendering");

const multiple = createLocalEewTestEvent("transition-one", { now, step: 1 });
assert.equal(one.eventId, multiple.eventId);
const updated = frame(multiple);
assert.equal(updated.features[0].properties.uncertain, false);
assert.equal(style(marker.layout["text-field"], updated.features[0]), "×");
assert.equal(style(marker.paint["text-color"], updated.features[0]), "#e3342f");
assert.equal(style(note.filter, updated.features[0]), false, "the earlier one-point label is removed on update");
assert.equal(updated.features.filter(f => f.properties.waveType).length, 2, "usable later estimates can draw P/S waves");

for (const scenario of ["assumption", "plum"]) {
  const event = createLocalEewTestEvent(scenario, { now });
  const features = frame(event).features;
  assert.equal(features.length, 1);
  assert.equal(features[0].properties.uncertain, true);
  assert.equal(features[0].properties.positionLabel, "仮定位置");
}
const plumOnly = normalizeWolfxEew({ EventID: "plum-only", OriginalText: "PLUM法による緊急地震速報（警報）", Latitude: 36, Longitude: 140 }, { receivedAt: now });
const level = createLocalEewTestEvent("level", { now });
const levelFeatures = frame(level).features;
assert.equal(levelFeatures.length, 1, "CodeType level reports with compatible source values must not draw waves");
assert.equal(style(marker.layout["text-field"], levelFeatures[0]), "◌");
assert.equal(levelFeatures[0].properties.positionLabel, "震源調査中");
assert.equal(level.isAssumption, false);
assert.equal(frame(plumOnly).features[0].properties.positionLabel, "仮定位置");
assert.equal(frame({ ...plumOnly, coordinates: null }).features.length, 0, "never fabricate a location without coordinates");
assert.equal(frame({ ...one, isCancel: true }).features.length, 0, "cancellation removes both the marker and its label");
assert.equal(frame(createLocalEewTestEvent("forecast", { now })).features[0].properties.uncertain, false, "serial 1 is not proof of one-point detection");
assert.equal(frame(createLocalEewTestEvent("mixed", { now })).features[0].properties.uncertain, false, "mixed PLUM/IPF is not classified as an assumed position");
language = "en";
assert.equal(frame(one).features[0].properties.positionLabel, "Single-station detection / initial estimate");
assert.equal(frame(plumOnly).features[0].properties.positionLabel, "Assumed position");
assert.equal(frame(level).features[0].properties.positionLabel, "Hypocenter under investigation");
console.log("EEW marker: evaluated dotted/yellow/label styles, one-to-multiple replacement, P/S gates, PLUM distinction, absent coordinates, cancellation and English labels passed");
