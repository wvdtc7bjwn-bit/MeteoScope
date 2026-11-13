import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { WARNING_CHAT_MODEL, WARNING_CHAT_LIMITS, normalizeWarningChatInput } from "../src/ai/warningChatPolicy.js";
import { reserveWarningChatQuota, warningChatDay } from "../functions/_shared/warningChatQuota.js";
import { loadWarningChatContext, fetchWarningChatJson } from "../functions/_shared/warningChatContext.js";
import { buildWarningChatMessages, parseWarningChatAnswer } from "../functions/_shared/warningChatAnswer.js";
import { hashQuizToken } from "../functions/_shared/quizSecurity.js";
import { onRequest } from "../functions/api/warning-chat.js";

// Synthetic fixtures follow JMA's r8 VPWW55 / warning_timeline JSON shape,
// verified against the JMA public JSON endpoints on 2026-11-13. No real alert.
const NOW = Date.parse("2026-11-13T03:30:00Z");
const ISSUE = "2026-11-13T11:00:00+09:00";
const catalog = {
  offices: { "130000": { name: "東京都" } },
  class10s: { "130010": { parent: "130000" } },
  class15s: { "130011": { parent: "130010" } },
  class20s: { "1310100": { name: "千代田区", parent: "130011" }, "1310200": { name: "中央区", parent: "130011" } }
};
const report = (code = "03", status = "発表", time = ISSUE) => ({ reportDatetime: time, headlineText: "東京地方では大雨に警戒してください。", warning: { class20Items: [{ areaCode: "1310100", kinds: [{ code, status }] }] } });
const timeline = {
  reportDatetime: ISSUE, timeSeries: [{
    timeDefines: [{ dateTime: "2026-11-13T12:00:00+09:00", duration: "PT3H" }, { dateTime: "2026-11-13T15:00:00+09:00", duration: "PT3H" }],
    class20Items: [{ areaCode: "1310100", kinds: [{ significancyParts: [{ type: "大雨浸水危険度", locals: [{ codes: ["31", "20"] }] }] }] }],
    class10Items: [{ areaCode: "130010", kinds: [{ significancyParts: [{ type: "風危険度", locals: [{ areaName: "陸上", codes: ["30", "20"] }] }] }] }]
  }]
};
function sourceFetcher({ warnings = [report()], outlook = timeline, failTimeline = false } = {}) {
  return async (url) => {
    if (String(url).includes("common/const/area")) return Response.json(catalog);
    if (String(url).includes("warning_timeline")) return failTimeline ? new Response("", { status: 503 }) : Response.json(outlook);
    if (String(url).includes("warning/data/r8/130000")) return Response.json(warnings);
    throw new Error("Unexpected URL");
  };
}
function makeDb() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("CREATE TABLE app_records (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE quiz_accounts (id TEXT PRIMARY KEY, display_name TEXT); CREATE TABLE quiz_sessions (token_hash TEXT, account_id TEXT, expires_at TEXT);");
  return {
    sql,
    prepare(query) {
      const statement = sql.prepare(query);
      let values = [];
      return {
        bind(...next) { values = next; return this; },
        async first() { return statement.get(...values) ?? null; },
        async run() { const result = statement.run(...values); return { meta: { changes: Number(result.changes) } }; }
      };
    }
  };
}

assert.equal(WARNING_CHAT_LIMITS.daily * WARNING_CHAT_LIMITS.reservedNeurons, 8000);
const estimate = (WARNING_CHAT_LIMITS.promptBytes + 1024) * 9091 / 1e6 + WARNING_CHAT_LIMITS.outputTokens * 27273 / 1e6;
assert.ok(estimate < WARNING_CHAT_LIMITS.reservedNeurons);
assert.equal(warningChatDay(Date.parse("2026-11-13T08:59:59+09:00")), "2026-11-12");
assert.equal(warningChatDay(Date.parse("2026-11-13T09:00:00+09:00")), "2026-11-13");
const validInput = { areaCode: "1310100", language: "ja", question: "いつまで警戒が必要？", consent: true };
for (const value of [null, {}, { ...validInput, consent: false }, { ...validInput, areaCode: 1310100 }, { ...validInput, areaCode: "../../admin" }, { ...validInput, language: "__proto__" }, { ...validInput, question: " " }, { ...validInput, question: "あ".repeat(241) }, { ...validInput, question: "a@example.com" }]) assert.throws(() => normalizeWarningChatInput(value), TypeError);
assert.equal(normalizeWarningChatInput({ ...validInput, model: "paid-model", dailyLimit: 9999 }).model, undefined);

const budgetDb = makeDb();
const results = await Promise.all(Array.from({ length: 180 }, (_, i) => reserveWarningChatQuota(budgetDb, `account-${Math.floor(i / 6)}`, { now: NOW, dailyLimit: 9999 })));
assert.equal(results.filter(Boolean).length, 40, "conditional SQL admits at most 40 concurrent requests across accounts");
const perAccountDb = makeDb();
const personal = await Promise.all(Array.from({ length: 20 }, () => reserveWarningChatQuota(perAccountDb, "same-user", { now: NOW })));
assert.equal(personal.filter(Boolean).length, 3);
assert.equal(await reserveWarningChatQuota(perAccountDb, "other", { now: NOW, dailyLimit: 0 }), null);
assert.ok(await reserveWarningChatQuota(perAccountDb, "same-user", { now: NOW + 86400_000 }));
budgetDb.sql.prepare("INSERT INTO app_records VALUES (?, ?, ?)").run("unrelated:settings", "{}", "old");
budgetDb.sql.prepare("INSERT INTO app_records VALUES (?, ?, ?)").run("warning-chat-quota:2020-01-01", "{}", "old");
await reserveWarningChatQuota(budgetDb, "cleanup", { now: NOW + 86400_000 });
assert.ok(budgetDb.sql.prepare("SELECT * FROM app_records WHERE key = 'unrelated:settings'").get());
assert.equal(budgetDb.sql.prepare("SELECT * FROM app_records WHERE key = 'warning-chat-quota:2020-01-01'").get(), undefined);
assert.doesNotMatch(JSON.stringify(budgetDb.sql.prepare("SELECT value FROM app_records WHERE key LIKE 'warning-chat-quota:%'").all()), /account-\d|same-user/);

const official = await loadWarningChatContext("1310100", { fetcher: sourceFetcher(), now: NOW });
assert.equal(official.areaName, "東京都 千代田区");
assert.match(official.warnings[0].label, /大雨警報/u);
assert.equal(official.outlook.length, 2, "municipality and its parent forecast area both resolve");
assert.equal(official.outlook[0].slots.length, 2);
assert.equal(official.outlook[0].slots.at(-1).endTime, "2026-11-13T09:00:00.000Z", "15 JST three-hour slot ends at 18 JST, not at its start");
assert.equal(official.outlook.find((row) => row.type.includes("風")).slots[0].description, "警報級の見通し", "wind must not be assigned a public evacuation level");
const same = await loadWarningChatContext("1310100", { fetcher: sourceFetcher(), now: NOW + 1000 });
assert.equal(official.revision, same.revision, "retrieval time alone does not invalidate an answer");
await assert.rejects(loadWarningChatContext("1310200", { fetcher: sourceFetcher(), now: NOW }), /municipality_not_in_source/);
await assert.rejects(loadWarningChatContext("https://evil.test", { fetcher: sourceFetcher(), now: NOW }), /invalid_area/);
const noOutlook = await loadWarningChatContext("1310100", { fetcher: sourceFetcher({ failTimeline: true }), now: NOW });
assert.equal(noOutlook.outlookAvailable, false);
const expiredOutlook = await loadWarningChatContext("1310100", { fetcher: sourceFetcher({ outlook: { ...timeline, reportDatetime: "2026-11-12T00:00:00+09:00" } }), now: NOW });
assert.equal(expiredOutlook.outlookAvailable, false);
await assert.rejects(loadWarningChatContext("1310100", { fetcher: sourceFetcher({ warnings: [report("03", "発表", "2027-01-01T00:00:00Z")] }), now: NOW }), /invalid_warning_source/);
const ended = await loadWarningChatContext("1310100", { fetcher: sourceFetcher({ warnings: [report(), report("03", "解除", "2026-11-13T12:00:00+09:00")] }), now: NOW });
assert.equal(ended.warnings.length, 0);
await assert.rejects(fetchWarningChatJson("fixed", { fetcher: async () => new Response("x".repeat(2 * 1024 * 1024 + 1)) }), /too_large/);
let sourceRequests = 0;
await assert.rejects(fetchWarningChatJson("fixed", { fetcher: async (_url, options) => {
  sourceRequests += 1;
  assert.equal(options.redirect, "manual", "Workers-compatible redirects must never follow another source");
  return new Response(null, { status: 302, headers: { Location: "https://other.example/" } });
} }), /jma_unavailable/);
assert.equal(sourceRequests, 1);

const prompt = buildWarningChatMessages(normalizeWarningChatInput({ ...validInput, revision: "old", history: [{ role: "assistant", content: "OLD REVISION" }] }), official);
assert.doesNotMatch(JSON.stringify(prompt), /OLD REVISION/);
assert.match(prompt[0].content, /No independent forecast/);
assert.throws(() => buildWarningChatMessages(validInput, { ...official, explanation: "あ".repeat(10000) }), RangeError);
const goodAnswer = { answer: "気象庁の見通しでは警報級の時間帯があります。解除時刻を保証するものではありません。最新発表を確認してください。AIの説明には誤りがある場合があります。", evidenceIds: ["current", "outlook"] };
const aiResult = (value) => ({ choices: [{ message: { content: JSON.stringify(value) } }] });
assert.equal(parseWarningChatAnswer(aiResult(goodAnswer), official).answer, goodAnswer.answer);
assert.throws(() => parseWarningChatAnswer(aiResult({ ...goodAnswer, answer: "99999時には安全です" }), official));
assert.throws(() => parseWarningChatAnswer(aiResult({ ...goodAnswer, answer: "<img src=x onerror=alert(1)>" }), official));
assert.throws(() => parseWarningChatAnswer(aiResult(goodAnswer), noOutlook));
assert.throws(() => parseWarningChatAnswer({ response: "not json" }, official));
assert.throws(() => parseWarningChatAnswer({ choices: [{ finish_reason: "length", message: { content: JSON.stringify(goodAnswer) } }] }, official), /incomplete_ai_response/);

// Exercise the real route, real session hashing and real SQLite quota statements.
const RealDate = Date;
globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [NOW])); } static now() { return NOW; } };
const originalFetch = globalThis.fetch;
globalThis.fetch = sourceFetcher();
const db = makeDb();
const session = "test-session-not-a-real-credential";
db.sql.prepare("INSERT INTO quiz_accounts VALUES (?, ?)").run("user", "Test");
db.sql.prepare("INSERT INTO quiz_sessions VALUES (?, ?, ?)").run(await hashQuizToken(session), "user", "2026-12-01T00:00:00Z");
db.sql.prepare("INSERT INTO app_records VALUES (?, ?, ?)").run("early-access-account:user", '{"allowed":true}', ISSUE);
let calls = 0;
const env = { NOTIFICATIONS_DB: db, WARNING_CHAT_ENABLED: "true", AI: { async run(model, input) {
  calls++;
  assert.equal(model, WARNING_CHAT_MODEL);
  assert.equal(input.max_completion_tokens, 1024);
  assert.deepEqual(input.chat_template_kwargs, { enable_thinking: false });
  assert.equal(input.n, 1);
  assert.doesNotMatch(JSON.stringify(input), /test-session-not-a-real-credential|"accountId"/);
  return aiResult(goodAnswer);
} } };
function routeRequest({ body, method = "POST", origin = "https://meteoscope.pages.dev", token = session } = {}) {
  return new Request("https://meteoscope.pages.dev/api/warning-chat", { method, headers: { Origin: origin, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(method === "POST" ? { body: JSON.stringify(body ?? validInput) } : {}) });
}
try {
  assert.equal((await onRequest({ request: routeRequest({ token: "" }), env })).status, 401);
  assert.equal((await onRequest({ request: routeRequest({ origin: "https://evil.test" }), env })).status, 403);
  assert.equal((await onRequest({ request: routeRequest(), env: { ...env, WARNING_CHAT_ENABLED: "false" } })).status, 503);
  assert.equal(calls, 0);
  const response = await onRequest({ request: routeRequest(), env });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).quota.accountUsed, 1);
  assert.equal(calls, 1);
  // Upstream failure still consumes its reservation; no automatic retry.
  const badEnv = { ...env, AI: { async run() { calls++; throw new Error("unavailable"); } } };
  assert.equal((await onRequest({ request: routeRequest(), env: badEnv })).status, 503);
  assert.equal(calls, 2);
  // Old AI response cannot be used if JMA changes while inference is pending.
  let warningReads = 0;
  const fetcher = sourceFetcher();
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("warning/data/")) {
      warningReads++;
      return Response.json([report(warningReads > 1 ? "33" : "03")]);
    }
    return fetcher(url, options);
  };
  const changed = await onRequest({ request: routeRequest(), env });
  assert.equal(changed.status, 409);
  const changedBody = await changed.json();
  assert.ok(changedBody.context);
  assert.equal(changedBody.answer, undefined);
  assert.equal((await onRequest({ request: routeRequest(), env })).status, 429);
  assert.equal(calls, 3);
  db.sql.prepare("DELETE FROM app_records WHERE key = 'early-access-account:user'").run();
  assert.equal((await onRequest({ request: routeRequest({ method: "GET" }), env })).status, 403);
} finally {
  globalThis.fetch = originalFetch;
  globalThis.Date = RealDate;
  db.sql.close(); budgetDb.sql.close(); perAccountDb.sql.close();
}

const [html, ui, styles, privacy, consent] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/warningChatModal.js", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/12-warning-chat.css", import.meta.url), "utf8"),
  readFile(new URL("../public/privacy.html", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/legalConsentModal.js", import.meta.url), "utf8")
]);
assert.ok(html.indexOf('id="warning-chat-button"') < html.indexOf('id="current-location-weather"'), "chat is to the left of forecast");
assert.match(html, /id="warning-chat-button"[^>]+hidden/u);
assert.match(html, /id="warning-chat-consent"[^>]+required/u);
assert.match(ui, /meteoscope:early-access-change/u);
assert.match(ui, /controller\?\.abort/u);
assert.match(ui, /history = \[\]/u);
assert.doesNotMatch(ui, /\.innerHTML|localStorage\.setItem|sessionStorage\.setItem/u);
assert.match(styles, /max-width: 420px/u);
assert.doesNotMatch(styles, /box-shadow|linear-gradient|backdrop-filter/u);
assert.match(privacy, /Cloudflare Workers AI/u);
assert.match(consent, /2026-11-13/u);
const config = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
assert.equal([...config.matchAll(/^\[ai\]$/gmu)].length, 1, "a single Workers AI binding is defined");
assert.match(config, /\[ai\]\s+binding = "AI"/u);
assert.match(config, /WARNING_CHAT_DAILY_LIMIT = "40"/u);
console.log("Warning chat tests passed: real atomic SQLite quotas, authentication/EA, source revisions, failure handling, prompt limits and UI/privacy integration.");
