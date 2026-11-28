import assert from "node:assert/strict";
import { prepareSidebarScroll } from "../src/ui/sidebarScroll.js";

// Simulate how replacing a long panel with a short/loading panel clamps the
// browser's scroll offset before the render completes.
let top = 0, maxTop = 900;
const sidebar = {
  get scrollTop() { return top; },
  set scrollTop(value) { top = Math.max(0, Math.min(value, maxTop)); }
};
function render(key, { max = 900, loading = false } = {}) {
  const finish = prepareSidebarScroll(sidebar, key, { loading });
  maxTop = max;
  sidebar.scrollTop = top;
  finish();
}
render("amedas");
sidebar.scrollTop = 600;
render("radar", { max: 150 });
assert.equal(top, 0, "a new tab starts at its heading instead of inheriting AMeDAS scroll");
sidebar.scrollTop = 80;
render("amedas");
assert.equal(top, 600, "returning to AMeDAS restores its own reading position");
sidebar.scrollTop = 650;
render("amedas");
assert.equal(top, 650, "same-tab live refresh does not move the reading position");
render("radar", { max: 0, loading: true });
assert.equal(top, 0);
render("radar", { max: 150 });
assert.equal(top, 80, "restore the saved position after loading content grows");
render("amedas", { max: 0, loading: true });
render("warnings", { max: 100 });
assert.equal(top, 0);
render("amedas");
assert.equal(top, 650, "a superseded loading tab must not replace its saved position with zero");
render("amedas", { max: 0, loading: true });
render("amedas");
assert.equal(top, 650, "same-tab loading placeholders preserve the prior position");
render("earthquake");
sidebar.scrollTop = 120;
render("volcano");
assert.equal(top, 0);
render("earthquake");
assert.equal(top, 120, "earthquake and volcano details have independent reading positions");
prepareSidebarScroll(null, "radar")();
console.log("Sidebar scroll: tab isolation, reading position, loading and rapid navigation passed");
