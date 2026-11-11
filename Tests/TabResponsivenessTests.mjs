import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { yieldAfterPaint } from "../src/scheduling.js";

const keys = ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout", "document"];
const originals = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
try {
  let nextId = 1;
  const frames = new Map();
  const timers = new Map();
  globalThis.requestAnimationFrame = (callback) => { const id = nextId++; frames.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  globalThis.setTimeout = (callback, delay) => { const id = nextId++; timers.set(id, { callback, delay }); return id; };
  globalThis.clearTimeout = (id) => timers.delete(id);
  Object.defineProperty(globalThis, "document", { configurable: true, value: { hidden: false } });
  const runTimer = (delay) => {
    const [id, timer] = [...timers].find(([, value]) => value.delay === delay);
    timers.delete(id);
    timer.callback();
  };
  let resolved = false;
  const work = yieldAfterPaint().then(() => { resolved = true; });
  assert.equal(resolved, false);
  [...frames.values()][0]();
  await Promise.resolve();
  assert.equal(resolved, false, "heavy work must not run inside the paint callback");
  runTimer(0);
  await work;
  assert.equal(frames.size + timers.size, 0);

  const stalled = yieldAfterPaint();
  runTimer(100);
  await stalled;
  assert.equal(frames.size + timers.size, 0, "suspended rAF must release timers");
  globalThis.document.hidden = true;
  const hidden = yieldAfterPaint();
  assert.equal(frames.size, 0);
  runTimer(0);
  await hidden;
} finally {
  keys.forEach((key, index) => {
    if (originals[index]) Object.defineProperty(globalThis, key, originals[index]);
    else delete globalThis[key];
  });
}

// Execute the actual navigation prelude, including its generation guard.
const source = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const start = source.indexOf("  async function selectTab(tabId) {");
const end = source.indexOf("    const cachedData =", start);
const pending = [];
const modes = [];
const noop = () => {};
const context = vm.createContext({
  performance, console, TABS: [{ id: "radar" }, { id: "earthquake" }, { id: "amedas" }],
  activeTab: "radar", tabAutoFocusGeneration: 0, activeLoadRequestId: 0,
  warningDetailsRequest: null, communityReportsVisible: false,
  yieldAfterPaint: () => new Promise((resolve) => pending.push(resolve)),
  weatherMap: { setMode: (mode) => modes.push(mode), setCommunityReportsVisible: noop },
  tabControls: { setActiveButton: noop },
  isRainRadarActive: () => false,
  ...Object.fromEntries(["syncTyphoonRadarOverlayButton", "renderCommunityReportLayerToggle",
    "syncEarlyWarningRefreshTimer", "invalidateScheduledMapRender", "invalidateScheduledPanelRender",
    "syncActiveTabToUrl", "stopRadarPlayback", "stopLightningPlayback", "stopWeatherChartPlayback",
    "stopWeatherDistributionPlayback", "refreshCommunityReports"].map((key) => [key, noop]))
});
vm.runInContext(`${source.slice(start, end)} return requestId; }`, context);
const first = context.selectTab("earthquake");
const second = context.selectTab("amedas");
assert.deepEqual(modes, [], "map preparation must yield before running");
pending.shift()();
await first;
assert.deepEqual(modes, [], "superseded navigation must not prepare its map");
pending.shift()();
await second;
assert.deepEqual(modes, ["amedas"]);
assert.match(source, /function updateCurrentView\(tab, data, options = \{\}\) \{[\s\S]*?if \(!tab \|\| tab.id !== activeTab\) return;/);
console.log("Tab responsiveness tests passed");
