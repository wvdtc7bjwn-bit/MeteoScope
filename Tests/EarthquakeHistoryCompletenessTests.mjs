import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/earthquake-history.js";
import { searchEarthquakeHistory, normalizeEarthquakeHistoryFilters } from "../src/jma/earthquakeHistory.js";
import { normalizeEarthquakeHistoryEvent } from "../src/jma/earthquakeHistoryDetail.js";
import { getEarthquakeHistoryStatus } from "../src/ui/earthquakeHistoryStatus.js";
import { validateJmaHistoryConditions, isCoordinateWithinRadius, normalizeJmaEarthquakeOriginTime } from "../src/jma/earthquakeHistoryApi.js";

const originalFetch = globalThis.fetch, originalCaches = globalThis.caches, originalNow = Date.now;
const publishedThrough = "2026-11-22";
// Reproduce the screenshot at 00:18 JST, when the two-day estimate is Nov 23.
Date.now = () => Date.parse("2026-11-24T15:18:00Z");
globalThis.caches = undefined;
let browserQueries = [], upstreamQueries = [], mode = "normal";
const rows = Array.from({ length: 118 }, (_, index) => {
  const day = index === 0 ? "16" : String(17 + (index % 6));
  return { id: `202611${day}${String(index).padStart(6, "0")}`, ot: `2026/11/${day} 12:00:00.0`,
    name: "宮城県沖", lat: "38.0", lon: "142.0", mag: "3.0", dep: "10 km", maxI: "震度1" };
});
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input), "https://history.test");
  if (url.pathname === "/api/earthquake-history") {
    browserQueries.push(url);
    const response = await onRequestGet({ request: new Request(url, { signal: init.signal }) });
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    return response;
  }
  assert.equal(url.href, "https://www.data.jma.go.jp/eqdb/data/shindo/api/");
  const [start] = init.body.getAll("dateTimeF[]"), [end] = init.body.getAll("dateTimeT[]");
  upstreamQueries.push({ start, end });
  if (end > publishedThrough) {
    // Exact response shape and wording verified against the official API.
    const message = `現時点の震度データベースには ${publishedThrough} より後のデータはありません　検索終了日時の設定を見直してください`;
    return Response.json({ res: message, str: [message] });
  }
  let selected = rows.filter(row => {
    const date = row.ot.slice(0, 10).replaceAll("/", "-");
    return date >= start && date <= end;
  });
  if (mode === "empty") selected = [];
  if (mode === "invalid") selected = [{ ...rows[0], lat: null }, { ...rows[1], lon: "" }, { ...rows[2], lat: "91" }, { ...rows[3], mag: null, dep: "ごく浅い" }];
  if (mode === "thousand" || mode === "capped") selected = Array.from({ length: 1000 }, (_, index) => ({ ...rows[1], ot: "2026/11/17 12:00:00.0", id: `2026111700${String(index).padStart(4, "0")}` }));
  return Response.json({ res: selected, str: [mode === "capped"
    ? "検索結果地震数 ： 上限を超えました （1000 地震を表示）"
    : `検索結果地震数 ： ${selected.length.toLocaleString("en-US")} 地震`] });
};
try {
  const initial = await searchEarthquakeHistory();
  assert.deepEqual([initial.filters.startDate, initial.filters.endDate], ["2026-11-16", publishedThrough]);
  assert.equal(initial.items.length, 118, "the earlier seventh day must be fetched, not merely relabelled");
  assert.equal(initial.complete, true);
  assert.equal(initial.rangeAdjusted, true);
  assert.deepEqual(initial.unavailableRanges, []);
  assert.equal(initial.availableThrough, publishedThrough);
  assert.equal(browserQueries[0].searchParams.get("latestWeek"), "1");
  assert.deepEqual(upstreamQueries, [{ start: "2026-11-17", end: "2026-11-23" }, { start: "2026-11-16", end: publishedThrough }]);
  assert.equal(getEarthquakeHistoryStatus(initial, "ok").kind, "complete");
  assert.match(getEarthquakeHistoryStatus(initial, "ok").hint, /2026\/11\/22.*1週間/u);

  const explicit = await searchEarthquakeHistory({ startDate: "2026-11-17", endDate: "2026-11-23" });
  assert.equal(explicit.items.length, 117);
  assert.equal(explicit.filters.endDate, "2026-11-23", "an explicitly chosen period must retain its meaning");
  assert.equal(explicit.complete, false);
  assert.equal(explicit.totalMatched, null);
  assert.deepEqual(explicit.unavailableRanges.map(range => [range.startDate, range.endDate, range.reason]), [["2026-11-23", "2026-11-23", "jma_not_yet_available"]]);
  assert.equal(getEarthquakeHistoryStatus(explicit, "ok").kind, "unpublished");
  assert.equal(browserQueries.at(-1).searchParams.has("latestWeek"), false);
  const waiting = await searchEarthquakeHistory({ startDate: "2026-11-23", endDate: "2026-11-23" });
  assert.equal(waiting.items.length, 0);
  assert.equal(getEarthquakeHistoryStatus(waiting, "ok").label, "公開待ち");
  assert.doesNotMatch(getEarthquakeHistoryStatus(waiting, "ok").hint, /一致する地震はありません/u);

  mode = "empty";
  const empty = await searchEarthquakeHistory({ startDate: "2026-11-18", endDate: "2026-11-19" });
  assert.equal(empty.complete, true);
  assert.equal(empty.totalMatched, 0);
  assert.match(getEarthquakeHistoryStatus(empty, "ok").hint, /一致する地震はありません/u);
  mode = "thousand";
  const exact = await searchEarthquakeHistory({ startDate: "2026-11-17", endDate: "2026-11-17" });
  assert.equal(exact.complete, true, "exactly 1,000 with a comma is not an exceeded limit");
  assert.equal(exact.totalMatched, 1000);
  mode = "capped";
  const capped = await searchEarthquakeHistory({ startDate: "2026-11-17", endDate: "2026-11-17" });
  assert.equal(capped.complete, false);
  assert.equal(getEarthquakeHistoryStatus(capped, "ok").label, "件数上限");
  mode = "invalid";
  const invalid = await searchEarthquakeHistory({ startDate: "2026-11-17", endDate: "2026-11-22" });
  assert.equal(invalid.invalidRecordCount, 3);
  assert.equal(invalid.complete, false);
  assert.equal(invalid.items.length, 1, "missing/out-of-range coordinates must never become a marker at zero");
  assert.equal(invalid.items[0].magnitude, null, "unknown magnitude must not be shown as M0.0");
  assert.equal(invalid.items[0].depthKm, 0);
  assert.equal(getEarthquakeHistoryStatus(invalid, "ok").kind, "invalid");
  assert.equal(getEarthquakeHistoryStatus({ ...explicit, unavailableRanges: [{ startDate: "2026-11-21", endDate: "2026-11-22" }] }, "ok").kind, "incomplete");
  assert.equal(getEarthquakeHistoryStatus({ ...explicit, cancelled: true }, "ok").label, "検索中断");
  assert.equal(getEarthquakeHistoryStatus({ ...initial, limitExceeded: true }, "ok").kind, "complete", "fully resolved split queries are complete even if their parent hit a limit");
  const response = await onRequestGet({ request: new Request("https://history.test/api/earthquake-history?start=2026-11-01&end=2026-11-22&latestWeek=1") });
  assert.equal(response.status, 400, "latestWeek must not silently replace a custom date range");

  // A capped parent can be live while a child uses a millisecond archive ID.
  // Both are the same earthquake; archive data must not replace live data.
  globalThis.fetch = async input => {
    const url = new URL(String(input), "https://history.test");
    if (url.pathname.endsWith("manifest.json")) return Response.json({ startDate: "2025-01-01", endDate: "2025-01-02", years: [{ year: 2025, file: "2025.json" }] });
    if (url.pathname.endsWith("2025.json")) return Response.json([{ id: "20250101120000005", t: "2025-01-01T12:00:00+09:00", p: "宮城県沖", la: 38, lo: 142, m: 3, d: 10, i: "1" }]);
    const start = url.searchParams.get("start"), end = url.searchParams.get("end");
    if (start === end && start === "2025-01-01") throw new TypeError("Fixture communication failure");
    return Response.json({ ok: true, records: start === end ? [] : [{ ...rows[0], id: "20250101120000", ot: "2025/01/01 12:00:00" }], candidateCount: 1, limited: start !== end, limitExceeded: start !== end });
  };
  const mixed = await searchEarthquakeHistory({ startDate: "2025-01-01", endDate: "2025-01-02", keyword: "宮城" });
  assert.equal(mixed.complete, true);
  assert.equal(mixed.items.length, 1);
  assert.equal(mixed.items[0].dataSource, "live");
  assert.equal(mixed.fallbackRanges.length, 1);
} finally {
  globalThis.fetch = originalFetch; globalThis.caches = originalCaches; Date.now = originalNow;
}

assert.deepEqual(Object.fromEntries(Object.entries(normalizeEarthquakeHistoryFilters({ startDate: "1800-01-01", endDate: "1801-01-01" })).filter(([key]) => key.endsWith("Date"))), { startDate: "1919-01-01", endDate: "1919-01-01" });
for (const latitude of [null, "", " "]) assert.throws(() => validateJmaHistoryConditions({ nearby: { latitude, longitude: 140, radiusKm: 50 } }), /近傍/u);
assert.equal(isCoordinateWithinRadius([null, 35], [0, 35], 100), false);
assert.equal(isCoordinateWithinRadius([180, 0], [0, 0], 20100), true);
assert.equal(normalizeJmaEarthquakeOriginTime("2025/02/30 12:00:00"), "");
assert.equal(normalizeJmaEarthquakeOriginTime("2025/02/28 25:00:00"), "");
const detail = { hypocenter: { id: "20240101161022", originTime: "2024/01/01 16:10:22.0", place: "石川県能登地方", lat: "37.5", lon: "137.3", magnitude: null, depth: "ごく浅い", maxIntensity: "震度7" },
  stations: [{ name: "欠損", latitude: null, longitude: 140, intensity: "震度1" }, { name: "東京", latitude: "35", longitude: "139", intensity: "震度1" }] };
const event = normalizeEarthquakeHistoryEvent(detail, "20240101161022005");
assert.equal(event.stations.length, 1);
assert.equal(event.hypocenter.magnitude, null);
assert.equal(event.hypocenter.depthKm, 0);
assert.throws(() => normalizeEarthquakeHistoryEvent({ ...detail, hypocenter: { ...detail.hypocenter, lat: null } }), /地震/u);
assert.throws(() => normalizeEarthquakeHistoryEvent(detail, "20240101161122"), /地震/u);

const originalLocation = globalThis.location;
try {
  globalThis.location = { hostname: "wvdtc7bjwn-bit.github.io" };
  const mirror = await import("../src/jma/earthquakeHistory.js?mirror-route-regression");
  const mirrorDetail = await import("../src/jma/earthquakeHistoryDetail.js?mirror-route-regression");
  const remotePaths = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input), "https://wvdtc7bjwn-bit.github.io");
    if (url.pathname.startsWith("/api/")) {
      remotePaths.push(url.pathname);
      assert.equal(url.origin, "https://meteoscope.pages.dev", "the static mirror must use the hosted API, not a nonexistent local function");
      return Response.json(url.pathname.endsWith("-event") ? { ok: true, event: detail } : { ok: true, records: [] });
    }
    return Response.json({ type: "FeatureCollection", features: [] });
  };
  await mirror.searchEarthquakeHistory({ startDate: "2020-01-01", endDate: "2020-01-02" });
  await mirrorDetail.fetchEarthquakeHistoryEvent("20240101161022");
  assert.deepEqual(remotePaths, ["/api/earthquake-history", "/api/earthquake-history-event"]);
} finally { globalThis.location = originalLocation; globalThis.fetch = originalFetch; }
console.log("Earthquake history: actual publication-date regression, full seven-day acquisition, explicit ranges, empty/capped/failed/cancelled results and missing data passed");
