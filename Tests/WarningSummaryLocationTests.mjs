import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { escapeHtml } from "../src/utils/html.js";

const source = readFileSync(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8");
const context = vm.createContext({
  escapeHtml, localizeWarningDisplayText: value => value,
  getPrimaryMobileWarning: warnings => warnings[0],
  getMobileWarningBadgeColorClass: () => "neutral",
  buildWarningBadgesMarkup: warnings => warnings.map(item => item.label).join(" "),
  buildWarningMobileActionRow: () => "<nav>発表 早期 キキクル 河川</nav>",
  buildMobileDockLoadingStatus: text => text,
  buildKikikuruMobileLayerRow: () => "全国のキキクル",
  buildRiverFloodMobileContextMarkup: () => "全国の河川情報"
});
vm.runInContext(source.slice(source.indexOf("function buildWarningMobileContextMarkup("), source.indexOf("function buildRiverFloodMobileContextMarkup(")), context);
const ready = { status: "found", areaCode: "0000000", geographyStatus: "ready" };
const render = (currentLocation, options = {}) => context.buildWarningMobileContextMarkup({
  area: "テスト地域", warningView: "status", warnings: [], dataStatus: "ok", warningsAvailable: true,
  currentLocation, ...options
});
for (const info of [undefined, { status: "idle" }, { status: "error" }, { status: "denied" }]) {
  for (const warningView of ["status", "early"]) {
    const html = render(info, { warningView, warnings: [{ label: "古い警報" }] });
    assert.match(html, /現在地未取得/);
    assert.doesNotMatch(html, /発表なし|古い警報/);
  }
}
assert.match(render({ status: "loading" }), /現在地取得中/);
assert.match(render({ status: "loading" }), /aria-busy="true"/);
assert.match(render({ status: "found", geographyStatus: "loading" }), /地域情報を取得中/);
assert.match(render({ status: "found", geographyStatus: "unavailable" }), /地域情報を取得できません/);
assert.match(render({ status: "found", geographyStatus: "ready" }), /地域情報を取得できません/);
assert.match(render(ready), /発表なし/);
assert.match(render(ready, { warnings: [{ label: "大雨警報", level: "warning" }] }), /大雨警報/);
assert.doesNotMatch(render(ready, { warnings: [{ label: "大雨警報", level: "warning" }] }), /発表なし/);
for (const options of [{ dataStatus: "error" }, { warningsAvailable: false }]) {
  const html = render(ready, options);
  assert.match(html, /取得失敗/);
  assert.doesNotMatch(html, /発表なし/);
}
assert.match(render(ready, { loadingLabel: "警報取得中" }), /警報取得中/);
assert.doesNotMatch(render(undefined, { loadingLabel: "警報取得中" }), /警報取得中/);
assert.match(render(undefined, { warningView: "kikikuru" }), /全国のキキクル/);
assert.match(render(undefined, { warningView: "river" }), /全国の河川情報/);
console.log("Warning summary: location, region and source failures never mean no warnings");
