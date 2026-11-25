import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const start = app.indexOf("  function syncEewConnectionIndicator() {");
const end = app.indexOf("  function syncEewAlertIndicator() {", start);
assert.ok(start >= 0 && end > start);
const indicator = { hidden: true, dataset: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
const state = { eewState: { connection: {} }, earlyAccessEnabled: true,
  document: { getElementById: () => indicator } };
vm.createContext(state);
vm.runInContext(`${app.slice(start, end)}; this.sync = syncEewConnectionIndicator;`, state);

for (const status of [undefined, "stopped", "suspended", "connecting", "connected"]) {
  state.eewState.connection.status = status;
  state.sync();
  assert.equal(indicator.hidden, true, `${status} does not show an abnormal-connection indicator`);
  assert.notEqual(indicator.dataset.state, "error");
}
for (const status of ["stale", "unsupported", "error", "disconnected"]) {
  state.eewState.connection.status = status;
  state.sync();
  assert.equal(indicator.hidden, false, `${status} shows the red blinking state`);
  assert.equal(indicator.dataset.state, "error");
  assert.equal(indicator.attributes["aria-label"], "Wolfx接続異常");
  state.earlyAccessEnabled = false;
  state.sync();
  assert.equal(indicator.hidden, true, "an inactive Wolfx feature never shows an alarm");
  state.earlyAccessEnabled = true;
}
for (const status of ["reconnecting", "connecting"]) {
  state.eewState.connection.status = status;
  state.sync();
  assert.equal(indicator.hidden, false, "reconnection stays visible throughout the retry");
  assert.equal(indicator.dataset.state, "reconnecting", "reconnection uses the orange state");
  assert.equal(indicator.attributes["aria-label"], "Wolfxへ再接続中");
}
state.eewState.connection.status = "connected";
state.sync();
assert.equal(indicator.hidden, true, "recovery immediately hides the previous alarm");
state.document.getElementById = () => null;
assert.doesNotThrow(() => state.sync());
console.log("Wolfx connection indicator state tests passed");
