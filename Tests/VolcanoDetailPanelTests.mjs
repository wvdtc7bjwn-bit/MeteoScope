import assert from "node:assert/strict";
import { renderVolcanoList } from "../src/ui/panels/volcanoPanel.js";

const warning = { id: "warning", bulletinCode: "VFVO51", volcanoCode: "999", volcanoName: "確認用火山（火口名）",
  reportTime: "2026/11/27 16:00", reportTimeRaw: "2026-11-27T16:00:00+09:00", level: 3,
  currentStatus: "レベル3（入山規制）", title: "火山の状況に関する解説情報", infoKind: "火山の状況に関する解説情報",
  prevention: "警戒範囲の原文を省略せずに表示。<安全情報>", activity: "活動の本文。\n\n詳しい観測内容。",
  nextAdvisory: "状況が変わった場合は随時発表。", sourceUrl: "https://www.jma.go.jp/example.xml" };
const forecast = { ...warning, id: "forecast", bulletinCode: "VFVO53", title: "降灰予報（定時）", headline: "発表内容の原文。" };
const report = { ...warning, relatedReports: [warning, forecast] };
const render = (selectedBulletinId = "") => {
  let html = "";
  renderVolcanoList({ status: "ok", selectedVolcanoCode: "999", selectedVolcanoBulletinId: selectedBulletinId,
    data: { reports: [report] } }, output => { html = output; });
  return html;
};
const overview = render();
assert.match(overview, /volcano-overview/);
assert.doesNotMatch(overview, /地図で選択中|volcano-selection-nav/);
assert.match(overview, /data-volcano-clear-selection>火山情報の見方/);
assert.ok(overview.indexOf('class="volcano-reference-links"') < overview.indexOf('class="volcano-detail-section volcano-safety-section"'), "external volcano pages remain near the heading");
let craterOverview;
renderVolcanoList({ status: "ok", selectedVolcanoCode: "999", data: { reports: [{ ...report, volcanoName: "確認用火山", craterName: "火口名", relatedReports: [{ ...warning, craterName: "火口名" }] }] } }, html => { craterOverview = html; });
assert.match(craterOverview, /<h2>確認用火山<\/h2>/);
assert.match(craterOverview, /class="volcano-crater-name">火口名<\/span>/);
assert.match(overview, /aria-label="現在の噴火警報・予報"/);
assert.match(overview, /噴火警戒レベル3/);
assert.match(overview, /<strong>入山規制<\/strong>/);
const safety = overview.match(/<section class="volcano-detail-section volcano-safety-section">([\s\S]*?)<\/section>/)[1];
assert.match(safety, /警戒範囲の原文を省略せずに表示。&lt;安全情報&gt;/, "safety instructions remain fully visible, with safe escaping");
assert.doesNotMatch(safety, /<details/);
for (const section of ["activity", "next", "history"]) {
  assert.match(overview, new RegExp(`<details[^>]*data-volcano-section="${section}">`));
}
assert.doesNotMatch(overview, /<details[^>]*\bopen\b/, "long supporting sections start collapsed");
assert.match(overview, /活動の本文。/);
assert.match(overview, /詳しい観測内容。/);
assert.match(overview, /volcano-section-count">2/);
assert.match(overview, /data-volcano-bulletin-id="forecast"/);
assert.match(overview, /気象庁発表原文を確認/);
const bulletin = render("forecast");
assert.match(bulletin, /data-volcano-bulletin-back/);
assert.match(bulletin, /発表内容の原文。/);
assert.match(bulletin, /volcano-safety-section/);
assert.match(bulletin, /data-volcano-section="activity"/);
assert.doesNotMatch(bulletin, /data-volcano-section="history"/);
console.log("Volcano detail: visible unabridged safety text, collapsible supporting information, related bulletin navigation and escaping passed");
