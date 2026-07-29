import assert from "node:assert/strict";
import { gzipSync, gunzipSync } from "node:zlib";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { onRequest } = await import("../functions/api/public/early-access.js");
const {
  EARLY_ACCESS_ACTIVATION_PREFIX,
  EARLY_ACCESS_CODES_KEY,
  hashEarlyAccessValue
} = await import("../functions/_shared/earlyAccessAuth.js");

class FakeD1 {
  constructor(records = new Map()) { this.records = records; }
  prepare(sql) { return new FakeStatement(this, sql); }
}

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql.replace(/\s+/gu, " ").trim();
    this.values = [];
  }
  bind(...values) { this.values = values; return this; }
  async first() {
    const value = this.db.records.get(String(this.values[0]));
    return value === undefined ? null : { value };
  }
  async all() {
    if (!this.sql.includes("WHERE key LIKE ?")) throw new Error(`Unsupported SQL: ${this.sql}`);
    const prefix = String(this.values[0]).replace(/%$/u, "");
    const results = [...this.db.records]
      .filter(([key]) => key.startsWith(prefix))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => ({ key, value }));
    return { results };
  }
  async run() {
    if (!this.sql.startsWith("INSERT INTO app_records")) throw new Error(`Unsupported SQL: ${this.sql}`);
    this.db.records.set(String(this.values[0]), String(this.values[1]));
    return { meta: { changes: 1 } };
  }
}

const geojson = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { segment_id: "test", segment_name: "試験断層" },
    geometry: { type: "LineString", coordinates: [[130, 30], [131, 31]] }
  }]
};
const compressed = gzipSync(Buffer.from(JSON.stringify(geojson)));
const encoded = compressed.toString("base64");
const token = "protected-active-fault-token";
const activationKey = `${EARLY_ACCESS_ACTIVATION_PREFIX}${await hashEarlyAccessValue(token)}`;
const db = new FakeD1(new Map([
  [EARLY_ACCESS_CODES_KEY, JSON.stringify([{ id: "code-1", label: "test", uses: 1 }])],
  [activationKey, JSON.stringify({
    codeId: "code-1",
    createdAt: new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString()
  })],
  ["early-access-active-fault:manifest", JSON.stringify({
    encoding: "gzip-base64",
    chunkCount: 2
  })],
  ["early-access-active-fault:chunk:0000", JSON.stringify(encoded.slice(0, 40))],
  ["early-access-active-fault:chunk:0001", JSON.stringify(encoded.slice(40))]
]));

const unauthorized = await onRequest({
  request: makeRequest("invalid-token"),
  env: { NOTIFICATIONS_DB: db }
});
assert.equal(unauthorized.status, 401);
assert.equal(unauthorized.headers.get("Cache-Control"), "no-store");

const authorized = await onRequest({
  request: makeRequest(token),
  env: { NOTIFICATIONS_DB: db }
});
assert.equal(authorized.status, 200);
assert.equal(authorized.headers.get("Content-Type"), "application/geo+json; charset=utf-8");
assert.equal(authorized.headers.get("Content-Encoding"), "gzip");
assert.match(authorized.headers.get("Cache-Control"), /private/u);
const restored = JSON.parse(gunzipSync(Buffer.from(await authorized.arrayBuffer())).toString("utf8"));
assert.deepEqual(restored, geojson);

const incompleteDb = new FakeD1(new Map([
  [EARLY_ACCESS_CODES_KEY, JSON.stringify([{ id: "code-1", label: "test", uses: 1 }])],
  [activationKey, JSON.stringify({
    codeId: "code-1",
    createdAt: new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString()
  })],
  ["early-access-active-fault:manifest", JSON.stringify({
    encoding: "gzip-base64",
    chunkCount: 2
  })],
  ["early-access-active-fault:chunk:0000", JSON.stringify(encoded)]
]));
const incomplete = await onRequest({
  request: makeRequest(token),
  env: { NOTIFICATIONS_DB: incompleteDb }
});
assert.equal(incomplete.status, 503);

const earlyAccessClient = await readFile(new URL("../src/ui/earlyAccess.js", import.meta.url), "utf8");
const weatherMapClient = await readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8");
const configClient = await readFile(new URL("../src/config.js", import.meta.url), "utf8");
assert.match(earlyAccessClient, /action:\s*"active-fault"/u);
assert.match(weatherMapClient, /setGsjActiveFaultData/u);
assert.doesNotMatch(configClient, /activefault_japan_segments|gsj-active-fault/u);

function makeRequest(accessToken) {
  return new Request("https://meteoscope.pages.dev/api/public/early-access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "active-fault", token: accessToken })
  });
}

console.log("Early access protected active-fault tests passed.");
