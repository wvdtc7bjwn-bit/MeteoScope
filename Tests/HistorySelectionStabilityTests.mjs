import assert from "node:assert/strict";
import { updateHistorySelection } from "../src/ui/historySelection.js";

let removedHeight = 0;
const sidebar = { scrollTop: 300, scrollHeight: 1000, clientHeight: 400, parentElement: null };
function button(id, mechanism) {
  const card = {
    mechanism, active: false,
    classList: { toggle(_, value) { card.active = value; } },
    querySelector(selector) { return selector === "focal-mechanism" ? card.mechanism : card.longPeriod; },
    insertAdjacentHTML(_position, markup) {
      if (markup.includes("earthquake-long-period")) card.longPeriod = { remove() { card.longPeriod = null; } };
      else card.mechanism = { remove() { card.mechanism = null; } };
    }
  };
  const b = { dataset: { earthquakeArchiveId: id }, closest: () => card,
    setAttribute(_, value) { b.pressed = value; },
    getBoundingClientRect: () => ({ top: 500 - removedHeight - sidebar.scrollTop }) };
  return { b, card };
}
const first = button("a", { remove() { first.card.mechanism = null; removedHeight = 100; } });
const second = button("b", null);
const root = { querySelectorAll: () => [first.b, second.b], scrollHeight: 600, clientHeight: 600, parentElement: sidebar };
const top = second.b.getBoundingClientRect().top;
updateHistorySelection(root, "b", [{ id: "b" }]);
assert.equal(second.b.getBoundingClientRect().top, top, "removing an earlier mechanism must not move the selected card");
assert.equal(first.b.pressed, "false");
assert.equal(second.b.pressed, "true");
const retained = second.card.mechanism;
updateHistorySelection(root, "b", [{ id: "b" }]);
assert.equal(second.card.mechanism, retained, "detail completion must retain loaded mechanism DOM");
assert.equal(sidebar.scrollTop, 200);
const detail = { id: "b", status: "ok", event: { longPeriod: { maxClass: 1, status: "issued" } } };
updateHistorySelection(root, "b", [{ id: "b" }], detail);
const longPeriodNode = second.card.longPeriod;
assert.ok(longPeriodNode, "completed history observations appear on the selected card");
updateHistorySelection(root, "b", [{ id: "b" }], detail);
assert.equal(second.card.longPeriod, longPeriodNode, "periodic refresh preserves expanded long-period details");
assert.equal(second.card.mechanism, retained);
updateHistorySelection(root, "a", [{ id: "a" }, { id: "b" }], detail);
assert.equal(second.card.longPeriod, null, "observations must not remain on the previously selected earthquake");

console.log("History selection scroll stability tests passed");
