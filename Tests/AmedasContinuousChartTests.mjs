import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { combineAmedasDailySeries, formatAmedasChartDate, splitAmedasChartSegments, findNearestAmedasObservation, getAmedasChartAxis, AMEDAS_CHART_LAYOUT, AMEDAS_SUMMARY_CHART_LAYOUT } from "../src/amedasChart.js";
import { loadAmedasChartDisplay, saveAmedasChartDisplay } from "../src/preferences/amedasChart.js";
import { fetchAmedasChartSeries } from "../src/jma/amedas.js";
import { bindAmedasChartInspection } from "../src/ui/amedasChartInspection.js";

const dates = ["20261231", "20270101"];
const previous = { points: [{minute: 1430, value: -5, label: "23:50"}], latest: {value: -5}, temperatureNormal: {minimum: -10, maximum: 5, period: "1991-2020"} };
const current = { points: [{minute: 0, value: 0, label: "00:00"}, {minute: 10, value: 2, label: "00:10"}], latest: {value: 2, label: "00:10"}, temperatureNormal: {minimum: -9, maximum: 6, period: "1991-2020"} };
const merged = combineAmedasDailySeries(previous, current, dates);
assert.deepEqual(merged.points.map(point => point.minute), [1430, 1440, 1450]);
assert.deepEqual(merged.points.map(point => point.label), ["12/31 23:50", "1/1 00:00", "1/1 00:10"]);
assert.equal(merged.latest, current.latest);
assert.equal(merged.min, -5); assert.equal(merged.max, 2);
assert.equal(previous.points[0].minute, 1430, "The daily cache must not be mutated");
assert.equal(splitAmedasChartSegments(merged.points, "value", "temperature").length, 1, "A midnight interval joins continuously");
assert.equal(findNearestAmedasObservation(merged.points, 1441).value, 0);
const gap = combineAmedasDailySeries({...previous, points: [{minute: 1200, value: 1, label: "20:00"}]}, current, dates);
assert.equal(splitAmedasChartSegments(gap.points, "value", "temperature").length, 2, "Do not invent a line across missing observations");
assert.equal(combineAmedasDailySeries(previous, null, dates).latest, null, "Yesterday's final value is never shown as current");
assert.deepEqual(combineAmedasDailySeries(null, current, dates).unavailableDates, [dates[0]]);

// Pointer coordinates and the guide use the same 48-hour scale.
const nativeElement = globalThis.Element;
globalThis.Element = class {};
try {
  const listeners = new Map();
  const time = {}, value = {}, small = {};
  const reading = {querySelector: selector => ({time, strong: value, small})[selector]};
  const line = {setAttribute() {}}, dot = {setAttribute() {}};
  const guide = {style: {}, querySelector: selector => selector === "line" ? line : dot};
  const plot = Object.assign(new Element(), {
    closest: () => plot, getBoundingClientRect: () => ({left: 0, width: 320}),
    dataset: {axisMin: "-10", axisMax: "10"}, querySelector: () => guide
  });
  const root = {
    classList: {add(){}, remove(){}}, addEventListener: (type, listener) => listeners.set(type, listener),
    querySelector: selector => ({".amedas-temperature-chart-plot": plot, ".amedas-chart-inspection-reading": reading,
      ".amedas-chart-inspection-hint": {}, ".amedas-chart-inspection-guide": guide})[selector]
  };
  bindAmedasChartInspection(root, {points: merged.points, rangeMinutes: 2880, formatValue: String});
  listeners.get("pointermove")({target: plot, clientX: 173});
  assert.equal(time.textContent, "1/1 00:00", "Pointer at the midpoint selects today's midnight");
  assert.equal(value.textContent, "0");
} finally {
  if (nativeElement === undefined) delete globalThis.Element;
  else globalThis.Element = nativeElement;
}

const storage = new Map();
const store = {getItem: key => storage.get(key), setItem: (key,value) => storage.set(key,value)};
assert.equal(loadAmedasChartDisplay(store), "continuous");
saveAmedasChartDisplay("daily", store); assert.equal(loadAmedasChartDisplay(store), "daily");
saveAmedasChartDisplay("bad", store); assert.equal(loadAmedasChartDisplay(store), "continuous");
assert.equal(loadAmedasChartDisplay({getItem(){throw Error("denied");}}), "continuous");

const panel = await readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8");
const context = vm.createContext({AMEDAS_CHART_LAYOUT, AMEDAS_SUMMARY_CHART_LAYOUT, formatAmedasChartDate, getAmedasChartAxis, splitAmedasChartSegments,
  getCurrentLanguage: () => "ja", escapeHtml: String, getAmedasDailySeriesTitle: () => "昨日から今日の気温", formatAmedasDailyAxis: String, formatAmedasDailyValue: value => `${value}℃`});
vm.runInContext(panel.slice(panel.indexOf("function buildAmedasDailyChartSvg("), panel.indexOf("function getRadarFrameKindLabel(")), context);
vm.runInContext(panel.slice(panel.indexOf("function buildAmedasTemperatureNormalLegend("), panel.indexOf("function formatAmedasDailyAxis(")), context);
for (const layout of [AMEDAS_CHART_LAYOUT, AMEDAS_SUMMARY_CHART_LAYOUT]) {
  const svg = context.buildAmedasDailyChartSvg(merged.points, merged.min, merged.max, {id: "temperature"}, -1, "1h", merged.temperatureNormal, layout, "inspection", merged);
  assert.match(svg, /12\/31 00時/); assert.match(svg, /1\/1 00時/);
  assert.match(svg, /amedas-chart-day-boundary/);
  const x = layout.inset.left + (layout.width - layout.inset.left - layout.inset.right) / 2;
  assert.match(svg, new RegExp(`class="amedas-chart-day-boundary" x1="${x.toFixed(1)}"`));
  assert.equal([...svg.matchAll(/<line class="(?:maximum|minimum)"/g)].length, 4, "Normals follow the date on each side of midnight");
}
const compact = context.buildAmedasDailyChartSvg(merged.points, merged.min, merged.max, {id: "temperature"}, -1, "1h", null, AMEDAS_SUMMARY_CHART_LAYOUT, "inspection", merged);
const compactAxis = getAmedasChartAxis(merged.min, merged.max, "temperature");
assert.match(compact, new RegExp(`data-axis-min="${compactAxis.min}" data-axis-max="${compactAxis.max}"`), "Compact charts retain the observation range when reference lines are hidden");
assert.match(compact, /<text x="34.0"[^>]+text-anchor="start">12\/31 00時/);
assert.ok(AMEDAS_SUMMARY_CHART_LAYOUT.inset.bottom - 9 >= 10, "Separate the bottom value baseline and time labels by at least one font height");

// Exercise actual retrieval at a year boundary, including field selection and
// a missing previous day. Each request is public station data, mocked offline.
const nativeFetch = globalThis.fetch;
const requests = [];
globalThis.fetch = async url => {
  requests.push(url);
  const match = String(url).match(/\/([^/]+)\/(\d{8})_(\d{2})\.json$/);
  assert.ok(match, String(url));
  const [, station, date, hour] = match;
  if (station === "missing" && date === "20261231") return new Response("missing", {status: 404});
  return Response.json({[`${date}${hour}0000`]: {humidity: [50,0], precipitation1h: [0,0], wind: [2,0], gust: [4,0]}});
};
try {
  const data = await fetchAmedasChartSeries("fixture", "2027-01-01T00:10:00+09:00", "humidity", 0, "1h", "continuous");
  assert.deepEqual(data.dates, dates);
  assert.equal(data.points.length, 9);
  assert.equal(requests.length, 9, "Eight previous-day chunks and one current chunk");
  assert.ok(data.points.every(point => point.value === 50));
  const split = await fetchAmedasChartSeries("fixture", "2027-01-01T00:10:00+09:00", "humidity", 1, "1h", "daily");
  assert.equal(split.rangeMinutes, 1440); assert.equal(split.dayOffset, 1);
  assert.equal(requests.length, 9, "Changing the view reuses cached daily chunks");
  const partial = await fetchAmedasChartSeries("missing", "2027-01-01T00:10:00+09:00", "humidity", 0, "1h", "continuous");
  assert.deepEqual(partial.unavailableDates, [dates[0]]);
  assert.equal(partial.latest.value, 50);
} finally { globalThis.fetch = nativeFetch; }
console.log("AMeDAS continuous chart: midnight, gaps, inspection, normals, storage, cached retrieval and partial failure passed");
