import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const panel = fs.readFileSync(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8");
const toggle = fs.readFileSync(new URL("../src/ui/weatherDistributionToggle.js", import.meta.url), "utf8");
const distribution = fs.readFileSync(new URL("../src/jma/weatherDistribution.js", import.meta.url), "utf8");

assert.match(index, /id="weather-distribution-toggle"/);
assert.match(index, /data-weather-distribution-mode="weather"/);
assert.match(index, /data-weather-distribution-mode="temperature"/);
assert.match(index, /data-weather-distribution-mode="snowfall"/);
assert.match(app, /setupWeatherDistributionToggle/);
assert.match(app, /snowfall-distribution/);
assert.match(distribution, /snowfall:\s*\{\s*element: "s3",\s*label: "降雪量",\s*usesForecastPeriod: true/s);
assert.match(app, /syncWeatherDistributionToggle/);
assert.match(app, /toggleWeatherDistributionPicker/);
assert.match(app, /visible: tab\?\.id === "radar" && Boolean\(weatherDistributionMode\)/);
assert.match(panel, /aria-label="天気分布予報"/);
assert.match(panel, /data-weather-distribution-picker/);
assert.doesNotMatch(panel, /event\.target\.closest\("\[data-weather-distribution-picker\]"\)\) return;/,
  "the picker button must still participate in slider gestures");
assert.match(panel, /const isWeatherDistribution = Boolean\(weatherDistributionMode\);/);
assert.match(panel, /state\.weatherDistribution \?\? state\.data\?\.weatherDistribution/);
assert.match(panel, /\$\{distributionLabel\}の時刻を選択/);
assert.match(panel, /timeLabelPrefix = isWeatherDistribution\s*\?\s*"対象時刻"/);
assert.match(panel, /weatherDistributionMode === "weather"[\s\S]*?\["雨または雪", "", "#[0-9a-f]{6}"\]/);
assert.match(panel, /renderWeatherTimeTimeline\([\s\S]*?\{ compact: true \}/);
assert.doesNotMatch(panel, />気温分布<\/button>/);
assert.match(toggle, /setCollapsed\(true\)/);
assert.match(toggle, /data-weather-distribution-mode/);

const choiceHandler = toggle.slice(
  toggle.indexOf("choices.addEventListener"),
  toggle.indexOf("updateWeatherDistributionToggle")
);
assert.doesNotMatch(choiceHandler, /setCollapsed\(true\)/);
assert.match(toggle, /pointerdown/);
assert.match(toggle, /toggleWeatherDistributionPicker/);
assert.match(toggle, /if \(!root \|\| !toggle \|\| !choices\) return null;/);

console.log("Weather distribution dock and map picker: OK");

// Exercise the actual delegated slider and overlay handlers together. The
// selected distribution button has a second job: a plain tap opens its picker.
class Node {
  constructor(kind, parent = null) {
    this.kind = kind; this.parent = parent; this.dataset = {}; this.attributes = new Map(); this.listeners = new Map();
    this.style = { setProperty() {} }; this.disabled = false;
    const classes = new Set();
    this.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
      toggle(name, value) { if (value) classes.add(name); else classes.delete(name); } };
  }
  addEventListener(name, fn, capture) { const list = this.listeners.get(name) ?? []; list.push({ fn, capture: capture === true }); this.listeners.set(name, list); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  closest(selector) {
    if (this.kind === "button" && (selector === "button" || selector === ".mobile-dock-segmented button"
      || selector === "[data-weather-distribution-picker]" && this.hasAttribute("data-weather-distribution-picker")
      || selector === "[data-radar-overlay]" && this.dataset.radarOverlay)) return this;
    if (this.kind === "segment" && selector === ".mobile-dock-segmented") return this;
    return this.parent?.closest(selector) ?? null;
  }
  contains(node) { return node === this || Boolean(node.parent && this.contains(node.parent)); }
  querySelectorAll() { return this.buttons ?? []; }
  getBoundingClientRect() { return { left: this.offsetLeft, width: this.offsetWidth }; }
  hasPointerCapture() { return false; }
  setPointerCapture() {}
  click() { this.parent.parent.emit("click", { target: this, isTrusted: false }); }
  emit(name, properties) {
    const event = { type: name, pointerId: 1, pointerType: "touch", button: 0, isTrusted: true,
      preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() { this.stopped = true; }, ...properties };
    for (const capture of [true, false]) for (const listener of this.listeners.get(name) ?? []) {
      if (listener.capture === capture && !event.stopped) listener.fn(event);
    }
  }
}
function sliderFixture() {
  const root = new Node("root"), segment = new Node("segment", root), doc = new Node("document"), win = new Node("window");
  const frames = new Map(); let sequence = 0, opened = 0;
  const changed = [];
  win.requestAnimationFrame = fn => { frames.set(++sequence, fn); return sequence; };
  win.cancelAnimationFrame = id => frames.delete(id);
  segment.buttons = ["radar", "weather-distribution", "weather-chart", "satellite", "lightning"].map((mode, index) => {
    const button = new Node("button", segment); button.offsetLeft = index * 100; button.offsetWidth = 100;
    button.dataset.radarOverlay = mode;
    button.setAttribute("aria-pressed", String(index === 1)); button.classList.toggle("active", index === 1);
    if (index === 1) { button.setAttribute("data-weather-distribution-picker", ""); delete button.dataset.radarOverlay; }
    return button;
  });
  doc.getElementById = id => id === "mobile-context-dock" ? root : null;
  const ctx = vm.createContext({ Element: Node, window: win, document: doc,
    syncMobileDockSegmentIndicators() {}, syncMobileDockSegmentIndicator() {},
    isSegmentButtonActive: button => button.classList.contains("active") });
  vm.runInContext(panel.slice(panel.indexOf("function setupSegmentedControls(root)"), panel.indexOf("export function setupMobileDockSegmentedControls")), ctx);
  vm.runInContext(panel.slice(panel.indexOf("export function setupRadarOverlayToggle("), panel.indexOf("export function setupWeatherChartControls(")).replace("export function", "function"), ctx);
  ctx.setupSegmentedControls(root);
  ctx.setupRadarOverlayToggle({ onChange: mode => changed.push(mode), onWeatherDistributionPicker: () => opened++ });
  const send = (name, x, source = segment.buttons[1]) => root.emit(name, { target: source, clientX: x });
  return { buttons: segment.buttons, changed, opened: () => opened, send };
}
for (const [x, mode] of [[50, "radar"], [250, "weather-chart"], [350, "satellite"], [450, "lightning"]]) {
  const f = sliderFixture(); f.send("pointerdown", 150); f.send("pointermove", x); f.send("pointerup", x);
  f.send("click", x);
  assert.deepEqual(f.changed, [mode], `slide from distribution to ${mode} commits once`);
  assert.equal(f.opened(), 0, "a slide must not open the picker");
}
const tap = sliderFixture(); tap.send("pointerdown", 150); tap.send("pointerup", 150); tap.send("click", 150);
assert.equal(tap.opened(), 1, "a tap opens the picker once despite the native compatibility click");
const returned = sliderFixture(); returned.send("pointerdown", 150); returned.send("pointermove", 350); returned.send("pointerup", 150); returned.send("click", 150);
assert.equal(returned.opened(), 0, "sliding back to the selected distribution does not open its picker");
assert.equal(returned.changed.length, 0);
const cancelled = sliderFixture(); cancelled.send("pointerdown", 150); cancelled.send("pointermove", 350); cancelled.send("pointercancel", 350);
assert.equal(cancelled.opened(), 0); assert.equal(cancelled.changed.length, 0);
assert.equal(cancelled.buttons[1].getAttribute("aria-pressed"), "true");
console.log("Distribution gestures: all four destinations, picker tap, compatibility click, return and cancellation passed");
