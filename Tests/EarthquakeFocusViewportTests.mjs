import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { calculateFocusPadding, createViewportFocus } from "../src/map/focusViewport.js";

const closed = { width: 430, height: 932, top: 60, bottom: 202 };
const padding = calculateFocusPadding(closed);
assert.deepEqual(padding, { top: 76, right: 26, bottom: 220, left: 26 });
assert.equal((932 + padding.top - padding.bottom) / 2, 394, "Center the available area above the summary");
for (const viewport of [{ width: 932, height: 430, top: 60, bottom: 210 },
  { width: 320, height: 568, top: 60, bottom: 500 }, { width: 1280, height: 900, top: 70, bottom: 200 }]) {
  const p = calculateFocusPadding(viewport);
  assert.ok(viewport.height - p.top - p.bottom >= Math.min(179, viewport.height * .5 - 1));
}

let currentPadding = padding;
const calls = [];
const controller = createViewportFocus({ padding: () => currentPadding, refocus: (...args) => calls.push(args) });
controller.remember([[130.5, 32.5], [131, 33]], { followViewport: true });
assert.equal(controller.refresh(), false, "Unchanged layout must not move the camera");
currentPadding = calculateFocusPadding({ ...closed, bottom: 590 });
assert.equal(controller.refresh(), true);
assert.equal(controller.refresh(), false, "Resize notifications are coalesced by padding");
controller.clear();
currentPadding = padding;
assert.equal(controller.refresh(), false, "Manual camera input ends viewport following");
assert.equal(calls.length, 1);

const landscape = { width: 932, height: 430, obstructions: [
  { left: 599, right: 922, top: 10, bottom: 50 },
  { left: 20, right: 410, top: 216, bottom: 342 },
  { left: 20, right: 410, top: 342, bottom: 410 },
  { left: 12, right: 56, top: 10, bottom: 54 }
] };
const tall = calculateFocusPadding({ ...landscape, coordinates: [[130.2, 31], [132, 34]] });
assert.ok(tall.left >= 422 && tall.bottom === 16, "A tall distribution uses the space beside the dock");
const wide = calculateFocusPadding({ ...landscape, coordinates: [[130, 33], [144, 36]] });
assert.ok(wide.bottom >= 226 && wide.left < tall.left, "A wide distribution uses the strip above the dock");
for (const p of [tall, wide]) {
  const available = { left: p.left, right: 932 - p.right, top: p.top, bottom: 430 - p.bottom };
  assert.ok(available.right > available.left && available.bottom > available.top);
  assert.ok(available.right - available.left >= 932 / 4, "Avoid a narrow strip beside the clock");
  assert.ok(landscape.obstructions.every(r => available.left >= r.right || available.right <= r.left
    || available.top >= r.bottom || available.bottom <= r.top), "Bounds never intersect visible panels");
}
assert.deepEqual(calculateFocusPadding({ ...closed, obstructions: landscape.obstructions }), padding, "Portrait layout stays unchanged");
const short = calculateFocusPadding({ ...landscape, width: 667, height: 375, coordinates: [[130.2, 31], [132, 34]] });
assert.ok(short.left >= 422 && short.top + short.bottom < 200, "Short landscape retains vertical space");

const source = await readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8");
const rect = (top, bottom, width = 390) => ({ top, bottom, left: 20, right: 20 + width, width, height: bottom - top });
const elements = {
  map: { rect: { ...rect(0, 932, 430), left: 0, right: 430 } },
  clock: { rect: rect(18, 60) },
  "mobile-context-dock": { rect: rect(730, 856) },
  "main-tabs": { rect: rect(855, 924) },
  sidebar: { rect: rect(334, 924), opacity: "0" }
};
let open = false;
const context = vm.createContext({ calculateFocusPadding, window: { innerWidth: 430, innerHeight: 932 },
  document: { getElementById: id => elements[id] && { ...elements[id], getBoundingClientRect: () => elements[id].rect },
    documentElement: { classList: { contains: () => open } } },
  getComputedStyle: e => ({ display: "block", visibility: "visible", opacity: e.opacity ?? "1" }) });
vm.runInContext(source.slice(source.indexOf("function getFocusOffset("), source.indexOf("function clampNumber(")), context);
assert.deepEqual({ ...context.getFocusPadding() }, padding, "Ignore invisible detail-sheet geometry");
assert.deepEqual(Array.from(context.getFocusOffset()), [0, -72]);
open = true; elements.sidebar.opacity = "1";
assert.equal(context.getFocusPadding().bottom, 616);
open = false;
assert.deepEqual({ ...context.getFocusPadding() }, padding, "Closing detail restores summary viewport");
elements.map.rect = { left: 0, right: 932, top: 0, bottom: 430, width: 932, height: 430 };
elements.clock.rect = { left: 599, right: 922, top: 10, bottom: 50, width: 323, height: 40 };
elements["mobile-context-dock"].rect = { left: 20, right: 410, top: 216, bottom: 342, width: 390, height: 126 };
elements["main-tabs"].rect = { left: 20, right: 410, top: 342, bottom: 410, width: 390, height: 68 };
const landscapePadding = context.getFocusPadding({ followViewport: true, focusCoordinates: [[130.2, 31], [132, 34]] });
assert.ok(landscapePadding.left >= 422 && landscapePadding.bottom === 16, "DOM measurement reaches the landscape focus calculation");
assert.equal(context.getFocusPadding().left, 48, "Other camera actions retain their existing padding policy");
console.log("Earthquake focus: panel geometry, landscape, layout reflow and manual cancellation passed");
