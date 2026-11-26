import assert from "node:assert/strict";
import { setupAccountCardMotion } from "../src/ui/accountCardMotion.js";

function fixture({ permission = "granted", reduced = false, sensor = true } = {}) {
  const document = new EventTarget();
  const view = new EventTarget();
  const card = new EventTarget();
  const toggle = new EventTarget();
  const status = { textContent: "", hidden: true };
  const media = new EventTarget();
  const touch = new EventTarget();
  const rotation = new EventTarget();
  const styles = new Map();
  const classes = new Set();
  const frames = new Map();
  let id = 0;
  let requests = 0;
  let visible = true;
  let hiddenCallback;
  let intersectionCallback;
  let observersDisconnected = 0;
  Object.assign(media, { matches: reduced });
  Object.assign(touch, { matches: true });
  Object.assign(rotation, { angle: 0 });
  Object.assign(view, {
    isSecureContext: true,
    screen: { orientation: rotation },
    matchMedia: query => query.includes("reduced") ? media : touch,
    requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    MutationObserver: class {
      constructor(callback) { hiddenCallback = callback; }
      observe() {}
      disconnect() { observersDisconnected++; }
    },
    IntersectionObserver: class {
      constructor(callback) { intersectionCallback = callback; }
      observe() {}
      disconnect() { observersDisconnected++; }
    },
    ...(sensor ? { DeviceOrientationEvent: { requestPermission() { requests++; return Promise.resolve(permission); } } } : {})
  });
  Object.assign(document, { defaultView: view, hidden: false });
  Object.assign(card, {
    ownerDocument: document,
    hidden: false,
    style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) },
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    closest: () => visible ? null : {},
    getClientRects: () => visible ? [{}] : [],
    getBoundingClientRect: () => ({ left: 100, top: 100, width: 300, height: 200 })
  });
  Object.assign(toggle, { setAttribute: (key, value) => { toggle[key] = value; } });
  const dispose = setupAccountCardMotion(card, { toggle, status });
  const dispatch = (target, name, data = {}) => target.dispatchEvent(Object.assign(new Event(name), data));
  return { card, toggle, status, media, touch, styles, classes, frames, view, document, rotation, dispose,
    dispatch, get requests() { return requests; }, get disconnected() { return observersDisconnected; },
    flush() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); },
    intersect(value) { intersectionCallback([{ isIntersecting: value }]); },
    hide() { visible = false; card.hidden = true; hiddenCallback([{ target: card }]); },
    show() { visible = true; card.hidden = false; hiddenCallback([{ target: card }]); },
    tick: () => new Promise(resolve => setImmediate(resolve))
  };
}

const f = fixture();
assert.equal(f.requests, 0, "Opening the account must never request motion permission.");
for (let i = 0; i < 20; i++) f.dispatch(f.card, "pointermove", { pointerType: "mouse", clientX: 400, clientY: 100 });
assert.equal(f.frames.size, 1, "Pointer events coalesce into one rendering frame.");
f.flush();
assert.equal(f.styles.get("--card-rotate-y"), "2.50deg");
assert.equal(f.styles.get("--card-rotate-x"), "2.00deg");
assert.equal(f.frames.size, 0, "There is no idle animation loop.");
f.dispatch(f.card, "pointerleave");
assert.equal(f.styles.size, 0);
f.dispatch(f.card, "pointermove", { pointerType: "touch", pointerId: 2, clientX: 400, clientY: 100 });
assert.equal(f.frames.size, 0, "A touch move without an active contact is ignored.");
const touch = new Event("pointerdown", { cancelable: true });
Object.assign(touch, { pointerType: "touch", pointerId: 2, clientX: 400, clientY: 100 });
f.card.dispatchEvent(touch);
assert.equal(touch.defaultPrevented, false, "Decorative motion must not capture scrolling.");
f.dispatch(f.card, "pointercancel");
assert.equal(f.frames.size, 0);
assert.equal(f.styles.size, 0);

f.dispatch(f.toggle, "click");
await f.tick();
assert.equal(f.requests, 1);
assert.equal(f.toggle["aria-pressed"], "true");
f.dispatch(f.view, "deviceorientation", { beta: null, gamma: null });
assert.equal(f.frames.size, 0, "Unavailable sensor readings must not be treated as zero.");
f.dispatch(f.view, "deviceorientation", { beta: 60, gamma: 0 });
f.flush();
assert.equal(f.styles.get("--card-rotate-y"), "0.00deg", "The initial holding angle is neutral.");
f.dispatch(f.view, "deviceorientation", { beta: 80, gamma: 30 });
f.flush();
assert.equal(f.styles.get("--card-rotate-y"), "2.50deg", "Sensor movement is clamped.");
f.hide();
f.dispatch(f.view, "deviceorientation", { beta: 40, gamma: -30 });
assert.equal(f.frames.size, 0, "Hidden cards detach sensor events and clear pending frames.");
assert.equal(f.styles.size, 0);
f.show();
f.dispatch(f.view, "deviceorientation", { beta: 50, gamma: 20 });
f.flush();
assert.equal(f.styles.get("--card-rotate-y"), "0.00deg", "Reopening recalibrates the holding angle.");
f.rotation.angle = 90;
f.dispatch(f.rotation, "change");
f.dispatch(f.view, "deviceorientation", { beta: 50, gamma: 20 });
f.flush();
f.dispatch(f.view, "deviceorientation", { beta: 68, gamma: 20 });
f.flush();
assert.equal(f.styles.get("--card-rotate-y"), "2.50deg", "Landscape orientation maps movement to screen coordinates.");
f.intersect(false);
assert.equal(f.styles.size, 0, "Offscreen cards stop rendering.");
f.intersect(true);
f.media.matches = true;
f.dispatch(f.media, "change");
f.dispatch(f.card, "pointermove", { clientX: 400, clientY: 100 });
f.dispatch(f.view, "deviceorientation", { beta: 20, gamma: 20 });
assert.equal(f.frames.size, 0);
assert.equal(f.toggle.hidden, true, "Reduced motion applies to all input types.");
f.media.matches = false;
f.dispatch(f.media, "change");
f.document.hidden = true;
f.dispatch(f.document, "visibilitychange");
f.dispatch(f.view, "deviceorientation", { beta: 20, gamma: 20 });
assert.equal(f.frames.size, 0, "Background tabs detach sensor events.");
f.dispose();
assert.equal(f.disconnected, 2);
f.dispatch(f.card, "pointermove", { clientX: 400, clientY: 100 });
assert.equal(f.frames.size, 0);

const denied = fixture({ permission: "denied" });
denied.dispatch(denied.toggle, "click");
await denied.tick();
assert.equal(denied.toggle["aria-pressed"], "false");
assert.match(denied.status.textContent, /許可されませんでした/u);
denied.dispatch(denied.card, "pointermove", { pointerType: "mouse", clientX: 400, clientY: 100 });
denied.flush();
assert.equal(denied.classes.has("is-motion-active"), true, "Pointer lighting remains available after permission denial.");
denied.dispose();
const unavailable = fixture({ sensor: false });
assert.equal(unavailable.toggle.hidden, true);
unavailable.dispose();
console.log("Account card motion: permission, throttling, visibility, rotation, scrolling and reduced-motion tests passed.");
