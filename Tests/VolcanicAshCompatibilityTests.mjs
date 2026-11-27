import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { installXmlDom } from "./helpers/installXmlDom.mjs";
import { JMA_ENDPOINTS } from "../src/config.js";
import {
  parseVolcanoReport, parseVolcanicAshWarning, fetchVolcanoXmlList,
  getAvailableVolcanoAshForecasts, selectVolcanoFeedEntries, consolidateVolcanoReports,
  getLatestVolcanoTargetMunicipalities
} from "../src/jma/volcanoXml.js";
import {
  VOLCANIC_ASH_ROLLOUT, VOLCANIC_ASH_DEPTH_LEVELS, classifyVolcanicAshKind,
  isVolcanicAshDisplayEnabled, buildVolcanicAshWarningState, partitionVolcanicAshProducts
} from "../src/volcanicAsh.js";
import { getVolcanoAshForecastLabel, getVolcanoAshfallLegendItems, getVolcanoAshfallLevel, getVolcanoAshfallAreasForDisplay } from "../src/volcanoAshfall.js";

const fixture = name => readFile(new URL(`./fixtures/volcanic-ash/${name}.xml`, import.meta.url), "utf8");
const restoreDom = installXmlDom();
const originalFetch = globalThis.fetch, originalNow = Date.now;
const enabled = { forecastStartsAt: "2020-01-01T00:00:00+09:00", warningStartsAt: "2020-01-01T00:00:00+09:00" };
try {
  const oldTexts = await Promise.all(["66_01_01_210517_VFVO53", "66_01_02_210514_VFVO54", "66_01_03_210514_VFVO55"].map(fixture));
  const newTexts = await Promise.all(["66_02_01_261118_VFVO53", "66_02_02_261118_VFVO54", "66_02_03_261118_VFVO55"].map(fixture));
  const warningTexts = await Promise.all(["93_01_01_261118_VFVO70", "93_01_02_261118_VFVO70", "93_01_03_261118_VFVO70"].map(fixture));
  const codes = ["VFVO53", "VFVO54", "VFVO55"];
  const oldReports = oldTexts.map((xml, index) => parseVolcanoReport(xml, { code: codes[index] }));
  const newReports = newTexts.map((xml, index) => parseVolcanoReport(xml, { code: codes[index] }));
  const warnings = warningTexts.map(xml => parseVolcanoReport(xml, { code: "VFVO70" }));
  assert.deepEqual(oldReports.map(report => report.ashForecastFormat), ["legacy", "legacy", "legacy"]);
  assert.deepEqual(newReports.map(report => report.ashForecastFormat), ["volcanic-ash", "volcanic-ash", "volcanic-ash"]);
  assert(oldReports.every(report => report.isOperational));
  assert(newReports.every(report => report.isOperational));
  assert(oldReports.every(report => report.targetAreas.length === 0), "ash cities must not override eruption-warning target cities");
  assert(newReports.every(report => report.ashTargetAreas.length > 0));
  assert.deepEqual(new Set(oldReports[2].ashForecasts.flatMap(f => f.areas.map(a => a.amount))), new Set(["moderate", "light"]));
  assert.equal(classifyVolcanicAshKind("多量の降灰", "73").amount, "heavy");
  const modernAreas = newReports[2].ashForecasts.flatMap(f => f.areas);
  assert.deepEqual(new Set(modernAreas.map(area => area.amount)), new Set(VOLCANIC_ASH_DEPTH_LEVELS.map(level => level.amount)));
  assert(modernAreas.every(area => area.known && area.category === "ashfall"));
  assert.deepEqual(VOLCANIC_ASH_DEPTH_LEVELS.map(level => level.minimumMm), [null, 0.1, 1, 10, 30, 100, 300]);
  assert.equal(VOLCANIC_ASH_DEPTH_LEVELS[2].maximumMmExclusive, null, "greater-or-equal forecasts are not exclusive intervals");
  for (const report of [oldReports[0], newReports[0]]) {
    assert(report.ashForecasts.flatMap(f => f.areas).some(area => area.category === "small-cinders"));
  }
  assert.equal(classifyVolcanicAshKind("３０ｃｍ以上の火山灰", "37", "volcanic-ash").depth.minimumMm, 300);
  assert.equal(classifyVolcanicAshKind("やや多量の降灰", "72").amount, "moderate");
  assert.equal(classifyVolcanicAshKind("やや多量の降灰", "").amount, "moderate", "legacy name-only compatibility");
  assert.equal(classifyVolcanicAshKind("１ｃｍ以上の火山灰", "", "volcanic-ash").amount, "ash-34");
  assert.deepEqual(classifyVolcanicAshKind("少量の降灰", "99"), { category: "unknown", amount: "unknown", known: false, depth: null });
  const unknown = parseVolcanoReport(newTexts[2].replaceAll("<Code>37</Code>", "<Code>99</Code>"), { code: "VFVO55" });
  const unknownArea = unknown.ashForecasts.flatMap(f => f.areas).find(area => area.kindCode === "99");
  assert(unknownArea && !unknownArea.known && unknownArea.kindName.includes("30"));

  // No guessed launch date, URL override, or automatic activation from receipt.
  assert.deepEqual(VOLCANIC_ASH_ROLLOUT, { forecastStartsAt: null, warningStartsAt: null });
  const launch = "2028-01-10T00:00:00+09:00", launchMs = Date.parse(launch);
  assert.equal(isVolcanicAshDisplayEnabled("forecast", launchMs - 1, { forecastStartsAt: launch }), false);
  assert.equal(isVolcanicAshDisplayEnabled("forecast", launchMs, { forecastStartsAt: launch }), true);
  assert.equal(isVolcanicAshDisplayEnabled("warning", launchMs, { forecastStartsAt: launch }), false);
  assert.equal(isVolcanicAshDisplayEnabled("forecast", launchMs, { forecastStartsAt: "2028-01-10" }), false, "timezone required");
  assert.equal(isVolcanicAshDisplayEnabled("forecast", launchMs), false);
  const now = Date.parse(newReports[2].ashForecasts[0].startTimeRaw) + 1;
  const products = partitionVolcanicAshProducts([...oldReports, ...newReports, ...warnings], { now });
  assert.deepEqual(products.visibleReports, oldReports);
  assert.equal(products.newForecastReports.length, 3);
  assert.equal(products.warningReports.length, 3);
  assert.equal(products.warningDisplayEnabled, false);
  assert.equal(partitionVolcanicAshProducts([...oldReports, ...newReports, ...warnings], { now, rollout: enabled }).visibleReports.length, 6);
  assert.equal(getAvailableVolcanoAshForecasts(newReports[2], now).length, 0);
  const forecasts = getAvailableVolcanoAshForecasts(newReports[2], now, enabled);
  assert(forecasts.length > 0);
  const forecast = forecasts[0];
  assert.equal(getVolcanoAshForecastLabel(forecast, { now }), "降灰予報");
  assert.equal(getVolcanoAshForecastLabel(forecast, { now, rollout: enabled }), "火山灰予報");
  assert.equal(getVolcanoAshForecastLabel(oldReports[2].ashForecasts[0], { now, rollout: enabled }), "降灰予報");
  assert.equal(getVolcanoAshfallLegendItems(forecast, { now }).length, 0);
  assert.equal(getVolcanoAshfallAreasForDisplay(forecast, { now }).length, 0);
  assert.equal(getVolcanoAshfallLegendItems(forecast, { now, rollout: enabled }).length, 7);
  assert.equal(getVolcanoAshfallLegendItems(oldReports[2].ashForecasts[0]).length, 3);
  const originalOrder = [...forecast.areas];
  const ordered = getVolcanoAshfallAreasForDisplay(forecast, { now, rollout: enabled });
  assert.deepEqual(forecast.areas, originalOrder);
  const ranks = ordered.filter(area => area.known).map(area => Number(area.kindCode));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), "larger overlapping thresholds paint last");
  assert.equal(getVolcanoAshfallLevel("ash-37", { now, rollout: enabled }).minimumMm, 300);
  assert.equal(getVolcanoAshfallLevel("ash-37", { now }).minimumMm, undefined);

  assert(warnings.every(report => report.isUsable && report.productType === "volcanic-ash-warning"));
  assert(warnings.every(report => !("level" in report) && !("volcanoCode" in report)), "national ash warnings are not volcano alert levels");
  assert.equal(consolidateVolcanoReports(warnings).length, 0);
  assert(warnings[0].regions.some(region => region.scope === "municipality" && region.code === "4620100"));
  assert(warnings[0].regions.some(region => region.scope === "prefecture" && region.code === "46"));
  assert(warnings[1].regions.some(region => region.condition === "継続"));
  const switched = parseVolcanicAshWarning(warningTexts[0].replaceAll("<Condition>発表</Condition>", "<Condition>切替</Condition>"));
  assert(switched.regions.every(region => region.condition === "切替"));
  assert(warnings[1].regions.some(region => region.categoryCode === "03" && region.severity === 3));
  assert(warnings[1].sources[0].widespreadAshfall);
  assert(warnings[2].regions.every(region => region.active === false));
  const active = buildVolcanicAshWarningState([warnings[0]]);
  assert(active.activeRegions.length > 0);
  const clear = buildVolcanicAshWarningState([warnings[0], warnings[2], warnings[1]]);
  assert.equal(clear.report, warnings[2]);
  assert.equal(clear.activeRegions.length, 0);
  assert.equal(clear.sources.length, 0);
  const missing = buildVolcanicAshWarningState([], { previousReport: warnings[0], sourceAvailable: false });
  assert.equal(missing.status, "stale");
  assert.equal(missing.activeRegions.length, active.activeRegions.length);
  assert.equal(buildVolcanicAshWarningState([]).status, "unavailable");
  const correction = { ...warnings[0], infoType: "訂正", controlTimeRaw: new Date(Date.parse(warnings[0].controlTimeRaw) + 1000).toISOString() };
  assert.equal(buildVolcanicAshWarningState([warnings[0], correction]).report, correction);
  for (const status of ["試験", "訓練", ""]) {
    const test = parseVolcanicAshWarning(warningTexts[1].replace("<Status>通常</Status>", `<Status>${status}</Status>`));
    assert.equal(test.isOperational, false);
    assert.equal(buildVolcanicAshWarningState([test], { previousReport: warnings[0] }).report, warnings[0]);
  }
  const testForecast = parseVolcanoReport(newTexts[2].replace("<Status>通常</Status>", "<Status>試験</Status>"), { code: "VFVO55" });
  assert.equal(partitionVolcanicAshProducts([testForecast], { now, rollout: enabled }).visibleReports.length, 0);
  assert.equal(getAvailableVolcanoAshForecasts(testForecast, now, enabled).length, 0);
  const invalid = parseVolcanicAshWarning(warningTexts[2].replaceAll("対象市町村等", "未定義地域"));
  assert.equal(invalid.isUsable, false);
  assert.equal(buildVolcanicAshWarningState([invalid], { previousReport: warnings[0] }).status, "stale");
  const unknownWarning = parseVolcanicAshWarning(warningTexts[0].replaceAll("<Code>02</Code>", "<Code>99</Code>"));
  assert(buildVolcanicAshWarningState([unknownWarning]).unknownRegions.length > 0);
  const multi = parseVolcanicAshWarning(warningTexts[0].replace("</AshSources>", '<AshSource><Area><Name>試験用の第2火山</Name><Code>999</Code><Coordinate>+35.0+140.0/</Coordinate></Area></AshSource></AshSources>'));
  assert.equal(multi.sources.length, 2);
  assert.equal(multi.regions.length, warnings[0].regions.length);
  assert.equal(getLatestVolcanoTargetMunicipalities({ relatedReports: [newReports[2]] }).length, 0);

  const entries = [...Array.from({ length: 80 }, (_, index) => ({ id: `forecast-${index}`, code: "VFVO53", updated: "2026-11-27T00:00:00Z" })),
    { id: "national", code: "VFVO70", updated: "2026-11-26T00:00:00Z" }, { id: "eruption", code: "VFVO50" }];
  assert(selectVolcanoFeedEntries(entries).length <= 32);
  assert.equal(selectVolcanoFeedEntries([...entries, ...Array.from({ length: 40 }, (_, i) => ({ id: `observation-${i}`, code: "VFVO52" }))]).length, 32);
  assert(selectVolcanoFeedEntries(entries).some(entry => entry.code === "VFVO70"));
  assert(selectVolcanoFeedEntries(entries).some(entry => entry.code === "VFVO50"));
  assert.equal(selectVolcanoFeedEntries(entries, 0).length, 0);

  // Real fetch path, including shared Atom feeds/cache, bounded detail requests,
  // pre-launch display isolation, missing bulletin retention and failed updates.
  let clock = Date.UTC(2026, 10, 27), stage = 0;
  Date.now = () => clock;
  const requestCounts = new Map();
  const records = [...oldTexts, ...newTexts, warningTexts[0]].map((xml, index) => ({
    url: `https://example.test/20261127_0_${index < 6 ? codes[index % 3] : "VFVO70"}_${index}.xml`, xml
  }));
  const clearRecord = { url: "https://example.test/20261127_0_VFVO70_clear.xml", xml: warningTexts[2] };
  const badUrl = "https://example.test/20261127_0_VFVO70_failed.xml";
  const feed = () => `<feed>${(stage === 1 ? records.slice(0, 6) : stage === 2 ? [clearRecord, ...records.slice(0, 6)] : stage === 3 ? [{ url: badUrl }, ...records.slice(0, 6)] : records).map(record => `<entry><id>${record.url}</id><title>火山情報</title><updated>2026-11-27T00:00:00Z</updated><link href="${record.url}"/></entry>`).join("")}</feed>`;
  globalThis.fetch = async url => {
    url = String(url);
    requestCounts.set(url, (requestCounts.get(url) ?? 0) + 1);
    if ([JMA_ENDPOINTS.earthquakeXmlFeed, JMA_ENDPOINTS.earthquakeXmlLongFeed].includes(url)) return new Response(feed());
    if (url === badUrl) return new Response("unavailable", { status: 503 });
    const record = [...records, clearRecord].find(item => item.url === url);
    if (record) return new Response(record.xml);
    if (url === JMA_ENDPOINTS.volcanoStatus) return Response.json({ volcanoInfos: [] });
    if ([JMA_ENDPOINTS.volcanoCatalog, JMA_ENDPOINTS.volcanoWarningStatus].includes(url)) return Response.json([]);
    throw new Error(`Unexpected request: ${url}`);
  };
  const fetched = await fetchVolcanoXmlList();
  assert(fetched.reports.length > 0);
  assert(fetched.reports.every(report => report.ashForecastFormat === "legacy"));
  assert.equal(fetched.volcanicAsh.preparedForecastReports.length, 3);
  assert.equal(fetched.volcanicAsh.warningDisplayEnabled, false);
  assert(fetched.volcanicAsh.warningState.activeRegions.length > 0);
  assert(records.every(record => requestCounts.get(record.url) === 1), "duplicate feed entries must share one detail fetch");
  const before = new Map(requestCounts);
  await fetchVolcanoXmlList();
  assert.deepEqual(requestCounts, before, "reuse existing request caches");
  stage = 1; clock += 61000;
  assert((await fetchVolcanoXmlList()).volcanicAsh.warningState.activeRegions.length > 0, "absence from feed is not a cancellation");
  stage = 2; clock += 61000;
  assert.equal((await fetchVolcanoXmlList()).volcanicAsh.warningState.activeRegions.length, 0);
  stage = 3; clock += 61000;
  assert.equal((await fetchVolcanoXmlList()).volcanicAsh.warningState.status, "stale");
  console.log("Volcanic ash: official legacy/new fixtures, seven cumulative thresholds, rollout isolation, nationwide snapshots, corrections/releases, unknown/test data and cached feed ingestion passed");
} finally {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  restoreDom();
}
