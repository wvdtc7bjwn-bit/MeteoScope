import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { escapeHtml } from "../src/utils/html.js";

const source = await readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8");
const context = vm.createContext({
  escapeHtml,
  formatArchiveDate: value => String(value ?? "").replaceAll("-", "/") || "日付不明",
  buildEarthquakeMobileViewSwitch: () => "",
  buildMobileEarthquakeSummaryCarousel: options => options.primaryMarkup
});
vm.runInContext(source.slice(source.indexOf("function buildEarthquakeArchiveMobileContextMarkup("), source.indexOf("function buildDistributionDateButton(")), context);
const data = {
  earthquakeArchiveStatus: "ok",
  earthquakeArchive: {
    totalMatched: 43, complete: true,
    filters: { startDate: "2026-11-12", endDate: "2026-11-18" },
    items: [{ id: "first", place: "Unselected first result" }]
  }
};
const render = changes => context.buildEarthquakeArchiveMobileContextMarkup({ ...data, ...changes });
assert.match(render(), /2026\/11\/12〜2026\/11\/18/);
assert.match(render(), /43<small>件/);
assert.match(render(), /地図の震央を選ぶと詳細を表示/);
assert.doesNotMatch(render(), /Unselected first result/);
assert.match(render({ earthquakeArchiveStatus: "loading", earthquakeArchive: null }), /検索中/);
assert.match(render({ earthquakeArchiveStatus: "refreshing" }), /43<small>件[\s\S]*検索中/);
assert.match(render({ earthquakeArchiveStatus: "error" }), /取得失敗/);
assert.doesNotMatch(render({ earthquakeArchiveStatus: "error" }), /43<small>件/);
assert.match(render({ earthquakeArchiveStatus: "partial-error" }), /一部の期間を取得できていません/);
assert.match(render({ earthquakeArchive: { ...data.earthquakeArchive, totalMatched: 0, items: [] } }), /条件に一致する地震はありません/);
assert.match(render({ earthquakeNearbySearchActive: true }), /震源近傍・震度3以上/);
assert.doesNotMatch(render({ earthquakeArchive: { ...data.earthquakeArchive, filters: { startDate: '<img src="x">' } } }), /<img/);
console.log("Earthquake archive summary tests passed");
