import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getRiverFloodLevelLabel, isRiverFloodReportActive, normalizeRiverWarningText, resolveRiverFloodLevel } from "../src/jma/riverFlood.js";
import {
  buildWarningLevelMap,
  planWarningFeatureStateChanges,
  runWarningFeatureStateOperations
} from "../src/map/warningFeatureState.js";
import { WARNING_GEOMETRY_FIX_CODES } from "../src/map/warningGeometryFixCodes.js";
import { chunkItems } from "../src/scheduling.js";
import { getRiverFloodWarningStatus, mergeRiverFloodWarningsIntoGroups } from "../src/warningRiverMerge.js";
import {
  buildWarningOutlookMap,
  getWarningMapTimestamp,
  isWarningMapPayload,
  isWarningMapTimePayload
} from "../src/jma/warnings.js";
import {
  buildMyAreaEarlyWarningSummaries,
  buildMyAreaWarningSummaries,
  findEarlyWarningAreaForMunicipality
} from "../src/warningLocationInsights.js";
import {
  formatWarningOutlookTime,
  getWarningOutlookStartDateDisplay,
  getWarningOutlookTimeDisplay,
  parseWarningOutlookDurationHours,
  splitWarningOutlookRows
} from "../src/warningOutlookTime.js";

const [appSource, warningsSource, leftPanelSource, weatherMapSource, warningGeometryFixes, indexSource, styleSource] = await Promise.all([
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/jma/warnings.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8"),
  readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8"),
  readFile(new URL("../public/data/jma-weather-warning-municipality-fixes.geojson", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/style.css", import.meta.url), "utf8")
]);

const warningGeometryFixCollection = JSON.parse(warningGeometryFixes);
const misakiGeometryFix = warningGeometryFixCollection.features.find((feature) => feature?.properties?.code === "2736600");
const joetsuGeometryFix = warningGeometryFixCollection.features.find((feature) => feature?.properties?.code === "1522200");

const myAreaFixture = [{ areaCode: "2921000", areaName: "香芝市", prefecture: "奈良県" }];
const currentWarningInsights = buildMyAreaWarningSummaries(myAreaFixture, {
  updatedAt: "2026/08/08 04:00",
  activeAreas: [{
    areaCode: "2921000",
    warnings: [{ label: "乾燥注意報", level: "advisory" }]
  }]
});
assert.equal(currentWarningInsights[0].warnings[0].label, "乾燥注意報");
assert.equal(currentWarningInsights[0].hasWarnings, true);

const earlyWarningFixture = {
  earlyDetailsLoaded: true,
  earlyWarnings: {
    updatedAt: "2026/08/08 05:00",
    municipalityAreas: [{
      areaCode: "2921000",
      displayAreaCode: "290010",
      displayAreaName: "奈良県北部",
      probabilities: [
        { type: "大雨", label: "高", level: "high" },
        { type: "波浪", label: "", level: "none" }
      ]
    }]
  }
};
assert.equal(findEarlyWarningAreaForMunicipality("2921000", earlyWarningFixture)?.displayAreaName, "奈良県北部");
const earlyWarningInsights = buildMyAreaEarlyWarningSummaries(myAreaFixture, earlyWarningFixture);
assert.equal(earlyWarningInsights[0].probabilities.length, 1);
assert.equal(earlyWarningInsights[0].probabilities[0].type, "大雨");
assert.equal(earlyWarningInsights[0].hasEarlyWarnings, true);
assert.equal(earlyWarningInsights[0].warnings, undefined, "早期タブに発表中の注意報を混在させない");
const noEarlyWarningInsights = buildMyAreaEarlyWarningSummaries(myAreaFixture, {
  earlyDetailsLoaded: true,
  earlyWarnings: { municipalityAreas: [] }
});
assert.equal(noEarlyWarningInsights.length, 1);
assert.equal(noEarlyWarningInsights[0].hasEarlyWarnings, false);
assert.equal(parseWarningOutlookDurationHours("PT3H"), 3);
assert.equal(parseWarningOutlookDurationHours("P1D"), 24);
assert.equal(parseWarningOutlookDurationHours("P1DT6H"), 30);
assert.equal(parseWarningOutlookDurationHours("PT18H"), 18);
assert.equal(parseWarningOutlookDurationHours("invalid"), 0);
assert.match(leftPanelSource, /warning-outlook-block-\$\{isDaily \? "daily" : "hourly"\}/);
assert.match(leftPanelSource, /splitWarningOutlookRows\(rows\)/);
assert.doesNotMatch(leftPanelSource, /formatDailyOutlookCellLabel/);
assert.match(leftPanelSource, /buildWarningOutlookTable\(area\.rows \?\? \[\], \{ splitLongPeriods: false \}\)/);
assert.match(leftPanelSource, /options\.kind === "combined"/);
assert.match(styleSource, /\.warning-outlook-level-middle\s*\{\s*background:\s*#ffc8b8;/);
assert.match(styleSource, /\.warning-outlook-block-heading\s*\{[^}]*color:\s*#eef5ff;/s);
assert.match(styleSource, /html\[data-theme="light"\] \.warning-outlook-block-heading\s*\{[^}]*color:\s*#17324d;/s);
const dailyOutlookLabel = formatWarningOutlookTime({
  time: "2026-08-08T00:00:00+09:00",
  duration: "P1D"
});
assert.match(dailyOutlookLabel, /^8\/8\s/);
assert.match(dailyOutlookLabel, /翌日/);
assert.notEqual(dailyOutlookLabel, "00時–00時");
assert.deepEqual(getWarningOutlookTimeDisplay({
  time: "2026-08-08T00:00:00+09:00",
  duration: "P1D"
}), {
  dateLabel: "8/8",
  timeLabel: "00時–翌日00時"
});
assert.deepEqual(getWarningOutlookStartDateDisplay({
  time: "2026-08-09T00:00:00+09:00"
}), {
  key: "2026-08-09",
  label: "8/9"
});
const splitOutlookRows = splitWarningOutlookRows([{
  type: "dry",
  localName: "hourly-area",
  slots: [
    { time: "2026-08-08T06:00:00+09:00", duration: "PT3H", level: 2 },
    { time: "2026-08-08T09:00:00+09:00", duration: "PT3H", level: 2 },
    { time: "2026-08-09T00:00:00+09:00", duration: "PT3H", level: 2 }
  ]
}, {
  type: "dry",
  localName: "daily-area",
  slots: [
    { time: "2026-08-08T06:00:00+09:00", duration: "PT18H", level: 0 }
  ]
}, {
  type: "thunder",
  localName: "",
  slots: [
    { time: "2026-08-08T06:00:00+09:00", duration: "PT3H", level: 2 }
  ]
}]);
assert.deepEqual(
  splitOutlookRows.dailyRows[0].slots.map((slot) => slot.duration),
  ["PT18H"]
);
assert.deepEqual(
  splitOutlookRows.hourlyRows.find((row) => row.type === "dry"),
  undefined,
  "日ごとの見通しがある種別は時間帯表へ重複表示しない"
);
assert.equal(
  splitOutlookRows.hourlyRows.find((row) => row.type === "thunder")?.slots.length,
  1,
  "別種別の時間帯見通しは保持する"
);
const dailyOnlyWarningTypes = ["乾燥", "なだれ", "低温", "霜"];
const splitDailyOnlyOutlookRows = splitWarningOutlookRows([
  {
    type: "乾燥",
    localName: "",
    slots: [
      { time: "2026-08-08T12:00:00+09:00", duration: "PT12H", level: 2 },
      { time: "2026-08-09T00:00:00+09:00", duration: "PT24H", level: 0 }
    ]
  },
  ...dailyOnlyWarningTypes.slice(1).map((type) => ({
    type,
    localName: "",
    slots: [{
      time: "2026-08-08T12:00:00+09:00",
      duration: "PT3H",
      level: 2
    }]
  })),
  {
    type: "雷",
    localName: "",
    slots: [{
      time: "2026-08-08T12:00:00+09:00",
      duration: "PT3H",
      level: 2
    }]
  }
]);
assert.deepEqual(
  splitDailyOnlyOutlookRows.dailyRows.map((row) => row.type),
  dailyOnlyWarningTypes,
  "乾燥・なだれ・低温・霜は期間の長さに関係なく日ごとの見通しへ分類する"
);
assert.deepEqual(
  splitDailyOnlyOutlookRows.dailyRows.find((row) => row.type === "乾燥")?.slots.map((slot) => slot.time),
  ["2026-08-08T12:00:00+09:00", "2026-08-09T00:00:00+09:00"],
  "日ごとの見通しに本日開始の枠も残す"
);
assert.equal(
  splitDailyOnlyOutlookRows.hourlyRows.some((row) => dailyOnlyWarningTypes.includes(row.type)),
  false,
  "日ごと扱いの4種は時間帯ごとの見通しへ重複表示しない"
);
assert.equal(
  splitDailyOnlyOutlookRows.hourlyRows.find((row) => row.type === "雷")?.slots.length,
  1,
  "通常の短時間枠は時間帯ごとの見通しに残す"
);
assert.deepEqual(getWarningOutlookTimeDisplay({
  time: "2026-08-08T21:00:00+09:00",
  duration: "PT3H"
}, {
  indicateDayChange: false
}), {
  dateLabel: "",
  timeLabel: "21時–00時"
});
assert.match(leftPanelSource, /warning-outlook-date-row/);
assert.match(leftPanelSource, /indicateDayChange:\s*false/);
assert.match(styleSource, /warning-outlook-date-row[\s\S]*?background:\s*rgba\(100, 176, 236, 0\.16\)/);
assert.match(styleSource, /html\[data-theme="light"\][\s\S]*?warning-outlook-date-row/);

const class10OutlookMap = buildWarningOutlookMap([{
  timeSeries: [{
    timeDefines: [{ dateTime: "2026-08-08T06:00:00+09:00", duration: "PT3H" }],
    class10Items: [{
      areaCode: "030010",
      kinds: [{
        significancyParts: [{
          type: "雷危険度",
          locals: [{ codes: ["20"] }]
        }]
      }]
    }]
  }]
}], {
  byCode: new Map([["0352400", { code: "0352400", name: "一戸町" }]]),
  byParentCode: new Map()
}, {
  collectMunicipalityCodes: (areaCode) => areaCode === "030010" ? ["0352400"] : []
});
assert.equal(class10OutlookMap.has("0352400"), true);
assert.equal(class10OutlookMap.get("0352400")?.[0]?.slots?.[0]?.level, 2);
assert.match(warningsSource, /buildWarningOutlookMap\([\s\S]*?areaHierarchy/);
assert.match(formatWarningOutlookTime({
  time: "2026-08-08T00:00:00+09:00",
  duration: "PT3H"
}), /00時–03時/);
assert.equal(formatWarningOutlookTime({
  time: "2026-08-08T00:00:00+09:00",
  duration: ""
}), "00時");
assert.match(appSource, /if \(!\["status", "early"\]\.includes\(activeWarningView\)\) return null;/);
assert.match(leftPanelSource, /warningView === "early"[\s\S]*?buildMyAreaEarlyWarningBadges/);
assert.match(leftPanelSource, /const isLayerRefresh = Boolean\(root\.querySelector\("\.warning-kikikuru-panel"\)\);/);
assert.match(leftPanelSource, /if \(!isLayerRefresh\) animateWarningDetailContent\(root\);/);
assert.match(leftPanelSource, /const canReuseButtons = currentButtons\.length === options\.length/);
assert.match(leftPanelSource, /if \(canReuseButtons\)[\s\S]*?syncMobileDockSegmentIndicator\(root\);[\s\S]*?return;/);
assert.match(styleSource, /\.mobile-dock-segmented button\s*\{[\s\S]*?transition-property: border-color, background-color;/);
assert.match(styleSource, /\.mobile-dock-segmented \.mobile-dock-action:not\(:disabled\):active,[\s\S]*?transform: none;/);
assert.ok(WARNING_GEOMETRY_FIX_CODES.includes("2736600"));
assert.ok(misakiGeometryFix, "岬町の警報境界補正が必要です");
assert.equal(countStrictGeometryIntersections(misakiGeometryFix.geometry), 0);
assert.ok(WARNING_GEOMETRY_FIX_CODES.includes("1522200"));
assert.ok(joetsuGeometryFix, "上越市の警報境界補正が必要です");
assert.equal(countStrictGeometryIntersections(joetsuGeometryFix.geometry), 0);

assert.equal(
  normalizeRiverWarningText("【警戒レベル３相当情報】袋川では、今後、氾濫危険水位に到達する見込み"),
  "【警戒レベル３相当情報】袋川では、今後、氾濫危険水位に到達する見込み"
);
assert.equal(
  normalizeRiverWarningText("【警戒レベル３相当】千歳橋基準観測所［洪水］ 受け持ち区間"),
  "【警戒レベル３相当】千歳橋基準観測所 受け持ち区間"
);
assert.equal(resolveRiverFloodLevel({
  condition: "レベル３氾濫警報（発表）",
  kindNames: ["氾濫警戒情報"],
  title: "指定河川洪水予報"
}), 3);
assert.equal(resolveRiverFloodLevel({
  kindNames: ["氾濫危険情報"],
  title: "指定河川洪水予報"
}), 4);
assert.deepEqual(
  [2, 3, 4, 5].map(getRiverFloodLevelLabel),
  [
    "レベル2 氾濫注意報",
    "レベル3 氾濫警報",
    "レベル4 氾濫危険警報",
    "レベル5 氾濫特別警報・発生情報"
  ]
);
assert.equal(isRiverFloodReportActive({
  level: 2,
  title: "太平川レベル2氾濫注意報（警報解除）",
  condition: "レベル2氾濫注意報（警報解除）"
}), true);
assert.equal(isRiverFloodReportActive({
  level: 2,
  title: "太平川レベル2氾濫注意報解除",
  condition: "解除"
}), false);
assert.equal(isRiverFloodReportActive({
  level: 3,
  title: "太平川レベル3氾濫警報",
  condition: "発表"
}), true);

const mergedRiverWarningGroups = mergeRiverFloodWarningsIntoGroups([
  {
    prefecture: "秋田県",
    count: 1,
    areas: [{
      areaCode: "0520100",
      areaName: "秋田市",
      warnings: [{ label: "大雨注意報", level: "advisory" }]
    }]
  }
], [{
  id: "820209000400",
  forecastAreaName: "太平川",
  level: 3,
  levelLabel: "レベル3 氾濫警報",
  headline: "【警戒レベル3相当情報［洪水］】〔継続〕太平川では、避難判断水位を上回る水位が続く見込み",
  updatedAt: "2026/07/26 00:10",
  affectedAreas: [
    { prefecture: "秋田県", city: "秋田市", cityCode: "0520100" },
    { prefecture: "秋田県", city: "秋田市", cityCode: "0520100" }
  ]
}]);
assert.deepEqual(
  mergedRiverWarningGroups[0].areas[0].warnings.map((warning) => [warning.label, warning.level]),
  [
    ["太平川・レベル3 氾濫警報", "warning"],
    ["大雨注意報", "advisory"]
  ]
);
assert.equal(mergedRiverWarningGroups[0].areas[0].warnings[0].status, "継続");
assert.equal(getRiverFloodWarningStatus({
  headline: "【警戒レベル2情報［洪水］】〔新規〕吉田川では、氾濫注意水位に到達"
}), "発表");
assert.equal(getRiverFloodWarningStatus({
  headline: "【警戒レベル2情報［洪水］】〔警戒レベル3相当から2に切替〕太平川では、水位が低下"
}), "切替");

const syntheticRiverWarningGroups = mergeRiverFloodWarningsIntoGroups([], [{
  id: "river-level-4",
  forecastAreaName: "見本川",
  level: 4,
  levelLabel: "レベル4 氾濫危険警報",
  affectedAreas: [{ prefecture: "見本県", city: "見本市", cityCode: "0000001" }]
}]);
assert.equal(syntheticRiverWarningGroups[0].areas[0].areaName, "見本市");
assert.equal(syntheticRiverWarningGroups[0].areas[0].warnings[0].level, "danger");

const officeCodes = Array.from({ length: 58 }, (_, index) => String(index + 1));
const officeCodeBatches = chunkItems(officeCodes, 8);
assert.deepEqual(officeCodeBatches.map((batch) => batch.length), [8, 8, 8, 8, 8, 8, 8, 2]);
assert.deepEqual(officeCodeBatches.flat(), officeCodes);

const mapTimePayload = { latestControlDatetime: "2026-08-03T09:59:35Z" };
assert.equal(isWarningMapTimePayload(mapTimePayload), true);
assert.equal(getWarningMapTimestamp(mapTimePayload), "2026-08-03T09:59:35Z");
assert.equal(isWarningMapTimePayload({ latestControlDatetime: "" }), false);
const aggregateFixture = [{
  reportDatetime: "2026-08-03T16:06:00+09:00",
  warning: { class20Items: [{ areaCode: "4320200", kinds: [] }] }
}];
assert.equal(isWarningMapPayload(aggregateFixture), true);
assert.equal(isWarningMapPayload([{ reportDatetime: "2026-08-03T16:06:00+09:00" }]), false);

const levels = buildWarningLevelMap([
  { areaCode: "0110100", level: "advisory" },
  { areaCode: "0110200", level: "warning" },
  { areaCode: "", level: "warning" },
  { areaCode: "0110100", level: "danger" }
]);
assert.deepEqual([...levels], [
  ["0110100", "danger"],
  ["0110200", "warning"]
]);

const currentLevels = new Map([
  ["0110100", "advisory"],
  ["0110200", "warning"],
  ["0120200", "emergency"]
]);
const plan = planWarningFeatureStateChanges(currentLevels, [
  { areaCode: "0110100", level: "danger" },
  { areaCode: "0110200", level: "warning" },
  { areaCode: "0130300", level: "advisory" }
]);
assert.deepEqual(plan.operations, [
  { type: "remove", areaCode: "0120200" },
  { type: "set", areaCode: "0110100", level: "danger" },
  { type: "set", areaCode: "0130300", level: "advisory" }
]);

const unchanged = planWarningFeatureStateChanges(plan.desiredLevels, [
  { areaCode: "0110100", level: "danger" },
  { areaCode: "0110200", level: "warning" },
  { areaCode: "0130300", level: "advisory" }
]);
assert.deepEqual(unchanged.operations, []);

let simulatedNow = 0;
let simulatedFrames = 0;
let simulatedApplied = 0;
const largeOperationResult = await runWarningFeatureStateOperations(
  Array.from({ length: 1000 }, (_, index) => ({ type: "set", areaCode: String(index), level: "warning" })),
  {
    budgetMs: 7,
    maxPerFrame: 48,
    now: () => simulatedNow,
    yieldFrame: async () => { simulatedFrames += 1; },
    apply: () => {
      simulatedApplied += 1;
      simulatedNow += 0.14;
    }
  }
);
assert.equal(largeOperationResult.applied, true);
assert.equal(simulatedApplied, 1000);
assert.equal(largeOperationResult.frameCount, simulatedFrames);
assert.ok(largeOperationResult.frameCount >= 21 && largeOperationResult.frameCount <= 22);
assert.ok(largeOperationResult.maxFrameDurationMs <= 6.8);

let cancelChecks = 0;
let cancelledApplied = 0;
const cancelledOperationResult = await runWarningFeatureStateOperations(
  Array.from({ length: 100 }, (_, index) => ({ areaCode: String(index) })),
  {
    maxPerFrame: 32,
    yieldFrame: async () => {},
    isCurrent: () => ++cancelChecks < 3,
    apply: () => { cancelledApplied += 1; }
  }
);
assert.equal(cancelledOperationResult.applied, false);
assert.equal(cancelledApplied, 64);

assert.match(
  appSource,
  /function scheduleCriticalWarningPrefetch\(\)[\s\S]*?await prefetchTabData\("warnings"\);[\s\S]*?setTimeout\(\(\) => void run\(\), 250\)/
);
assert.doesNotMatch(
  appSource.match(/function scheduleCriticalWarningPrefetch\(\)[\s\S]*?\n  \}/)?.[0] ?? "",
  /refreshWarningDetailsData|refreshRiverFloodData/
);
assert.match(
  appSource,
  /const startUserServices = \(\) => \{[\s\S]*?scheduleCriticalWarningPrefetch\(\);[\s\S]*?selectTab\(activeTab\)/
);
assert.doesNotMatch(
  appSource,
  /\.sort\(\(left, right\) => Number\(right\.id === "warnings"\) - Number\(left\.id === "warnings"\)\)/
);
assert.match(
  appSource,
  /if \(tabId === "warnings"\) weatherMap\?\.prepareWarningData\(latestDataByTab\[tabId\]\)/
);
assert.doesNotMatch(appSource, /queueWarningFullRefresh|refreshAllWarningData/);
assert.match(
  appSource,
  /function updateCurrentView\(tab, data, options = \{\}\)[\s\S]*?scheduleMapRender\(tab\.id, displayData\);[\s\S]*?if \(options\.deferPanel\)/
);
assert.doesNotMatch(appSource, /yieldToMainThread\(tab\.id === "warnings" \? 160 : 0\)/);
assert.match(
  appSource,
  /activeWarningView = "early";[\s\S]*?updateCurrentView\(tab, latestDataByTab\.warnings, \{ immediateMap: true \}\)/
);
assert.match(
  appSource,
  /warningDetailsLoadedAtByKey\.set\(requestKey, Date\.now\(\)\);[\s\S]*?weatherMap\?\.prepareWarningData\(latestDataByTab\.warnings\)/
);
assert.match(
  appSource,
  /const EARLY_WARNING_REFRESH_INTERVAL_MS = 60 \* 1000;[\s\S]*?function syncEarlyWarningRefreshTimer\(\)[\s\S]*?activeTab !== "warnings" \|\| activeWarningView !== "early"[\s\S]*?refreshWarningDetails\(\{ force: true, includeEarlyWarnings: true \}\)/
);
assert.match(
  appSource,
  /document\.addEventListener\("visibilitychange"[\s\S]*?syncEarlyWarningRefreshTimer\(\);[\s\S]*?refreshWarningDetails\(\{ includeEarlyWarnings: true \}\)/
);
assert.match(
  warningsSource,
  /fetchJson\(JMA_ENDPOINTS\.probabilityMap, \{[\s\S]*?ttlMs: 0,[\s\S]*?cache: "no-cache"/
);
assert.doesNotMatch(
  appSource,
  /else if \(tab\.id === "warnings"\)[\s\S]*?refreshWarningDetails/
);
assert.match(
  appSource,
  /onDetailRequest: \(areaCode\) => refreshWarningDetails\(\{ areaCode \}\)/
);
assert.match(
  appSource,
  /activeTab === "warnings" && tab\.id !== "warnings" && warningDetailsRequest\?\.abortOnTabChange/
);
assert.match(
  appSource,
  /riverFloodLoadedAt = Date\.now\(\);[\s\S]*?refreshWarningsView\(\{ view: "river", updateMap: true \}\);/
);
assert.match(
  appSource,
  /warningKikikuruLoadedAt = Date\.now\(\);[\s\S]*?refreshWarningsView\(\{ view: "kikikuru", updateMap: true \}\);/
);
assert.match(
  appSource,
  /function refreshWarningsView\(options = \{\}\)[\s\S]*?skipMap: options\.updateMap !== true/
);
assert.match(
  appSource,
  /weatherMap\?\.prepareWarningData\(latestDataByTab\.warnings\);[\s\S]*?refreshWarningsView\(\{ updateMap: true \}\);/
);
assert.match(
  appSource,
  /if \(!options\.skipMap\) \{[\s\S]*?if \(options\.immediateMap\) \{[\s\S]*?invalidateScheduledMapRender\(\);[\s\S]*?weatherMap\?\.renderData\(tab\.id, displayData\)/
);
assert.match(
  leftPanelSource,
  /function renderWarningGroupAccordions\(root, groups, warningView\)[\s\S]*?activeWarningGroupsByKey = new Map\(\);[\s\S]*?warningGroupKeyByAreaCode = new Map\(\);[\s\S]*?buildWarningGroupAccordionMarkup/
);
assert.match(
  leftPanelSource,
  /const openGroupKey = selectedGroupKey[\s\S]*?activeWarningGroupsByKey\.has\(expandedWarningGroupKey\)[\s\S]*?: ""/
);
assert.match(
  styleSource,
  /\.warning-prefecture-group-warning\s*\{\s*--warning-group-color:\s*#ff2b12;\s*\}[\s\S]*?\.warning-prefecture-group-advisory\s*\{\s*--warning-group-color:\s*#fff000;\s*\}/
);
assert.match(
  styleSource,
  /\.warning-prefecture-group-high\s*\{\s*--warning-group-color:\s*#ff6b73;\s*\}[\s\S]*?\.warning-prefecture-group-middle\s*\{\s*--warning-group-color:\s*#ffc8b8;\s*\}/
);
assert.match(
  appSource,
  /function schedulePanelRender\(tab, panelState\)[\s\S]*?requestAnimationFrame\(\(\) => \{[\s\S]*?requestAnimationFrame\(\(\) => \{[\s\S]*?renderLeftPanelState\(tab, panelState\)/
);
assert.match(
  leftPanelSource,
  /const canReuseRenderedDetails =[\s\S]*?lastWarningDetailsData === state\.data[\s\S]*?lastWarningDetailsAreaCode === selectedWarningAreaCode/
);
assert.match(
  leftPanelSource,
  /const groups = mergeRiverFloodWarningsIntoGroups\([\s\S]*?state\.data\?\.groups \?\? \[\],[\s\S]*?getRiverFloodReports\(state\.data\?\.riverFlood\)[\s\S]*?\);/
);
assert.match(
  leftPanelSource,
  /function localizeWarningDisplayText\(value\)[\s\S]*?localizeText\(source, language\)[\s\S]*?split\(\/\(\\s\+\|・\)\//
);
assert.match(
  leftPanelSource,
  /mobile-dock-kikikuru-label[^]*?localizeWarningDisplayText\("表示レイヤー"\)/
);
assert.match(
  leftPanelSource,
  /function localizeWarningDataText\(value, fallback = ""\)[\s\S]*?containsJapaneseWarningText\(localized\)[\s\S]*?localizeWarningDisplayText\(fallback\)/
);
assert.match(
  leftPanelSource,
  /function getRiverForecastDisplayName\(report = \{\}\)[\s\S]*?Designated river forecast[\s\S]*?localizeWarningDataText/
);
assert.match(
  leftPanelSource,
  /function buildRiverBulletinTextMarkup\(report = \{\}\)[\s\S]*?Check the original JMA bulletin[\s\S]*?気象庁発表原文を確認/
);
assert.match(
  leftPanelSource,
  /buildRiverFloodListMarkup[\s\S]*?getRiverForecastDisplayName\(report\)[\s\S]*?localizeWarningDisplayText\(report\.levelLabel\)/
);
assert.match(
  leftPanelSource,
  /if \(groups\.length === 0\) \{[\s\S]*?発表中の警報・注意報はありません[\s\S]*?renderWarningGroupAccordions\(root, groups, "status"\)/
);
assert.doesNotMatch(
  leftPanelSource,
  /河川の警報・注意報/
);
const nonWarningBranch = leftPanelSource.match(
  /function renderWarningDetails\(tab, state, warningView = "status"\)[\s\S]*?if \(!isWarnings\) \{([\s\S]*?)\n  \}/
)?.[1] ?? "";
assert.doesNotMatch(nonWarningBranch, /root\.innerHTML\s*=\s*""/);
assert.doesNotMatch(nonWarningBranch, /activeWarningAreasByCode = new Map\(\)/);
assert.match(
  leftPanelSource,
  /function setWarningGroupExpanded\(root, groupKey, expanded[\s\S]*?buildWarningAreaRowsMarkup\(entry\.group, entry\.warningView\)[\s\S]*?aria-expanded/
);
assert.match(
  leftPanelSource,
  /function toggleWarningGroup\(root, groupKey\)[\s\S]*?warning-prefecture-group\.is-open[\s\S]*?setWarningGroupExpanded/
);
assert.match(indexSource, /id="warning-view-tabs"[^>]*role="tablist"/);
assert.match(leftPanelSource, /function getWarningViewOptions\(warningView\)[\s\S]*?status[\s\S]*?early[\s\S]*?kikikuru[\s\S]*?river/);
assert.match(leftPanelSource, /function renderWarningViewTabs\(tab, warningView\)[\s\S]*?getWarningViewOptions\(warningView\)/);
assert.match(leftPanelSource, /function renderKikikuruWarningDetails\(root, state, activeKikikuruLayer\)/);
assert.match(leftPanelSource, /function animateWarningDetailContent\(root\)[\s\S]*?is-entering/);
assert.match(styleSource, /\.warning-prefecture-body\s*\{[\s\S]*?grid-template-rows:\s*0fr;[\s\S]*?transition:/);
assert.match(styleSource, /\.warning-prefecture-group\.is-open \.warning-prefecture-body\s*\{[\s\S]*?grid-template-rows:\s*1fr;/);
assert.doesNotMatch(leftPanelSource, /data-warning-load-more|WARNING_AREA_PAGE_SIZE/);
assert.match(
  weatherMapSource,
  /function prepareWarningData\(data\)[\s\S]*?updateWarningFeatureStates\(map, statusAreas, "status"\)[\s\S]*?updateWarningFeatureStates\(map, earlyAreas, "early"\)/
);
assert.match(weatherMapSource, /runWarningFeatureStateOperations\(operations, \{[\s\S]*?budgetMs: 7,[\s\S]*?maxPerFrame: getWarningFeatureStateBatchLimit\(\)/);
assert.match(
  weatherMapSource,
  /const WARNING_FEATURE_STATE_KEYS = \{[\s\S]*?status: "warningStatusLevel"[\s\S]*?early: "warningEarlyLevel"/
);
const activeWarningPaintBranch = weatherMapSource.match(
  /function updateWarningMunicipalityPaint\(map, mode, data = \{\}\) \{[\s\S]*?\n\}/
)?.[0] ?? "";
assert.match(activeWarningPaintBranch, /if \(!cache\.visibleChannel\) \{[\s\S]*?setWarningOverlayVisibility\(map, warningView\)/);
assert.doesNotMatch(activeWarningPaintBranch, /setWarningOverlayVisibility\(map, null\);\s*setWarningHatchVisibility\(map, false\);\s*\n\s*void updateWarningFeatureStates/);
assert.match(
  weatherMapSource,
  /const visible = mode === "warnings" && data\?\.activeWarningView === "river";/
);
assert.match(
  weatherMapSource,
  /const WARNING_EARLY_OVERLAY_LAYER_IDS = \[[\s\S]*?function setWarningOverlayVisibility\(map, warningView = null\)/
);
assert.doesNotMatch(weatherMapSource, /setWarningOverlayPaint|updateWarningHatchPaint/);

console.log("Warning responsiveness tests passed");

function countStrictGeometryIntersections(geometry) {
  const polygons = geometry?.type === "Polygon"
    ? [geometry.coordinates]
    : geometry?.type === "MultiPolygon"
      ? geometry.coordinates
      : [];
  let crossings = 0;
  polygons.forEach((polygon) => polygon.forEach((ring) => {
    for (let index = 0; index < ring.length - 1; index += 1) {
      for (let compared = index + 2; compared < ring.length - 1; compared += 1) {
        if (index === 0 && compared === ring.length - 2) continue;
        const [a, b, c, d] = [ring[index], ring[index + 1], ring[compared], ring[compared + 1]];
        if (orientation(a, b, c) * orientation(a, b, d) < 0
          && orientation(c, d, a) * orientation(c, d, b) < 0) crossings += 1;
      }
    }
  }));
  return crossings;
}

function orientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
