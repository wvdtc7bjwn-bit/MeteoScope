import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
class ElementMock {
  constructor(id) {
    this.id = id; this.listeners = new Map(); this.attributes = new Map(); this.dataset = {};
    this.values = new Map(); this.reads = 0;
    this.style = {
      setProperty: (key, value) => this.values.set(key, value),
      removeProperty: key => { delete this.style[key]; this.values.delete(key); }
    };
    const classes = new Set();
    this.classList = {
      add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key),
      toggle(key, active) { if (active) classes.add(key); else classes.delete(key); }
    };
  }
  addEventListener(type, callback) { const list = this.listeners.get(type) || []; list.push(callback); this.listeners.set(type, list); }
  dispatchEvent(event) { (this.listeners.get(event.type) || []).forEach(callback => callback(event)); }
  setAttribute(key, value) { this.attributes.set(key, value); }
  getBoundingClientRect() { this.reads++; return { height: this.id === "main-tabs" ? 74 : 130, top: 300 }; }
  get offsetHeight() { this.reads++; return 130; }
  get offsetWidth() { return 400; }
  matches() { return this.control === true; }
  closest(selector) { return selector === "#sidebar-drawer-handle" ? this.id === "sidebar-drawer-handle" : this.control; }
  querySelector() { return this; }
  setPointerCapture() {}
  releasePointerCapture() {}
}

let nextFrame = 0;
const frames = new Map(), timers = new Map();
const timer = {
  requestFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
  cancelFrame(id) { frames.delete(id); },
  finish() { for (const callback of [...frames.values()]) callback(); frames.clear(); }
};
let renderedHeight = 74;
const nodes = Object.fromEntries(["sidebar", "mobile-context-dock", "sidebar-drawer-handle", "main-tabs"].map(id => [id, new ElementMock(id)]));
const root = new ElementMock("root"), win = new ElementMock("window");
Object.assign(win, {
  innerWidth: 430, innerHeight: 932,
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame: timer.requestFrame, cancelAnimationFrame: timer.cancelFrame,
  setTimeout(callback) { const id = ++nextFrame; timers.set(id, callback); return id; },
  clearTimeout: id => timers.delete(id),
  getComputedStyle: () => ({ height: `${renderedHeight}px`, opacity: "0.5", transform: "matrix(1, 0, 0, 1, 0, 50)" })
});
let layouts = 0;
const source = readFileSync(new URL("../src/ui/panelToggle.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/m, "").replace("export function", "function");
vm.runInNewContext(`${source}\nsetupPanelToggle({onLayoutChange: () => recordLayout()});`, {
  document: { getElementById: id => nodes[id], documentElement: root }, window: win,
  Element: ElementMock, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
  performance: { now: () => 100 }, Date,
  recordLayout: () => layouts++
});
const dock = nodes["mobile-context-dock"], handle = nodes["sidebar-drawer-handle"];
const height = () => parseFloat(root.values.get("--mobile-sidebar-visible-height"));
const fire = (target, type, extra = {}) => target.dispatchEvent({
  type, target, preventDefault() {}, stopImmediatePropagation() {}, composedPath: () => [target], ...extra
});

const settle = () => {
  renderedHeight = height();
  fire(nodes.sidebar, "transitionend", { propertyName: "height" });
  timer.finish();
};
assert.equal(height(), 74);
fire(dock, "click");
assert.equal(handle.attributes.get("aria-expanded"), "true");
assert.equal(height(), 620);
assert(root.classList.contains("is-drawer-transitioning"));
assert.equal(layouts, 0, "map resize waits for actual completion");
assert.equal(timers.size, 1);
const beforeRendering = [...timers.values()][0];
fire(nodes.sidebar, "transitionrun", { propertyName: "height" });
beforeRendering();
assert(root.classList.contains("is-drawer-transitioning"), "delayed rendering resets the safety clock");
assert.equal(layouts, 0);
fire(handle, "click");
assert.equal(height(), 74);
assert.equal(timers.size, 1, "reversal cancels the old completion timer");
settle();
assert.equal(handle.attributes.get("aria-expanded"), "false");
assert.equal(layouts, 1);
assert(!root.classList.contains("is-drawer-transitioning"));
assert.equal(timers.size, 0);
// A late event from an already completed transition cannot duplicate resize.
fire(nodes.sidebar, "transitionend", { propertyName: "opacity" }); timer.finish();
assert.equal(layouts, 1);

fire(handle, "keydown", { key: "Enter" }); settle();
fire(handle, "click");
renderedHeight = 400; // A real CSS transition's rendered intermediate height.
fire(handle, "pointerdown", { pointerId: 9, clientX: 100, clientY: 300 });
assert.equal(height(), 400, "interrupting a transition freezes its rendered height");
assert.equal(nodes.sidebar.style.opacity, "0.5");
assert.equal(dock.style.opacity, "0.5");
fire(win, "pointerup", { pointerId: 9, clientX: 100, clientY: 300 });
fire(handle, "click"); settle();
assert.equal(height(), 620, "a tap during closing must reopen, not keep closing");
assert.equal(dock.style.opacity, undefined, "resuming restores the ordinary summary styles");

const beforeDrag = layouts;
fire(handle, "pointerdown", { pointerId: 1, clientX: 100, clientY: 300 });
for (const y of [320, 340, 380]) {
  fire(win, "pointermove", { pointerId: 1, clientX: 100, clientY: y }); timer.finish();
}
assert.equal(height(), 540);
assert.equal(layouts, beforeDrag, "drag frames must not repeatedly resize the map");
fire(win, "pointerup", { pointerId: 1, clientX: 100, clientY: 380 });
assert.equal(layouts, beforeDrag + 1);
assert.equal(height(), 540, "release keeps the user's intermediate position");

const control = new ElementMock("segmented"); control.control = true;
fire(dock, "pointerdown", { target: control, composedPath: () => [control, dock], pointerId: 2, clientX: 100, clientY: 300 });
fire(win, "pointermove", { pointerId: 2, clientX: 100, clientY: 500 }); timer.finish();
assert.equal(height(), 540, "segmented controls keep their own gesture");

fire(win, "sidebar-drawer-state", { detail: "peek" }); settle();
let swipe;
dock.addEventListener("mobile-dock-horizontal-swipe", event => { swipe = event.detail; });
fire(dock, "pointerdown", { pointerId: 3, clientX: 200, clientY: 300 });
fire(win, "pointermove", { pointerId: 3, clientX: 100, clientY: 302 }); timer.finish();
fire(win, "pointerup", { pointerId: 3, clientX: 100, clientY: 302 });
assert.equal(swipe.deltaX, -100);
assert.equal(height(), 74, "horizontal paging does not open the details");

fire(win, "sidebar-drawer-state", { detail: "full" });
win.innerHeight = 600;
fire(win, "resize"); timer.finish();
assert.equal(height(), 432, "resize cancels old geometry and settles at the intended state");
assert.equal(timers.size, 0);
win.matchMedia = query => ({ matches: query.includes("prefers-reduced-motion") });
fire(win, "sidebar-drawer-state", { detail: "peek" }); timer.finish();
assert.equal(height(), 74);
assert.equal(nodes.sidebar.style.transition, "none");
assert(!root.classList.contains("is-drawer-transitioning"));
assert.equal(timers.size, 0, "reduced motion settles immediately");
// No transitionend is guaranteed for unchanged endpoints/background tabs.
win.matchMedia = () => ({ matches: false });
fire(win, "sidebar-drawer-state", { detail: "full" });
const finishFallback = [...timers.values()][0];
finishFallback(); timer.finish();
assert(!root.classList.contains("is-drawer-transitioning"));
assert.equal(timers.size, 0);
console.log("Drawer motion: native transitions, reversal, drag, controls, completion, resize and reduced motion OK");
