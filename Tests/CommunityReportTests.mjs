import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMMUNITY_REPORT_ACCOUNT_DAILY_LIMIT,
  COMMUNITY_REPORT_GLOBAL_DAILY_LIMIT,
  COMMUNITY_REPORT_POST_COOLDOWN_MS,
  COMMUNITY_REPORT_RETENTION_MS,
  cleanupExpiredCommunityReports,
  insertCommunityReportWithQuota,
  normalizeCommunityReportInput,
  normalizeCommunityReportComment,
  readCommunityReportOperationalMetrics,
  roundCommunityCoordinate
} from "../functions/_shared/communityReports.js";
import { accountSessionToken } from "../functions/_shared/accountAuth.js";

assert.equal(COMMUNITY_REPORT_RETENTION_MS, 5 * 60 * 60 * 1000);
assert.equal(COMMUNITY_REPORT_POST_COOLDOWN_MS, 5 * 60 * 1000);
assert.equal(COMMUNITY_REPORT_ACCOUNT_DAILY_LIMIT, 12);
assert.equal(COMMUNITY_REPORT_GLOBAL_DAILY_LIMIT, 2400);
assert.equal(roundCommunityCoordinate(139.7514), 139.76);
assert.deepEqual(normalizeCommunityReportInput({
  weather: "heavy-rain",
  comment: null,
  sensation: "cool",
  temperature: 18.26,
  hazards: ["flooded-road", "strong-wind", "strong-wind"],
  latitude: 35.6812,
  longitude: 139.7671,
  areaCode: "1310100",
  areaName: "千代田区"
}), {
  weather: "heavy-rain",
  comment: null,
  sensation: "cool",
  temperatureTenths: 183,
  hazards: ["flooded-road", "strong-wind"],
  latitude: 35.68,
  longitude: 139.76,
  areaCode: "1310100",
  areaName: "千代田区"
});
assert.deepEqual(normalizeCommunityReportComment("  道路が 冠水しています\n注意  "), { comment: "道路が 冠水しています 注意" });
assert.match(normalizeCommunityReportComment("https://example.com を確認").error, /URL/u);
assert.match(normalizeCommunityReportComment("あ".repeat(81)).error, /80文字/u);
assert.match(normalizeCommunityReportInput({ weather: "unknown" }).error, /天気/u);
assert.match(normalizeCommunityReportInput({ weather: "sunny", latitude: 1, longitude: 1, areaName: "x" }).error, /範囲外/u);
assert.match(normalizeCommunityReportInput({
  weather: "sunny", latitude: 35, longitude: 139, areaName: "x",
  hazards: ["flooded-road", "strong-wind", "poor-visibility", "thunder"]
}).error, /危険/u);

assert.equal(accountSessionToken(new Request("https://example.com", {
  headers: { Authorization: "Bearer web-token" }
})).token, "web-token");
assert.equal(accountSessionToken(new Request("https://example.com", {
  headers: { Cookie: "meteoscope_quiz_session=legacy-token" }
})).source, "legacy");

const prepared = [];
const fakeDB = {
  prepare(sql) {
    const entry = { sql, values: [] };
    prepared.push(entry);
    return { bind(...values) { entry.values = values; return entry; } };
  },
  async batch(statements) {
    assert.equal(statements.length, 3);
    return [{ meta: { changes: 3 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }];
  }
};
assert.deepEqual(await cleanupExpiredCommunityReports(fakeDB, new Date("2026-07-17T00:01:00Z")), { ran: false, deleted: 0 });
assert.deepEqual(await cleanupExpiredCommunityReports(fakeDB, new Date("2026-07-17T00:05:00Z")), {
  ran: true,
  deleted: 3,
  countersDeleted: 1,
  totalsDeleted: 1
});
assert.match(prepared[0].sql, /LIMIT 200/u);
assert.match(prepared[1].sql, /community_post_daily/u);
assert.match(prepared[2].sql, /community_post_totals/u);

const quotaStatements = [];
const quotaDB = {
  prepare(sql) {
    const entry = { sql, values: [] };
    quotaStatements.push(entry);
    return { bind(...values) { entry.values = values; return entry; } };
  },
  async batch(statements) {
    assert.equal(statements.length, 4);
    return [{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 0 } }];
  }
};
const quotaReport = {
  id: "11111111-1111-4111-8111-111111111111",
  accountID: "account-1",
  weather: "sunny",
  comment: null,
  sensation: null,
  temperatureTenths: null,
  hazardsJSON: "[]",
  latitude: 35.68,
  longitude: 139.76,
  areaCode: "1310100",
  areaName: "千代田区",
  createdAt: "2026-07-20T00:00:00.000Z",
  expiresAt: "2026-07-20T05:00:00.000Z",
  activityDate: "2026-07-20",
  counterExpiresAt: "2026-07-22T00:00:00.000Z"
};
assert.equal(await insertCommunityReportWithQuota(quotaDB, quotaReport), true);
assert.match(quotaStatements[0].sql, /post_count < 2400/u);
assert.match(quotaStatements[1].sql, /post_count < 12/u);
assert.match(quotaStatements[2].sql, /last_reservation_id/u);
assert.match(quotaStatements[3].sql, /NOT EXISTS/u);

const metricsStatements = [];
const metrics = await readCommunityReportOperationalMetrics({
  NOTIFICATIONS_DB: {
    prepare(sql) {
      const entry = { sql, values: [] };
      metricsStatements.push(entry);
      return { bind(...values) { entry.values = values; return entry; } };
    },
    async batch(statements) {
      assert.equal(statements.length, 3);
      return [
        { results: [{ count: 42 }] },
        { results: [{ count: 18 }] },
        { results: [{ post_count: 75 }] }
      ];
    }
  }
}, new Date("2026-07-20T01:00:00.000Z"));
assert.deepEqual(metrics, {
  configured: true,
  activeReports: 42,
  activeAccounts: 18,
  postsToday: 75,
  accountDailyLimit: 12,
  globalDailyLimit: 2400
});
assert.match(metricsStatements[2].sql, /community_post_totals/u);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [route, migration, quotaMigration, webClient, webModal, webMap, webSummary, webIndex, privacyPage] = await Promise.all([
  fs.readFile(path.join(root, "functions", "api", "community", "[[path]].js"), "utf8"),
  fs.readFile(path.join(root, "migrations", "0008_community_reports.sql"), "utf8"),
  fs.readFile(path.join(root, "migrations", "0009_community_report_quota.sql"), "utf8"),
  fs.readFile(path.join(root, "src", "domain", "communityReportClient.js"), "utf8"),
  fs.readFile(path.join(root, "src", "ui", "communityReportModal.js"), "utf8"),
  fs.readFile(path.join(root, "src", "map", "weatherMap.js"), "utf8"),
  fs.readFile(path.join(root, "src", "ui", "leftPanel.js"), "utf8"),
  fs.readFile(path.join(root, "index.html"), "utf8"),
  fs.readFile(path.join(root, "public", "privacy.html"), "utf8")
]);
for (const table of ["community_reports", "community_report_flags", "community_post_daily"]) {
assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "u"));
}
assert.match(migration, /comment TEXT/u);
assert.match(quotaMigration, /CREATE TABLE IF NOT EXISTS community_post_totals/u);
assert.match(quotaMigration, /last_reservation_id/u);
assert.match(route, /requireAccountAuthentication/u);
assert.doesNotMatch(route, /validateEarlyAccessToken|X-MeteoScope-Early-Access/u);
assert.match(route, /POST_COOLDOWN_MS/u);
assert.match(route, /COMMUNITY_REPORT_ACCOUNT_DAILY_LIMIT/u);
assert.match(route, /COMMUNITY_REPORT_GLOBAL_DAILY_LIMIT/u);
assert.match(route, /insertCommunityReportWithQuota/u);
assert.doesNotMatch(route, /console\.(?:log|error).*token/iu);
assert.match(webClient, /REPORT_LIST_CACHE_TTL_MS = 60 \* 1000/u);
assert.match(webClient, /limit = 100/u);
assert.doesNotMatch(webClient, /getEarlyAccessToken|X-MeteoScope-Early-Access/u);
assert.match(webModal, /roundReportCoordinate/u);
assert.doesNotMatch(webModal, /validateEarlyAccess|community-report-access-required/u);
assert.match(webModal, /data\.get\("comment"\)/u);
assert.match(webModal, /input, select, textarea, button/u);
assert.match(webMap, /community-report-cluster/u);
assert.doesNotMatch(webMap, /community-report-label/u);
assert.doesNotMatch(webMap, /shortLabel: meta\.short/u);
assert.match(webMap, /4, 5, 8, 7\.5, 12, 9\.5/u);
assert.match(webMap, /if \(!hitReport\) hideMapInfo\("community-report"\)/u);
assert.doesNotMatch(webSummary, /mobile-dock-community-report-open/u);
assert.match(webIndex, /data-community-report-open/u);
assert.match(webIndex, /map-community-report-button/u);
assert.match(privacyPage, /5時間/u);
assert.match(privacyPage, /約2km/u);

console.log("Community report tests passed.");
