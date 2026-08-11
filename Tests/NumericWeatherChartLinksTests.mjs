import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { numericWeatherChartGroups } from "../src/ui/numericWeatherChartModal.js";

const [indexSource, appSource, styleSource, modalSource] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/style.css", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/numericWeatherChartModal.js", import.meta.url), "utf8")
]);

assert.ok(indexSource.includes('id="numeric-weather-chart-button"'));
assert.ok(indexSource.includes('id="numeric-weather-chart-modal"'));
assert.ok(indexSource.includes("https://www.jma.go.jp/bosai/numericmap/"));
assert.ok(appSource.includes("setupNumericWeatherChartModal"));
assert.ok(modalSource.includes("export function setupNumericWeatherChartModal"));
assert.ok(modalSource.includes("export function openNumericWeatherChartModal"));
assert.ok(styleSource.includes(".numeric-weather-chart-open-button::before"));
assert.ok(styleSource.includes(".numeric-weather-chart-panel"));
assert.ok(styleSource.includes(".numeric-weather-chart-panel {\n  width: min(760px, calc(100vw - 28px));\n  max-height: min(84dvh, 760px);\n  padding: 0;"));
assert.ok(styleSource.includes(".numeric-weather-chart-body {\n  min-height: 0;\n  flex: 1 1 auto;\n  display: flex;\n  flex-direction: column;"));
assert.ok(styleSource.includes(".numeric-weather-chart-group {\n  flex: 0 0 auto;\n  display: grid;\n  gap: 8px;\n  min-height: 58px;"));

const chartLinks = numericWeatherChartGroups.flatMap((group) => group.links);
assert.equal(chartLinks.length, 61);
assert.equal(new Set(chartLinks.map((link) => link.href)).size, chartLinks.length);
assert.ok(chartLinks.every((link) => link.href.startsWith("https://")));
assert.ok(chartLinks.every((link) => Number.isFinite(link.leadHours) && link.forecast));
assert.ok(chartLinks.some((link) => link.href.includes("fxfe5782_00.pdf")));
assert.ok(chartLinks.some((link) => link.href.includes("fcvx15_12.png")));
assert.ok(modalSource.includes("const timelineStages"));
assert.ok(modalSource.includes("data-numeric-weather-chart-group-toggle"));
assert.ok(modalSource.includes("setNumericWeatherChartGroupExpanded"));
assert.ok(modalSource.includes('toggle.addEventListener("click", () => toggleNumericWeatherChartGroup(toggle))'));
assert.ok(modalSource.includes('toggle.className = "numeric-weather-chart-group-toggle"'));
assert.ok(!modalSource.includes("settings-group-toggle numeric-weather-chart-group-toggle"));
assert.equal(chartLinks.find((link) => link.href.includes("feas514_12.pdf"))?.leadHours, 144);
assert.equal(chartLinks.find((link) => link.href.includes("feas526_12.pdf"))?.leadHours, 264);

console.log("Numeric weather chart link tests passed");
