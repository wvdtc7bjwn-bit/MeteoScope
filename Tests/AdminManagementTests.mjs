import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  deleteMeteoScopeAccount,
  listMeteoScopeAccounts,
  normalizeAccountID
} from "../functions/_shared/adminManagement.js";
import { deleteAdminPushBroadcast } from "../functions/api/push/[[path]].js";

const accountID = "11111111-1111-4111-8111-111111111111";
const broadcastID = "22222222-2222-4222-8222-222222222222";

assert.equal(normalizeAccountID(accountID.toUpperCase()), accountID);
assert.throws(() => normalizeAccountID("not-an-account"), /Invalid account ID/u);

const listDb = {
  prepare(sql) {
    return {
      bind(...values) {
        return {
          async all() {
            assert.deepEqual(values, [100, 0]);
            return { results: [{
              id: accountID,
              username_normalized: "weather_user",
              display_name: "天気ユーザー",
              password_hash: "must-not-leak",
              created_at: "2026-07-17T00:00:00.000Z",
              updated_at: "2026-07-17T01:00:00.000Z"
            }] };
          }
        };
      },
      async first() {
        assert.match(sql, /COUNT\(\*\) AS total FROM quiz_accounts/u);
        return { total: 1 };
      }
    };
  }
};
const accountPage = await listMeteoScopeAccounts(listDb, { limit: 100, offset: 0 });
assert.deepEqual(accountPage.accounts[0], {
  id: accountID,
  username: "weather_user",
  displayName: "天気ユーザー",
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T01:00:00.000Z"
});
assert.equal("password_hash" in accountPage.accounts[0], false);
assert.equal(accountPage.nextOffset, null);

const accountDeleteStatements = [];
const deleteDb = {
  prepare(sql) {
    const statement = {
      sql,
      values: [],
      bind(...values) {
        this.values = values;
        return this;
      },
      async first() {
        return {
          id: accountID,
          username_normalized: "weather_user",
          display_name: "天気ユーザー",
          created_at: "2026-07-17T00:00:00.000Z"
        };
      },
      async all() {
        assert.match(sql, /sqlite_master/u);
        return { results: [{ name: "quiz_best_scores" }] };
      }
    };
    return statement;
  },
  async batch(statements) {
    accountDeleteStatements.push(...statements);
    return statements.map(() => ({ meta: { changes: 1 } }));
  }
};
const deletion = await deleteMeteoScopeAccount(deleteDb, accountID);
assert.equal(deletion.account.displayName, "天気ユーザー");
assert.equal(deletion.deletedRows, 11);
const accountDeleteSql = accountDeleteStatements.map((statement) => statement.sql).join("\n");
for (const table of [
  "community_report_flags", "community_reports", "community_post_daily", "quiz_best_scores", "quiz_daily_scores",
  "quiz_daily_active", "quiz_challenges", "quiz_attempts", "quiz_sessions", "app_records", "quiz_accounts"
]) {
  assert.match(accountDeleteSql, new RegExp(`DELETE FROM ${table}`, "u"));
}
assert.match(accountDeleteSql, /early-access-activation:%/u);

const currentSchemaStatements = [];
const currentSchemaDb = {
  prepare(sql) {
    return {
      sql,
      bind() { return this; },
      async first() {
        return sql.includes("FROM quiz_accounts")
          ? { id: accountID, username_normalized: "weather_user", display_name: "天気ユーザー" }
          : null;
      },
      async all() { return { results: [] }; }
    };
  },
  async batch(statements) {
    currentSchemaStatements.push(...statements);
    return statements.map(() => ({ meta: { changes: 1 } }));
  }
};
const currentSchemaDeletion = await deleteMeteoScopeAccount(currentSchemaDb, accountID);
assert.equal(currentSchemaDeletion.deletedRows, 10);
assert.doesNotMatch(currentSchemaStatements.map((statement) => statement.sql).join("\n"), /DELETE FROM quiz_best_scores/u);

const pushDeleteBatches = [];
const pushDb = {
  prepare(sql) {
    return {
      sql,
      values: [],
      bind(...values) {
        this.values = values;
        return this;
      },
      async first() {
        if (sql.includes("FROM admin_push_broadcasts")) return { id: broadcastID, status: "completed" };
        return null;
      }
    };
  },
  async batch(statements) {
    pushDeleteBatches.push(statements);
    if (statements.some((statement) => statement.sql.includes("CREATE TABLE"))) {
      return statements.map(() => ({ meta: { changes: 0 } }));
    }
    return [{ meta: { changes: 1 } }, { meta: { changes: 3 } }, { meta: { changes: 1 } }];
  }
};
const broadcastDeletion = await deleteAdminPushBroadcast({ NOTIFICATIONS_DB: pushDb }, broadcastID);
assert.deepEqual(broadcastDeletion, { deleted: true, pendingMessages: 1, deliveries: 3 });
const pushDeleteSql = pushDeleteBatches.flat().map((statement) => statement.sql).join("\n");
assert.match(pushDeleteSql, /DELETE FROM push_pending_messages/u);
assert.match(pushDeleteSql, /DELETE FROM admin_push_deliveries/u);
assert.match(pushDeleteSql, /DELETE FROM admin_push_broadcasts WHERE id = \?1 AND status = 'completed'/u);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [adminRoute, adminPage, adminScript, adminStyles] = await Promise.all([
  fs.readFile(path.join(root, "functions", "api", "admin", "[[path]].js"), "utf8"),
  fs.readFile(path.join(root, "admin.html"), "utf8"),
  fs.readFile(path.join(root, "src", "admin.js"), "utf8"),
  fs.readFile(path.join(root, "src", "admin.css"), "utf8")
]);
assert.match(adminRoute, /route === "accounts" && method === "GET"/u);
assert.match(adminRoute, /route\.startsWith\("accounts\/"\) && method === "DELETE"/u);
assert.match(adminRoute, /route\.startsWith\("push\/broadcasts\/"\) && method === "DELETE"/u);
assert.match(adminRoute, /listAdminPushBroadcasts\(env, 50\)/u);
assert.match(adminRoute, /deleteEarlyAccessActivationsForCode\(db, id\)/u);
assert.match(adminPage, /id="admin-account-list"/u);
assert.match(adminPage, /管理者通知管理/u);
assert.match(adminScript, /data-delete-account/u);
assert.match(adminScript, /data-delete-push-broadcast/u);
assert.match(adminStyles, /\.admin-account-item/u);

console.log("Admin account and notification management tests passed.");
