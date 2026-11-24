import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { AMEDAS_CHART_LAYOUT, AMEDAS_SUMMARY_CHART_LAYOUT, getAmedasChartAxis, splitAmedasChartSegments, findNearestAmedasObservation } from "../src/amedasChart.js";

// The chart must not force a wholly subzero station (e.g. Mt Fuji) up to +1C.
const cold = getAmedasChartAxis(-13.7, -6.5, "temperature");
assert.ok(cold.max < 0);
assert.ok(cold.min <= -13.7 && cold.max >= -6.5);

for (const [low, high, metric] of [
  [-0.5, 0.8, "temperature"], [25, 25, "temperature"],
  [1004.3, 1013.7, "pressure"], [0, 100, "humidity"],
  [99, 100, "humidity"], [0, 0, "precipitation"],
  [2, 12.5, "precipitation"], [0, 21.4, "wind"],
  [0, 0, "snow"], [36, 37, "snow"]
]) {
  const axis = getAmedasChartAxis(low, high, metric);
  assert.ok(axis.min <= low && axis.max >= high, `${metric}: never crop real observations`);
  assert.ok(axis.ticks.length >= 2 && axis.ticks.length <= 8);
  assert.equal(new Set(axis.ticks).size, axis.ticks.length, "No repeated labels");
  assert.ok(Math.abs(axis.ticks[0] - axis.min) < 1e-9);
  assert.ok(Math.abs(axis.ticks.at(-1) - axis.max) < 1e-9);
  if (["precipitation", "snow", "wind"].includes(metric)) assert.equal(axis.min, 0);
  if (metric === "snow") assert.ok(axis.ticks.every(Number.isInteger));
  if (metric === "humidity") assert.ok(axis.min >= 0 && axis.max <= 100);
}
const missing = getAmedasChartAxis(undefined, undefined, "temperature");
assert.ok(Number.isFinite(missing.min) && missing.max > missing.min);
console.log("AMeDAS chart axes: negative temperatures, ranges, zero baselines and distinct ticks passed");

// Exercise the actual SVG renderer: a 0mm observation must not acquire a bar
// below the zero grid line when the axis range is small.
const panel = await readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8");
const context = vm.createContext({
  AMEDAS_CHART_LAYOUT, AMEDAS_SUMMARY_CHART_LAYOUT, getAmedasChartAxis, splitAmedasChartSegments,
  getCurrentLanguage: () => "ja", escapeHtml: value => value,
  getAmedasDailySeriesTitle: () => "Rainfall", formatAmedasDailyAxis: String,
  buildAmedasTemperatureNormalLines: () => ""
});
vm.runInContext(panel.slice(panel.indexOf("function buildAmedasDailyChartSvg("), panel.indexOf("function getRadarFrameKindLabel(")), context);
const zeroSvg = context.buildAmedasDailyChartSvg([{ minute: 0, value: 0 }, { minute: 1430, value: 0 }], 0, 0, { id: "precipitation" });
assert.doesNotMatch(zeroSvg, /<rect /, "Dry days have no rainfall bars");
const rainSvg = context.buildAmedasDailyChartSvg([{ minute: 360, value: 0 }, { minute: 720, value: 0.5 }], 0, 0.5, { id: "precipitation" });
const bars = [...rainSvg.matchAll(/<rect[^>]+y="([\d.]+)"[^>]+height="([\d.]+)"/g)];
assert.equal(bars.length, 1, "Only the nonzero observation is drawn");
const bottomGrid = Math.max(...[...rainSvg.matchAll(/<g><line[^>]+y1="([\d.]+)"/g)].map(match => Number(match[1])));
assert.ok(Math.abs(Number(bars[0][1]) + Number(bars[0][2]) - bottomGrid) < 0.2, "Rainfall bars end on the zero grid line");
console.log("AMeDAS SVG regression: zero rainfall, missing bars and zero baseline passed");

const samples = [{minute: 0, value: 0}, {minute: 10, value: null}, {minute: 20, value: -9.4}, {minute: 30, value: 2.5}];
assert.equal(findNearestAmedasObservation(samples, 1), samples[0], "Zero is a real observation");
assert.equal(findNearestAmedasObservation(samples, 19), samples[2], "Skip missing observations");
assert.equal(findNearestAmedasObservation(samples, 1440), samples[3], "Snap to the last actual observation");
assert.equal(findNearestAmedasObservation([], 10), null);
assert.equal(findNearestAmedasObservation(samples, NaN), null);
console.log("AMeDAS inspection: nearest observations, missing data and zero readings passed");

// A replacement station must retain the old chart footprint during loading,
// and revealing it must wait until the new data has been rendered.
const frames = [];
const root = { hidden: false, innerHTML: "previous chart", style: { minHeight: "", setProperty() {} },
  getBoundingClientRect: () => ({ height: 380, top: 100 }) };
Object.assign(context, {
  document: { getElementById: () => root }, window: { requestAnimationFrame: fn => frames.push(fn) },
  bindAmedasChartInspection() {}, getAmedasPrecipitationPeriod: () => ({id: "1h"}),
  formatAmedasDailyColoredValue: String, getAmedasDailyMinLabel: () => "Minimum",
  getAmedasDailyMaxLabel: () => "Maximum"
});
vm.runInContext("let revealAmedasChartAfterLoad = true;", context);
vm.runInContext(panel.slice(panel.indexOf("function renderAmedasDailyChart("), panel.indexOf("function buildAmedasDailyChartPeriodToggle(")), context);
const state = {selectedAmedasStationId: "x", amedasDailyChart: {metricId: "precipitation", precipitationPeriod: "1h", status: "loading"}};
context.renderAmedasDailyChart({id: "amedas"}, state, {id: "precipitation"});
assert.equal(root.style.minHeight, "380px", "Keep the previous plot height while loading");
assert.equal(frames.length, 0, "Do not scroll to a temporary loading placeholder");
state.amedasDailyChart = {...state.amedasDailyChart, status: "ready", data: {points: [{minute: 0, value: 0}], min: 0, max: 0, latest: {value: 0}}};
context.renderAmedasDailyChart({id: "amedas"}, state, {id: "precipitation"});
assert.equal(root.style.minHeight, "");
assert.equal(frames.length, 1, "Reveal the finished chart once");
context.renderAmedasDailyChart({id: "amedas"}, state, {id: "precipitation"});
assert.equal(frames.length, 1, "Routine refreshes do not scroll again");
console.log("AMeDAS loading stability: preserved height and one reveal after readiness passed");

const compactSvg = context.buildAmedasDailyChartSvg([{minute: 0, value: 0}, {minute: 600, value: 1}], 0, 1, {id: "precipitation"}, 0, "1h", null, AMEDAS_SUMMARY_CHART_LAYOUT, "summary-inspection");
assert.match(compactSvg, /viewBox="0 0 320 68"/);
assert.match(compactSvg, /aria-describedby="summary-inspection"/);
assert.doesNotMatch(compactSvg, /amedas-daily-chart-inspection/);
assert.equal([...compactSvg.matchAll(/<g><line/g)].length, 2, "Two readable range labels in the compact plot");

const dockContext = vm.createContext({
  getCurrentLanguage: () => "ja", escapeHtml: String,
  getAmedasMetric: () => ({id: "temperature", label: "Temperature"}),
  getAmedasPrecipitationPeriod: () => ({id: "1h", label: "1h"}),
  AMEDAS_PRECIPITATION_PERIODS: [{id: "1h", label: "1h"}],
  AMEDAS_METRICS: [{id: "temperature", label: "Temperature"}, {id: "snow", label: "Snow"}],
  findNearestAmedasPoint: () => null, getAmedasNearestFallbackText: () => "No location"
});
const start = panel.indexOf("function buildMobileContextDockContent(");
vm.runInContext(panel.slice(start, panel.indexOf("\nfunction ", start + 10)), dockContext);
for (const status of ["loading", "error", "ok"]) {
  const markup = dockContext.buildMobileContextDockContent({id: "amedas"}, {selectedAmedasStationId: "x", amedasSummaryChartVisible: true, amedasDailyChart: {status}});
  assert.match(markup, /data-amedas-summary-back/);
  assert.match(markup, /id="amedas-summary-chart"/);
  assert.doesNotMatch(markup, /data-mobile-amedas-metric=/);
}
const returned = dockContext.buildMobileContextDockContent({id: "amedas"}, {selectedAmedasStationId: "x", amedasSummaryChartVisible: false});
assert.match(returned, /data-mobile-amedas-metric=/, "Back keeps the selected station but restores metric controls");
assert.doesNotMatch(returned, /amedas-summary-chart/);
console.log("AMeDAS summary: compact shared renderer, unique IDs, loading/back states and metric return passed");

// Yesterday's final sample is not a current reading. Hide only the headline;
// retain the trace and inspection UI for looking up historical observations.
state.amedasDailyChart.data.latest = {value: 0, label: "23:50"};
for (const compact of [false, true]) {
  state.amedasDailyChart.dayOffset = 0;
  context.renderAmedasDailyChart({id: "amedas"}, state, {id: "precipitation"}, root, {compact});
  assert.match(root.innerHTML, /class="amedas-temperature-chart-current"/);
  assert.match(root.innerHTML, /23:50/);
  state.amedasDailyChart.dayOffset = 1;
  context.renderAmedasDailyChart({id: "amedas"}, state, {id: "precipitation"}, root, {compact});
  assert.doesNotMatch(root.innerHTML, /class="amedas-temperature-chart-current"/);
  assert.doesNotMatch(root.innerHTML, /23:50/);
  assert.match(root.innerHTML, /amedas-temperature-chart-plot/);
  assert.match(root.innerHTML, /amedas-chart-inspection-reading/);
}
console.log("AMeDAS past day: hide final sample headline, retain chart and inspection in both views passed");
