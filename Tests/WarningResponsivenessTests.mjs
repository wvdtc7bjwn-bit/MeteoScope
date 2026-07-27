import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getRiverFloodLevelLabel, isRiverFloodReportActive, normalizeRiverWarningText, resolveRiverFloodLevel } from "../src/jma/riverFlood.js";
import { buildWarningLevelMap, planWarningFeatureStateChanges } from "../src/map/warningFeatureState.js";
import { chunkItems } from "../src/scheduling.js";
import { getRiverFloodWarningStatus, mergeRiverFloodWarningsIntoGroups } from "../src/warningRiverMerge.js";

const [appSource, leftPanelSource, weatherMapSource] = await Promise.all([
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8"),
  readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8")
]);

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
  /warningDetailsLoadedAt = Date\.now\(\);[\s\S]*?weatherMap\?\.prepareWarningData\(latestDataByTab\.warnings\)/
);
assert.match(
  appSource,
  /if \(tab\.id === "warnings" && activeWarningView === "river"\) \{[\s\S]*?refreshRiverFloodData\(\);[\s\S]*?else if \(tab\.id === "warnings"\) \{[\s\S]*?scheduleWarningDetailRefresh\(\)/
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
  /const WARNING_AREA_PAGE_SIZE = 80;[\s\S]*?data-warning-load-more[\s\S]*?warningVisibleAreaCount \+= WARNING_AREA_PAGE_SIZE/
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
  /if \(groups\.length === 0\) \{[\s\S]*?発表中の警報・注意報はありません[\s\S]*?renderWarningGroupsProgressively\(root, groups/
);
assert.doesNotMatch(
  leftPanelSource,
  /河川の警報・注意報/
);
const nonWarningBranch = leftPanelSource.match(
  /if \(!isWarnings\) \{([\s\S]*?)\n  \}/
)?.[1] ?? "";
assert.doesNotMatch(nonWarningBranch, /root\.innerHTML\s*=\s*""/);
assert.doesNotMatch(nonWarningBranch, /activeWarningAreasByCode = new Map\(\)/);
assert.match(
  leftPanelSource,
  /function buildWarningRenderChunks\(groups, chunkSize = 12\)[\s\S]*?areas\.slice\(offset, offset \+ safeChunkSize\)/
);
assert.match(
  leftPanelSource,
  /if \(renderChunks\.length === 0\)[\s\S]*?renderNextChunk\(\);\s*\n\}/
);
assert.match(
  weatherMapSource,
  /function prepareWarningData\(data\)[\s\S]*?updateWarningFeatureStates\(map, statusAreas, "status"\)[\s\S]*?updateWarningFeatureStates\(map, earlyAreas, "early"\)/
);
assert.match(weatherMapSource, /const chunkSize = 8;/);
assert.match(
  weatherMapSource,
  /const WARNING_FEATURE_STATE_KEYS = \{[\s\S]*?status: "warningStatusLevel"[\s\S]*?early: "warningEarlyLevel"/
);
assert.match(
  weatherMapSource,
  /setWarningOverlayVisibility\(map, null\);[\s\S]*?updateWarningFeatureStates\(map, activeAreas, warningView\)\.then\(\(applied\) => \{[\s\S]*?displayGeneration !== displayGeneration[\s\S]*?setWarningOverlayVisibility\(map, warningView\)/
);
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
