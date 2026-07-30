import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDistributionSummary,
  filterDistributionDates,
  JMA_DAILY_RETENTION_DAYS,
  parseJmaDailyHypocenterHtml
} from "../workers/earthquake-realtime/src/jmaDailyHypocenters.js";
import {
  getJmaXmlRetentionDates,
  parseJmaXmlFeed,
  parseJmaXmlHypocenterReport,
  selectJmaXmlCandidates
} from "../workers/earthquake-realtime/src/jmaXmlHypocenters.js";
import {
  buildDiscordEarthquakeTestWebhookPayload,
  buildDiscordEarthquakeWebhookPayload,
  computeDiscordRetryDelayMs,
  deliverPendingDiscordEarthquakeNotifications,
  isDiscordNotifiableEarthquakeReport,
  parseDiscordWebhookUrl,
  sendDiscordEarthquakeTestNotification
} from "../workers/earthquake-realtime/src/discordEarthquakeNotifications.js";
import earthquakeWorkerHandler, {
  getScheduledSyncName,
  JMA_DAILY_BACKFILL_CRON,
  JMA_XML_SYNC_CRON
} from "../workers/earthquake-realtime/src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [
  worker,
  wrangler,
  migration,
  xmlMigration,
  discordMigration,
  xmlWorker,
  discordWorker,
  pagesRoute,
  packageJson,
  workerDeployScript
] = await Promise.all([
  fs.readFile(path.join(root, "workers", "earthquake-realtime", "src", "index.js"), "utf8"),
  fs.readFile(path.join(root, "workers", "earthquake-realtime", "wrangler.toml"), "utf8"),
  fs.readFile(path.join(root, "workers", "earthquake-realtime", "migrations", "0003_remove_dmdata.sql"), "utf8"),
  fs.readFile(path.join(root, "workers", "earthquake-realtime", "migrations", "0004_jma_xml_hypocenters.sql"), "utf8"),
  fs.readFile(path.join(root, "workers", "earthquake-realtime", "migrations", "0005_discord_earthquake_notifications.sql"), "utf8"),
  fs.readFile(path.join(root, "workers", "earthquake-realtime", "src", "jmaXmlHypocenters.js"), "utf8"),
  fs.readFile(path.join(root, "workers", "earthquake-realtime", "src", "discordEarthquakeNotifications.js"), "utf8"),
  fs.readFile(path.join(root, "functions", "api", "earthquakes", "[[path]].js"), "utf8"),
  fs.readFile(path.join(root, "package.json"), "utf8"),
  fs.readFile(path.join(root, "scripts", "deploy-earthquake-worker.mjs"), "utf8")
]);

assert.equal(JMA_DAILY_RETENTION_DAYS, 731);
assert.deepEqual(
  filterDistributionDates(
    ["2026-07-29", "2026-07-28", "2026-07-27"],
    false,
    Date.parse("2026-07-29T08:00:00Z")
  ),
  ["2026-07-27"],
  "設定で非表示にした場合は当日・前日を日付候補から除外する"
);
assert.deepEqual(
  filterDistributionDates(
    ["2026-07-29", "2026-07-28", "2026-07-27"],
    true,
    Date.parse("2026-07-29T08:00:00Z")
  ),
  ["2026-07-29", "2026-07-28", "2026-07-27"],
  "設定で表示する場合は当日・前日を保持する"
);
assert.match(worker, /pathname !== "\/distribution"/u);
assert.match(worker, /\/internal\/discord\/test/u);
assert.match(worker, /METEOSCOPE_ADMIN_SERVICE_TOKEN/u);
assert.match(worker, /timingSafeEqual/u);
assert.match(worker, /runJmaXmlHypocenterSync/u);
assert.match(worker, /requestUrl\.searchParams\.get\("fresh"\) === "1"/u);
assert.match(worker, /jma-distribution-fresh-v1/u);
assert.match(worker, /public, max-age=5, s-maxage=5/u);
assert.match(worker, /withCacheControl\(response, "no-store"\)/u);
assert.equal(JMA_XML_SYNC_CRON, "* * * * *");
assert.equal(JMA_DAILY_BACKFILL_CRON, "17 * * * *");
assert.equal(getScheduledSyncName(JMA_XML_SYNC_CRON), "jma-xml");
assert.equal(getScheduledSyncName(JMA_DAILY_BACKFILL_CRON), "daily-backfill");
assert.equal(getScheduledSyncName("unknown"), "jma-xml");
assert.match(worker, /runScheduledSync\(controller\?\.cron, env, cache\)/u);
assert.doesNotMatch(worker, /Promise\.allSettled\(jobs/u);
assert.match(wrangler, /crons\s*=\s*\["\* \* \* \* \*", "17 \* \* \* \*"\]/u);
assert.equal(
  JSON.parse(packageJson).scripts["deploy:earthquake-worker"],
  "node scripts/deploy-earthquake-worker.mjs",
  "Worker本体とCronを一体で反映する専用デプロイコマンドを維持する"
);
assert.match(workerDeployScript, /"deploy"/u);
assert.match(workerDeployScript, /"triggers",\s*"deploy"/u);
assert.match(workerDeployScript, /"deployments",\s*"status"/u);
assert.doesNotMatch(
  workerDeployScript,
  /"versions",\s*"(?:upload|deploy)"/u,
  "Cron反映が別操作になるversions方式を専用デプロイ経路では使用しない"
);
assert.match(
  await fs.readFile(
    path.join(root, "workers", "earthquake-realtime", "src", "jmaDailyHypocenters.js"),
    "utf8"
  ),
  /const fresh = url\.searchParams\.get\("fresh"\) === "1";[\s\S]*readDistributionSummary\(db, ctx, \{ fresh \}\)[\s\S]*if \(!fresh && cache && cacheKey\)[\s\S]*lastDataUpdateAt: lastSuccessfulFetchAt/u,
  "fresh指定は内部サマリーキャッシュも回避し、時刻の意味を明示する"
);
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
assert.match(discordMigration, /CREATE TABLE IF NOT EXISTS discord_earthquake_notifications/u);
assert.match(xmlWorker, /DELETE FROM jma_xml_hypocenters[\s\S]*source_date < \? OR source_date > \?/u);
assert.match(xmlWorker, /DELETE FROM jma_xml_feed_entries[\s\S]*source_date < \? OR source_date > \?/u);
assert.match(xmlWorker, /isDiscordNotifiableEarthquakeReport/u);
assert.match(xmlWorker, /deliverPendingDiscordEarthquakeNotifications/u);
assert.match(discordWorker, /DISCORD_EARTHQUAKE_WEBHOOK_URL/u);
assert.match(discordWorker, /allowed_mentions:\s*\{\s*parse:\s*\[\]\s*\}/u);
assert.match(discordWorker, /requestUrl\.searchParams\.set\("wait", "true"\)/u);
assert.match(discordWorker, /method = "PATCH"/u);
assert.match(discordWorker, /response\.status === 429/u);
assert.doesNotMatch(discordWorker, /discord(?:app)?\.com\/api\/webhooks\/\d+/u);
assert.match(pagesRoute, /HYPOCENTER_ARCHIVE/u, "震央分布WorkerのService bindingを使用する");
assert.match(pagesRoute, /earthquake-worker\.internal\/api\/earthquakes/u);

assert.match(
  pagesRoute,
  /sourceUrl\.searchParams\.get\("fresh"\) === "1"[\s\S]*headers\.set\("cache-control", "no-store"\)/u
);

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
      <Intensity><Observation><MaxInt>5-</MaxInt></Observation></Intensity>
      <Comments><ForecastComment><Text>この地震による津波の心配はありません。</Text></ForecastComment></Comments>
    </Body>
  </Report>`, reportEntry);
assert.equal(report.eventId, "20260729235900");
assert.equal(report.sourceDate, "2026-07-29");
assert.equal(report.latitude, 32.7);
assert.equal(report.longitude, 130.8);
assert.equal(report.depthKm, 10);
assert.equal(report.magnitude, 2.8);
assert.equal(report.active, 1);
assert.equal(report.maxIntensity, "5-");
assert.equal(report.tsunamiText, "この地震による津波の心配はありません。");
assert.equal(
  isDiscordNotifiableEarthquakeReport(report),
  true,
  "震源・震度に関する情報（VXSE53）の確定報だけをDiscord通知対象にする"
);
assert.equal(
  isDiscordNotifiableEarthquakeReport({ ...report, xmlCode: "VXSE51" }),
  false,
  "震度速報（VXSE51）はDiscord通知しない"
);
assert.equal(
  isDiscordNotifiableEarthquakeReport({ ...report, xmlCode: "VXSE52" }),
  false,
  "震源情報（VXSE52）もDiscord通知しない"
);
assert.equal(
  isDiscordNotifiableEarthquakeReport({ ...report, maxIntensity: "" }),
  false,
  "観測最大震度を持たない不完全なVXSE53は通知しない"
);

const discordPayload = buildDiscordEarthquakeWebhookPayload(report);
assert.deepEqual(discordPayload.allowed_mentions, { parse: [] });
assert.match(discordPayload.embeds[0].title, /最大震度 5弱/u);
assert.match(discordPayload.embeds[0].title, /熊本県熊本地方/u);
assert.match(discordPayload.embeds[0].description, /7月29日 23:59ごろ発生/u);
assert.match(discordPayload.embeds[0].description, /M2\.8　／　深さ 10km/u);
assert.match(discordPayload.embeds[0].description, /津波の心配なし/u);
assert.equal(discordPayload.embeds[0].fields, undefined);
assert.equal(discordPayload.username, "MeteoScope");
assert.ok(parseDiscordWebhookUrl("https://discord.com/api/webhooks/123/token"));
assert.equal(
  parseDiscordWebhookUrl("https://discordapp.com/api/webhooks/123/token")?.hostname,
  "discord.com",
  "旧discordapp.com形式は公式discord.comへ正規化する"
);
assert.equal(parseDiscordWebhookUrl("https://example.com/api/webhooks/123/token"), null);
assert.equal(computeDiscordRetryDelayMs(0, 2.5), 2_500);

const testPayload = buildDiscordEarthquakeTestWebhookPayload(Date.parse("2026-07-30T03:00:00Z"));
assert.match(testPayload.embeds[0].title, /TEST/u);
assert.match(testPayload.embeds[0].description, /実際の地震情報ではありません/u);
assert.match(testPayload.embeds[0].description, /確定報（VXSE53）のみ/u);
assert.equal(testPayload.embeds[0].fields, undefined);
assert.deepEqual(testPayload.allowed_mentions, { parse: [] });
const testDeliveryCalls = [];
const testDelivery = await sendDiscordEarthquakeTestNotification({
  DISCORD_EARTHQUAKE_WEBHOOK_URL: "https://discord.com/api/webhooks/123/token"
}, {
  now: Date.parse("2026-07-30T03:00:00Z"),
  fetchImpl: async (url, init) => {
    testDeliveryCalls.push({ url: String(url), init });
    return Response.json({ id: "discord-test-message-1" });
  }
});
assert.equal(testDelivery.ok, true);
assert.match(testDeliveryCalls[0].url, /\?wait=true$/u);
assert.equal(testDeliveryCalls[0].init.method, "POST");
assert.equal(
  JSON.parse(testDeliveryCalls[0].init.body).embeds[0].title,
  "【TEST】地震情報通知"
);

const unauthorizedDiscordTestResponse = await earthquakeWorkerHandler.fetch(
  new Request("https://worker.example/api/earthquakes/internal/discord/test", {
    method: "POST",
    headers: { "x-meteoscope-admin-token": "wrong-token" }
  }),
  {
    METEOSCOPE_ADMIN_SERVICE_TOKEN: "internal-token",
    DISCORD_EARTHQUAKE_WEBHOOK_URL: "https://discord.com/api/webhooks/123/token"
  },
  {}
);
assert.equal(unauthorizedDiscordTestResponse.status, 404);

const originalFetch = globalThis.fetch;
const internalDiscordTestCalls = [];
try {
  globalThis.fetch = async (url, init) => {
    internalDiscordTestCalls.push({ url: String(url), init });
    return Response.json({ id: "discord-internal-test-message-1" });
  };
  const authorizedDiscordTestResponse = await earthquakeWorkerHandler.fetch(
    new Request("https://worker.example/api/earthquakes/internal/discord/test", {
      method: "POST",
      headers: { "x-meteoscope-admin-token": "internal-token" }
    }),
    {
      METEOSCOPE_ADMIN_SERVICE_TOKEN: "internal-token",
      DISCORD_EARTHQUAKE_WEBHOOK_URL: "https://discord.com/api/webhooks/123/token"
    },
    {}
  );
  assert.equal(authorizedDiscordTestResponse.status, 200);
  assert.equal((await authorizedDiscordTestResponse.json()).ok, true);
  assert.equal(internalDiscordTestCalls.length, 1);
}
finally {
  globalThis.fetch = originalFetch;
}

function createDiscordDeliveryDb(row) {
  const updates = [];
  return {
    updates,
    prepare(sql) {
      let bound = [];
      return {
        bind(...values) {
          bound = values;
          return this;
        },
        async all() {
          return { results: row ? [row] : [] };
        },
        async run() {
          updates.push({ sql, bound });
          return { success: true };
        }
      };
    }
  };
}

const deliveryCalls = [];
const deliveryDb = createDiscordDeliveryDb({
  event_id: report.eventId,
  payload_json: JSON.stringify(discordPayload),
  discord_message_id: null,
  attempts: 0
});
const delivery = await deliverPendingDiscordEarthquakeNotifications({
  EQ_D1: deliveryDb,
  DISCORD_EARTHQUAKE_WEBHOOK_URL: "https://discord.com/api/webhooks/123/token"
}, {
  now: Date.parse("2026-07-30T00:05:00Z"),
  fetchImpl: async (url, init) => {
    deliveryCalls.push({ url: String(url), init });
    return Response.json({ id: "discord-message-1" });
  }
});
assert.equal(delivery.sent, 1);
assert.equal(deliveryCalls[0].init.method, "POST");
assert.match(deliveryCalls[0].url, /\?wait=true$/u);
assert.equal(deliveryDb.updates.at(-1).bound[0], "discord-message-1");

const correctionCalls = [];
const correctionDb = createDiscordDeliveryDb({
  event_id: report.eventId,
  payload_json: JSON.stringify(discordPayload),
  discord_message_id: "discord-message-1",
  attempts: 1
});
const correctionDelivery = await deliverPendingDiscordEarthquakeNotifications({
  EQ_D1: correctionDb,
  DISCORD_EARTHQUAKE_WEBHOOK_URL: "https://discord.com/api/webhooks/123/token"
}, {
  now: Date.parse("2026-07-30T00:06:00Z"),
  fetchImpl: async (url, init) => {
    correctionCalls.push({ url: String(url), init });
    return Response.json({});
  }
});
assert.equal(correctionDelivery.sent, 1);
assert.equal(correctionCalls[0].init.method, "PATCH");
assert.match(correctionCalls[0].url, /\/messages\/discord-message-1$/u);

const rateLimitedDb = createDiscordDeliveryDb({
  event_id: report.eventId,
  payload_json: JSON.stringify(discordPayload),
  discord_message_id: null,
  attempts: 0
});
const rateLimitedDelivery = await deliverPendingDiscordEarthquakeNotifications({
  EQ_D1: rateLimitedDb,
  DISCORD_EARTHQUAKE_WEBHOOK_URL: "https://discord.com/api/webhooks/123/token"
}, {
  now: Date.parse("2026-07-30T00:07:00Z"),
  fetchImpl: async () => Response.json({ retry_after: 2.5 }, { status: 429 })
});
assert.equal(rateLimitedDelivery.retried, 1);
assert.match(rateLimitedDb.updates.at(-1).sql, /status = 'retry'/u);
assert.equal(
  Date.parse(rateLimitedDb.updates.at(-1).bound[1]),
  Date.parse("2026-07-30T00:07:02.500Z"),
  "Discordのretry_afterを守って次回送信時刻を保存する"
);

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
const retentionDates = getJmaXmlRetentionDates(boundaryNow);
const pendingEntries = retentionDates.flatMap((sourceDate, dateIndex) => (
  Array.from({ length: 40 }, (_, index) => ({
    url: `https://example.test/${dateIndex}-${index}_VXSE53_.xml`,
    updated: `${sourceDate}T00:${String(index).padStart(2, "0")}:00+09:00`,
    sourceDate,
    xmlCode: "VXSE53"
  }))
));
const selectedEntries = selectJmaXmlCandidates(
  pendingEntries,
  new Map(),
  boundaryNow,
  retentionDates
);
assert.equal(selectedEntries.length, 8, "1回のcronを小分けにしてWorker上限へ余裕を持たせる");
assert.equal(
  selectedEntries.filter((entry) => entry.sourceDate === retentionDates[0]).length,
  4,
  "当日分の最新4件を処理する"
);
assert.equal(
  selectedEntries.filter((entry) => entry.sourceDate === retentionDates[1]).length,
  4,
  "前日分も同じcronで最新4件を処理する"
);
assert.deepEqual(
  selectedEntries
    .filter((entry) => entry.sourceDate === retentionDates[0])
    .map((entry) => entry.updated),
  [
    "2026-07-30T00:39:00+09:00",
    "2026-07-30T00:38:00+09:00",
    "2026-07-30T00:37:00+09:00",
    "2026-07-30T00:36:00+09:00"
  ],
  "大量発表時も古い順ではなく最新発表から追いつく"
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
