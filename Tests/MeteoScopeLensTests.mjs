import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [indexSource, appSource, styleSource, modalSource] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/style.css", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/meteoScopeLensModal.js", import.meta.url), "utf8")
]);

assert.match(indexSource, /id="meteoscope-lens-button"/);
assert.match(indexSource, /id="meteoscope-lens-modal"/);
assert.match(indexSource, /id="meteoscope-lens-camera-input"[^>]*capture="environment"/);
assert.match(indexSource, /id="meteoscope-lens-library-input"/);
assert.match(indexSource, /id="meteoscope-lens-preview"/);
assert.match(indexSource, /id="meteoscope-lens-download"/);
assert.match(indexSource, /id="meteoscope-lens-share"/);
assert.match(indexSource, /id="meteoscope-lens-early-access"/);

assert.match(appSource, /setupMeteoScopeLensModal/);
assert.match(appSource, /openMeteoScopeLensModal/);
assert.match(appSource, /function syncMeteoScopeLensButton/);
assert.match(appSource, /tabId === "amedas"/);
assert.match(appSource, /earlyAccessEnabled/);
assert.ok(appSource.includes("data: latestDataByTab.amedas"));
assert.ok(appSource.includes("precipitationPeriod: activeAmedasPrecipitationPeriod"));

assert.match(styleSource, /\.map-meteoscope-lens-button\s*\{[\s\S]*?right:\s*9px;[\s\S]*?bottom:\s*82px;[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/);
assert.match(styleSource, /\.map-locate-button\s*\{[\s\S]*?left:\s*9px;[\s\S]*?bottom:\s*82px;/);
assert.match(styleSource, /\.map-meteoscope-lens-button::before/);
assert.match(styleSource, /\.mobile-drawer-open :is\([^)]*map-meteoscope-lens-button/);
assert.match(styleSource, /html\[data-theme="light"\] :is\([^)]*map-meteoscope-lens-button/);

assert.match(modalSource, /getAmedasPrecipitationPeriod/);
assert.match(modalSource, /function findNearestStation/);
assert.match(modalSource, /function applyEarlyAccessState/);
assert.match(modalSource, /function drawTextFitted/);
assert.match(modalSource, /function setFittedCanvasFont/);
assert.match(modalSource, /\^\(\?:\(\\d\+\)\\s\+\)\?\(\\d\+\)px/u);
assert.match(modalSource, /MeteoScope Lensはアーリーアクセス機能/u);
assert.match(modalSource, /AMeDAS ·/u);
assert.match(modalSource, /JMA ·/u);
assert.doesNotMatch(modalSource, /最寄りの観測所・/u);
assert.match(modalSource, /canvas\.toBlob/);
assert.match(modalSource, /navigator\.share/);
assert.match(modalSource, /URL\.revokeObjectURL/);
assert.doesNotMatch(modalSource, /\bfetch\s*\(/);
assert.doesNotMatch(modalSource, /\bFormData\b/);
assert.doesNotMatch(modalSource, /\bXMLHttpRequest\b/);

console.log("MeteoScope Lens tests passed");
