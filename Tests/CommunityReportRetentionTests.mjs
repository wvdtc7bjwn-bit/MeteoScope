import assert from "node:assert/strict";
import { onRequest } from "../functions/api/community/[[path]].js";

// Exercise the HTTP handlers and bound D1 values, without a live account or DB.
const RealDate = globalThis.Date;
let now = RealDate.parse("2026-11-14T18:00:00+09:00");
let inserted = null;
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
};
const db = {
  prepare(sql) {
    return {
      values: [], sql,
      bind(...values) { this.values = values; return this; },
      async first() {
        return sql.includes("FROM quiz_sessions") ? { id: "test-account", display_name: "Test" } : null;
      },
      async all() {
        assert.match(sql, /WHERE reports\.expires_at > \?2/u);
        const cutoff = this.values[1];
        assert.equal(cutoff, new RealDate(now).toISOString());
        return { results: inserted && inserted.expires_at > cutoff ? [inserted] : [] };
      }
    };
  },
  async batch(statements) {
    const insert = statements.find((s) => s.sql.includes("INSERT INTO community_reports"));
    assert.ok(insert);
    inserted = {
      id: insert.values[0], weather: insert.values[2],
      created_at: insert.values[11], expires_at: insert.values[12],
      latitude: 35.68, longitude: 139.76, area_name: "テスト地域"
    };
    return statements.map(() => ({ meta: { changes: 1 } }));
  }
};
const env = { NOTIFICATIONS_DB: db };
const list = async (suffix = "") => {
  const response = await onRequest({ env, request: new Request(`https://example.com/api/community/reports${suffix}`) });
  assert.equal(response.status, 200);
  return response.json();
};
try {
  const response = await onRequest({ env, request: new Request("https://example.com/api/community/reports", {
    method: "POST", headers: { Authorization: "Bearer local-test", "Content-Type": "application/json" },
    body: JSON.stringify({ weather: "snow-cover-present", latitude: 35.68, longitude: 139.76, areaName: "テスト地域" })
  }) });
  assert.equal(response.status, 201);
  const { report } = await response.json();
  assert.equal(report.weather, "snow-cover-present");
  assert.equal(report.createdAt, "2026-11-14T09:00:00.000Z");
  assert.equal(report.expiresAt, "2026-11-14T21:00:00.000Z", "Expire 12 elapsed hours later, across midnight JST");
  assert.equal(inserted.expires_at, report.expiresAt);
  assert.equal((await list()).retentionHours, 12);
  now = RealDate.parse(report.expiresAt) - 1;
  assert.equal((await list()).reports.length, 1);
  assert.equal((await list("?bbox=139,35,140,36")).reports.length, 1);
  now += 1;
  assert.equal((await list()).reports.length, 0);
  assert.equal((await list("?bbox=139,35,140,36")).reports.length, 0);
} finally {
  globalThis.Date = RealDate;
}
console.log("Community report HTTP retention: 12 hours, expiry boundary and snow values OK");
