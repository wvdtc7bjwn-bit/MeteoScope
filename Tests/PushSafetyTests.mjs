import assert from "node:assert/strict";
import { onRequest, runPushMaintenance } from "../functions/api/push/[[path]].js";

const canonicalArea = {
  areaCode: "2920101",
  areaName: "奈良市西部",
  prefecture: "奈良県",
  officeCode: "290000"
};

let savedWebSubscription = null;
const webSubscriptionDatabase = {
  prepare(sql) {
    return {
      bind(...values) {
        return {
          async run() {
            if (sql.includes("INSERT INTO push_subscriptions")) {
              savedWebSubscription = JSON.parse(values[1]);
            }
            return { success: true };
          }
        };
      }
    };
  }
};
const webSubscriptionResponse = await onRequest({
  request: new Request("https://example.test/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: {
        endpoint: "https://push.example.test/subscription",
        keys: { p256dh: "public-key", auth: "auth-secret" }
      },
      area: canonicalArea,
      preferences: { notifyAdvisory: true, adminBroadcast: false },
      warningState: { warnings: [{ code: "03", level: "warning" }] }
    })
  }),
  env: {
    NOTIFICATIONS_DB: webSubscriptionDatabase,
    VAPID_PUBLIC_KEY: "configured-public-key",
    VAPID_PRIVATE_KEY: "configured-private-key"
  }
});
assert.equal(webSubscriptionResponse.status, 200);
assert.equal((await webSubscriptionResponse.json()).deliveryMode, "admin_only");
assert.equal(savedWebSubscription.deliveryMode, "admin_only");
assert.deepEqual(savedWebSubscription.preferences, { adminBroadcast: true });
assert.equal("areaCode" in savedWebSubscription, false);
assert.equal("warningState" in savedWebSubscription, false);

class CountingD1 {
  constructor() {
    this.queries = 0;
    this.records = new Map();
  }

  prepare(sql) {
    const database = this;
    return {
      sql,
      values: [],
      bind(...values) {
        this.values = values;
        return this;
      },
      async first() {
        database.queries += 1;
        if (sql.includes("FROM push_meta")) return { value: new Date().toISOString() };
        if (sql.includes("FROM app_records")) {
          const value = database.records.get(this.values[0]);
          return value === undefined ? null : { value };
        }
        return null;
      },
      async all() {
        database.queries += 1;
        return { results: [] };
      },
      async run() {
        database.queries += 1;
        if (sql.includes("INSERT INTO app_records")) {
          database.records.set(this.values[0], this.values[1]);
        }
        return { meta: { changes: 1 } };
      }
    };
  }

  async batch(statements) {
    this.queries += statements.length;
    return statements.map(() => ({ meta: { changes: 1 } }));
  }
}

const countingD1 = new CountingD1();
globalThis.fetch = async (url) => {
  throw new Error(`Unexpected fetch: ${url}`);
};
const freeTierCycle = await runPushMaintenance(
  { NOTIFICATIONS_DB: countingD1 },
  { now: new Date("2026-07-19T03:01:00.000Z") }
);
assert.equal(freeTierCycle.communityReports.skipped, true);
assert.equal(freeTierCycle.retention.skipped, true);
assert.equal(freeTierCycle.webSubscriptionMigration.skipped, true);
assert.ok(countingD1.queries < 50, `D1 query budget exceeded: ${countingD1.queries}`);

console.log("Push safety tests passed");
