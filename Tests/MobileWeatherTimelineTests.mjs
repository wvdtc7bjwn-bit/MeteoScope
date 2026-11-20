import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { escapeHtml } from "../src/utils/html.js";
import { renderMobileWeatherTimelineToolbar, getMobileWeatherFocusSelector } from "../src/ui/mobileWeatherTimeline.js";

const panel = await readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8");
const clampIndex = (index, length) => Math.max(0, Math.min(length - 1, Number(index) || 0));
const context = vm.createContext({ escapeHtml, localizeText: text => text, renderMobileWeatherTimelineToolbar, clampIndex,
  formatWarningTime: text => text, findLatestRadarObservationIndex: frames => frames.findLastIndex(frame => !frame.isForecast),
  findLatestWeatherChartAnalysisIndex: frames => frames.findLastIndex(frame => frame.chartKind !== "forecast"),
  getRadarFrameKindLabel: frame => frame?.isForecast ? "予測" : "観測", getWeatherChartFrameKindLabel: frame => frame?.chartKind === "forecast" ? "予想" : "実況",
  getWeatherDistributionLabel: () => "天気分布", buildMobileDockLoadingStatus: () => '<span>読み込み中</span>', parseJsonArray: text => JSON.parse(text || "[]") });
vm.runInContext(panel.slice(panel.indexOf("function compactWeatherTimeLabel("), panel.indexOf("function syncWeatherTimelineActiveTick(")), context);
vm.runInContext(panel.slice(panel.indexOf("function buildWeatherTimeTimelineMarkup("), panel.indexOf("function renderWeatherTimeTimeline(")), context);
vm.runInContext(panel.slice(panel.indexOf("function buildRadarMobileContextMarkup("), panel.indexOf("function updateMobileRadarSliderProgress(")), context);
const frames = [{ label: "2026/11/20 23:50" }, { label: "2026/11/21 00:00", isForecast: true }];
const modes = [
  { radarPlaying: true },
  { lightningEnabled: true, lightningStatus: "ok", lightning: { frames, activeFrameIndex: 1 }, lightningPlaying: true },
  { weatherDistributionMode: "weather", weatherDistributionStatus: "ok", weatherDistribution: { frames, activeFrameIndex: 1 } },
  { weatherChartEnabled: true, weatherChartStatus: "ok", weatherChartPlaying: true, weatherChart: { frames: frames.map((frame, i) => ({ latestTime: frame.label, chartKind: i ? "forecast" : "analysis" })), activeFrameIndex: 1 } },
  { weatherChartSatellite: { enabled: true, status: "ok", frames: frames.map(frame => ({ observedAt: frame.label })), activeFrameIndex: 1, playing: true } }
];
for (const state of modes) {
  const markup = context.buildRadarMobileContextMarkup(frames, 1, "ok", state);
  assert.match(markup, /data-mobile-weather-date>11\/21</);
  assert.match(markup, /data-mobile-weather-time[^>]*>00:00</);
  assert.match(markup, /aria-valuetext="2026\/11\/21 00:00 · /);
  assert.equal((markup.match(/class="mobile-weather-control"/g) || []).length, 4);
  assert.match(markup, /aria-label="次の時刻"[^>]* disabled/);
  assert.match(markup, /data-mobile-weather-kind>/);
  assert.doesNotMatch(markup, /data-mobile-weather-tap-controls/);
}
for (const state of [{}, { weatherChartSatellite: { enabled: true, status: "loading", frames: [] } }]) {
  const markup = context.buildRadarMobileContextMarkup([], 0, "loading", state);
  assert.equal((markup.match(/class="mobile-weather-control"[^>]* disabled/g) || []).length, 4);
}
assert.match(context.buildRadarMobileContextMarkup(frames, 1, "error"), /data-mobile-radar-slider[^>]*aria-valuetext/);

// Taps choose a visible tick, while drag motion retains the existing direction.
vm.runInContext(panel.slice(panel.indexOf("function selectWeatherTimelineFrameAtPointer("), panel.indexOf("function getWeatherTimelineDragIndex(")), context);
context.getWeatherTimelineStep = () => 30;
const timeline = { getBoundingClientRect: () => ({ left: 20, width: 300 }) };
const slider = { min: "0", max: "9", value: "4", closest: () => timeline };
assert.equal(context.selectWeatherTimelineFrameAtPointer(slider, 170, 4), 4);
assert.equal(context.selectWeatherTimelineFrameAtPointer(slider, 230, 4), 6);
assert.equal(context.selectWeatherTimelineFrameAtPointer(slider, 110, 4), 2);
assert.equal(context.selectWeatherTimelineFrameAtPointer(slider, -1000, 4), 0);
assert.equal(context.selectWeatherTimelineFrameAtPointer(slider, 1000, 4), 9);

// Drag previews update the date, selected time, kind and screen-reader value together.
vm.runInContext(panel.slice(panel.indexOf("function updateMobileWeatherDate("), panel.indexOf("function buildMobileContextMarkup(")), context);
const fields = new Map(["date", "time", "kind"].map(key => [key, {}]));
const root = { querySelector: selector => fields.get(selector.match(/weather-(date|time|kind)/)?.[1]) };
const previewSlider = { dataset: { mobileWeatherFrames: JSON.stringify([{ title: "2026/11/20 23:50", kind: "観測" }, { title: "2026/11/21 00:00", kind: "予測" }]) }, closest: () => root,
  setAttribute(key, value) { this[key] = value; } };
context.updateMobileWeatherDate(previewSlider, 1);
assert.equal(fields.get("date").textContent, "11/21");
assert.equal(fields.get("time").textContent, "00:00");
assert.equal(fields.get("kind").textContent, "予測");
assert.equal(previewSlider["aria-valuetext"], "2026/11/21 00:00 · 予測");

// Explicit buttons dispatch only their own operation, never a delayed tap action.
let listener;
class FakeElement { closest() { return this.button; } }
const actions = [];
const controls = vm.createContext({ Element: FakeElement, document: { getElementById: () => ({ addEventListener: (_event, callback) => { listener = callback; } }) } });
vm.runInContext(panel.slice(panel.indexOf("export function setupMobileWeatherTimelineControls("), panel.indexOf("export function setupRadarOverlayToggle(")).replace(/^export /, ""), controls);
controls.setupMobileWeatherTimelineControls({ onStep: delta => actions.push(delta), onTogglePlay: () => actions.push("play"), onGoLatest: () => actions.push("latest") });
for (const action of ["prev", "next", "play", "latest"]) {
  const target = new FakeElement(); target.button = { dataset: { mobileWeatherAction: action }, disabled: false };
  listener({ target, preventDefault() {}, stopPropagation() {} });
}
assert.deepEqual(actions, [-1, 1, "play", "latest"]);
const disabledTarget = new FakeElement(); disabledTarget.button = { disabled: true };
listener({ target: disabledTarget, preventDefault() { throw Error("disabled button handled"); } });
const focused = { getAttribute: name => name === "data-mobile-weather-action" ? "play" : null, hasAttribute: () => false };
assert.equal(getMobileWeatherFocusSelector({ ownerDocument: { activeElement: focused }, contains: () => true }), '[data-mobile-weather-action="play"]');
assert.equal(getMobileWeatherFocusSelector({ ownerDocument: { activeElement: focused }, contains: () => false }), "");
console.log("Mobile weather timeline: five modes, boundaries, disabled states, midnight preview, taps, explicit actions and keyboard focus passed");
