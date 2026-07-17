import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMMUNITY_REPORT_RETENTION_MS,
  cleanupExpiredCommunityReports,
  normalizeCommunityReportInput,
  normalizeCommunityReportComment,
  roundCommunityCoordinate
} from "../functions/_shared/communityReports.js";
import { accountSessionToken } from "../functions/_shared/accountAuth.js";

assert.equal(COMMUNITY_REPORT_RETENTION_MS, 5 * 60 * 60 * 1000);
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
  headers: { Authorization: "Bearer ios-token" }
})).token, "ios-token");
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
    assert.equal(statements.length, 2);
    return [{ meta: { changes: 3 } }, { meta: { changes: 1 } }];
  }
};
assert.deepEqual(await cleanupExpiredCommunityReports(fakeDB, new Date("2026-07-17T00:01:00Z")), { ran: false, deleted: 0 });
assert.deepEqual(await cleanupExpiredCommunityReports(fakeDB, new Date("2026-07-17T00:05:00Z")), { ran: true, deleted: 3, countersDeleted: 1 });
assert.match(prepared[0].sql, /LIMIT 200/u);
assert.match(prepared[1].sql, /community_post_daily/u);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [route, migration, webModal, webMap, webSummary, webIndex, iosService, iosComposer, privacyManifest, privacyPage] = await Promise.all([
  fs.readFile(path.join(root, "functions", "api", "community", "[[path]].js"), "utf8"),
  fs.readFile(path.join(root, "migrations", "0008_community_reports.sql"), "utf8"),
  fs.readFile(path.join(root, "src", "ui", "communityReportModal.js"), "utf8"),
  fs.readFile(path.join(root, "src", "map", "weatherMap.js"), "utf8"),
  fs.readFile(path.join(root, "src", "ui", "leftPanel.js"), "utf8"),
  fs.readFile(path.join(root, "index.html"), "utf8"),
  fs.readFile(path.join(root, "ios", "MeteoScope", "Services", "CommunityReportService.swift"), "utf8"),
  fs.readFile(path.join(root, "ios", "MeteoScope", "Views", "CommunityReportComposerView.swift"), "utf8"),
  fs.readFile(path.join(root, "ios", "MeteoScope", "Support", "PrivacyInfo.xcprivacy"), "utf8"),
  fs.readFile(path.join(root, "public", "privacy.html"), "utf8")
]);
for (const table of ["community_reports", "community_report_flags", "community_post_daily"]) {
assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "u"));
}
assert.match(migration, /comment TEXT/u);
assert.match(route, /requireAccountAuthentication/u);
assert.match(route, /validateEarlyAccessToken/u);
assert.match(route, /POST_COOLDOWN_MS/u);
assert.match(route, /MAX_POSTS_PER_24_HOURS/u);
assert.doesNotMatch(route, /console\.(?:log|error).*token/iu);
assert.match(webModal, /roundReportCoordinate/u);
assert.match(webModal, /data\.get\("comment"\)/u);
assert.match(webModal, /input, select, textarea, button/u);
assert.match(webMap, /community-report-cluster/u);
assert.match(webSummary, /mobile-dock-community-report-open/u);
assert.match(webSummary, /data-community-report-open/u);
assert.match(webIndex, /data-community-report-open/u);
assert.match(iosService, /X-MeteoScope-Early-Access/u);
assert.match(iosComposer, /roundedReportCoordinate/u);
assert.match(iosComposer, /80文字/u);
assert.match(privacyManifest, /NSPrivacyCollectedDataTypeOtherUserContent/u);
assert.match(privacyPage, /5時間/u);
assert.match(privacyPage, /約2km/u);

console.log("Community report tests passed.");
