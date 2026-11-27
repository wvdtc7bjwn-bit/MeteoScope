import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setupSegmentedPressFeedback, SEGMENTED_PRESS_SELECTOR } from "../src/ui/segmentedPress.js";

class Target {
  listeners = new Map();
  addEventListener(name, fn) { const listeners = this.listeners.get(name) ?? []; listeners.push(fn); this.listeners.set(name, listeners); }
  emit(name, event = {}) { for (const fn of this.listeners.get(name) ?? []) fn(event); }
}
function fixture({ disabled = false, active = true } = {}) {
  const doc = new Target(), view = new Target(), timers = new Map();
  let now = 0, sequence = 0, observer;
  doc.documentElement = { dataset: {} }; doc.defaultView = view;
  view.performance = { now: () => now };
  view.setTimeout = (fn, delay) => { timers.set(++sequence, { fn, at: now + delay }); return sequence; };
  view.clearTimeout = id => timers.delete(id);
  view.MutationObserver = class { constructor(fn) { this.fn = fn; observer = this; } observe() {} disconnect() { this.disconnected = true; } };
  const scope = { matches: () => false, querySelectorAll: () => [scope.current] };
  const createRoot = () => ({ attributes: new Map(), isConnected: true, parentElement: scope,
    closest: () => scope, setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); } });
  scope.current = createRoot();
  const button = { disabled, matches: () => active, closest: selector => selector === "button" ? button
    : selector === SEGMENTED_PRESS_SELECTOR ? scope.current : null };
  const send = (name, extra = {}) => doc.emit(name, { target: button, pointerType: "touch", button: 0, ...extra });
  setupSegmentedPressFeedback(doc);
  const advance = ms => { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } };
  return { doc, view, send, advance, scope, timers, pressed: () => scope.current.attributes.has("data-segmented-press"),
    replace() { const old = scope.current; old.isConnected = false; scope.current = createRoot(); observer.fn(); return old; } };
}

for (const disabled of [false, true]) {
  const f = fixture({ disabled });
  f.send("pointerdown"); assert.equal(f.pressed(), true, "selected disabled segments also provide feedback");
  f.advance(20); f.send("pointerup");
  assert.equal(f.pressed(), true, "a quick tap must remain visible long enough to inflate");
  f.advance(159); assert.equal(f.pressed(), true);
  f.advance(1); assert.equal(f.pressed(), false);
}
const unavailable = fixture({ disabled: true, active: false }); unavailable.send("pointerdown");
assert.equal(unavailable.pressed(), false, "unavailable options stay inactive");
const replacement = fixture(); replacement.send("pointerdown");
const old = replacement.replace();
assert.equal(old.attributes.has("data-segmented-press"), false);
assert.equal(replacement.pressed(), true, "rebuilding the dock preserves its press feedback");
replacement.send("pointerup"); replacement.advance(180); assert.equal(replacement.pressed(), false);
const fallback = fixture({ disabled: true }); fallback.send("touchstart", { touches: [{}] });
assert.equal(fallback.pressed(), true, "iOS touch fallback includes the selected disabled segment");
fallback.send("touchcancel"); assert.equal(fallback.pressed(), false);
const keyboard = fixture(); keyboard.send("keydown", { key: " " }); assert.equal(keyboard.pressed(), true);
keyboard.send("keyup", { key: " " }); keyboard.advance(180); assert.equal(keyboard.pressed(), false);
for (const cancel of [f => f.send("pointercancel"), f => f.view.emit("blur"), f => { f.doc.hidden = true; f.doc.emit("visibilitychange"); }]) {
  const f = fixture(); f.send("pointerdown"); cancel(f);
  assert.equal(f.pressed(), false); assert.equal(f.timers.size, 0);
}
const css = readFileSync(new URL("../src/styles/17-segmented-press.css", import.meta.url), "utf8");
assert.match(css, /--segmented-press-scale: 1\.07;/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?--segmented-press-scale: 1;/);
console.log("Segmented press: disabled selected controls, short taps, dock replacement, iOS touch, keyboard and cleanup passed");
