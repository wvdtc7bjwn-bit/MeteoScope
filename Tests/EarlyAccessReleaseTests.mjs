import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  EARLY_ACCESS_ACTIVATION_PREFIX,
  EARLY_ACCESS_CODES_KEY,
  EARLY_ACCESS_IDLE_RECLAIM_DAYS,
  deleteEarlyAccessActivationsForCode,
  hashEarlyAccessValue,
  reconcileEarlyAccessCodeUsage,
  releaseEarlyAccessToken,
  validateEarlyAccessToken
} = await import("../functions/_shared/earlyAccessAuth.js");
const { readJson, writeJson } = await import("../functions/_shared/d1Store.js");

class FakeD1 {
  constructor() { this.records = new Map(); }
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
    if (this.sql.startsWith("SELECT COUNT(*) AS activeUses")) {
      let activeUses = 0;
      for (const [key, value] of this.db.records) {
        if (!key.startsWith(EARLY_ACCESS_ACTIVATION_PREFIX)) continue;
        if (JSON.parse(value)?.codeId === this.values[0]) activeUses += 1;
      }
      return { activeUses };
    }
    const value = this.db.records.get(this.values[0]);
    return value === undefined ? null : { value };
  }
  async run() {
    if (this.sql.startsWith("INSERT INTO app_records")) {
      this.db.records.set(this.values[0], this.values[1]);
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes("datetime(COALESCE(")) {
      let changes = 0;
      const cutoff = Date.parse(this.values[1]);
      const now = Date.parse(this.values[2]);
      for (const [key, value] of this.db.records) {
        if (!key.startsWith(EARLY_ACCESS_ACTIVATION_PREFIX)) continue;
        const activation = JSON.parse(value);
        if (activation?.codeId !== this.values[0]) continue;
        const lastVerifiedAt = Date.parse(activation.lastVerifiedAt || activation.createdAt || "");
        const expiresAt = Date.parse(activation.expiresAt || "");
        const isStale = Number.isFinite(lastVerifiedAt) && lastVerifiedAt <= cutoff;
        const isExpired = Number.isFinite(expiresAt) && expiresAt <= now;
        if (!isStale && !isExpired) continue;
        this.db.records.delete(key);
        changes += 1;
      }
      return { meta: { changes } };
    }
    if (this.sql.includes("json_extract(value, '$.codeId')")) {
      let changes = 0;
      for (const [key, value] of this.db.records) {
        if (!key.startsWith(EARLY_ACCESS_ACTIVATION_PREFIX)) continue;
        if (JSON.parse(value)?.codeId !== this.values[0]) continue;
        this.db.records.delete(key);
        changes += 1;
      }
      return { meta: { changes } };
    }
    if (this.sql.startsWith("DELETE FROM app_records")) {
      return { meta: { changes: this.db.records.delete(this.values[0]) ? 1 : 0 } };
    }
    throw new Error(`Unsupported SQL: ${this.sql}`);
  }
}

async function seedActivation(db, token, expiresAt) {
  await writeJson(db, EARLY_ACCESS_CODES_KEY, [{ id: "code-1", label: "test", maxUses: 1, uses: 1 }]);
  const activationKey = `${EARLY_ACCESS_ACTIVATION_PREFIX}${await hashEarlyAccessValue(token)}`;
  await writeJson(db, activationKey, { codeId: "code-1", expiresAt });
  return activationKey;
}

async function uses(db) {
  return (await readJson(db, EARLY_ACCESS_CODES_KEY, []))[0].uses;
}

{
  const db = new FakeD1();
  const token = "release-test-token";
  const activationKey = await seedActivation(db, token, new Date(Date.now() + 60_000).toISOString());
  assert.equal((await releaseEarlyAccessToken(db, token)).released, true);
  assert.equal(await uses(db), 0);
  assert.equal(db.records.has(activationKey), false);
  assert.equal((await releaseEarlyAccessToken(db, token)).released, false);
  assert.equal(await uses(db), 0);
}

{
  const db = new FakeD1();
  const token = "expired-test-token";
  const activationKey = await seedActivation(db, token, new Date(Date.now() - 1_000).toISOString());
  assert.equal((await validateEarlyAccessToken(db, token)).active, false);
  assert.equal(await uses(db), 0);
  assert.equal(db.records.has(activationKey), false);
}

{
  const db = new FakeD1();
  await writeJson(db, `${EARLY_ACCESS_ACTIVATION_PREFIX}first`, { codeId: "code-revoked" });
  await writeJson(db, `${EARLY_ACCESS_ACTIVATION_PREFIX}second`, { codeId: "code-revoked" });
  await writeJson(db, `${EARLY_ACCESS_ACTIVATION_PREFIX}other`, { codeId: "code-active" });
  assert.equal(await deleteEarlyAccessActivationsForCode(db, "code-revoked"), 2);
  assert.equal(db.records.has(`${EARLY_ACCESS_ACTIVATION_PREFIX}first`), false);
  assert.equal(db.records.has(`${EARLY_ACCESS_ACTIVATION_PREFIX}second`), false);
  assert.equal(db.records.has(`${EARLY_ACCESS_ACTIVATION_PREFIX}other`), true);
}

{
  const db = new FakeD1();
  const now = new Date("2026-07-17T00:00:00.000Z");
  await writeJson(db, EARLY_ACCESS_CODES_KEY, [{ id: "code-lease", maxUses: 2, uses: 2 }]);
  await writeJson(db, `${EARLY_ACCESS_ACTIVATION_PREFIX}recent`, {
    codeId: "code-lease",
    createdAt: "2026-07-16T00:00:00.000Z",
    lastVerifiedAt: "2026-07-16T00:00:00.000Z"
  });
  await writeJson(db, `${EARLY_ACCESS_ACTIVATION_PREFIX}abandoned`, {
    codeId: "code-lease",
    createdAt: "2026-06-01T00:00:00.000Z",
    lastVerifiedAt: "2026-06-01T00:00:00.000Z"
  });
  const usage = await reconcileEarlyAccessCodeUsage(db, "code-lease", now);
  assert.deepEqual(usage, { activeUses: 1, reclaimed: 1 });
  assert.equal(db.records.has(`${EARLY_ACCESS_ACTIVATION_PREFIX}recent`), true);
  assert.equal(db.records.has(`${EARLY_ACCESS_ACTIVATION_PREFIX}abandoned`), false);
}

{
  const db = new FakeD1();
  const token = "verification-refresh-token";
  const oldVerification = new Date(Date.now() - 2 * 86400000).toISOString();
  await writeJson(db, EARLY_ACCESS_CODES_KEY, [{ id: "code-refresh", maxUses: 1, uses: 1 }]);
  const activationKey = `${EARLY_ACCESS_ACTIVATION_PREFIX}${await hashEarlyAccessValue(token)}`;
  await writeJson(db, activationKey, {
    codeId: "code-refresh",
    createdAt: oldVerification,
    lastVerifiedAt: oldVerification,
    expiresAt: new Date(Date.now() + 86400000).toISOString()
  });
  assert.equal((await validateEarlyAccessToken(db, token)).active, true);
  const refreshed = await readJson(db, activationKey, null);
  assert.ok(Date.parse(refreshed.lastVerifiedAt) > Date.parse(oldVerification));
}

{
  const db = new FakeD1();
  const token = "abandoned-install-token";
  const abandonedAt = new Date(Date.now() - (EARLY_ACCESS_IDLE_RECLAIM_DAYS + 1) * 86400000).toISOString();
  await writeJson(db, EARLY_ACCESS_CODES_KEY, [{ id: "code-abandoned", maxUses: 1, uses: 1 }]);
  const activationKey = `${EARLY_ACCESS_ACTIVATION_PREFIX}${await hashEarlyAccessValue(token)}`;
  await writeJson(db, activationKey, {
    codeId: "code-abandoned",
    createdAt: abandonedAt,
    lastVerifiedAt: abandonedAt,
    expiresAt: new Date(Date.now() + 86400000).toISOString()
  });
  const result = await validateEarlyAccessToken(db, token);
  assert.equal(result.active, false);
  assert.match(result.error, /認証枠を解放/u);
  assert.equal(db.records.has(activationKey), false);
  assert.equal(await uses(db), 0);
}

const webClient = await fs.readFile(path.join(root, "src", "ui", "earlyAccess.js"), "utf8");
assert.match(webClient, /action:\s*"deactivate"/u);
assert.match(webClient, /PENDING_RELEASE_STORAGE_KEY/u);
assert.match(webClient, /Number\(error\?\.status\) === 401/u);
assert.match(webClient, /Webアプリを削除する場合は先に解除/u);

const publicApi = await fs.readFile(path.join(root, "functions", "api", "public", "early-access.js"), "utf8");
assert.match(publicApi, /reconcileEarlyAccessCodeUsage\(db, entry\.id\)/u);

const adminApi = await fs.readFile(path.join(root, "functions", "api", "admin", "[[path]].js"), "utf8");
assert.match(adminApi, /early-access\\\/codes\\\/\(\[\^\/\]\+\)\\\/activations/u);
assert.match(adminApi, /resetEarlyAccessActivations/u);

const adminClient = await fs.readFile(path.join(root, "src", "admin.js"), "utf8");
assert.match(adminClient, /data-reset-early-access/u);

const iosService = await fs.readFile(path.join(root, "ios", "MeteoScope", "Services", "EarlyAccessService.swift"), "utf8");
assert.match(iosService, /func deactivate\(\) async/u);
assert.match(iosService, /"action": "deactivate"/u);

console.log("Early access release tests passed.");
