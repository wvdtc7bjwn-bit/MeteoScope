import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { escapeHtml } from "../src/utils/html.js";
import { formatTyphoonSummaryName } from "../src/jma/typhoon.js";
import { getMobileWeatherFocusSelector } from "../src/ui/mobileWeatherTimeline.js";

const source = readFileSync(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8");
let language = "ja";
const context = vm.createContext({ escapeHtml, formatTyphoonSummaryName, getCurrentLanguage: () => language, localizeText: text => text,
  NO_TYPHOON_MESSAGE: "現在、台風情報は発表されていません", buildMobileDockLoadingStatus: text => `<span>${text}</span>`,
  compactWeatherTimeLabel: title => title, buildWeatherTimeTimelineMarkup: (_frames, _index, _label, input) => input });
vm.runInContext(source.slice(source.indexOf("function buildTyphoonMobileContextMarkup("), source.indexOf("function getWorldForecastMaxStep(")), context);
vm.runInContext(source.slice(source.indexOf("function getActiveTyphoonSelection("), source.indexOf("function getAmedasMetric(")), context);
vm.runInContext(source.slice(source.indexOf("function getTyphoonClassificationItems("), source.indexOf("function buildMobileEarthquakeSummaryCarousel(")), context);
vm.runInContext(source.slice(source.indexOf("function normalizeSummaryValue("), source.indexOf("function normalizeSummaryValue(") + 250).split("\r\n\r\n")[0], context);
vm.runInContext(source.slice(source.indexOf("function compactWeatherTimeLabel("), source.indexOf("function syncWeatherTimelineActiveTick(")), context);
const times = ["2026-11-27T12:00:00.000Z", "2026-11-27T18:00:00.000Z"];
const data = { forecastMode: "world", worldForecastStatus: "ok", worldForecastTimes: times, worldForecastTime: times[0],
  worldForecastModelStates: [{ id: "ecmwf", enabled: true, modelInfo: { shortLabel: "ECMWF", label: "ECMWF IFS ENS", color: "#ec4899" } }] };
const markup = context.buildTyphoonMobileContextMarkup(data);
assert.match(markup, /data-typhoon-forecast-mode="jma"[^>]*aria-label="気象庁"/);
assert.match(markup, /data-typhoon-forecast-mode="world"[^>]*aria-label="海外モデル"/);
assert.doesNotMatch(markup, /mobile-dock-typhoon-mode/);
assert.match(markup, /mobile-dock-typhoon-dots mobile-dock-summary-dots/);
assert.match(source, /mobile-dock-earthquake-summary-dots mobile-dock-summary-dots/);
assert.match(markup, /data-typhoon-page="jma"[^>]*aria-hidden="true" inert/);
assert.match(markup, /data-typhoon-page="world"[^>]*aria-hidden="false"/);
assert.match(markup, /data-world-typhoon-time-date>11\/27<\/time>/);
assert.match(markup, /日本時間/);
assert.match(markup, /data-world-typhoon-time title="11\/27 21:00">21:00<\/strong>/);
assert.match(markup, /mobile-dock-world-time-control mobile-weather-timeline-axis/);
assert.doesNotMatch(markup, /weather-time-label-mask|mobile-dock-world-time-toolbar/);
assert.match(markup, /aria-label="ECMWF IFS ENSをオフにする"/);
assert.match(context.buildTyphoonMobileContextMarkup({ ...data, worldForecastTime: times[1] }), /data-world-typhoon-time-date>11\/28<\/time>/);
assert.match(context.buildTyphoonMobileContextMarkup({ forecastMode: "jma", typhoons: [] }), /現在、台風情報は発表されていません/);
assert.match(context.buildTyphoonMobileContextMarkup({ ...data, worldForecastTimes: [], worldForecastStatus: "error" }), /海外モデル資料を取得できません/);
const mockTyphoons = [
  { id: "demo-1", details: { name: "台風第99号", size: "大型", strength: "非常に強い", pressure: "945 hPa", maxGust: "60 m/s" } },
  { id: "demo-2", details: { name: "台風第98号", size: "超大型", strength: "猛烈な", pressure: "925 hPa", maxWind: "50 m/s", maxGust: "70 m/s" } }
];
const jmaMarkup = context.buildTyphoonMobileContextMarkup({ forecastMode: "jma", typhoons: mockTyphoons, selectedTyphoonId: "demo-2" });
assert.match(jmaMarkup, /data-typhoon-id="demo-1"[^>]*>2\/2/);
assert.equal((jmaMarkup.match(/data-typhoon-id=/g) ?? []).length, 1, "only one cycling control is rendered");
assert.match(jmaMarkup, /925 hPa/);
assert.match(jmaMarkup, /50 m\/s/);
assert.match(jmaMarkup, /70 m\/s/);
assert.match(jmaMarkup, /最大風速/);
assert.match(jmaMarkup, /超大型/);
language = "en";
assert.match(context.buildTyphoonMobileContextMarkup(data), /JST/);
assert.match(context.buildTyphoonMobileContextMarkup(data), /Hide ECMWF IFS ENS/);

// Exercise the real slider event handler: date rollover, visible readout,
// accessibility text and the time passed to the map must remain in agreement.
const listeners = new Map(), selected = [], date = {}, clock = {}, timeline = {};
class Element {}
class Input extends Element {
  constructor() { super(); this.value = "1"; this.dataset = { worldTyphoonTimes: JSON.stringify(times) }; }
  matches(selector) { return selector === "[data-world-typhoon-time-slider]"; }
  closest(selector) { return selector === ".weather-time-timeline" ? timeline : { querySelector: selector => selector === "[data-world-typhoon-time-date]" ? date : clock }; }
  setAttribute(key, value) { this[key] = value; }
  setPointerCapture() {}
  releasePointerCapture() {}
}
const modeSelections = [], timers = new Map();
let timerId = 0;
const classes = () => ({ toggle() {} });
const pages = ["jma", "world"].map(mode => ({ dataset: { typhoonPage: mode }, setAttribute(key, value) { this[key] = value; } }));
const buttons = ["jma", "world"].map(mode => ({ dataset: { typhoonForecastMode: mode }, classList: classes(), setAttribute(key, value) { this[key] = value; }, getAttribute(key) { return this[key]; } }));
const root = { dataset: { tab: "typhoon", mobileTyphoonSummaryPage: "jma" }, style: { setProperty(key, value) { this[key] = value; } },
  addEventListener: (name, listener) => listeners.set(name, listener), querySelectorAll: selector => selector === "[data-typhoon-page]" ? pages : buttons };
context.applyMobileTyphoonSummaryPage(root, "jma");
const controls = vm.createContext({ Element, HTMLInputElement: Input,
  window: { clearTimeout: id => timers.delete(id), setTimeout: callback => { timers.set(++timerId, callback); return timerId; } },
  applyMobileTyphoonSummaryPage: context.applyMobileTyphoonSummaryPage,
  document: { getElementById: () => root },
  parseJsonArray: value => JSON.parse(value), clampIndex: (index, length) => Math.max(0, Math.min(length - 1, index)),
  updateWeatherTimelinePosition() {}, syncWeatherTimelineActiveTick() {},
  beginWeatherTimelineDrag() {}, finishWeatherTimelineDrag() {}, updateWeatherTimelineFractionalPosition() {},
  getWeatherTimelineDragIndex: () => 0.5,
  interpolateWeatherTimelineTime: (values, index) => new Date(Date.parse(values[0]) + (Date.parse(values[1]) - Date.parse(values[0])) * index).toISOString(),
  requestAnimationFrame: callback => { callback(); return 1; }, cancelAnimationFrame() {},
  compactWeatherDateLabel: context.compactWeatherDateLabel, compactWeatherTimeLabel: context.compactWeatherTimeLabel,
  formatWorldForecastTime: value => new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) });
vm.runInContext(source.slice(source.indexOf("export function setupTyphoonForecastModeControls("), source.indexOf("export function setupEarthquakeSelector(")).replace(/^export /, ""), controls);
controls.setupTyphoonForecastModeControls({ onChange: mode => modeSelections.push(mode), onTimeChange: time => selected.push(time) });
listeners.get("mobile-dock-horizontal-swipe")({ detail: { deltaX: -80, velocityX: -0.5 } });
assert.equal(root.dataset.mobileTyphoonSummaryPage, "world");
assert.equal(pages[0].inert, true);
assert.equal(pages[1].inert, false);
assert.equal(buttons[1]["aria-pressed"], "true");
for (const callback of timers.values()) callback();
timers.clear();
assert.deepEqual(modeSelections, ["world"], "source selection must reach the map callback");
listeners.get("mobile-dock-horizontal-swipe")({ detail: { deltaX: 8, velocityX: 0 } });
assert.equal(root.dataset.mobileTyphoonSummaryPage, "world", "short swipe stays on current page");
assert.equal(root.style["--mobile-summary-drag-x"], "0px");
listeners.get("keydown")({ key: "ArrowLeft", preventDefault() {}, stopImmediatePropagation() {} });
assert.equal(root.dataset.mobileTyphoonSummaryPage, "jma");
for (const callback of timers.values()) callback();
timers.clear();
assert.deepEqual(modeSelections, ["world", "jma"]);
const input = new Input();
listeners.get("input")({ target: input });
assert.equal(`${date.textContent} ${clock.textContent}`, "11/28 03:00");
assert.equal(date.dateTime, times[1]);
assert.equal(input["aria-valuetext"], `${date.textContent} ${clock.textContent}`);
assert.deepEqual(selected, [times[1]]);
const pointer = { target: input, pointerId: 1, clientX: 100, preventDefault() {}, stopPropagation() {} };
listeners.get("pointerdown")(pointer);
listeners.get("pointermove")(pointer);
assert.equal(`${date.textContent} ${clock.textContent}`, "11/28 00:00", "drag preview must show the interpolated time passed to the map");
assert.equal(date.dateTime, selected.at(-1));
listeners.get("pointerup")(pointer);
assert.equal(`${date.textContent} ${clock.textContent}`, "11/28 03:00", "release snaps both map and readout to the same forecast frame");
assert.equal(date.dateTime, selected.at(-1));
const focused = { getAttribute: name => name === "data-world-typhoon-model-toggle" ? "ifs-hres" : null, hasAttribute: () => false };
assert.equal(getMobileWeatherFocusSelector({ ownerDocument: { activeElement: focused }, contains: () => true }), '[data-world-typhoon-model-toggle="ifs-hres"]');
console.log("World typhoon dock: swipe source carousel, JST date rollover, readout/map consistency, empty/error states and focus passed");
