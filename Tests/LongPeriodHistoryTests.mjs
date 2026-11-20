import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseLongPeriodHistoryCatalog, findLongPeriodHistoryRecord, parseLongPeriodHistoryCsv } from "../src/jma/longPeriodHistory.js";
import { fetchHistoricalLongPeriod } from "../functions/_shared/longPeriodHistory.js";
import { normalizeEarthquakeHistoryEvent } from "../src/jma/earthquakeHistoryDetail.js";
import { renderHistoricalLongPeriod } from "../src/ui/longPeriodGroundMotion.js";

// JMA official past_list.html excerpt and unchanged 2024 Noto level.csv (Shift-JIS).
const html = await readFile(new URL("./fixtures/long-period-history-catalog.html", import.meta.url), "utf8");
const bytes = await readFile(new URL("./fixtures/long-period-noto-level.csv", import.meta.url));
const csv = new TextDecoder("shift_jis").decode(bytes);
const catalogue = parseLongPeriodHistoryCatalog(html);
assert.equal(catalogue.length, 3);
const hypocenter = { originTime: "2024/01/01 16:10:22.5", place: "石川県能登地方", magnitude: "7.6" };
const record = findLongPeriodHistoryRecord(catalogue, hypocenter);
assert.equal(record.eventId, "20240101161010");
assert.equal(record.maxClass, 4);
assert.equal(findLongPeriodHistoryRecord(catalogue, { ...hypocenter, originTime: "2024-01-01T07:10:22.500Z" }), record);
for (const overrides of [{ place: "別の震源" }, { magnitude: "6.0" }, { magnitude: "" }, { originTime: "2024/01/01 16:11:00" }]) {
  assert.equal(findLongPeriodHistoryRecord(catalogue, { ...hypocenter, ...overrides }), null);
}
assert.equal(findLongPeriodHistoryRecord([...catalogue, { ...record, eventId: "20240101161040" }], hypocenter), null, "Ambiguous nearby earthquakes are not associated");
assert.throws(() => parseLongPeriodHistoryCatalog("<html>maintenance</html>"));
const report = parseLongPeriodHistoryCsv(csv, record);
assert.equal(report.maxClass, 4);
assert.equal(report.stations.find(station => station.stationName === "輪島市鳳至町").class, 4);
assert.equal(report.areas.find(area => area.areaName === "石川県能登").maxClass, 4);
assert.equal(report.areas.find(area => area.areaName === "新潟県上越").maxClass, 3);
assert.equal(report.stations[0].periods.length, 7);
assert.equal(report.reportTime, "", "Observation start time is not a publication time");
assert.throws(() => parseLongPeriodHistoryCsv(csv, { ...record, maxClass: 3 }));
assert.throws(() => parseLongPeriodHistoryCsv("bad,csv", record));
assert.match(renderHistoricalLongPeriod({ longPeriod: report }), /気象庁の過去観測データ/);
assert.doesNotMatch(renderHistoricalLongPeriod({ longPeriod: report }), /階級1未満|grade-0/, "Historical CSV rows below class 1 are also hidden");
for (const status of ["not-listed", "unsupported", "unavailable"]) {
  assert.equal(renderHistoricalLongPeriod({ longPeriodStatus: status }), "", "No empty long-period section without observations");
}
const normalized = normalizeEarthquakeHistoryEvent({ hypocenter: { id: "20240101161022", lat: 37.5, lon: 137.3 }, stations: [], longPeriod: report, longPeriodStatus: "available" });
assert.equal(normalized.longPeriod, report);
assert.equal(normalized.longPeriodStatus, "available");

const originalFetch = globalThis.fetch;
const originalCaches = globalThis.caches;
try {
  globalThis.caches = undefined;
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    return new Response(String(url).endsWith("past_list.html") ? html : bytes);
  };
  const result = await fetchHistoricalLongPeriod(hypocenter, new AbortController().signal);
  assert.equal(result.longPeriod.maxClass, 4);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /20240101161010\/\/data\/level\.csv$/);
  assert.equal((await fetchHistoricalLongPeriod({ ...hypocenter, originTime: "2011/03/11 14:46:00" }, new AbortController().signal)).longPeriodStatus, "unsupported");
  assert.equal(calls.length, 2, "No archive requests before coverage begins");
  assert.equal((await fetchHistoricalLongPeriod({ ...hypocenter, place: "別の震源" }, new AbortController().signal)).longPeriodStatus, "not-listed");
  globalThis.fetch = async () => new Response("maintenance", { status: 503 });
  const unavailable = await fetchHistoricalLongPeriod(hypocenter, new AbortController().signal);
  assert.equal(unavailable.longPeriodStatus, "unavailable");
  assert.equal(unavailable.longPeriod, null);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => fetchHistoricalLongPeriod(hypocenter, controller.signal), { name: "AbortError" });
} finally { globalThis.fetch = originalFetch; globalThis.caches = originalCaches; }
console.log("Historical long-period: Noto official CSV, cross-catalogue association, coverage, failures and cancellation passed");
