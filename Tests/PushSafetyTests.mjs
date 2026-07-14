import assert from "node:assert/strict";
import {
  buildNotificationMessage,
  onRequest,
  runWarningPushCheck,
  selectNotificationQueueBatch,
  selectWarningOfficeBatch,
  shouldPreserveWarningState
} from "../functions/api/push/[[path]].js";
import {
  isValidAPNSDeviceToken,
  normalizeIOSSubscription
} from "../functions/_shared/apns.js";

const token = "ab".repeat(32);
const canonicalArea = {
  areaCode: "2920101",
  areaName: "奈良市西部",
  prefecture: "奈良県",
  officeCode: "290000"
};

assert.equal(isValidAPNSDeviceToken(token), true);
assert.equal(isValidAPNSDeviceToken("not-a-token"), false);
assert.equal(isValidAPNSDeviceToken("a".repeat(65)), false);
assert.equal(normalizeIOSSubscription({ deviceToken: "bad", environment: "sandbox" }, canonicalArea), null);
assert.equal(normalizeIOSSubscription({ deviceToken: token, environment: "development" }, canonicalArea), null);
assert.equal(
  normalizeIOSSubscription({ deviceToken: token, environment: "sandbox", preferences: {} }, canonicalArea).officeCode,
  "290000"
);

assert.equal(selectWarningOfficeBatch(0).length, 15);
assert.ok(selectWarningOfficeBatch(45).length <= 15);
assert.equal(shouldPreserveWarningState("290000", ["290000"]), true);
assert.equal(shouldPreserveWarningState("290000", []), false);
assert.equal(shouldPreserveWarningState("", []), true);

const firstQueueBatch = selectNotificationQueueBatch(
  [{ key: "web:a" }, { key: "web:b" }, { key: "web:c" }],
  "",
  2
);
assert.deepEqual(firstQueueBatch.batch.map((item) => item.key), ["web:a", "web:b"]);
const queueAfterDeletion = selectNotificationQueueBatch(
  [{ key: "web:b" }, { key: "web:c" }],
  "web:b",
  2
);
assert.deepEqual(queueAfterDeletion.batch.map((item) => item.key), ["web:c"]);
assert.equal(
  selectNotificationQueueBatch(
    Array.from({ length: 10 }, (_, index) => ({ key: `web:${String(index).padStart(2, "0")}` }))
  ).batch.length,
  6
);

const baseSubscription = {
  areaCode: "2920101",
  areaName: "奈良市西部",
  preferences: { notifyAdvisory: false }
};

const switched = buildNotificationMessage(
  {
    ...baseSubscription,
    warningState: { warnings: [{ code: "03", rawLabel: "大雨警報", label: "大雨警報", level: "warning" }] }
  },
  { areaName: "奈良市西部" },
  [{ code: "10", rawLabel: "大雨注意報", label: "大雨注意報", level: "advisory" }]
);
assert.match(switched.body, /［切替］大雨注意報に切り替え/);
assert.match(switched.title, /^気象庁発表｜/);

const released = buildNotificationMessage(
  {
    ...baseSubscription,
    warningState: { warnings: [{ code: "04", rawLabel: "洪水警報", label: "レベル3 洪水警報", level: "warning" }] }
  },
  null,
  []
);
assert.match(released.body, /［解除］レベル3 洪水警報/);

const announcedWithContinuation = buildNotificationMessage(
  {
    ...baseSubscription,
    warningState: {
      warnings: [
        { code: "03", rawLabel: "大雨警報", label: "大雨警報", level: "warning" },
        { code: "04", rawLabel: "洪水警報", label: "レベル3 洪水警報", level: "warning" }
      ]
    }
  },
  null,
  [
    { code: "03", rawLabel: "大雨警報", label: "大雨警報", level: "warning" },
    { code: "44", rawLabel: "洪水危険警報", label: "レベル4 洪水危険警報", level: "danger" }
  ]
);
assert.match(announcedWithContinuation.body, /［発表］レベル4 洪水危険警報/);
assert.match(announcedWithContinuation.body, /［継続］大雨警報/);

const noChange = buildNotificationMessage(
  {
    ...baseSubscription,
    warningState: { warnings: [{ code: "03", rawLabel: "大雨警報", label: "大雨警報", level: "warning" }] }
  },
  null,
  [{ code: "03", rawLabel: "大雨警報", label: "大雨警報", level: "warning" }]
);
assert.equal(noChange, null);

const unconfiguredResponse = await onRequest({
  request: new Request("https://example.test/api/push/ios/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceToken: token, environment: "sandbox", area: canonicalArea })
  }),
  env: { NOTIFICATIONS_DB: {} }
});
assert.equal(unconfiguredResponse.status, 503);
assert.equal((await unconfiguredResponse.json()).deliveryEnabled, false);

const configuredEnvironment = {
  NOTIFICATIONS_DB: {},
  APNS_KEY_ID: "key",
  APNS_TEAM_ID: "team",
  APNS_PRIVATE_KEY: "private",
  APNS_BUNDLE_ID: "jp.meteoscope.ios"
};
const oversizedResponse = await onRequest({
  request: new Request("https://example.test/api/push/ios/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ padding: "x".repeat(5000) })
  }),
  env: configuredEnvironment
});
assert.equal(oversizedResponse.status, 413);

const invalidAreaResponse = await onRequest({
  request: new Request("https://example.test/api/push/ios/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceToken: token,
      environment: "sandbox",
      area: { areaCode: "invalid", areaName: "invalid", prefecture: "invalid" }
    })
  }),
  env: configuredEnvironment
});
assert.equal(invalidAreaResponse.status, 400);

const areaCatalog = {
  offices: { "290000": { name: "奈良県" } },
  class10s: { "290010": { name: "北部", parent: "290000" } },
  class15s: { "290011": { name: "北西部", parent: "290010" } },
  class20s: { "2920101": { name: "奈良市西部", parent: "290011" } }
};
globalThis.fetch = async () => new Response(JSON.stringify(areaCatalog), {
  status: 200,
  headers: { "Content-Type": "application/json" }
});
const database = {
  prepare(sql) {
    return {
      bind() {
        return {
          async first() { return null; },
          async run() { return { success: true }; }
        };
      }
    };
  }
};
const invalidTokenResponse = await onRequest({
  request: new Request("https://example.test/api/push/ios/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceToken: "fake",
      environment: "sandbox",
      area: { areaCode: "2920101", areaName: "spoofed", prefecture: "spoofed" }
    })
  }),
  env: { ...configuredEnvironment, NOTIFICATIONS_DB: database }
});
assert.equal(invalidTokenResponse.status, 400);

const validRegistrationResponse = await onRequest({
  request: new Request("https://example.test/api/push/ios/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceToken: token,
      environment: "sandbox",
      area: { areaCode: "2920101", areaName: "spoofed", prefecture: "spoofed" }
    })
  }),
  env: { ...configuredEnvironment, NOTIFICATIONS_DB: database }
});
assert.equal(validRegistrationResponse.status, 200);
const validRegistration = await validRegistrationResponse.json();
assert.equal(validRegistration.area.areaName, "奈良市西部");
assert.equal(validRegistration.area.prefecture, "奈良県");
assert.equal(validRegistration.deliveryEnabled, true);

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
let warningFetches = 0;
globalThis.fetch = async (url) => {
  if (String(url).includes("/bosai/warning/data/r8/")) {
    warningFetches += 1;
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  throw new Error(`Unexpected fetch: ${url}`);
};
const freeTierCycle = await runWarningPushCheck({ NOTIFICATIONS_DB: countingD1 });
assert.equal(freeTierCycle.attemptedOffices, 15);
assert.equal(warningFetches, 15);
assert.ok(countingD1.queries < 50, `D1 query budget exceeded: ${countingD1.queries}`);

console.log("Push safety tests passed");
