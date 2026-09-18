import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  EARTHQUAKE_HISTORY_LIST_VISIBLE_LIMIT,
  EARTHQUAKE_HISTORY_RESULT_LIMIT,
  formatHistoricalIntensity,
  getHistoricalIntensityRank,
  normalizeEarthquakeHistoryFilters
} from "../src/jma/earthquakeHistory.js";
import { translateHistoricalEpicenterName } from "../src/jma/historicalEpicenterNames.js";

const projectRoot = path.resolve(import.meta.dirname, "..");
const dataDirectory = path.join(projectRoot, "public", "data", "earthquake-history");
const manifest = JSON.parse(await readFile(path.join(dataDirectory, "manifest.json"), "utf8"));

assert.equal(EARTHQUAKE_HISTORY_RESULT_LIMIT, 1_000, "検索結果の上限が意図せず変わっている");
assert.equal(EARTHQUAKE_HISTORY_LIST_VISIBLE_LIMIT, 200, "一覧表示の上限が意図せず変わっている");
assert.equal(manifest.years.length, 51, "50年間の端点を含む51暦年分を保持する");
assert.equal(manifest.years[0].year, Number(manifest.startDate.slice(0, 4)));
assert.equal(manifest.years.at(-1).year, Number(manifest.endDate.slice(0, 4)));

const start = new Date(`${manifest.startDate}T00:00:00Z`);
const end = new Date(`${manifest.endDate}T00:00:00Z`);
assert.equal(end.getUTCFullYear() - start.getUTCFullYear(), 50, "保持期間は50年でなければならない");
assert.equal(end.getUTCMonth(), start.getUTCMonth(), "保持期間の月境界がずれている");
assert.equal(end.getUTCDate(), start.getUTCDate(), "保持期間の日境界がずれている");

const expectedFiles = new Set(manifest.years.map(({ file }) => file));
const actualYearFiles = (await readdir(dataDirectory))
  .filter((file) => /^\d{4}\.json$/u.test(file));
assert.deepEqual(
  actualYearFiles.sort(),
  [...expectedFiles].sort(),
  "保持期間外の年ファイルが残っている、または必要な年ファイルが欠けている"
);

let totalCount = 0;
let totalBytes = (await stat(path.join(dataDirectory, "manifest.json"))).size;
const recordIds = new Set();
const intensityCounts = new Map();
for (const yearEntry of manifest.years) {
  const filePath = path.join(dataDirectory, yearEntry.file);
  const raw = await readFile(filePath, "utf8");
  const records = JSON.parse(raw);
  totalBytes += Buffer.byteLength(raw);
  totalCount += records.length;
  assert.equal(records.length, yearEntry.count, `${yearEntry.year}年の目録件数が一致しない`);
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    intensityCounts.set(record.i, (intensityCounts.get(record.i) ?? 0) + 1);
    const date = String(record.t).slice(0, 10);
    assert.ok(date >= manifest.startDate && date <= manifest.endDate, `${record.id}が50年範囲外`);
    assert.ok(Number.isFinite(Number(record.la)) && Number.isFinite(Number(record.lo)), `${record.id}の座標が不正`);
    assert.ok(record.id && record.p && record.i, `${record.id || yearEntry.year}の必須項目が不足`);
    assert.ok(!recordIds.has(record.id), `${record.id}の内部IDが重複している`);
    recordIds.add(record.id);
    if (index > 0) {
      assert.ok(records[index - 1].t >= record.t, `${yearEntry.year}年のデータが新しい順ではない`);
    }
  }
}
assert.equal(totalCount, manifest.totalCount, "全シャード件数と目録件数が一致しない");
assert.ok(totalBytes < 30 * 1024 * 1024, "静的データが想定した30MiBを超えている");
for (const intensity of ["1", "2", "3"]) {
  assert.ok((intensityCounts.get(intensity) ?? 0) > 0, `震度${intensity}の履歴データが欠けている`);
}

const normalized = normalizeEarthquakeHistoryFilters({}, manifest);
assert.equal(normalized.endDate, manifest.endDate);
assert.equal(normalized.minIntensity, "4");
assert.equal(normalized.sort, "newest");
assert.ok(normalized.startDate >= manifest.startDate && normalized.startDate <= manifest.endDate);
assert.ok(getHistoricalIntensityRank("6+") > getHistoricalIntensityRank("6-"));
assert.equal(formatHistoricalIntensity("5-"), "5弱");
assert.equal(translateHistoricalEpicenterName("FAR E OFF MIYAGI PREF"), "宮城県東方はるか沖");
assert.equal(translateHistoricalEpicenterName("E OFF MIYAGI PREF"), "宮城県東方沖");

const [generator, app, panel, map] = await Promise.all([
  readFile(path.join(projectRoot, "scripts", "update-jma-earthquake-history.mjs"), "utf8"),
  readFile(path.join(projectRoot, "src", "app.js"), "utf8"),
  readFile(path.join(projectRoot, "src", "ui", "leftPanel.js"), "utf8"),
  readFile(path.join(projectRoot, "src", "map", "weatherMap.js"), "utf8")
]);

assert.match(generator, /const HISTORY_YEARS = 50;/u);
assert.match(generator, /const REQUEST_INTERVAL_MS = 2_000;/u);
assert.match(generator, /await pruneExpiredYearFiles\(earliestYear, latestYear\);/u);
assert.match(generator, /unlink\(path\.join\(OUTPUT_DIR, entry\.name\)\)/u);
assert.match(generator, /readCachedUrl/u);
assert.match(generator, /readCachedIntensityQuery/u);
assert.match(generator, /translateHistoricalEpicenterName/u);
assert.match(generator, /hundredthsOfKilometers \/ 100/u);
assert.match(app, /view === "history"/u);
assert.match(app, /onArchiveFilterChange:[\s\S]*?earthquakeArchiveFilters = \{ \.\.\.earthquakeArchiveFilters, \.\.\.filters \}/u);
assert.match(panel, /data-earthquake-view="history"/u);
assert.match(panel, /<form class="earthquake-archive-search" data-earthquake-archive-form/u);
assert.match(panel, /type="button" class="earthquake-archive-search-button"/u);
assert.match(panel, /root\.addEventListener\("submit"/u);
assert.match(panel, /archiveSearchButton\.closest\("\[data-earthquake-archive-form\]"\)/u);
assert.match(panel, /closest\("button\[data-earthquake-view\]"\)/u);
assert.match(panel, /onArchiveFilterChange\?\.\(readArchiveSearchFilters\(archiveForm\)\)/u);
assert.match(panel, /const filters = data\.earthquakeArchiveFilters \?\? snapshot\?\.filters/u);
assert.match(panel, /震度1〜7を収録/u);
assert.match(panel, /earthquake-archive-item-content/u);
assert.match(panel, /<small>震度<\/small><b>/u);
assert.match(panel, /一覧は先頭.*のみ表示しています/u);
assert.match(panel, /地図は先頭.*件/u);
assert.match(map, /getEarthquakeMapView\(data\) === "history"/u);
assert.match(map, /formatDistributionOriginTime\(item\?\.originTime, true\)/u);

console.log(`Earthquake history tests passed: ${totalCount.toLocaleString("ja-JP")} records, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB.`);
