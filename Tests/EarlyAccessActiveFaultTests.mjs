import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { onRequest } = await import("../functions/api/public/early-access.js");
const { hashQuizToken } = await import("../functions/_shared/quizSecurity.js");
const accountId = "11111111-1111-4111-8111-111111111111";
const token = "protected-account-session";
const sessionHash = await hashQuizToken(token);

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
    if (this.sql.includes("FROM quiz_sessions")) {
      return this.values[0] === sessionHash ? { id: accountId, display_name: "test" } : null;
    }
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
const db = new FakeD1(new Map([
  [`early-access-account:${accountId}`, JSON.stringify({ allowed: true, activeFaultSource: "gsj" })],
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

const jshisOnlyDb = new FakeD1(new Map(db.records));
jshisOnlyDb.records.set(`early-access-account:${accountId}`, JSON.stringify({ allowed: true }));
const jshisOnly = await onRequest({ request: makeRequest(token), env: { NOTIFICATIONS_DB: jshisOnlyDb } });
assert.equal(jshisOnly.status, 403);
assert.equal(jshisOnly.headers.get("Cache-Control"), "no-store");

const authorized = await onRequest({
  request: makeRequest(token),
  env: { NOTIFICATIONS_DB: db }
});
assert.equal(authorized.status, 200);
assert.equal(authorized.headers.get("Content-Type"), "application/geo+json; charset=utf-8");
assert.equal(authorized.headers.get("Content-Encoding"), null);
assert.match(authorized.headers.get("Cache-Control"), /private/u);
const restored = await authorized.json();
assert.deepEqual(restored, geojson);

const incompleteDb = new FakeD1(new Map([
  [`early-access-account:${accountId}`, JSON.stringify({ allowed: true, activeFaultSource: "gsj" })],
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
const appClient = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
const weatherMapClient = await readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8");
const configClient = await readFile(new URL("../src/config.js", import.meta.url), "utf8");
assert.match(earlyAccessClient, /requestAccess\("active-fault"/u);
assert.match(appClient, /earlyAccessState\.activeFaultSource === "gsj"/u);
assert.doesNotMatch(appClient, /meteoscope-early-access-active-fault-source-v1/u);
assert.doesNotMatch(indexHtml, /data-settings-active-fault-source/u);
assert.match(weatherMapClient, /setGsjActiveFaultData/u);
assert.doesNotMatch(configClient, /activefault_japan_segments|gsj-active-fault/u);

function makeRequest(accessToken) {
  return new Request("https://meteoscope.pages.dev/api/public/early-access", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ action: "active-fault" })
  });
}

console.log("Early access protected active-fault tests passed.");
