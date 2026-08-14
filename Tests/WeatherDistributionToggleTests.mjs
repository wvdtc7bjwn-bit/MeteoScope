import assert from "node:assert/strict";
import fs from "node:fs";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const panel = fs.readFileSync(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8");
const toggle = fs.readFileSync(new URL("../src/ui/weatherDistributionToggle.js", import.meta.url), "utf8");

assert.match(index, /id="weather-distribution-toggle"/);
assert.match(index, /data-weather-distribution-mode="weather"/);
assert.match(index, /data-weather-distribution-mode="temperature"/);
assert.match(app, /setupWeatherDistributionToggle/);
assert.match(app, /syncWeatherDistributionToggle/);
assert.match(app, /toggleWeatherDistributionPicker/);
assert.match(app, /visible: tab\?\.id === "radar" && Boolean\(weatherDistributionMode\)/);
assert.match(panel, />天気分布予報<\/button>/);
assert.match(panel, /data-weather-distribution-picker/);
assert.match(panel, /event\.target\.closest\("\[data-weather-distribution-picker\]"\)\) return;/);
assert.match(panel, /const isWeatherDistribution = Boolean\(weatherDistributionMode\);/);
assert.match(panel, /state\.weatherDistribution \?\? state\.data\?\.weatherDistribution/);
assert.match(panel, /\$\{distributionLabel\}の時刻を選択/);
assert.match(panel, /timeLabelPrefix = isWeatherDistribution \? "対象時刻"/);
assert.match(panel, /renderWeatherTimeTimeline\([\s\S]*?\{ compact: true \}/);
assert.doesNotMatch(panel, />天気分布<\/button>/);
assert.doesNotMatch(panel, />気温分布<\/button>/);
assert.match(toggle, /setCollapsed\(true\)/);
assert.match(toggle, /data-weather-distribution-mode/);

const choiceHandler = toggle.slice(
  toggle.indexOf("choices.addEventListener"),
  toggle.indexOf("updateWeatherDistributionToggle")
);
assert.doesNotMatch(choiceHandler, /setCollapsed\(true\)/);
assert.match(toggle, /pointerdown/);
assert.match(toggle, /toggleWeatherDistributionPicker/);
assert.match(toggle, /if \(!root \|\| !toggle \|\| !choices\) return;\s*weatherDistributionToggleInitialized = true;/);

console.log("Weather distribution dock and map picker: OK");
