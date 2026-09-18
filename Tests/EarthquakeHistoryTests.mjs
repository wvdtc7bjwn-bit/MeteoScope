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
import {
  normalizeHistoricalEpicenterName,
  translateHistoricalEpicenterName
} from "../src/jma/historicalEpicenterNames.js";

const projectRoot = path.resolve(import.meta.dirname, "..");
const dataDirectory = path.join(projectRoot, "public", "data", "earthquake-history");
const manifest = JSON.parse(await readFile(path.join(dataDirectory, "manifest.json"), "utf8"));
const officialEpicenterExpectations = [
  ["19980422203248420", "滋賀・岐阜県境", "三重県北部"],
  ["20090218064707060", "滋賀・岐阜県境", "岐阜県美濃中西部"],
  ["20111121191629590", "島根・広島県境", "広島県北部"],
  ["20180409013230810", "島根・広島県境", "島根県西部"],
  ["20180617152721870", "栃木・群馬県境", "群馬県南部"],
  ["20180618075834140", "京都・大阪府境", "大阪府北部"],
  ["20180626170009660", "島根・広島県境", "広島県北部"],
  ["20200519131258160", "飛騨山脈", "岐阜県飛騨地方"],
  ["20220502222103180", "京都・大阪府境", "京都府南部"]
];

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
const recordsById = new Map();
const intensityCounts = new Map();
let legacyEpicenterNameCount = 0;
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
    if (/県境|山脈|山系/u.test(record.p)) legacyEpicenterNameCount += 1;
    const date = String(record.t).slice(0, 10);
    assert.ok(date >= manifest.startDate && date <= manifest.endDate, `${record.id}が50年範囲外`);
    assert.ok(Number.isFinite(Number(record.la)) && Number.isFinite(Number(record.lo)), `${record.id}の座標が不正`);
    assert.ok(record.id && record.p && record.i, `${record.id || yearEntry.year}の必須項目が不足`);
    assert.ok(!recordIds.has(record.id), `${record.id}の内部IDが重複している`);
    recordIds.add(record.id);
    recordsById.set(record.id, record);
    if (index > 0) {
      assert.ok(records[index - 1].t >= record.t, `${yearEntry.year}年のデータが新しい順ではない`);
    }
  }
}
assert.equal(totalCount, manifest.totalCount, "全シャード件数と目録件数が一致しない");
assert.match(manifest.contentHash, /^[a-f0-9]{64}$/u, "年別JSONの内容ハッシュが必要");
assert.ok(totalBytes < 30 * 1024 * 1024, "静的データが想定した30MiBを超えている");
assert.equal(legacyEpicenterNameCount, 0, "旧カタログの県境・山脈・山系名が残っている");
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
for (const [id, catalogueName, officialName] of officialEpicenterExpectations) {
  assert.equal(normalizeHistoricalEpicenterName(id, catalogueName), officialName);
  assert.equal(recordsById.get(id)?.p, officialName, `${id}には公式の震央地名を表示する`);
}
assert.equal(normalizeHistoricalEpicenterName("20170108230650810", "京都・大阪府境"), "京都・大阪府境");

const [generator, app, panel, map, updateWorkflow, epicenterRegionUpdater, epicenterRegionApplier] = await Promise.all([
  readFile(path.join(projectRoot, "scripts", "update-jma-earthquake-history.mjs"), "utf8"),
  readFile(path.join(projectRoot, "src", "app.js"), "utf8"),
  readFile(path.join(projectRoot, "src", "ui", "leftPanel.js"), "utf8"),
  readFile(path.join(projectRoot, "src", "map", "weatherMap.js"), "utf8"),
  readFile(path.join(projectRoot, ".github", "workflows", "update-earthquake-history.yml"), "utf8"),
  readFile(path.join(projectRoot, "scripts", "update-jma-earthquake-epicenter-regions.mjs"), "utf8"),
  readFile(path.join(projectRoot, "scripts", "apply-jma-earthquake-epicenter-regions.mjs"), "utf8")
]);

assert.match(generator, /const HISTORY_YEARS = 50;/u);
assert.match(generator, /const RECENT_REFRESH_DAYS = 14;/u);
assert.match(generator, /const REQUEST_INTERVAL_MS = 2_000;/u);
assert.match(generator, /const requestedLatestDate = formatJstDate\(Date\.now\(\) - \(2 \* 86_400_000\)\);/u);
assert.match(generator, /const recentUpdate = await readRecentIntensityWindow\(requestedLatestDate\);/u);
assert.match(generator, /await pruneExpiredYearFiles\(earliestYear, latestYear\);/u);
assert.match(generator, /const removedYearFileCount = await pruneExpiredYearFiles\(earliestYear, latestYear\);/u);
assert.match(generator, /await readExistingYear\(year\)/u);
assert.match(
  generator,
  /if \(recentUpdate\.latestDate >= latestDate\) \{\s*replaceRecordsInRange\(recordsByYear, refreshStartDate, latestDate, recentUpdate\.records\);/u
);
assert.match(generator, /unlink\(path\.join\(OUTPUT_DIR, entry\.name\)\)/u);
assert.match(generator, /readCachedUrl/u);
assert.match(generator, /readCachedIntensityQuery/u);
assert.match(generator, /async function readCachedIntensityQuery\(startDate, endDate, \{ bypassCache = false \} = \{\}\)/u);
assert.match(generator, /if \(!bypassCache\) \{/u);
assert.match(generator, /class JmaIntensityAvailabilityError extends Error/u);
assert.match(generator, /retrying the recent window through that date/u);
assert.match(generator, /retaining existing data through/u);
assert.match(generator, /JSON\.stringify\(toComparableManifest\(previousManifest\)\) !== JSON\.stringify\(manifestContent\)/u);
assert.match(generator, /let recordsChanged = false;/u);
assert.match(generator, /recordsChanged = await writeJsonIfChanged\(path\.join\(OUTPUT_DIR, fileName\), records\) \|\| recordsChanged;/u);
assert.match(generator, /const contentHash = createHash\("sha256"\);/u);
assert.match(generator, /contentHash\.update\(JSON\.stringify\(records\)\)\.update\("\\n"\);/u);
assert.match(generator, /contentHash: contentHash\.digest\("hex"\)/u);
assert.match(generator, /const manifestChanged = recordsChanged\s*\n\s*\|\| removedYearFileCount > 0/u);
assert.match(generator, /generatedAt: manifestChanged \? new Date\(\)\.toISOString\(\) : previousManifest\?\.generatedAt/u);
assert.match(generator, /async function writeJsonIfChanged/u);
assert.match(generator, /normalizeHistoricalEpicenterName/u);
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
assert.match(updateWorkflow, /cron: "30 0 \* \* \*"/u);
assert.match(updateWorkflow, /workflow_dispatch:/u);
assert.match(updateWorkflow, /permissions:\s*\n\s*contents: write/u);
assert.match(updateWorkflow, /concurrency:\s*\n\s*group: earthquake-history-data\s*\n\s*cancel-in-progress: false/u);
assert.match(updateWorkflow, /actions\/cache\/restore@v4/u);
assert.match(updateWorkflow, /actions\/cache\/save@v4/u);
assert.match(updateWorkflow, /path: \.cache\/jma-earthquake-history/u);
assert.match(updateWorkflow, /npm run data:update:earthquake-history/u);
assert.match(updateWorkflow, /npm run test:earthquake/u);
assert.match(updateWorkflow, /git diff --quiet -- public\/data\/earthquake-history/u);
assert.match(updateWorkflow, /id: data-changes/u);
assert.match(updateWorkflow, /git add public\/data\/earthquake-history/u);
assert.match(updateWorkflow, /git commit -m "chore\(data\): update earthquake history"/u);
assert.match(updateWorkflow, /git push/u);
assert.doesNotMatch(updateWorkflow, /git push --force/u);
assert.doesNotMatch(updateWorkflow, /CLOUDFLARE_API_TOKEN|npm run deploy:cloudflare/u);
assert.match(epicenterRegionUpdater, /0Quake\/JMA_Region/u);
assert.match(epicenterRegionApplier, /isPointInGeometry/u);
assert.match(epicenterRegionApplier, /normalizeHistoricalEpicenterName/u);

console.log(`Earthquake history tests passed: ${totalCount.toLocaleString("ja-JP")} records, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB.`);
