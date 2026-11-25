import assert from "node:assert/strict";
import { test } from "node:test";
import { setupMapUtilityReorder, UTILITY_ORDER_STORAGE_KEY } from "../src/ui/mapUtilityReorder.js";

// A layout-aware DOM double exercises real listeners, timers, capture-phase
// click suppression and persistence without relying on network/map services.
class Target {
  listeners = new Map();
  addEventListener(type, fn, options) {
    const list = this.listeners.get(type) ?? [];
    list.push({ fn, capture: options === true || options?.capture });
    this.listeners.set(type, list);
  }
  emit(type, properties = {}) {
    const event = { target: this, cancelable: true, button: 0, isPrimary: true,
      pointerId: 1, pointerType: "mouse", clientX: 50, clientY: 50,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.stopped = true; },
      stopPropagation() { this.stopped = true; }, ...properties };
    const path = [];
    for (let node = this; node; node = node.parent) path.push(node);
    for (const phase of [true, false]) {
      for (const node of phase ? [...path].reverse() : path) {
        for (const listener of node.listeners.get(type) ?? []) {
          if (Boolean(listener.capture) === phase) listener.fn(event);
          if (event.stopped) return event;
        }
      }
    }
    return event;
  }
}
class Element extends Target {
  children = []; attrs = new Map(); style = {}; hidden = false; inert = false; scrollTop = 0;
  constructor(tag, doc, id = "") {
    super(); Object.assign(this, { tag, ownerDocument: doc, id });
    const values = new Set();
    this.classList = { add: (...names) => names.forEach((name) => values.add(name)),
      remove: (...names) => names.forEach((name) => values.delete(name)), contains: (name) => values.has(name) };
  }
  setAttribute(key, value) { this.attrs.set(key, value); }
  getAttribute(key) { return this.attrs.get(key) ?? null; }
  removeAttribute(key) { this.attrs.delete(key); if (key === "id") this.id = ""; }
  append(node) { this.insertBefore(node, null); }
  insertBefore(node, reference) {
    node.remove();
    const index = reference ? this.children.indexOf(reference) : this.children.length;
    assert.ok(index >= 0);
    this.children.splice(index, 0, node); node.parent = this;
  }
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  get nextSibling() { return this.parent?.children[this.parent.children.indexOf(this) + 1] ?? null; }
  closest() { return this.tag === "button" ? this : this.parent?.closest() ?? null; }
  querySelectorAll(selector) {
    return this.children.flatMap((node) => [
      ...(selector === "button[id]" ? node.tag === "button" && node.id ? [node] : [] : node.id ? [node] : []),
      ...node.querySelectorAll(selector)
    ]);
  }
  getClientRects() { return this.hidden ? [] : [this.getBoundingClientRect()]; }
  getBoundingClientRect() {
    if (this.tag !== "button") return { left: 0, top: 0, right: 300, bottom: 240, width: 300, height: 240 };
    const visible = this.parent.children.filter((node) => node.tag === "button" && !node.hidden);
    if (this.parent.classList.contains("is-reordering")) visible.sort((a, b) => Number(a.style.order) - Number(b.style.order));
    const index = visible.indexOf(this);
    const left = index % 3 * 100, top = Math.floor(index / 3) * 100 - this.parent.scrollTop;
    return { left, top, right: left + 100, bottom: top + 100, width: 100, height: 100 };
  }
  cloneNode() { const clone = new Element(this.tag, this.ownerDocument); clone.id = this.id; return clone; }
  focus() { this.ownerDocument.activeElement = this; }
  setPointerCapture(id) { this.capture = id; }
  hasPointerCapture(id) { return this.capture === id; }
  releasePointerCapture() { this.capture = null; }
}
function fixture(saved = null, { blocked = false, hidden = [] } = {}) {
  const doc = new Target(), view = new Target();
  const timers = new Map(), frames = new Map(); let sequence = 0, writes = 0;
  view.setTimeout = (fn) => { timers.set(++sequence, fn); return sequence; };
  view.clearTimeout = (id) => timers.delete(id);
  view.requestAnimationFrame = (fn) => { frames.set(++sequence, fn); return sequence; };
  view.cancelAnimationFrame = (id) => frames.delete(id);
  view.localStorage = {
    getItem(key) { assert.equal(key, UTILITY_ORDER_STORAGE_KEY); if (blocked) throw Error(); return saved; },
    setItem(key, value) { assert.equal(key, UTILITY_ORDER_STORAGE_KEY); if (blocked) throw Error(); writes++; saved = value; }
  };
  doc.defaultView = view;
  doc.createElement = (tag) => new Element(tag, doc);
  doc.body = new Element("body", doc); doc.body.parent = doc;
  const menu = new Element("menu", doc); doc.body.append(menu);
  const buttons = Object.fromEntries(["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((id) => {
    const button = new Element("button", doc, id); button.hidden = hidden.includes(id);
    button.append(new Element("span", doc)); menu.append(button); return [id, button];
  }));
  let launches = 0;
  Object.values(buttons).forEach((button) => button.addEventListener("click", () => launches++));
  const controller = setupMapUtilityReorder(menu);
  return { doc, view, menu, buttons, controller, frames,
    hold() { const pending = [...timers.values()]; timers.clear(); pending.forEach((fn) => fn()); },
    frame() { const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn()); },
    ids: () => menu.querySelectorAll("button[id]").map((button) => button.id),
    saved: () => saved, writes: () => writes, launches: () => launches };
}
const touch = (x, y, identifier = 5) => ({ clientX: x, clientY: y, identifier });
const beginTouch = (f) => f.buttons.a.emit("touchstart", { touches: [touch(50, 50)] });

test("stored order handles duplicates, removed/new IDs and hidden features", () => {
  const f = fixture('["c","c","gone","b"]', { hidden: ["b"] });
  assert.deepEqual(f.ids(), ["c", "b", "a", "d", "e", "f", "g", "h", "i"]);
  f.buttons.c.emit("keydown", { key: "ArrowRight", altKey: true });
  assert.deepEqual(f.ids().slice(0, 3), ["b", "a", "c"]);
  assert.deepEqual(fixture(f.saved()).ids(), f.ids());
  assert.equal(f.writes(), 1);
});
test("malformed or unavailable storage never disables normal tapping", () => {
  for (const f of [fixture("bad json"), fixture(null, { blocked: true })]) {
    f.buttons.a.emit("pointerdown"); f.doc.emit("pointerup"); f.hold();
    assert.equal(f.buttons.a.emit("click").defaultPrevented, undefined);
    assert.equal(f.launches(), 1); assert.equal(f.writes(), 0);
    f.buttons.a.emit("keydown", { key: "ArrowRight", altKey: true });
    assert.equal(f.ids()[1], "a");
  }
});
test("scrolling before the hold remains native and never reorders", () => {
  const f = fixture(); beginTouch(f);
  const movement = f.doc.emit("touchmove", { touches: [touch(50, 80)] });
  f.hold();
  assert.equal(movement.defaultPrevented, undefined);
  assert.equal(f.menu.classList.contains("is-reordering"), false);
  assert.equal(f.frames.size, 0); assert.equal(f.writes(), 0);
});
test("touch hold reorders vertically, saves once, and consumes compatibility click", () => {
  const f = fixture(); beginTouch(f); f.hold();
  assert.equal(f.menu.classList.contains("is-reordering"), true);
  assert.equal(f.doc.body.children.length, 2);
  assert.equal(f.doc.emit("touchmove", { touches: [touch(50, 150)] }).defaultPrevented, true);
  assert.equal(f.ids()[0], "a", "the live touch target stays in its original DOM position");
  assert.equal(f.buttons.a.style.order, "3");
  f.doc.emit("touchend", { changedTouches: [touch(50, 150)] });
  assert.deepEqual(f.ids().slice(0, 4), ["b", "c", "d", "a"]);
  assert.equal(f.writes(), 1); assert.equal(f.frames.size, 0);
  assert.equal(f.doc.body.children.length, 1);
  assert.equal(f.buttons.a.emit("click").defaultPrevented, true);
  assert.equal(f.launches(), 0);
  // The next intentional tap is not swallowed even if the browser sent no click.
  f.buttons.a.emit("pointerdown"); f.doc.emit("pointerup"); f.buttons.a.emit("click");
  assert.equal(f.launches(), 1);
});
test("mouse hold reorders after restoring a non-default order", () => {
  const f = fixture('["c","b","a"]');
  f.buttons.c.emit("pointerdown"); f.hold();
  f.doc.emit("pointermove", { clientX: 250 }); f.doc.emit("pointerup", { clientX: 250 });
  assert.deepEqual(f.ids().slice(0, 3), ["b", "a", "c"]);
  assert.equal(f.writes(), 1); assert.equal(f.buttons.c.hasPointerCapture(1), false);
});
test("direct mouse dragging commits without waiting and clears the pending hold", () => {
  const f = fixture(); f.buttons.a.emit("pointerdown");
  f.doc.emit("pointermove", { clientX: 250 }); f.hold();
  assert.equal(f.doc.body.children.length, 2, "only one drag preview exists");
  f.doc.emit("pointerup", { clientX: 250 });
  assert.deepEqual(f.ids().slice(0, 3), ["b", "c", "a"]);
  assert.equal(f.buttons.a.style.order, "");
  assert.equal(f.writes(), 1);
});
test("cancel, Escape, blur, closing and outside drop restore order without saving", () => {
  for (const cancel of [
    (f) => f.doc.emit("touchcancel"),
    (f) => f.buttons.a.emit("keydown", { key: "Escape" }),
    (f) => f.view.emit("blur"),
    (f) => f.controller.cancel(),
    (f) => f.doc.emit("touchend", { changedTouches: [touch(400, 150)] }),
    (f) => f.doc.emit("touchstart", { touches: [touch(50, 150), touch(200, 150, 6)] })
  ]) {
    const f = fixture(); const original = f.ids(); beginTouch(f); f.hold();
    f.doc.emit("touchmove", { touches: [touch(50, 150)] }); cancel(f);
    assert.deepEqual(f.ids(), original); assert.equal(f.writes(), 0);
    assert.equal(f.frames.size, 0); assert.equal(f.doc.body.children.length, 1);
  }
});
test("hold with no movement suppresses launch without saving, keyboard activation recovers", () => {
  const f = fixture(); beginTouch(f); f.hold();
  f.doc.emit("touchend", { changedTouches: [touch(50, 50)] });
  assert.equal(f.writes(), 0);
  f.buttons.a.emit("keydown", { key: "Enter" }); f.buttons.a.emit("click");
  assert.equal(f.launches(), 1);
});
test("a shortcut can activate a menu feature after a drag without a compatibility click", () => {
  const f = fixture(); beginTouch(f); f.hold();
  f.doc.emit("touchend", { changedTouches: [touch(50, 50)] });
  assert.equal(f.buttons.a.emit("click", { detail: 0 }).defaultPrevented, undefined);
  assert.equal(f.launches(), 1);
});
test("drag scrolls at menu edge and stops its animation loop on cancellation", () => {
  const f = fixture(); beginTouch(f); f.hold();
  f.doc.emit("touchmove", { touches: [touch(50, 235)] }); f.frame();
  assert.ok(f.menu.scrollTop > 0); assert.equal(f.frames.size, 1);
  f.controller.cancel(); assert.equal(f.frames.size, 0);
});
