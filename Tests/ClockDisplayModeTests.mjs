import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildNationwideForecastRegions,
  buildNationwideTickerEntries,
  formatForecastRegionName,
  normalizeTickerWeather
} from "../src/ui/clockDisplayMode.js";

assert.deepEqual(buildNationwideForecastRegions([{
  officeCode: "130000",
  officeName: "東京管区気象台",
  regions: [{ areaCode: "130000", forecastAreaCode: "130010", areaName: "東京地方" }]
}]), [{
  officeCode: "130000",
  officeName: "東京管区気象台",
  regions: [{ areaCode: "130000", forecastAreaCode: "130010", areaName: "東京地方" }]
}]);
assert.equal(normalizeTickerWeather("雨後くもり"), "雨のちくもり");
assert.equal(formatForecastRegionName("嶺南", "福井地方気象台"), "福井県嶺南");
assert.equal(formatForecastRegionName("南部", "札幌管区気象台"), "北海道南部");
assert.equal(formatForecastRegionName("東京地方", "東京管区気象台"), "東京地方");
assert.equal(formatForecastRegionName("嶺北", "福井地方気象台"), "福井県嶺北");
assert.equal(formatForecastRegionName("石狩地方", "石狩・空知・後志地方"), "北海道石狩地方");
assert.deepEqual(buildNationwideTickerEntries([
  { status: "fulfilled", value: { displayName: "東京地方", forecast: { days: [{ weather: "晴れ", maxTemperature: 27 }] } } },
  { status: "fulfilled", value: { displayName: "大阪府", forecast: { days: [{ weather: "雨後くもり", maxTemperature: null }] } } },
  { status: "rejected" },
  { status: "fulfilled", value: { officeName: "札幌", days: [] } }
]), ["東京地方　晴れ 27℃", "大阪府　雨のちくもり"]);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [html, styles, appSource, moduleSource] = await Promise.all([
  fs.readFile(path.join(root, "index.html"), "utf8"),
  fs.readFile(path.join(root, "src", "style.css"), "utf8"),
  fs.readFile(path.join(root, "src", "app.js"), "utf8"),
  fs.readFile(path.join(root, "src", "ui", "clockDisplayMode.js"), "utf8")
]);
assert.match(html, /<button id="clock"[^>]*時計表示モード/u);
assert.match(html, /id="clock-display-mode"[\s\S]*id="clock-display-marquee-line"[\s\S]*id="clock-display-time"/u);
assert.match(appSource, /setupClockDisplayMode\(\)/u);
assert.match(moduleSource, /navigator\.wakeLock\.request\s*\(\s*"screen"\s*\)/u);
assert.match(moduleSource, /Math\.min\(2, offices\.length\)/u);
assert.match(moduleSource, /fetchWeeklyForecastsForOfficeRegions/u);
assert.match(moduleSource, /board\?\.classList\.add\("is-loading"\)/u);
assert.match(moduleSource, /document\.addEventListener\("click"/u);
assert.match(moduleSource, /closeButton\?\.addEventListener\("click"/u);
assert.match(moduleSource, /window\.innerWidth > window\.innerHeight/u);
assert.match(moduleSource, /releaseWakeLock\(\)/u);
assert.match(styles, /\.clock-display-mode\s*\{[\s\S]*?position:\s*fixed/u);
assert.match(styles, /\.clock-display-mode\[hidden\]\s*\{\s*display:\s*none/u);
assert.match(styles, /@media \(max-aspect-ratio: 1 \/ 1\)/u);
assert.match(styles, /--clock-display-marquee-duration/u);
assert.match(styles, /\.clock-display-board\.is-loading .clock-display-marquee/u);
assert.match(styles, /\.clock-display-close\s*\{[\s\S]*?position:\s*fixed/u);
console.log("Clock display mode tests passed.");
