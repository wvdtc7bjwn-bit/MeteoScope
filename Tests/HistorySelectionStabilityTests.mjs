import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { updateHistorySelection } from "../src/ui/historySelection.js";

let removedHeight = 0;
const sidebar = { scrollTop: 300, scrollHeight: 1000, clientHeight: 400, parentElement: null };
function button(id, mechanism) {
  const card = {
    mechanism, active: false,
    classList: { toggle(_, value) { card.active = value; } },
    querySelector() { return card.mechanism; },
    insertAdjacentHTML() { card.mechanism = { remove() { card.mechanism = null; } }; }
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

const source = readFileSync(new URL("../src/ui/settingsModal.js", import.meta.url), "utf8");
const calls = [];
const group = { matches: () => false };
const context = vm.createContext({
  setSettingsGroupExpanded: (g, value) => calls.push(value),
  renderSettingsLegalDocument: () => {}, renderSettingsChangelog: () => {},
  document: { querySelectorAll() { throw new Error("must not collapse groups above the clicked heading"); } },
  scrollSettingsGroupIntoView() { throw new Error("ordinary toggles must not force scroll"); }
});
vm.runInContext(source.slice(source.indexOf("function toggleSettingsGroup("), source.indexOf("async function renderSettingsLegalDocument(")), context);
context.toggleSettingsGroup({ closest: () => group, getAttribute: () => "false" });
context.toggleSettingsGroup({ closest: () => group, getAttribute: () => "true" });
assert.deepEqual(calls, [true, false]);
console.log("History selection and settings scroll stability tests passed");
