import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { hashQuizToken } from "../functions/_shared/quizSecurity.js";
import { setAccountEarlyAccess, getAccountEarlyAccess } from "../functions/_shared/accountEarlyAccess.js";
import { onRequest } from "../functions/api/public/early-access.js";
import { onRequest as upperAir } from "../functions/api/upper-air.js";
import { onRequest as gfs } from "../functions/api/gfs-profile.js";
import { onRequest as admin } from "../functions/api/admin/[[path]].js";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const hashA = await hashQuizToken("session-a");
const hashB = await hashQuizToken("session-b");
class FakeD1 {
  records = new Map();
  sessions = new Map([[hashA, userA], [hashB, userB]]);
  prepare(sql) {
    const db = this;
    return { values: [], bind(...values) { this.values = values; return this; },
      async first() {
        if (sql.includes("FROM quiz_sessions")) {
          const id = db.sessions.get(this.values[0]);
          return id ? { id, display_name: "test" } : null;
        }
        if (sql.includes("SELECT id FROM quiz_accounts")) return [userA, userB].includes(this.values[0]) ? { id: this.values[0] } : null;
        if (sql.startsWith("SELECT value")) {
          const value = db.records.get(this.values[0]);
          return value === undefined ? null : { value };
        }
        throw new Error(`unexpected SQL ${sql}`);
      },
      async run() {
        if (sql.startsWith("INSERT INTO app_records")) { db.records.set(this.values[0], this.values[1]); return {}; }
        if (sql.startsWith("DELETE FROM app_records")) { db.records.delete(this.values[0]); return {}; }
        throw new Error(`unexpected SQL ${sql}`);
      }
    };
  }
}
const db = new FakeD1();
const request = (token, payload = { action: "status" }) => new Request("https://meteoscope.pages.dev/api/public/early-access", {
  method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(payload)
});
assert.equal((await onRequest({ request: request(""), env: { NOTIFICATIONS_DB: db } })).status, 401);
assert.equal((await onRequest({ request: request("session-a"), env: { NOTIFICATIONS_DB: db } })).status, 403);
await setAccountEarlyAccess(db, userA, true);
const defaultAccess = await onRequest({ request: request("session-a"), env: { NOTIFICATIONS_DB: db } });
assert.equal(defaultAccess.status, 200);
assert.equal((await defaultAccess.json()).activeFaultSource, "jshis");
assert.equal((await onRequest({ request: request("session-a", { action: "active-fault" }), env: { NOTIFICATIONS_DB: db } })).status, 403);
assert.equal((await onRequest({ request: request("session-b"), env: { NOTIFICATIONS_DB: db } })).status, 403);
assert.equal((await onRequest({ request: request("", { code: "MS-OLD-CODE" }), env: { NOTIFICATIONS_DB: db } })).status, 401);
const cookie = new Request("https://meteoscope.pages.dev/api/public/early-access", { headers: { Cookie: "meteoscope_session=session-a" } });
assert.equal((await getAccountEarlyAccess(cookie, db)).active, true);
await setAccountEarlyAccess(db, userA, false);
assert.equal((await onRequest({ request: request("session-a"), env: { NOTIFICATIONS_DB: db } })).status, 403);
for (const handler of [upperAir, gfs]) {
  assert.equal((await handler({ request: new Request("https://meteoscope.pages.dev/api/test", { headers: { "X-MeteoScope-Early-Access": "legacy" } }), env: { NOTIFICATIONS_DB: db } })).status, 401);
  assert.equal((await handler({ request: new Request("https://meteoscope.pages.dev/api/test", { headers: { Authorization: "Bearer session-a" } }), env: { NOTIFICATIONS_DB: db } })).status, 403);
}
const env = { NOTIFICATIONS_DB: db, ADMIN_PASSWORD: "test-password", ADMIN_SESSION_SECRET: "test-secret" };
const adminRequest = (cookie, body, accountId = userA, action = "early-access") => new Request(`https://meteoscope.pages.dev/api/admin/accounts/${accountId}/${action}`, {
  method: "PUT", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body)
});
assert.equal((await admin({ request: adminRequest("", { allowed: true }), env })).status, 401);
const login = await admin({ request: new Request("https://meteoscope.pages.dev/api/admin/login", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "test-password" })
}), env });
assert.equal(login.status, 200);
const adminCookie = login.headers.get("set-cookie").split(";")[0];
assert.equal((await admin({ request: adminRequest(adminCookie, { allowed: "true" }), env })).status, 400);
assert.equal((await admin({ request: adminRequest(adminCookie, { allowed: true }), env })).status, 200);
assert.equal((await onRequest({ request: request("session-a"), env })).status, 200);
assert.equal((await admin({ request: adminRequest("", { source: "gsj" }, userA, "active-fault-source"), env })).status, 401);
assert.equal((await admin({ request: adminRequest(adminCookie, { source: "unknown" }, userA, "active-fault-source"), env })).status, 400);
assert.equal((await admin({ request: adminRequest(adminCookie, { source: "gsj" }, userB, "active-fault-source"), env })).status, 409);
assert.equal((await admin({ request: adminRequest(adminCookie, { source: "gsj" }, userA, "active-fault-source"), env })).status, 200);
assert.equal((await getAccountEarlyAccess(cookie, db)).activeFaultSource, "gsj");
await setAccountEarlyAccess(db, userA, true);
assert.equal((await getAccountEarlyAccess(cookie, db)).activeFaultSource, "gsj");
assert.equal((await admin({ request: adminRequest(adminCookie, { source: "jshis" }, userA, "active-fault-source"), env })).status, 200);
assert.equal((await getAccountEarlyAccess(cookie, db)).activeFaultSource, "jshis");
assert.equal((await admin({ request: adminRequest(adminCookie, { allowed: false }), env })).status, 200);
assert.equal((await onRequest({ request: request("session-a"), env })).status, 403);
console.log("Account-based early access tests passed.");
