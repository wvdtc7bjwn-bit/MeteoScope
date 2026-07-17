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
  hashEarlyAccessValue,
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
    const value = this.db.records.get(this.values[0]);
    return value === undefined ? null : { value };
  }
  async run() {
    if (this.sql.startsWith("INSERT INTO app_records")) {
      this.db.records.set(this.values[0], this.values[1]);
      return { meta: { changes: 1 } };
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

const webClient = await fs.readFile(path.join(root, "src", "ui", "earlyAccess.js"), "utf8");
assert.match(webClient, /action:\s*"deactivate"/u);
assert.match(webClient, /PENDING_RELEASE_STORAGE_KEY/u);
assert.match(webClient, /Number\(error\?\.status\) === 401/u);
assert.match(webClient, /Webアプリを削除する場合は先に解除/u);

console.log("Early access release tests passed.");
