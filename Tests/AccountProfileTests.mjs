import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { onRequest } from "../functions/api/quiz/[[path]].js";
import { hashQuizToken } from "../functions/_shared/quizSecurity.js";
import { PUBLIC_QUIZ_LEADERBOARD_SQL, quizRankingDate } from "../functions/_shared/quizStorage.js";
import { validateProfileAvatar, MAX_PROFILE_IMAGE_BYTES } from "../src/domain/profileImagePolicy.js";

const fixture = await readFile(new URL("./fixtures/profile-avatar.jpg", import.meta.url));
const image = `data:image/jpeg;base64,${fixture.toString("base64")}`;
assert.equal(validateProfileAvatar(image), image);
assert.equal(validateProfileAvatar(null), null);
for (const invalid of [undefined, 42, {}, "", "https://example.com/a.jpg", "data:image/svg+xml;base64,PHN2Zz4=",
  "data:image/jpeg;base64,bm90IGpwZWc=", image.slice(0, -8), `data:image/jpeg;base64,${"A".repeat(MAX_PROFILE_IMAGE_BYTES * 2)}`]) {
  assert.throws(() => validateProfileAvatar(invalid), TypeError);
}
const oversized = Buffer.from(fixture);
const sof = oversized.indexOf(Buffer.from([255, 192]));
assert(sof >= 0);
oversized.writeUInt16BE(257, sof + 7);
assert.throws(() => validateProfileAvatar(`data:image/jpeg;base64,${oversized.toString("base64")}`), /256px/u);

const sqlite = new DatabaseSync(":memory:");
for (const file of ["0002_app_storage.sql", "0005_quiz_accounts.sql", "0006_quiz_free_tier_optimization.sql", "0007_quiz_daily_points_ranking.sql"]) {
  sqlite.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
}
// Execute the actual endpoint SQL and transaction against SQLite, matching D1 bindings.
const db = {
  prepare(query) {
    let values = [];
    const statement = sqlite.prepare(query);
    const args = () => /\?\d/u.test(query) ? [Object.fromEntries(values.map((value, index) => [String(index + 1), value]))] : values;
    return {
      bind(...next) { values = next; return this; },
      async first() { return statement.get(...args()) ?? null; },
      async all() { return { results: statement.all(...args()) }; },
      async run() { return { meta: { changes: Number(statement.run(...args()).changes) } }; }
    };
  },
  async batch(statements) {
    sqlite.exec("BEGIN");
    try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec("COMMIT"); return result; }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  }
};
const now = new Date().toISOString();
for (const id of ["alice", "bob"]) sqlite.prepare("INSERT INTO quiz_accounts VALUES (?, ?, ?, 'salt', 'hash', ?, ?)").run(id, id, id, now, now);
const token = "profile-test-token";
sqlite.prepare("INSERT INTO quiz_sessions VALUES (?, 'alice', ?, ?)").run(await hashQuizToken(token), now, new Date(Date.now() + 3600000).toISOString());
sqlite.prepare("INSERT INTO quiz_daily_scores VALUES (?, 'alice', 'beginner', 10, 1, ?, ?)").run(quizRankingDate(), now, now);
const env = { NOTIFICATIONS_DB: db, QUIZ_PASSWORD_PEPPER: "test", QUIZ_RATE_LIMIT_SECRET: "test" };
const removedCaches = [];
globalThis.caches = { default: { async delete(key) { removedCaches.push(key.url); return true; } } };
const send = (payload, { method = "PUT", auth = true, origin = "https://meteoscope.pages.dev", raw } = {}) => onRequest({
  env, request: new Request("https://meteoscope.pages.dev/api/quiz/account", {
    method, headers: { Origin: origin, ...(auth ? { Cookie: `meteoscope_session=${token}` } : {}), "Content-Type": "application/json" },
    ...(method === "GET" || method === "OPTIONS" ? {} : { body: raw ?? JSON.stringify(payload) })
  })
});
assert.equal((await send({ displayName: "changed" }, { auth: false })).status, 401);
assert.equal((await send({ displayName: "changed" }, { origin: "https://evil.example" })).status, 403);
const preflight = await send(null, { method: "OPTIONS" });
assert.match(preflight.headers.get("Access-Control-Allow-Methods"), /PUT/u);
let response = await send({ displayName: "　防災 太郎　", avatarDataUrl: image, id: "bob" });
assert.equal(response.status, 200);
assert.deepEqual((await response.json()).account, { id: "alice", displayName: "防災 太郎", avatarDataUrl: image });
assert(removedCaches.length > 0);
assert.equal(sqlite.prepare("SELECT display_name FROM quiz_accounts WHERE id='bob'").get().display_name, "bob");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM app_records WHERE key='account-profile:bob'").get().total, 0);
assert.equal(sqlite.prepare(PUBLIC_QUIZ_LEADERBOARD_SQL).all({ "1": quizRankingDate(), "2": "beginner", "3": 20 })[0].display_name, "防災 太郎");
assert.equal((await (await send(null, { method: "GET" })).json()).account.avatarDataUrl, image);
assert.equal((await (await send({ displayName: "名前だけ" })).json()).account.avatarDataUrl, image);
for (const payload of [{ displayName: "x" }, { displayName: "<bad>" }, { displayName: {} }, { displayName: ["名前"] },
  { displayName: "有効な名前", avatarDataUrl: "https://evil.example/x.svg" }, null, []]) {
  assert.equal((await send(payload)).status, 400);
}
assert.equal(sqlite.prepare("SELECT display_name FROM quiz_accounts WHERE id='alice'").get().display_name, "名前だけ");
assert.equal((await send({}, { raw: `{"displayName":"${"a".repeat(100000)}"}` })).status, 413);
assert.equal((await send({ displayName: "制限超過" })).status, 429);
sqlite.exec("DELETE FROM quiz_rate_limits");
sqlite.exec("CREATE TRIGGER reject_profile BEFORE INSERT ON app_records BEGIN SELECT RAISE(ABORT, 'test write failure'); END;");
assert.equal((await send({ displayName: "未保存の名前", avatarDataUrl: image })).status, 500);
assert.equal(sqlite.prepare("SELECT display_name FROM quiz_accounts WHERE id='alice'").get().display_name, "名前だけ");
assert.equal(JSON.parse(sqlite.prepare("SELECT value FROM app_records WHERE key='account-profile:alice'").get().value).avatarDataUrl, image);
sqlite.exec("DROP TRIGGER reject_profile");
response = await send({ displayName: "削除後", avatarDataUrl: null });
assert.equal(response.status, 200);
assert.equal((await response.json()).account.avatarDataUrl, null);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM app_records WHERE key='account-profile:alice'").get().total, 0);
assert.equal((await (await send(null, { method: "GET" })).json()).account.avatarDataUrl, null);
assert.equal((await (await send(null, { method: "GET", auth: false })).json()).account, undefined);
sqlite.close();
delete globalThis.caches;
const { QuizRankingClient } = await import("../src/domain/quizRankingClient.js");
let changes = 0;
globalThis.sessionStorage = { getItem: () => token };
globalThis.dispatchEvent = event => { assert.equal(event.type, "meteoscope:account-change"); changes++; };
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  assert.equal(url, "/api/quiz/account");
  assert.equal(options.method, "PUT");
  assert.equal(options.credentials, "include");
  assert.equal(options.headers.get("Authorization"), `Bearer ${token}`);
  assert.deepEqual(JSON.parse(options.body), { displayName: "クライアント更新" });
  return Response.json({ account: { id: "alice", displayName: "クライアント更新" } });
};
assert.equal((await QuizRankingClient.updateProfile({ displayName: "クライアント更新" })).account.displayName, "クライアント更新");
assert.equal(changes, 1);
globalThis.fetch = async () => Response.json({ error: "Not found" }, { status: 404 });
await assert.rejects(QuizRankingClient.updateProfile({ displayName: "未保存" }), /変更は保存されていません/u);
assert.equal(changes, 1, "A failed save must not signal an account change.");
globalThis.fetch = async () => Response.json({ error: "しばらく待ってください。" }, { status: 429 });
await assert.rejects(QuizRankingClient.updateProfile({ displayName: "未保存" }), /しばらく待ってください/u);
assert.equal(changes, 1);
globalThis.fetch = originalFetch;
delete globalThis.sessionStorage;
delete globalThis.dispatchEvent;
console.log("Account profile image validation, authenticated storage, update, removal and cache invalidation tests passed.");
