import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const migrationDirectory = new URL("../migrations/", import.meta.url);
const cleanupName = "0012_remove_legacy_warning_cache.sql";
const migrations = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();
const cleanup = await readFile(new URL(cleanupName, migrationDirectory), "utf8");

function records(database) {
  return database.prepare("SELECT key, value, updated_at FROM app_records ORDER BY key").all();
}

const database = new DatabaseSync(":memory:");
try {
  database.exec("PRAGMA foreign_keys = ON");
  for (const name of migrations.filter((name) => name < cleanupName)) {
    database.exec(await readFile(new URL(name, migrationDirectory), "utf8"));
  }

  const currentRecords = [
    ["push:vapid-keys", { publicKey: "test-public", privateKey: "test-private" }],
    ["early-access-active-fault:manifest", { count: 1 }],
    ["early-access-active-fault:chunk:0", { features: [] }],
    ["early-access-account:test-account", { allowed: true }],
    ["warning-chat-quota:2026-11-14", { used: 2 }],
    ["app-config", { maintenance: false }],
    ["app-notices", [{ title: "Test notice" }]],
    ["user-feedback", [{ message: "Test feedback" }]],
    // Similar names outside the retired namespace must remain untouched.
    ["push:warning-office-batch", { keep: true }],
    ["push:warning-office-batch-other:0", { keep: true }]
  ];
  const insert = database.prepare("INSERT INTO app_records (key, value, updated_at) VALUES (?, ?, ?)");
  for (const [key, value] of currentRecords) {
    insert.run(key, JSON.stringify(value), "2026-11-14T00:00:00.000Z");
  }
  const expectedRecords = records(database);
  for (let index = 0; index < 4; index += 1) {
    insert.run(`push:warning-office-batch:${index}`, JSON.stringify({ obsoleteCache: "x".repeat(10_000) }), "2026-07-18T00:00:00.000Z");
  }
  database.prepare("INSERT INTO push_subscriptions (id, data, updated_at) VALUES (?, ?, ?)")
    .run("test-subscription", '{"endpoint":"https://push.example.test"}', "2026-11-14T00:00:00.000Z");
  database.prepare("INSERT INTO push_meta (key, value) VALUES (?, ?)")
    .run("retention:last-cleanup", "2026-11-14T00:00:00.000Z");
  const expectedSubscriptions = database.prepare("SELECT * FROM push_subscriptions").all();
  const expectedMetadata = database.prepare("SELECT * FROM push_meta").all();
  const expectedSchema = database.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all();

  // Reproduce the already-applied migration: only v2 batches were removed.
  database.exec(await readFile(new URL("0010_remove_ios_push_storage.sql", migrationDirectory), "utf8"));
  assert.equal(records(database).length, expectedRecords.length + 4);
  const bytesBefore = database.prepare("SELECT SUM(length(CAST(value AS BLOB))) AS bytes FROM app_records").get().bytes;

  database.exec(cleanup);
  assert.deepEqual(records(database), expectedRecords, "Only retired v1 cache records should be removed");
  assert.ok(database.prepare("SELECT SUM(length(CAST(value AS BLOB))) AS bytes FROM app_records").get().bytes < bytesBefore - 40_000);
  assert.deepEqual(database.prepare("SELECT * FROM push_subscriptions").all(), expectedSubscriptions);
  assert.deepEqual(database.prepare("SELECT * FROM push_meta").all(), expectedMetadata);
  assert.deepEqual(database.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all(), expectedSchema);

  // Safe to rerun, including databases without the legacy records.
  database.exec(cleanup);
  assert.deepEqual(records(database), expectedRecords);
} finally {
  database.close();
}

const fresh = new DatabaseSync(":memory:");
try {
  fresh.exec("PRAGMA foreign_keys = ON");
  for (const name of migrations) {
    fresh.exec(await readFile(new URL(name, migrationDirectory), "utf8"));
  }
  assert.equal(fresh.prepare("SELECT COUNT(*) AS count FROM app_records").get().count, 0);
} finally {
  fresh.close();
}

console.log("Legacy warning cache cleanup: upgrade, current data preservation, idempotency and fresh migrations passed.");
