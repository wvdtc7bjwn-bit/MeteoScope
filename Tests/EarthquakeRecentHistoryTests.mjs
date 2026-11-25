import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadP2pHistory, p2pHistoryRecord } from "../src/earthquake/p2pHistory.js";
import { normalizeP2pEarthquake } from "../src/earthquake/realtimeEarthquake.js";
import { searchEarthquakeHistory, normalizeEarthquakeHistoryFilters, getEarthquakeHistoryPresetRange } from "../src/jma/earthquakeHistory.js";
import { fetchRecentEarthquakeDetail } from "../src/jma/earthquakeRecent.js";
import { loadEarthquakeHistoryRecentEnabled, saveEarthquakeHistoryRecentEnabled } from "../src/preferences/earthquakeHistory.js";
import { onRequestGet } from "../functions/api/earthquake-recent.js";

const bulletin = (id, day = "25", overrides = {}) => ({ code: 551, id: id.toString(16).padStart(24, "0"),
  issue: { type: "DetailScale", time: `2026/11/${day} 13:03:00` },
  earthquake: { time: `2026/11/${day} 13:${String(id % 60).padStart(2, "0")}:00`, maxScale: 30,
    hypocenter: { name: "熊本県天草・芦北地方", latitude: 32.4, longitude: 130.5, depth: 10, magnitude: 3.1 } },
  points: [{ addr: "芦北町芦北", pref: "熊本県", scale: 30, isArea: false }], ...overrides });
const record = (id, day) => p2pHistoryRecord(normalizeP2pEarthquake(bulletin(id, day)));
const jmaRecord = day => ({ id: `202611${day}130100`, ot: `2026/11/${day} 13:01:00.0`,
  name: "熊本県天草・芦北地方", lat: "32.4", lon: "130.5", dep: "10 km", mag: "3.1", maxI: "震度3" });
const originalFetch = globalThis.fetch, originalNow = Date.now, originalCaches = globalThis.caches;
let clock = Date.parse("2026-11-25T12:00:00Z");
Date.now = () => clock;
globalThis.caches = undefined;
try {
  // Both endpoints report the same earthquake; the detailed bulletin wins.
  let requests = [];
  const fetchImpl = async input => {
    const url = new URL(input); requests.push(url);
    return Response.json(url.pathname.endsWith("/history") ? [bulletin(2), bulletin(1)] : [bulletin(1)]);
  };
  const combined = await loadP2pHistory({ startDate: "2026-11-24", endDate: "2026-11-25", fetchImpl });
  assert.equal(combined.complete, true); assert.equal(combined.items.length, 2);
  assert.match(combined.items[0].id, /^p2p:/);
  assert.equal(combined.items[0].originTime.slice(0, 10), "2026-11-25", "filter by JST origin date");
  assert.equal(requests.find(url => url.pathname.endsWith("/quake")).searchParams.get("order"), "1");
  const duplicate = await loadP2pHistory({ startDate: "2026-11-25", endDate: "2026-11-25",
    fetchImpl: async () => Response.json([bulletin(1), bulletin(1), bulletin(3, "24")]) });
  assert.equal(duplicate.items.length, 1, "duplicate reports and out-of-range days are excluded");

  requests = [];
  const paged = await loadP2pHistory({ startDate: "2026-11-25", endDate: "2026-11-25", fetchImpl: async input => {
    const url = new URL(input); requests.push(url);
    return Response.json(url.pathname.endsWith("/history") ? [] : url.searchParams.get("offset") === "0"
      ? Array.from({ length: 100 }, () => bulletin(1)) : [bulletin(2)]);
  } });
  assert.equal(paged.complete, true); assert.equal(paged.items.length, 2);
  assert(requests.some(url => url.searchParams.get("offset") === "100"));
  const limited = await loadP2pHistory({ startDate: "2026-11-25", endDate: "2026-11-25",
    fetchImpl: async input => Response.json(String(input).includes("/history?") ? [] : Array.from({ length: 100 }, () => bulletin(1))) });
  assert.equal(limited.complete, false); assert.equal(limited.limited, true);
  const partial = await loadP2pHistory({ startDate: "2026-11-25", endDate: "2026-11-25", fetchImpl: async input =>
    String(input).includes("/history?") ? Response.json([bulletin(1)]) : new Response("", { status: 429 }) });
  assert.equal(partial.complete, false); assert.equal(partial.items.length, 1); assert.deepEqual(partial.errors, ["archive_failed"]);
  const unavailable = await loadP2pHistory({ startDate: "2026-11-25", endDate: "2026-11-25",
    fetchImpl: async () => new Response("", { status: 503 }) });
  assert.equal(unavailable.items.length, 0); assert.equal(unavailable.complete, false);
  const midnightBulletin = bulletin(1, "25"); midnightBulletin.earthquake.time = "2026/11/25 00:01:00";
  const midnight = await loadP2pHistory({ startDate: "2026-11-25", endDate: "2026-11-25",
    fetchImpl: async () => Response.json([midnightBulletin]) });
  assert.equal(midnight.items.length, 1, "a JST midnight event must not move into the previous UTC day");
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(loadP2pHistory({ startDate: "2026-11-25", endDate: "2026-11-25", signal: aborted.signal, fetchImpl }), { name: "AbortError" });

  let mode = "lag", calls = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), "https://test.invalid"); calls.push(url);
    if (url.pathname === "/api/earthquake-history") {
      const day = mode === "lag" ? "22" : "23";
      return Response.json({ ok: true, records: [jmaRecord(day)], limited: false, candidateCount: 1,
        availableThrough: mode === "lag" ? "2026-11-22" : null });
    }
    if (url.pathname === "/api/earthquake-recent") {
      if (mode === "failure") return new Response("", { status: 503 });
      if (mode === "abort") return new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }));
      return Response.json({ ok: true, complete: mode !== "limited", limited: mode === "limited",
        items: [record(1, "22"), record(2, "23"), record(3, "24"), record(4, "25")], fetchedAt: "2026-11-25T12:00:00Z" });
    }
    if (url.pathname.endsWith("jma-intensity-stations.json")) return Response.json({ "4300000": { name: "芦北町芦北", latitude: 32.3, longitude: 130.5 } });
    if (url.pathname.endsWith("earthquake-areas.geojson")) return Response.json({ type: "FeatureCollection", features: [] });
    throw new Error(`Unexpected fetch ${url}`);
  };
  const progress = [];
  const enabled = await searchEarthquakeHistory({}, { includeRecent: true, onProgress: data => progress.push(data) });
  assert.equal(enabled.filters.endDate, "2026-11-25");
  assert.equal(enabled.filters.startDate, "2026-11-19");
  assert.equal(enabled.complete, true); assert.equal(enabled.items.length, 4);
  assert.equal(enabled.items.filter(item => item.dataSource === "p2p").length, 3);
  assert.equal(enabled.supplementation.startDate, "2026-11-23", "follow actual publication rather than a fixed two-day assumption");
  assert(progress.some(data => data.searchFinished === false)); assert.equal(progress.at(-1).complete, true);
  assert.equal(calls.find(url => url.pathname.endsWith("earthquake-recent")).searchParams.get("start"), "2026-11-23");

  calls = []; mode = "normal"; clock += 61_000;
  const off = await searchEarthquakeHistory({ startDate: "2026-11-19", endDate: "2026-11-25" }, { includeRecent: false });
  assert.equal(off.filters.endDate, "2026-11-23"); assert(!calls.some(url => url.pathname.endsWith("earthquake-recent")));
  clock += 61_000;
  const seam = await searchEarthquakeHistory({ startDate: "2026-11-23", endDate: "2026-11-25" }, { includeRecent: true });
  assert.equal(seam.items.length, 3); assert.equal(seam.items.filter(item => item.originTime.startsWith("2026-11-23")).length, 1);
  assert.equal(seam.items.find(item => item.originTime.startsWith("2026-11-23")).dataSource, "live", "JMA exclusively owns published dates");
  const todayOnly = await searchEarthquakeHistory({ startDate: "2026-11-25", endDate: "2026-11-25" }, { includeRecent: true });
  assert.equal(todayOnly.items.length, 1); assert.equal(todayOnly.items[0].dataSource, "p2p");
  clock += 61_000; mode = "failure";
  const failed = await searchEarthquakeHistory({ startDate: "2026-11-23", endDate: "2026-11-25" }, { includeRecent: true });
  assert.equal(failed.complete, false); assert.equal(failed.totalMatched, null); assert.equal(failed.items.length, 1);
  assert.equal(failed.supplementation.status, "error"); assert.equal(failed.unavailableRanges[0].reason, "p2p_unavailable");
  clock += 61_000; mode = "limited";
  const capped = await searchEarthquakeHistory({ startDate: "2026-11-24", endDate: "2026-11-25" }, { includeRecent: true });
  assert.equal(capped.complete, false); assert.equal(capped.truncated, true); assert.equal(capped.items.length, 2);
  assert.equal(capped.unavailableRanges[0].reason, "p2p_limited");
  clock += 61_000; mode = "normal";
  const filtered = await searchEarthquakeHistory({ startDate: "2026-11-24", endDate: "2026-11-25", minMagnitude: "4" }, { includeRecent: true });
  assert.equal(filtered.items.length, 0); assert.equal(filtered.complete, true);
  const outside = await searchEarthquakeHistory({ startDate: "2026-11-24", endDate: "2026-11-25",
    areaPolygon: [[140,35],[141,35],[141,36],[140,36],[140,35]] }, { includeRecent: true });
  assert.equal(outside.items.length, 0, "supplementary records use the same polygon filter");
  const detail = await fetchRecentEarthquakeDetail(record(4, "25"));
  assert.equal(detail.id, record(4, "25").id); assert.equal(detail.stations.length, 1);
  assert.deepEqual(detail.stations[0].coordinates, [130.5,32.3]); assert.equal(detail.hypocenter.maxIntensity, "3");
  assert.equal(normalizeEarthquakeHistoryFilters({ endDate: "2026-11-25" }, { includeRecent: true }).endDate, "2026-11-25");
  assert.equal(getEarthquakeHistoryPresetRange("month", "2026-11-25", { includeRecent: true }).endDate, "2026-11-25");
  clock += 61_000; mode = "abort";
  const during = new AbortController();
  const pending = searchEarthquakeHistory({ startDate: "2026-11-24", endDate: "2026-11-25" }, { includeRecent: true, signal: during.signal });
  await new Promise(resolve => setImmediate(resolve)); during.abort();
  await assert.rejects(pending, { name: "AbortError" });

  const store = new Map(); const storage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) };
  assert.equal(loadEarthquakeHistoryRecentEnabled(storage), true);
  saveEarthquakeHistoryRecentEnabled(false, storage); assert.equal(loadEarthquakeHistoryRecentEnabled(storage), false);
  saveEarthquakeHistoryRecentEnabled(true, storage); assert.equal(loadEarthquakeHistoryRecentEnabled(storage), true);
  const blocked = { getItem() { throw new Error(); }, setItem() { throw new Error(); } };
  assert.equal(loadEarthquakeHistoryRecentEnabled(blocked), true); assert.equal(saveEarthquakeHistoryRecentEnabled(false, blocked), false);

  globalThis.fetch = async input => Response.json([bulletin(1)]);
  const response = await onRequestGet({ request: new Request("https://test.invalid/api/earthquake-recent?start=2026-11-24") });
  assert.equal(response.status, 200); assert.equal((await response.json()).complete, true);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.match(response.headers.get("cache-control"), /s-maxage=30/);
  globalThis.fetch = async () => new Response("", { status: 503 });
  const failedProxy = await onRequestGet({ request: new Request("https://test.invalid/api/earthquake-recent?start=2026-11-24") });
  assert.equal(failedProxy.headers.get("cache-control"), "no-store");
  assert.equal((await failedProxy.json()).complete, false);
  assert.equal((await onRequestGet({ request: new Request("https://test.invalid/api/earthquake-recent?start=1919-01-01") })).status, 400);
  const page = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(page, /id="settings-earthquake-history-recent"[^>]*class="settings-switch"[^>]*role="switch"/);
} finally { globalThis.fetch = originalFetch; Date.now = originalNow; globalThis.caches = originalCaches; }
console.log("Recent earthquake supplementation: source boundaries, failure/cap coverage, pagination, deduplication, JST, filters, detail mapping, settings and proxy passed");
