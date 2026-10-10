import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  EARTHQUAKE_HISTORY_DEFAULT_RANGE_DAYS,
  EARTHQUAKE_HISTORY_LIST_VISIBLE_LIMIT,
  EARTHQUAKE_HISTORY_QUERY_CONCURRENCY,
  EARTHQUAKE_HISTORY_RESULT_LIMIT,
  formatHistoricalIntensity,
  getJmaLatestAvailableDate,
  getHistoricalIntensityRank,
  normalizeEarthquakeHistoryFilters,
  searchEarthquakeHistory
} from "../src/jma/earthquakeHistory.js";
import {
  normalizeHistoricalEpicenterName,
  translateHistoricalEpicenterName
} from "../src/jma/historicalEpicenterNames.js";
import { isCoordinateWithinRadius } from "../src/jma/earthquakeHistoryApi.js";

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

assert.equal(EARTHQUAKE_HISTORY_RESULT_LIMIT, 1_000, "検索結果は1000件を上限とする");
assert.equal(EARTHQUAKE_HISTORY_LIST_VISIBLE_LIMIT, 200, "一覧表示の上限が意図せず変わっている");
assert.equal(EARTHQUAKE_HISTORY_QUERY_CONCURRENCY, 3, "過去地震の年次検索は過剰な同時接続を避けて3件並列にする");
assert.equal(EARTHQUAKE_HISTORY_DEFAULT_RANGE_DAYS, 7, "初期表示期間は過去1週間でなければならない");
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
const expectedDefaultStart = new Date(Date.parse(`${getJmaLatestAvailableDate()}T00:00:00Z`) - (EARTHQUAKE_HISTORY_DEFAULT_RANGE_DAYS - 1) * 86_400_000)
  .toISOString()
  .slice(0, 10);
assert.equal(normalized.endDate, getJmaLatestAvailableDate(), "検索可能な最新日を現在日から判定する");
assert.equal(normalized.minIntensity, "1");
assert.equal(normalized.startDate, expectedDefaultStart, "初期検索は終了日を含む過去7日間に限定する");
assert.equal(normalized.sort, "newest");
const nearbyNormalized = normalizeEarthquakeHistoryFilters({ startDate: "2025-01-01", endDate: "2025-01-02", nearby: { latitude: 35.5, longitude: 139.5, radiusKm: 50 } });
assert.deepEqual(nearbyNormalized.nearby, { latitude: 35.5, longitude: 139.5, radiusKm: 50 }, "近傍検索の座標と半径を正規化する");
assert.throws(() => normalizeEarthquakeHistoryFilters({ nearby: { latitude: 91, longitude: 0, radiusKm: 50 } }), /近傍/u);
assert.ok(manifest.startDate <= manifest.endDate, "静的履歴マニフェストの期間が有効である");
assert.ok(getHistoricalIntensityRank("6+") > getHistoricalIntensityRank("6-"));
assert.equal(formatHistoricalIntensity("5-"), "5弱");
assert.equal(translateHistoricalEpicenterName("FAR E OFF MIYAGI PREF"), "宮城県東方はるか沖");
assert.equal(translateHistoricalEpicenterName("E OFF MIYAGI PREF"), "宮城県東方沖");
for (const [id, catalogueName, officialName] of officialEpicenterExpectations) {
  assert.equal(normalizeHistoricalEpicenterName(id, catalogueName), officialName);
  assert.equal(recordsById.get(id)?.p, officialName, `${id}には公式の震央地名を表示する`);
}
assert.equal(normalizeHistoricalEpicenterName("20170108230650810", "京都・大阪府境"), "京都・大阪府境");

const originalFetch = globalThis.fetch;
let liveCalls = [];
let archiveCalls = [];
let override = null;
const toLive = (record) => ({
  id: record.id, ot: record.t.replace(/^(\d{4})-(\d{2})-(\d{2})T/u, "$1/$2/$3 ").replace(/\+09:00$/u, ""),
  name: record.p, lat: record.la, lon: record.lo, mag: record.m, dep: record.d == null ? "" : `${record.d} km`, maxI: `震度${record.i}`
});
globalThis.fetch = async (url, init) => {
  const requestUrl = new URL(String(url), "https://meteoscope.test");
  const archivePath = requestUrl.pathname.match(/^\/data\/earthquake-history\/(.+)$/u)?.[1];
  if (archivePath) {
    archiveCalls.push(archivePath);
    return new Response(await readFile(path.join(dataDirectory, archivePath), "utf8"));
  }
  liveCalls.push(requestUrl);
  if (override) return override(requestUrl, init);
  const p = requestUrl.searchParams;
  const records = [...recordsById.values()].filter((r) => r.t.slice(0, 10) >= p.get("start") && r.t.slice(0, 10) <= p.get("end")
    && getHistoricalIntensityRank(r.i) >= getHistoricalIntensityRank(p.get("minIntensity"))
    && (Number(p.get("minMagnitude")) === 0 || r.m != null && r.m >= Number(p.get("minMagnitude")))
    && (p.get("maxDepth") === "all" || r.d != null && r.d <= Number(p.get("maxDepth"))));
  records.sort(p.get("sort") === "oldest" ? (a,b) => a.t.localeCompare(b.t)
    : p.get("sort") === "magnitude" ? (a,b) => (b.m ?? -10)-(a.m ?? -10) || b.t.localeCompare(a.t)
    : p.get("sort") === "intensity" ? (a,b) => getHistoricalIntensityRank(b.i)-getHistoricalIntensityRank(a.i) || b.t.localeCompare(a.t)
    : (a,b) => b.t.localeCompare(a.t));
  return Response.json({ ok: true, records: records.slice(0,1000).map(toLive), limited: records.length > 1000, limitExceeded: records.length > 1000 });
};
try {
  for (const sort of ["newest", "oldest", "intensity", "magnitude"]) {
    liveCalls = []; archiveCalls = [];
    const result = await searchEarthquakeHistory({ startDate: manifest.startDate, endDate: manifest.endDate, minMagnitude: "7", minIntensity: "5-", maxDepth: "100", sort });
    assert.equal(result.complete, true);
    assert.equal(result.searchFinished, true);
    assert.equal(liveCalls.length, 1, "50年間の条件検索を1回で問い合わせる");
    assert.equal(archiveCalls.length, 0, "通常検索では目録を含め保存JSONへ依存しない");
    assert.equal(liveCalls[0].searchParams.get("minIntensity"), "5-");
    assert.equal(liveCalls[0].searchParams.get("minMagnitude"), "7");
    assert.equal(liveCalls[0].searchParams.get("maxDepth"), "100");
    assert.equal(liveCalls[0].searchParams.get("sort"), sort);
    const expected = [...recordsById.values()].filter(r => r.m >= 7 && getHistoricalIntensityRank(r.i) >= 5 && r.d != null && r.d <= 100)
      .sort(sort === "oldest" ? (a,b) => a.t.localeCompare(b.t) : sort === "magnitude" ? (a,b) => b.m-a.m || b.t.localeCompare(a.t)
        : sort === "intensity" ? (a,b) => getHistoricalIntensityRank(b.i)-getHistoricalIntensityRank(a.i) || b.t.localeCompare(a.t) : (a,b) => b.t.localeCompare(a.t));
    assert.deepEqual(result.items.map(r=>r.id), expected.map(r=>r.id), `${sort}は全期間に対して正しい`);
  }
  archiveCalls = [];
  const capped = await searchEarthquakeHistory({ startDate: "2025-01-01", endDate: "2025-12-31" });
  assert.equal(capped.items.length, 1000);
  assert.equal(capped.totalMatched, null, "上限時に1000を総件数としない");
  assert.equal(capped.complete, false);
  assert.equal(capped.searchFinished, true, "処理終了と全期間取得を区別する");
  assert.equal(capped.limitExceeded, true);
  assert.equal(capped.queryCount, 1, "並び順の先頭1000件が分かる時は追加取得しない");
  assert.equal(archiveCalls.length, 0, "上限で保存データに切り替えない");
  const empty = await searchEarthquakeHistory({ startDate: "1950-01-01", endDate: "1950-01-02" });
  assert.equal(empty.totalMatched, 0);
  assert.equal(empty.complete, true);
  assert.equal(archiveCalls.length, 0, "0件でも保存データに切り替えない");
  await assert.rejects(searchEarthquakeHistory({ startDate: "2025-02-30" }), /日付/);

  override = () => Response.json({ ok: false }, { status: 400 });
  await assert.rejects(searchEarthquakeHistory({ startDate: "1982-01-01", endDate: "1982-01-02" }), e => e.status === 400);
  assert.equal(archiveCalls.length, 0, "入力エラーを通信障害と扱わない");
  override = () => Response.json({ ok: false }, { status: 422 });
  await assert.rejects(searchEarthquakeHistory({ startDate: "1983-01-01", endDate: "1983-01-02" }), e => e.status === 422);
  assert.equal(archiveCalls.length, 0, "検索上限を示すHTTP応答でも保存JSONへ切り替えない");

  override = () => Response.json({ ok: false }, { status: 502 });
  const fallback = await searchEarthquakeHistory({ startDate: "1976-09-26", endDate: "1976-10-02", minMagnitude: "3", keyword: "沖" });
  assert.equal(fallback.complete, false, "保存データの範囲外は検索完了と表示しない");
  assert.equal(fallback.fallbackRanges[0].startDate, manifest.startDate);
  assert.equal(fallback.fallbackRanges[0].updatedAt, manifest.generatedAt);
  assert.equal(fallback.unavailableRanges[0].endDate, "1976-09-27");
  assert.ok(fallback.items.every(r => r.magnitude >= 3 && r.place.includes("沖") && r.originTime >= manifest.startDate));
  const nearbyFallbackRecord = [...recordsById.values()].find((record) => getHistoricalIntensityRank(record.i) >= 3);
  override = () => Response.json({ ok: false }, { status: 502 });
  const nearbyFallback = await searchEarthquakeHistory({
    startDate: nearbyFallbackRecord.t.slice(0, 10), endDate: nearbyFallbackRecord.t.slice(0, 10),
    minIntensity: "3", nearby: { latitude: Number(nearbyFallbackRecord.la), longitude: Number(nearbyFallbackRecord.lo), radiusKm: 10 }
  });
  assert.ok(nearbyFallback.items.some((record) => record.id === nearbyFallbackRecord.id), "通信障害時も半径条件に一致する保存地震を検索する");
  assert.ok(nearbyFallback.items.every((record) => isCoordinateWithinRadius(record.coordinates,
    [nearbyFallback.filters.nearby.longitude, nearbyFallback.filters.nearby.latitude], nearbyFallback.filters.nearby.radiusKm)), "保存JSONにもライブ取得と同じ近傍条件を適用する");
  override = () => { throw new DOMException("timeout", "TimeoutError"); };
  const timedOut = await searchEarthquakeHistory({ startDate: "2020-04-01", endDate: "2020-04-02" });
  assert.equal(timedOut.complete, true);
  assert.equal(timedOut.fallbackRanges.length, 1);

  archiveCalls = [];
  let networkAborted = false;
  const controller = new AbortController();
  override = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener("abort", () => { networkAborted = true; reject(init.signal.reason); }, { once: true });
    setTimeout(() => controller.abort(), 5);
  });
  let progressAfterAbort = 0;
  await assert.rejects(searchEarthquakeHistory({ startDate: "1951-01-01", endDate: "1951-02-01" }, { signal: controller.signal, onProgress: () => progressAfterAbort++ }), e=>e.name==="AbortError");
  assert.equal(networkAborted, true, "待ち合わせだけでなく実際の通信も中断する");
  assert.equal(archiveCalls.length, 0, "中断はフォールバックしない");
  assert.equal(progressAfterAbort, 0);

  // A partial-name search must inspect censored ranges; parent/child records
  // overlap, so use IDs to count and merge each earthquake just once.
  const synthetic = Array.from({ length: 1200 }, (_,i) => {
    const day = new Date(Date.UTC(2005,0,1)+Math.floor(i/4)*86400000).toISOString().slice(0,10);
    return { id: `synthetic-${i}`, t: `${day}T12:0${i%4}:00+09:00`, p: i%2 ? "能登沖" : "別地域", la:35,lo:138,m:4,d:10,i:"3" };
  });
  override = (url) => {
    const p=url.searchParams;
    const rows=synthetic.filter(r=>r.t.slice(0,10)>=p.get("start") && r.t.slice(0,10)<=p.get("end")).sort((a,b)=>b.t.localeCompare(a.t));
    return Response.json({ ok:true, records:rows.slice(0,1000).map(toLive), limited:rows.length>1000, limitExceeded:rows.length>1000 });
  };
  const partialSnapshots = [];
  const partial = await searchEarthquakeHistory({ startDate:"2005-01-01",endDate:"2005-12-31",keyword:"能登" }, {onProgress:r=>partialSnapshots.push(r)});
  assert.equal(partial.complete,true);
  assert.equal(partial.totalMatched,600);
  assert.equal(new Set(partial.items.map(r=>r.id)).size,600);
  assert.ok(partial.queryCount>1, "部分一致で候補が不足するときは必要な期間を追加取得する");
  assert.ok(partialSnapshots[0].items.length>0 && !partialSnapshots[0].searchFinished, "追加取得を待たず既に取得した結果を表示する");
  assert.ok(partialSnapshots.length<=partial.queryCount+1);

  override = (url) => {
    const p=url.searchParams;
    const rows=synthetic.filter(r=>r.t.slice(0,10)>=p.get("start") && r.t.slice(0,10)<=p.get("end"))
      .sort((a,b)=>b.t.localeCompare(a.t));
    return Response.json({ok:true,records:rows.slice(0,1000).map(toLive),candidateCount:Math.min(rows.length,1000),limited:rows.length>1000,limitExceeded:rows.length>1000});
  };
  liveCalls=[];
  const deepNearby = await searchEarthquakeHistory({
    startDate:"1919-01-01", endDate:"2026-10-01", minIntensity:"3", sort:"newest",
    nearby:{latitude:35,longitude:138,radiusKm:50}
  });
  assert.equal(deepNearby.filters.minIntensity,"3");
  assert.equal(liveCalls[0].searchParams.get("nearbyLat"),"35");
  assert.equal(liveCalls[0].searchParams.get("nearbyRadiusKm"),"50");
  assert.equal(deepNearby.items.length,1000,"近傍検索は検索表示上限まで古い期間へ遡る");
  assert.deepEqual(deepNearby.items.map(r=>r.id),synthetic.slice().sort((a,b)=>b.t.localeCompare(a.t)).slice(0,1000).map(r=>r.id),"広い期間は新しい地震から優先して上限分を集める");
  assert.equal(deepNearby.queryCount,1,"気象庁が返す最新1,000件で上限分を満たすなら不要な追加問い合わせをしない");
  assert.equal(deepNearby.complete,false,"1,000件上限より古い未検索期間は明示的に未完了とする");

  const sparseNearby = synthetic.map((record,index)=>({...record,la:index<700?35:35.5}));
  override = (url) => {
    const p=url.searchParams;
    const candidates=sparseNearby.filter(r=>r.t.slice(0,10)>=p.get("start") && r.t.slice(0,10)<=p.get("end"))
      .sort((a,b)=>b.t.localeCompare(a.t));
    const page=candidates.slice(0,1000);
    const exact=page.filter(r=>Math.abs(Number(r.la)-35)<=0.449);
    return Response.json({ok:true,records:exact.map(toLive),candidateCount:page.length,limited:candidates.length>1000,limitExceeded:candidates.length>1000});
  };
  const sparseHistory = await searchEarthquakeHistory({startDate:"2005-01-01",endDate:"2005-12-31",minIntensity:"3",sort:"newest",nearby:{latitude:35,longitude:138,radiusKm:50}});
  assert.equal(sparseHistory.totalMatched,700,"近傍円の外側候補で初回1,000件が埋まる場合は期間分割し、円内の古い地震も補う");
  assert.ok(sparseHistory.queryCount>1);

  const mixedYear = [...recordsById.values()].filter(r => r.t.startsWith("2008-"));
  const expectedMixed = mixedYear.filter(r => r.p.includes("県"));
  override = (url) => {
    const p=url.searchParams;
    if (p.get("start")==="2008-01-01" && p.get("end")==="2008-12-31") {
      return Response.json({ok:true,records:mixedYear.slice(0,1000).map(toLive),limited:true,limitExceeded:true});
    }
    if (p.get("start")==="2008-01-01") return Response.json({ok:false},{status:502});
    return Response.json({ok:true,records:mixedYear.filter(r=>r.t.slice(0,10)>=p.get("start") && r.t.slice(0,10)<=p.get("end")).map(toLive),limited:false});
  };
  const mixed = await searchEarthquakeHistory({startDate:"2008-01-01",endDate:"2008-12-31",keyword:"県"});
  assert.equal(mixed.complete,true,"ライブと保存データが全期間を埋めた場合だけ完了とする");
  assert.equal(mixed.totalMatched,expectedMixed.length,"親範囲と障害時代替分を重複カウントしない");
  assert.ok(mixed.fallbackRanges.length>0);
  assert.equal(mixed.unavailableRanges.length,0);
  archiveCalls=[];

  // Even a saturated one-minute query terminates without false fallback.
  override = () => Response.json({ok:true,records:synthetic.slice(0,1000).map(toLive),limited:true,limitExceeded:true});
  const budget = await searchEarthquakeHistory({startDate:"2006-01-01",endDate:"2006-12-31",keyword:"予算"});
  assert.equal(budget.complete,false);
  assert.equal(budget.searchFinished,true);
  assert.ok(budget.scannedRecordCount<=budget.acquisitionLimit);
  assert.ok(budget.unsearchedRanges.length>0);
  assert.equal(archiveCalls.length,0);
} finally {
  globalThis.fetch = originalFetch;
}

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
assert.match(panel, /1919年〜2日前/u);
assert.match(panel, /検索結果が上限の\$\{EARTHQUAKE_HISTORY_RESULT_LIMIT\.toLocaleString\("ja-JP"\)\}件を超えています/u);
assert.match(panel, /earthquake-archive-item-content/u);
assert.match(panel, /<small>震度<\/small><b>/u);
assert.match(panel, /getEarthquakeIntensityColor\(item\.maxIntensity\)[\s\S]*?style="background-color:\$\{escapeHtml\(intensityColor\)\};color:\$\{intensityTextColor\}"/u,
  "過去地震の震度バッジは凡例と共通の震度色を使う");
assert.match(panel, /一覧は\$\{visibleItems\.length\.toLocaleString\("ja-JP"\)\}件表示中/u);
assert.match(panel, /地図は先頭.*件/u);
assert.match(panel, /data-earthquake-archive-list-more/u);
assert.match(panel, /data-earthquake-nearby-search/u);
assert.match(panel, /data-mobile-dock-control data-earthquake-nearby-search/u,
  "近傍検索ボタン操作で下部シートのドラッグを開始しない");
assert.match(panel, /data-earthquake-nearby-clear/u);
assert.match(panel, /<button type="button" data-earthquake-nearby-clear>近傍条件を解除<\/button>/u,
  "近傍検索が実行中でも解除ボタンを表示する");
assert.doesNotMatch(panel, /earthquakeNearbySearchActive\s*\?\s*""\s*:\s*`<button[^`]*data-earthquake-nearby-clear/u,
  "近傍検索中に解除ボタンを隠さない");
assert.match(app, /function searchNearbyEarthquakes/u);
assert.match(app, /earthquakeNearbySearchActive = true;\s*earthquakeView = "history";/u,
  "近傍検索は過去の地震タブへ切り替える");
assert.match(app, /function closeNearbyEarthquakeSearch\(\)\s*\{[\s\S]*?earthquakeNearbySearchActive = false;[\s\S]*?nearby: null[\s\S]*?refreshEarthquakeArchive\(filters\)/u,
  "近傍条件解除後は条件を消して通常の過去地震検索を再実行する");
assert.doesNotMatch(panel, /if \(state\.data\?\.earthquakeNearbySearchActive\) \{\s*root\.hidden = true;/u,
  "詳細パネルを手動で開いた際に近傍検索結果を空にしない");
assert.match(panel, /if \(view === "history"\) \{[\s\S]*?buildEarthquakeArchiveMarkup\(state\.data \?\? \{\}\)/u,
  "過去の地震タブを開くと検索条件と結果を詳細パネルに表示する");
assert.match(app, /radiusKm: 50/u);
assert.match(panel, /data-next-visible-count/u);
assert.match(panel, /status === "refreshing" \? "・検索中"/u);
assert.doesNotMatch(panel, /snapshot\?\.complete === false \? "・更新中"/u);
assert.match(panel, /snapshot\.unavailableRanges/u);
assert.match(app, /onProgress: \(partialData\)/u);
assert.match(panel, /気象庁の震度データベースを検索/u);
assert.match(map, /getEarthquakeMapView\(data\) === "history"/u);
assert.match(map, /formatDistributionOriginTime\(item\?\.originTime, true\)/u);
assert.doesNotMatch(updateWorkflow, /schedule:/u, "年次履歴の自動コミットは停止し、手動実行は維持する");
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
