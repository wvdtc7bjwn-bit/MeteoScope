import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildNationwideForecastRegions,
  buildNationwideTickerEntries,
  formatNationwideForecastDate,
  formatForecastRegionName,
  formatTickerTemperatures,
  getTickerTargetDateKey,
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
  { status: "fulfilled", value: { displayName: "東京地方", forecast: { days: [{ weather: "晴れ", minTemperature: 17, maxTemperature: 27 }] } } },
  { status: "fulfilled", value: { displayName: "大阪府", forecast: { days: [{ weather: "雨後くもり", maxTemperature: null }] } } },
  { status: "rejected" },
  { status: "fulfilled", value: { officeName: "札幌", days: [] } }
]), ["東京地方　晴れ　最高27℃ / 最低17℃", "大阪府　雨のちくもり"]);
assert.equal(formatTickerTemperatures({ minTemperature: 8.4, maxTemperature: 18.6 }), "　最高19℃ / 最低8℃");
assert.equal(formatTickerTemperatures({ minTemperature: null, maxTemperature: 18 }), "");
assert.deepEqual(buildNationwideTickerEntries([
  { status: "fulfilled", value: { displayName: "宮崎県南部平野部", forecast: { days: [{ weather: "晴れ" }] } } },
  { status: "fulfilled", value: { displayName: "宮崎県北部山沿い", forecast: { days: [{ weather: "晴れ" }] } } },
  { status: "fulfilled", value: { displayName: "宮崎県中部", forecast: { days: [{ weather: "晴れ" }] } } },
  { status: "fulfilled", value: { displayName: "宮崎県北部平野部", forecast: { days: [{ weather: "晴れ" }] } } }
]), [
  "宮崎県北部山沿い　晴れ",
  "宮崎県北部平野部　晴れ",
  "宮崎県中部　晴れ",
  "宮崎県南部平野部　晴れ"
]);
assert.equal(formatNationwideForecastDate([
  { status: "fulfilled", value: { forecast: { days: [{ date: "2026-09-29T00:00:00+09:00" }] } } }
]), "9月29日（火）");
assert.equal(formatNationwideForecastDate([]), "");
const dayBoundaryResults = [{
  status: "fulfilled",
  value: {
    displayName: "東京都東京地方",
    forecast: {
      days: [
        { date: "2026-09-29T00:00:00+09:00", weather: "くもり", minTemperature: 16, maxTemperature: 25 },
        { date: "2026-09-30T00:00:00+09:00", weather: "晴れ", minTemperature: 18, maxTemperature: 27 }
      ]
    }
  }
}];
const beforeNineteen = new Date("2026-09-29T09:59:00Z");
const afterNineteen = new Date("2026-09-29T10:00:00Z");
assert.equal(getTickerTargetDateKey(beforeNineteen), "2026-09-29");
assert.equal(getTickerTargetDateKey(afterNineteen), "2026-09-30");
assert.deepEqual(buildNationwideTickerEntries(dayBoundaryResults, beforeNineteen), ["東京都東京地方　くもり　最高25℃ / 最低16℃"]);
assert.deepEqual(buildNationwideTickerEntries(dayBoundaryResults, afterNineteen), ["東京都東京地方　晴れ　最高27℃ / 最低18℃"]);
assert.equal(formatNationwideForecastDate(dayBoundaryResults, afterNineteen), "9月30日（水）");

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
assert.match(moduleSource, /scheduleTickerRefresh\(\)/u);
assert.match(moduleSource, /displayedTickerDateKey/u);
assert.match(styles, /\.clock-display-mode\s*\{[\s\S]*?position:\s*fixed/u);
assert.match(styles, /\.clock-display-mode\[hidden\]\s*\{\s*display:\s*none/u);
assert.match(styles, /@media \(max-aspect-ratio: 1 \/ 1\)/u);
assert.match(styles, /--clock-display-marquee-duration/u);
assert.match(styles, /\.clock-display-board\.is-loading .clock-display-marquee/u);
assert.match(styles, /\.clock-display-close\s*\{[\s\S]*?position:\s*fixed/u);
console.log("Clock display mode tests passed.");
