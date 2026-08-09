import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createFeedbackRecord,
  isFeedbackEmail,
  publicFeedbackStatus,
  updateFeedbackRecord
} from "../functions/_shared/feedbackSupport.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [publicRoute, adminRoute, feedbackUi, privacy, support] = await Promise.all([
  fs.readFile(path.join(root, "functions", "api", "public", "feedback.js"), "utf8"),
  fs.readFile(path.join(root, "functions", "api", "admin", "[[path]].js"), "utf8"),
  fs.readFile(path.join(root, "src", "ui", "feedbackModal.js"), "utf8"),
  fs.readFile(path.join(root, "public", "privacy.html"), "utf8"),
  fs.readFile(path.join(root, "public", "support.html"), "utf8")
]);

const id = "11111111-1111-4111-8111-111111111111";
const createdAt = "2026-08-09T00:00:00.000Z";
const record = createFeedbackRecord({
  category: "bug",
  topic: "radar",
  message: "Timeline does not update.",
  expected: "It updates every minute.",
  email: "Reply.Me+test@example.jp",
  page: "/?support=1#private",
  context: { tab: "radar", theme: "dark", language: "en", viewport: "393x852" }
}, { id, now: createdAt });

assert.equal(record.page, "/");
assert.equal(record.email, "reply.me+test@example.jp");
assert.deepEqual(record.context, { tab: "radar", theme: "dark", language: "en", viewport: "393x852" });
assert.equal(isFeedbackEmail("reply@example.jp"), true);
assert.equal(isFeedbackEmail("not-an-email"), false);

const publicRecord = publicFeedbackStatus(updateFeedbackRecord(record, {
  status: "reviewing",
  response: "We are reviewing this report."
}, "2026-08-09T00:01:00.000Z"));
assert.equal(publicRecord.status, "reviewing");
assert.equal(publicRecord.response, "We are reviewing this report.");
assert.equal("email" in publicRecord, false);
assert.equal("message" in publicRecord, false);
assert.equal("expected" in publicRecord, false);
assert.equal("context" in publicRecord, false);

assert.match(publicRoute, /isSameOriginRequest\(request\)/u);
assert.match(publicRoute, /MAX_FEEDBACK_ITEMS = 250/u);
assert.match(publicRoute, /Cache-Control": "no-store"/u);
assert.match(publicRoute, /Cross-Origin-Resource-Policy": "same-origin"/u);
assert.match(adminRoute, /route === "feedback" && method === "GET"/u);
assert.match(adminRoute, /feedbackRoute && method === "PUT"/u);
assert.match(adminRoute, /feedbackRoute && method === "DELETE"/u);
assert.match(adminRoute, /async function deleteFeedback/u);
assert.match(adminRoute, /entries\.filter\(\(item\) => String\(item\?\.id \|\| ""\) !== id\)/u);
assert.match(adminRoute, /isAuthenticated\(request, env\)/u);
assert.match(feedbackUi, /MAX_RECENT_TICKETS = 8/u);
assert.match(feedbackUi, /RECENT_TICKET_RETENTION_DAYS = 30/u);
assert.match(feedbackUi, /RECENT_TICKET_MAX_AGE_MS/u);
assert.match(feedbackUi, /filter\(\(ticket\) => updates\.has\(ticket\.id\)\)/u);
assert.match(feedbackUi, /page: location\.pathname/u);
assert.doesNotMatch(feedbackUi, /navigator\.geolocation|userAgent/iu);
assert.match(privacy, /メールアドレス/u);
assert.match(support, /\?support=1/u);

console.log("Feedback support privacy and admin workflow tests passed.");
