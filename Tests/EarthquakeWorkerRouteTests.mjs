import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDistributionSummary,
  JMA_DAILY_RETENTION_DAYS,
  parseJmaDailyHypocenterHtml
} from "../workers/earthquake-realtime/src/jmaDailyHypocenters.js";
import {
  getJmaXmlRetentionDates,
  parseJmaXmlFeed,
  parseJmaXmlHypocenterReport
} from "../workers/earthquake-realtime/src/jmaXmlHypocenters.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [worker, wrangler, migration, xmlMigration, xmlWorker, pagesRoute] = await Promise.all([
  fs.readFile(path.join(root, "workers", "earthquake-realtime", "src", "index.js"), "utf8"),
  fs.readFile(path.join(root, "workers", "earthquake-realtime", "wrangler.toml"), "utf8"),
  fs.readFile(path.join(root, "workers", "earthquake-realtime", "migrations", "0003_remove_dmdata.sql"), "utf8"),
  fs.readFile(path.join(root, "workers", "earthquake-realtime", "migrations", "0004_jma_xml_hypocenters.sql"), "utf8"),
  fs.readFile(path.join(root, "workers", "earthquake-realtime", "src", "jmaXmlHypocenters.js"), "utf8"),
  fs.readFile(path.join(root, "functions", "api", "earthquakes", "[[path]].js"), "utf8")
]);

assert.equal(JMA_DAILY_RETENTION_DAYS, 731);
assert.match(worker, /pathname !== "\/distribution"/u);
assert.match(worker, /runJmaXmlHypocenterSync/u);
assert.doesNotMatch(worker, /DMDATA|DM-D\.S\.S|EARTHQUAKE_HUB/u);
assert.doesNotMatch(wrangler, /^DMDATA_[A-Z_]+\s*=/mu);
assert.doesNotMatch(wrangler, /durable_objects/u);
assert.match(wrangler, /deleted_classes\s*=\s*\["MeteoScopeEarthquakeHub"\]/u);
assert.match(wrangler, /binding = "EQ_D1"/u);
assert.match(migration, /DROP TABLE IF EXISTS earthquake_history/u);
assert.match(migration, /DROP TABLE IF EXISTS station_intensities/u);
assert.match(migration, /DROP TABLE IF EXISTS tsunami_history/u);
assert.match(xmlMigration, /CREATE TABLE IF NOT EXISTS jma_xml_hypocenters/u);
assert.match(xmlMigration, /CREATE TABLE IF NOT EXISTS jma_xml_feed_entries/u);
assert.match(xmlWorker, /DELETE FROM jma_xml_hypocenters[\s\S]*source_date < \? OR source_date > \?/u);
assert.match(xmlWorker, /DELETE FROM jma_xml_feed_entries[\s\S]*source_date < \? OR source_date > \?/u);
assert.match(pagesRoute, /HYPOCENTER_ARCHIVE/u, "震央分布WorkerのService bindingを使用する");
assert.match(pagesRoute, /earthquake-worker\.internal\/api\/earthquakes/u);

const parsed = parseJmaDailyHypocenterHtml(`
  <html><body><pre>
  2026 07 20 01:02 03.4 35° 00.0'N 140° 00.0'E 10 2.5 千葉県東方沖
  </pre></body></html>
`, "2026-07-20");
assert.ok(Array.isArray(parsed));

const feedEntries = parseJmaXmlFeed(`<?xml version="1.0" encoding="UTF-8"?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <id>https://www.data.jma.go.jp/developer/xml/data/20260729150100_0_VXSE53_010000.xml</id>
      <updated>2026-07-29T15:01:00Z</updated>
    </entry>
    <entry>
      <id>https://www.data.jma.go.jp/developer/xml/data/20260729150200_0_VFVO52_010000.xml</id>
      <updated>2026-07-29T15:02:00Z</updated>
    </entry>
  </feed>`);
assert.equal(feedEntries.length, 1, "震源分布にはVXSE51-53だけを取り込む");
assert.equal(feedEntries[0].xmlCode, "VXSE53");
assert.equal(feedEntries[0].sourceDate, "2026-07-30", "Atom更新日時もJSTで日付判定する");

const reportEntry = {
  url: feedEntries[0].url,
  updated: feedEntries[0].updated,
  xmlCode: "VXSE53"
};
const report = parseJmaXmlHypocenterReport(`<?xml version="1.0" encoding="UTF-8"?>
  <Report xmlns="http://xml.kishou.go.jp/jmaxml1/">
    <Control><Status>通常</Status><DateTime>2026-07-29T15:01:00Z</DateTime></Control>
    <Head>
      <ReportDateTime>2026-07-30T00:01:00+09:00</ReportDateTime>
      <EventID>20260729235900</EventID>
      <InfoType>発表</InfoType>
    </Head>
    <Body>
      <Earthquake>
        <OriginTime>2026-07-29T23:59:00+09:00</OriginTime>
        <Hypocenter><Area>
          <Name>熊本県熊本地方</Name>
          <jmx_eb:Coordinate xmlns:jmx_eb="http://xml.kishou.go.jp/jmaxml1/elementBasis1/">+32.7+130.8-10000/</jmx_eb:Coordinate>
        </Area></Hypocenter>
        <jmx_eb:Magnitude xmlns:jmx_eb="http://xml.kishou.go.jp/jmaxml1/elementBasis1/">2.8</jmx_eb:Magnitude>
      </Earthquake>
    </Body>
  </Report>`, reportEntry);
assert.equal(report.eventId, "20260729235900");
assert.equal(report.sourceDate, "2026-07-29");
assert.equal(report.latitude, 32.7);
assert.equal(report.longitude, 130.8);
assert.equal(report.depthKm, 10);
assert.equal(report.magnitude, 2.8);
assert.equal(report.active, 1);

const cancelled = parseJmaXmlHypocenterReport(`<?xml version="1.0" encoding="UTF-8"?>
  <Report xmlns="http://xml.kishou.go.jp/jmaxml1/">
    <Control><Status>通常</Status></Control>
    <Head>
      <ReportDateTime>2026-07-30T00:03:00+09:00</ReportDateTime>
      <TargetDateTime>2026-07-29T23:59:00+09:00</TargetDateTime>
      <EventID>20260729235900</EventID>
      <InfoType>取消</InfoType>
    </Head>
    <Body />
  </Report>`, reportEntry);
assert.equal(cancelled.active, 0, "取消報は同一EventIDの無効化として保存する");
assert.equal(cancelled.ignored, false);

const boundaryNow = Date.parse("2026-07-29T15:01:00Z");
assert.deepEqual(
  getJmaXmlRetentionDates(boundaryNow),
  ["2026-07-30", "2026-07-29"],
  "保存期間はJSTの当日と前日"
);
const combined = buildDistributionSummary([
  { source_date: "2026-07-30", record_count: 2, status: "ok", source_type: "jma-xml" },
  { source_date: "2026-07-30", record_count: 99, status: "ok", source_type: "jma-daily" },
  { source_date: "2026-07-29", record_count: 3, status: "ok", source_type: "jma-xml" },
  { source_date: "2026-07-29", record_count: 98, status: "ok", source_type: "jma-daily" },
  { source_date: "2026-07-28", record_count: 4, status: "ok", source_type: "jma-daily" },
  { source_date: "2026-07-28", record_count: 97, status: "ok", source_type: "jma-xml" }
], boundaryNow);
assert.deepEqual(combined.availableDates.slice(0, 3), [
  "2026-07-30",
  "2026-07-29",
  "2026-07-28"
]);
assert.deepEqual(combined.dailyCounts.slice(0, 3).map(({ count, source }) => [count, source]), [
  [2, "jma-xml"],
  [3, "jma-xml"],
  [4, "jma-daily"]
], "当日・前日と2日前以前のソースを日付単位で排他化する");

console.log("JMA hypocenter archive worker tests passed.");
