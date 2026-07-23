import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  consolidateVolcanoReports,
  getAvailableVolcanoAshForecasts,
  getHighestPriorityVolcanoReport,
  getLatestVolcanoReportsByType,
  getVolcanoWarningDetailReport,
  groupVolcanoPolygonRings,
  normalizeVolcanoAscii,
  parseVolcanoSeismicCountTable,
  parseVolcanoCoordinate,
  parseVolcanoPolygon,
  selectVolcanoFeedEntries,
  volcanoAlertLevel
} from "../src/jma/volcanoXml.js";
import { getVolcanoLevelColor, getVolcanoLevelTextColor } from "../src/volcanoLevels.js";
import {
  getVolcanoAshfallLegendItems,
  getVolcanoAshfallLevel,
  VOLCANO_SMALL_CINDERS_STYLE
} from "../src/volcanoAshfall.js";

assert.deepEqual(
  [1, 2, 3, 4, 5].map(getVolcanoLevelColor),
  ["#f0f0f8", "#faf700", "#ffad00", "#ff2900", "#ca01f9"]
);
assert.equal(getVolcanoLevelTextColor(3), "#13233a");
assert.equal(getVolcanoLevelTextColor(4), "#ffffff");
const ashfallArea = { category: "ashfall", amount: "heavy" };
assert.deepEqual(
  getVolcanoAshfallLegendItems({ bulletinCode: "VFVO53", areas: [ashfallArea] }),
  [["降灰予報範囲", "", "#969da6"]],
  "降灰予報（定時）は従来の簡潔な凡例を維持する"
);
for (const bulletinCode of ["VFVO54", "VFVO55"]) {
  assert.deepEqual(
    getVolcanoAshfallLegendItems({ bulletinCode, areas: [ashfallArea] }).map(([label]) => label),
    ["降灰 多量", "降灰 やや多量", "降灰 少量"],
    `${bulletinCode} は降灰量3階級の専用凡例を表示する`
  );
}
assert.deepEqual(
  getVolcanoAshfallLegendItems({
    bulletinCode: "VFVO54",
    areas: [{ category: "small-cinders" }]
  }),
  [],
  "降灰域がない場合は降灰量凡例を表示しない"
);
assert.equal(getVolcanoAshfallLevel("heavy").color, "#747b84");
assert.equal(getVolcanoAshfallLevel("moderate").opacity, 0.3);
assert.equal(getVolcanoAshfallLevel("light").color, "#b8bec5");
assert.equal(VOLCANO_SMALL_CINDERS_STYLE.color, "#65329a");

const feedSelection = selectVolcanoFeedEntries([
  ...Array.from({ length: 40 }, (_, index) => ({
    id: `ash-${index}`,
    url: `https://example.test/ash-${index}`,
    code: "VFVO53",
    updated: new Date(Date.UTC(2026, 6, 23, 12, 0, index)).toISOString()
  })),
  { id: "warning", url: "https://example.test/warning", code: "VFVO50", updated: "2026-07-17T06:30:27Z" },
  { id: "commentary", url: "https://example.test/commentary", code: "VFVO51", updated: "2026-07-17T07:04:09Z" }
], 32);
assert.deepEqual(feedSelection.slice(0, 2).map((entry) => entry.code), ["VFVO51", "VFVO50"]);
assert.equal(feedSelection.filter((entry) => entry.code === "VFVO53").length, 10);

const warningDetail = { bulletinCode: "VFVO51", prevention: "火口周辺では大きな噴石に警戒してください。" };
const ashForecastDetail = { bulletinCode: "VFVO53", prevention: "降灰予報の説明" };
assert.equal(getVolcanoWarningDetailReport({ relatedReports: [ashForecastDetail, warningDetail] }), warningDetail);
assert.equal(getVolcanoWarningDetailReport({ relatedReports: [ashForecastDetail] }), null);
const latestReports = getLatestVolcanoReportsByType([
  { id: "commentary-old", bulletinCode: "VFVO51", reportTimeRaw: "2026-07-17T07:00:00+09:00" },
  { id: "ash-old", bulletinCode: "VFVO53", reportTimeRaw: "2026-07-23T08:00:00+09:00" },
  { id: "commentary-new", bulletinCode: "VFVO51", reportTimeRaw: "2026-07-20T16:00:00+09:00" },
  { id: "ash-new", bulletinCode: "VFVO53", reportTimeRaw: "2026-07-23T11:00:00+09:00" }
]);
assert.deepEqual(latestReports.map((report) => report.id), ["ash-new", "commentary-new"]);

const coordinate = parseVolcanoCoordinate("+3026.60+13013.03+657/");
assert.ok(Math.abs(coordinate[0] - 130.2171667) < 0.0001);
assert.ok(Math.abs(coordinate[1] - 30.4433333) < 0.0001);
assert.equal(volcanoAlertLevel("レベル３（入山規制）", "13"), 3);
assert.equal(volcanoAlertLevel("噴火警戒レベル４（避難準備）", ""), 4);
assert.equal(normalizeVolcanoAscii("２０２６年７月・概ね２ｋｍ"), "2026年7月・概ね2km");
assert.equal(normalizeVolcanoAscii("半径２ＫＭ・噴石"), "半径2KM・噴石");
assert.deepEqual(
  parseVolcanoSeismicCountTable(`火山性地震　爆発
7月 17日 5回 0回
18日 10回 0回
19日 9回 0回
20日15時まで 7回 0回`),
  {
    before: [],
    rows: [
      { period: "7月17日", earthquakeCount: "5", explosionCount: "0" },
      { period: "18日", earthquakeCount: "10", explosionCount: "0" },
      { period: "19日", earthquakeCount: "9", explosionCount: "0" },
      { period: "20日15時まで", earthquakeCount: "7", explosionCount: "0" }
    ],
    after: []
  }
);

assert.deepEqual(parseVolcanoPolygon("+31.500+130.500/+31.600+130.500/+31.600+130.600/"), [
  [130.5, 31.5], [130.5, 31.6], [130.6, 31.6], [130.5, 31.5]
]);
const outerAshRing = [[130, 31], [131, 31], [131, 32], [130, 32], [130, 31]];
const ashFreeHole = [[130.2, 31.2], [130.4, 31.2], [130.4, 31.4], [130.2, 31.4], [130.2, 31.2]];
const separateAshRing = [[132, 31], [133, 31], [133, 32], [132, 32], [132, 31]];
assert.deepEqual(groupVolcanoPolygonRings([outerAshRing, ashFreeHole]), [
  { polygon: outerAshRing, holes: [ashFreeHole] }
], "内包ポリゴンは降灰範囲の穴として扱う");
assert.deepEqual(groupVolcanoPolygonRings([outerAshRing, separateAshRing]), [
  { polygon: outerAshRing, holes: [] },
  { polygon: separateAshRing, holes: [] }
], "離れた降灰範囲は別ポリゴンとして残す");
const forecastReport = {
  ashForecasts: [
    { id: "expired", startTimeRaw: "2026-07-23T00:00:00+09:00", endTimeRaw: "2026-07-23T01:00:00+09:00", areas: [{ polygon: [[130, 31], [131, 31], [131, 32], [130, 31]] }] },
    { id: "current", startTimeRaw: "2026-07-23T09:00:00+09:00", endTimeRaw: "2026-07-23T12:00:00+09:00", areas: [{ polygon: [[130, 31], [131, 31], [131, 32], [130, 31]] }] },
    { id: "current-duplicate", startTimeRaw: "2026-07-23T09:00:00+09:00", endTimeRaw: "2026-07-23T12:00:00+09:00", areas: [{ polygon: [[130, 31], [131, 31], [131, 32], [130, 31]] }] },
    { id: "next", startTimeRaw: "2026-07-23T12:00:00+09:00", endTimeRaw: "2026-07-23T15:00:00+09:00", areas: [{ polygon: [[130, 31], [131, 31], [131, 32], [130, 31]] }] }
  ]
};
assert.deepEqual(
  getAvailableVolcanoAshForecasts(forecastReport, Date.parse("2026-07-23T10:00:00+09:00")).map((item) => item.id),
  ["current", "next"],
  "期限切れの降灰予報は地図へ表示しない"
);

const reports = consolidateVolcanoReports([
  { id: "a-new", volcanoCode: "506", volcanoName: "桜島", reportTimeRaw: "2026-07-23T10:00:00+09:00", level: 0, bulletinCode: "VFVO51" },
  { id: "a-status", volcanoCode: "506", volcanoName: "桜島", reportTimeRaw: "2026-07-08T16:00:00+09:00", kindName: "噴火警戒レベル3", level: 3, alertPriority: 3, bulletinCode: "CURRENT" },
  { id: "b-status", volcanoCode: "105", volcanoName: "雌阿寒岳", reportTimeRaw: "2026-07-08T16:00:00+09:00", level: 2, alertPriority: 2, bulletinCode: "CURRENT" }
]);
assert.equal(reports.length, 2, "同じ火山は1件へ統合する");
assert.equal(reports[0].volcanoName, "桜島", "警戒度の高い火山を先頭にする");
assert.equal(reports[0].level, 3, "最新の解説情報で現在の警戒レベルを失わない");
assert.equal(reports[0].currentStatus, "噴火警戒レベル3");
assert.equal(reports[0].relatedReports.length, 2);
assert.equal(
  getHighestPriorityVolcanoReport([
    { volcanoCode: "low", alertPriority: 1, reportTimeRaw: "2026-07-23T12:00:00+09:00" },
    { volcanoCode: "high-old", alertPriority: 3, reportTimeRaw: "2026-07-22T12:00:00+09:00" },
    { volcanoCode: "high-new", alertPriority: 3, reportTimeRaw: "2026-07-23T11:00:00+09:00" }
  ])?.volcanoCode,
  "high-new",
  "要約バーの既定表示は警戒度を優先し、同じ警戒度では新しい発表を選ぶ"
);

const [config, map, app, panel, style, volcanoParser, longPressHint, viteConfig] = await Promise.all([
  readFile(new URL("../src/config.js", import.meta.url), "utf8"),
  readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8"),
  readFile(new URL("../src/style.css", import.meta.url), "utf8"),
  readFile(new URL("../src/jma/volcanoXml.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/earthquakeLongPressHint.js", import.meta.url), "utf8"),
  readFile(new URL("../vite.config.js", import.meta.url), "utf8")
]);
assert.match(config, /volcano\/data\/info\/900\.json/);
assert.match(config, /volcano\/const\/volcano_list\.json/);
assert.match(map, /VOLCANO_MARKER_IMAGE_ID = "volcano-filled-triangle"/);
assert.match(map, /"icon-image": VOLCANO_MARKER_IMAGE_ID/);
assert.match(map, /function setupVolcanoMarkerImage/);
assert.doesNotMatch(map, /"text-field": "△"/);
assert.match(map, /CustomEvent\("volcano-select"/);
assert.match(map, /CustomEvent\("volcano-select"[\s\S]*hideMapInfo\("earthquake-distribution"\);[\s\S]*return;/);
assert.doesNotMatch(map, /popup:\s*buildVolcanoPopup/);
assert.doesNotMatch(map, /function buildVolcanoPopup/);
assert.doesNotMatch(map, /popup:\s*buildAshfallPopup/);
assert.doesNotMatch(map, /function buildAshfallPopup/);
assert.match(map, /markerType:\s*"ashfall"/);
assert.match(map, /coordinates:\s*\[area\.polygon,\s*\.\.\.\(Array\.isArray\(area\.holes\)/);
assert.match(map, /getAvailableVolcanoAshForecasts/);
assert.match(map, /getHighestPriorityVolcanoReport\(reports\)/);
assert.match(map, /volcanoCode:\s*activeVolcanoCode/);
assert.match(map, /volcanoCode: String\(report\.volcanoCode/);
assert.match(map, /layerID === "sample-volcano" \|\| feature\?\.properties\?\.markerType === "ashfall"/);
assert.match(map, /mapInfoElement\.dataset\.variant = variant/);
assert.match(style, /\.map-info-popup\[data-variant="volcano"\]\s*\{\s*z-index: 410;/);
assert.match(app, /setupLongPressButton[\s\S]*data-tab="earthquake"/);
assert.match(app, /setupEarthquakeLongPressHint\(earthquakeTabButton\)/);
assert.match(app, /earthquakeLongPressHint\.showFirstRun\(\)/);
assert.match(longPressHint, /meteoscope-earthquake-long-press-hint-v4/);
assert.match(longPressHint, /document\.querySelector\("\.warning-modal:not\(\[hidden\]\)"\)/);
assert.match(longPressHint, /classList\.contains\("app-initializing"\)/);
assert.match(longPressHint, /地震ボタンを長押し/);
assert.match(style, /\.earthquake-long-press-hint\s*\{/);
assert.match(app, /classList\.toggle\("is-volcano-mode", earthquakeContentMode === "volcano"\)/);
assert.match(app, /selectedVolcanoCode = volcanoCode/);
assert.match(app, /selectedVolcanoBulletinId = String\(bulletinId/);
assert.match(panel, /data-volcano-clear-selection/);
assert.match(panel, /getHighestPriorityVolcanoReport\(reports\)/);
assert.match(panel, /data-volcano-bulletin-id/);
assert.match(panel, /data-volcano-bulletin-back/);
assert.doesNotMatch(panel, /<a class="volcano-history-item"/);
assert.match(panel, /function buildVolcanoBulletinDetail/);
assert.match(panel, /data-volcano-ash-forecast-index/);
assert.match(panel, /data-mobile-dock-control data-volcano-ash-forecast-index/);
assert.match(panel, /class="volcano-ash-timeline"/);
assert.match(panel, /class="volcano-ash-timeline-rail"/);
assert.match(panel, /forecasts\.map\(\(\) => "<i><\/i>"\)/);
assert.match(panel, /data-volcano-ash-forecast-times="\$\{escapeHtml\(JSON\.stringify\(forecastTimes\)\)\}"/);
assert.match(panel, /aria-valuetext="\$\{escapeHtml\(forecastTime\)\}"/);
assert.doesNotMatch(panel, /mobileDock\?\.addEventListener\("input", handleFilterChange\)/, "ドラッグ中にモバイル降灰予報スライダーを再描画しない");
assert.match(panel, /function previewVolcanoAshForecast|const previewVolcanoAshForecast/);
assert.match(panel, /mobileDock\?\.addEventListener\("input", \(event\) => \{[\s\S]*?previewVolcanoAshForecast\(target\)/);
assert.match(panel, /mobileVolcanoAshSliderDragging[\s\S]*?state\.earthquakeContentMode === "volcano"/);
assert.match(panel, /const updateVolcanoAshSliderFromPointer = \(slider, clientX\) =>/);
assert.match(panel, /slider\.value = String\(nextValue\);[\s\S]*?previewVolcanoAshForecast\(slider\)/);
assert.match(panel, /mobileDock\?\.addEventListener\("pointermove", \(event\) => \{[\s\S]*?updateVolcanoAshSliderFromPointer/);
assert.match(
  app,
  /onVolcanoAshForecastChange: \(index\) => \{[\s\S]*?selectedVolcanoAshForecastIndex = index;[\s\S]*?refreshVolcanoView\(\)/
);
assert.match(app, /function refreshVolcanoView[\s\S]*?updateCurrentView/);
assert.match(app, /function updateCurrentView[\s\S]*?scheduleMapRender\(tab\.id, displayData\)/);
assert.match(style, /\.volcano-ash-timeline\s*\{[\s\S]*?height:\s*28px;/);
assert.match(style, /\.volcano-ash-timeline-rail\s*\{[\s\S]*?justify-content:\s*space-between;/);
assert.match(style, /\.volcano-ash-slider::\-webkit-slider-thumb[\s\S]*?width:\s*44px;[\s\S]*?border-radius:\s*999px;/);
assert.doesNotMatch(style, /\.volcano-ash-timeline-rail i\.active/);
assert.match(panel, /function formatVolcanoBulletinTitle/);
assert.match(panel, /replace\(\/\^火山名\[\\s\\u3000\]\*\/u/);
assert.match(panel, /volcano-bulletin-detail-nav volcano-selection-nav/);
assert.match(panel, /data-volcano-clear-selection>← 火山情報の見方/);
assert.doesNotMatch(panel, /一覧へ戻る/);
assert.match(panel, /buildSelectedVolcanoDetail\(selectedReport, selectedBulletinId\)/);
assert.match(panel, /function buildVolcanoAlertLevelGuide/);
assert.match(panel, /buildVolcanoAlertLevelGuide\(\)/);
assert.match(panel, /活火山であることに留意/);
assert.match(panel, /level === 1 \? "活火山に留意" : keyword/);
assert.match(panel, /高齢者等避難/);
assert.doesNotMatch(panel, /visibleReports\.map\(\(report\) => buildVolcanoReportCard/);
assert.doesNotMatch(panel, /function buildVolcanoReportCard/);
assert.doesNotMatch(panel, /function buildVolcanoRelatedReport/);
assert.match(viteConfig, /return "world-geometry"/);
assert.match(panel, /噴火警報・予報の対象市町村/);
assert.match(style, /\.volcano-level-guide\s*\{/);
assert.match(style, /\.volcano-guide-scope-row\s*\{/);
assert.match(style, /\.volcano-guide-scope-row\.level-1 span\s*\{/);
assert.match(style, /\.tab-button\[data-tab="earthquake"\]\.is-volcano-mode\s*\{/);
assert.match(style, /\.volcano-guide-level\s*\{/);
assert.match(style, /\.volcano-history-item\s*\{[\s\S]*?appearance:\s*none;[\s\S]*?border:\s*0;/);
assert.match(style, /\.volcano-history-item:last-child\s*\{\s*border-bottom:\s*0;/);
assert.match(style, /\.volcano-selection-nav\s*\{/);
assert.match(style, /\.level-5\s*\{[\s\S]*?--volcano-level-color:\s*#ca01f9;/);
assert.match(volcanoParser, /function parseVolcanoTargetAreas/);
assert.match(volcanoParser, /"VFVO53"/);
assert.match(volcanoParser, /function parseAshForecasts/);
assert.match(volcanoParser, /export function groupVolcanoPolygonRings/);
assert.match(volcanoParser, /targetAreas: entry\.code === "VFVO50" \? parseVolcanoTargetAreas\(body\) : \[\]/);

console.log("Volcano tests passed");
