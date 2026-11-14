import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { normalizeP2pDiscordReport, runP2pDiscordNotifications, P2P_DISCORD_HISTORY_URL } from "../workers/earthquake-realtime/src/p2pDiscordNotifications.js";
import { resolveDiscordEarthquakeIdentity, isSameDiscordEarthquake } from "../workers/earthquake-realtime/src/discordEarthquakeIdentity.js";
import { buildDiscordEarthquakeNotificationUpsert, buildDiscordEarthquakeWebhookPayload, deliverPendingDiscordEarthquakeNotifications, sendDiscordEarthquakePreviousTestNotification } from "../workers/earthquake-realtime/src/discordEarthquakeNotifications.js";
import { runScheduledSync, JMA_XML_SYNC_CRON } from "../workers/earthquake-realtime/src/index.js";
import { runJmaXmlHypocenterMaintenance } from "../workers/earthquake-realtime/src/jmaXmlHypocenters.js";

// P2P JSON API v2 code 551 fixture, fields from the provider's specification:
// https://www.p2pquake.net/swagger-ui/specification.yaml (checked 2026-11-14).
// Synthetic event; all HTTP requests, clocks and Discord delivery are stubbed.
const now = Date.parse("2026-11-14T12:03:00Z");
const fixture = {
  code: 551, id: "fixture-report-1", time: "2026/11/14 21:02:05.000",
  issue: { source: "気象庁", type: "ScaleAndDestination", time: "2026/11/14 21:02:00", correct: "None" },
  earthquake: { time: "2026/11/14 21:01:00", maxScale: 30, domesticTsunami: "None",
    hypocenter: { name: "熊本県熊本地方", latitude: 32.7, longitude: 130.8, magnitude: 4, depth: 10 } },
  points: [{ pref: "熊本県", addr: "熊本市", scale: 30, isArea: false }]
};
const clone = () => structuredClone(fixture);
const report = normalizeP2pDiscordReport(fixture, now);
assert.equal(report.reportTime, "2026-11-14T12:02:00.000Z");
assert.equal(report.originTime, "2026-11-14T12:01:00.000Z");
assert.equal(report.source, "p2p");
assert.equal(report.maxIntensity, "3");
assert.equal(report.depthKm, 10);
assert.equal(report.intensityStations, undefined);
for (const type of ["ScalePrompt", "Destination", "Foreign", "Other"]) {
  const value = clone(); value.issue.type = type;
  assert.equal(normalizeP2pDiscordReport(value, now), null);
}
for (const mutate of [
  value => { value.issue.time = "invalid"; value.time = "invalid"; },
  value => { value.issue.time = "2026/11/14 21:20:00"; },
  value => { value.issue.time = "2026/11/14 20:00:00"; },
  value => { value.earthquake.hypocenter.latitude = -200; },
  value => { value.earthquake.maxScale = -1; },
  value => { value.test = true; }
]) {
  const value = clone(); mutate(value);
  assert.equal(normalizeP2pDiscordReport(value, now), null);
}
const missing = clone(); missing.earthquake.hypocenter.magnitude = null; missing.earthquake.hypocenter.depth = "";
const missingPayload = buildDiscordEarthquakeWebhookPayload(normalizeP2pDiscordReport(missing, now));
assert.deepEqual(missingPayload.embeds[0].fields.slice(0, 2).map(field => field.value), ["調査中", "調査中"]);
const correction = clone(); correction.issue.correct = "ScaleOnly";
assert.equal(normalizeP2pDiscordReport(correction, now).infoType, "訂正");

async function createDb() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of ["0004_jma_xml_hypocenters.sql", "0005_discord_earthquake_notifications.sql"]) {
    sqlite.exec(await readFile(new URL("../workers/earthquake-realtime/migrations/" + migration, import.meta.url), "utf8"));
  }
  let statements = 0;
  const db = {
    sqlite, get statements() { return statements; },
    prepare(sql) {
      const prepared = sqlite.prepare(sql);
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async all() { statements++; return { results: prepared.all(...values) }; },
        async first() { statements++; return prepared.get(...values) ?? null; },
        async run() { statements++; return { success: true, meta: { changes: Number(prepared.run(...values).changes) } }; }
      };
    },
    async batch(items) { return Promise.all(items.map(item => item.run())); }
  };
  return db;
}
const db = await createDb();
const env = { EQ_D1: db, DISCORD_EARTHQUAKE_WEBHOOK_URL: "https://discord.com/api/webhooks/123/test-token",
  BROWSER: { quickAction() { assert.fail("画像生成を呼び出してはいけない"); } } };
const calls = [];
const fetchImpl = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (String(url) === P2P_DISCORD_HISTORY_URL) return Response.json([fixture]);
  assert.match(String(url), /^https:\/\/discord\.com\/api\/webhooks\//u);
  const body = JSON.parse(init.body);
  assert.equal(init.headers["content-type"], "application/json");
  assert.equal(body._earthquake, undefined);
  assert.equal(body._shareCard, undefined);
  assert.equal(body.embeds[0].image, undefined);
  return Response.json({ id: "message-1" });
};
const first = await runP2pDiscordNotifications(env, { now, fetchImpl });
assert.equal(first.discord.sent, 1);
assert.match(JSON.parse(calls[1].init.body).embeds[0].footer.text, /P2P/u);
assert.equal((await runP2pDiscordNotifications(env, { now: now + 60000, fetchImpl })).discord.sent, 0);
assert.equal(calls.filter(call => call.init.method === "POST").length, 1, "履歴を繰り返し確認しても再投稿しない");

const xml = { ...report, source: "xml", eventId: "20261114210100", reportTime: "2026-11-14T12:02:30Z", xmlCode: "VXSE53" };
const resolved = await resolveDiscordEarthquakeIdentity(db, xml);
assert.equal(resolved.eventId, report.eventId);
await buildDiscordEarthquakeNotificationUpsert(db, resolved, { updated: xml.reportTime }, now).run();
assert.equal((await deliverPendingDiscordEarthquakeNotifications(env, { now, fetchImpl })).sent, 1);
assert.equal(calls.at(-1).init.method, "PATCH", "後からXMLが来ても同じメッセージを編集する");
assert.deepEqual(JSON.parse(calls.at(-1).init.body).allowed_mentions, { parse: [] });
assert.equal((await runP2pDiscordNotifications(env, { now: now + 60000, fetchImpl })).discord.sent, 0, "古いP2PでXMLを上書きしない");
assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS total FROM discord_earthquake_notifications").get().total, 1);

const sameTimeXml = { ...resolved, reportTime: report.reportTime };
db.sqlite.exec("DELETE FROM discord_earthquake_notifications");
await buildDiscordEarthquakeNotificationUpsert(db, sameTimeXml, { updated: report.reportTime }, now).run();
const sameTimeP2p = { ...report, eventId: sameTimeXml.eventId };
assert.equal((await buildDiscordEarthquakeNotificationUpsert(db, sameTimeP2p, { updated: report.reportTime }, now).run()).meta.changes, 0,
  "同一発表時刻のP2PでXMLが置き換わり続けない");

const identity = buildDiscordEarthquakeWebhookPayload(report)._earthquake;
assert.equal(isSameDiscordEarthquake(identity, { ...identity, sourceEventId: "another-id", originTime: "2026-11-14T12:02:00Z" }), true);
assert.equal(isSameDiscordEarthquake(identity, { ...identity, sourceEventId: "another-id", coordinates: [140, 35] }), false);
assert.equal(isSameDiscordEarthquake(identity, { ...identity, sourceEventId: "another-id", originTime: "2026-11-14T12:04:00Z" }), false);

// A crash during send leaves a lease; another invocation cannot immediately POST.
db.sqlite.exec("UPDATE discord_earthquake_notifications SET status='pending'");
let release;
const inFlight = deliverPendingDiscordEarthquakeNotifications(env, { now, fetchImpl: () => new Promise(resolve => { release = resolve; }) });
await new Promise(resolve => setImmediate(resolve));
assert.equal((await deliverPendingDiscordEarthquakeNotifications(env, { now, fetchImpl })).attempted, 0);
release(Response.json({ id: "leased-message" }));
await inFlight;
db.sqlite.prepare("UPDATE discord_earthquake_notifications SET status='sending', updated_at=?").run(new Date(now - 61000).toISOString());
assert.equal((await deliverPendingDiscordEarthquakeNotifications(env, { now, fetchImpl })).sent, 1, "期限切れの送信ロックは回復する");

// If a newer report arrives while POST is in flight, save its message ID and
// leave the new payload pending so the next delivery PATCHes rather than POSTs.
db.sqlite.exec("UPDATE discord_earthquake_notifications SET status='pending', discord_message_id=NULL");
let releaseUpdated;
const duringUpdate = deliverPendingDiscordEarthquakeNotifications(env, { now, fetchImpl: () => new Promise(resolve => { releaseUpdated = resolve; }) });
await new Promise(resolve => setImmediate(resolve));
await buildDiscordEarthquakeNotificationUpsert(db, { ...sameTimeXml, magnitude: 4.1 }, { updated: "2026-11-14T12:03:00Z" }, now).run();
releaseUpdated(Response.json({ id: "updated-message" }));
await duringUpdate;
const updated = db.sqlite.prepare("SELECT * FROM discord_earthquake_notifications").get();
assert.equal(updated.status, "pending");
assert.equal(updated.discord_message_id, "updated-message");

const testCalls = [];
await sendDiscordEarthquakePreviousTestNotification(env, updated, { now, fetchImpl: async (_url, init) => {
  testCalls.push(JSON.parse(init.body)); return Response.json({ id: "test-message" });
} });
assert.match(testCalls[0].content, /TEST/u);
assert.deepEqual(testCalls[0].allowed_mentions, { parse: [] });
assert.equal(testCalls[0].embeds[0].image, undefined);

for (const response of [new Response("", { status: 503 }), new Response("invalid json"), Response.json({ error: "bad-shape" })]) {
  const failed = await runP2pDiscordNotifications(env, { now, fetchImpl: async () => response });
  assert.equal(failed.ok, false);
}

const dbFallback = await createDb();
const sourceUrl = "https://www.data.jma.go.jp/developer/xml/data/20261114120230_0_VXSE53_010000.xml";
const xmlBody = `<Report><Control><Status>通常</Status></Control><Head>
  <ReportDateTime>2026-11-14T12:02:30Z</ReportDateTime><EventID>20261114210100</EventID><InfoType>発表</InfoType></Head>
  <Body><Earthquake><OriginTime>2026-11-14T12:01:00Z</OriginTime><Hypocenter><Area><Name>熊本県熊本地方</Name>
  <Coordinate>+32.7+130.8-10000/</Coordinate></Area></Hypocenter><Magnitude>4.0</Magnitude></Earthquake>
  <Intensity><Observation><MaxInt>3</MaxInt></Observation></Intensity></Body></Report>`;
const order = [];
const fallbackResult = await runScheduledSync(JMA_XML_SYNC_CRON, { ...env, EQ_D1: dbFallback }, null, { now,
  fetchImpl: async (url, init = {}) => {
    const value = String(url); order.push(value);
    if (value === P2P_DISCORD_HISTORY_URL) return new Response("", { status: 503 });
    if (value.endsWith("eqvol.xml")) return new Response(`<feed><entry><id>${sourceUrl}</id><updated>2026-11-14T12:02:30Z</updated></entry></feed>`);
    if (value === sourceUrl) return new Response(xmlBody);
    return Response.json({ id: "fallback-message" });
  }
});
assert.equal(fallbackResult.p2p.ok, false);
assert.equal(fallbackResult.discord.sent, 1, "P2P停止時もXMLで通知する");
assert.equal(order[0], P2P_DISCORD_HISTORY_URL);

const dbPriority = await createDb();
const priorityOrder = [];
await runScheduledSync(JMA_XML_SYNC_CRON, { ...env, EQ_D1: dbPriority }, null, { now,
  fetchImpl: async (url, init = {}) => {
    const value = String(url); priorityOrder.push(value);
    if (value === P2P_DISCORD_HISTORY_URL) return Response.json([fixture]);
    if (value.endsWith("eqvol.xml")) return new Response(`<feed><entry><id>${sourceUrl}</id><updated>2026-11-14T12:02:30Z</updated></entry></feed>`);
    if (value === sourceUrl) return new Response(xmlBody);
    return Response.json({ id: "priority-message" });
  }
});
assert.ok(priorityOrder.findIndex(url => url.includes("discord.com")) < priorityOrder.findIndex(url => url.endsWith("eqvol.xml")), "XMLの取得前にP2P通知を送る");
assert.equal(dbPriority.sqlite.prepare("SELECT COUNT(*) AS total FROM discord_earthquake_notifications").get().total, 1);

await buildDiscordEarthquakeNotificationUpsert(dbPriority, { ...report, eventId: "p2p:expired", sourceDate: "2026-11-12" },
  { updated: "2026-11-12T00:00:00Z" }, now).run();
const cleaned = await runJmaXmlHypocenterMaintenance({ EQ_D1: dbPriority }, { now });
assert.equal(cleaned.cleanup.deletedDiscordNotifications, 1, "P2P通知も既存の当日・前日保持と自動削除に従う");
assert.equal(dbPriority.sqlite.prepare("SELECT COUNT(*) AS total FROM discord_earthquake_notifications").get().total, 1);

for (const item of [db, dbFallback, dbPriority]) item.sqlite.close();
console.log("Discord P2P notification SQL, fallback, ordering, deduplication and text-only tests passed");
