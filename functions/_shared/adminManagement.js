import { requireD1 } from "./d1Store.js";

const ACCOUNT_PAGE_SIZE = 100;
const MAX_ACCOUNT_OFFSET = 100_000;
const ACCOUNT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function listMeteoScopeAccounts(db, options = {}) {
  requireD1(db);
  const limit = Math.min(ACCOUNT_PAGE_SIZE, Math.max(1, Number.parseInt(options.limit, 10) || ACCOUNT_PAGE_SIZE));
  const offset = Math.min(MAX_ACCOUNT_OFFSET, Math.max(0, Number.parseInt(options.offset, 10) || 0));
  const [accountsResult, totalRow] = await Promise.all([
    db.prepare(
      `SELECT id, username_normalized, display_name, created_at, updated_at
       FROM quiz_accounts
       ORDER BY datetime(created_at) DESC, id ASC
       LIMIT ?1 OFFSET ?2`
    ).bind(limit, offset).all(),
    db.prepare("SELECT COUNT(*) AS total FROM quiz_accounts").first()
  ]);
  const accounts = (accountsResult?.results || []).map(publicAccount);
  const total = Math.max(0, Number(totalRow?.total || 0));
  return {
    accounts,
    total,
    limit,
    offset,
    nextOffset: offset + accounts.length < total ? offset + accounts.length : null
  };
}

export async function deleteMeteoScopeAccount(db, accountID) {
  requireD1(db);
  const id = normalizeAccountID(accountID);
  const account = await db.prepare(
    `SELECT id, username_normalized, display_name, created_at
     FROM quiz_accounts WHERE id = ?1`
  ).bind(id).first();
  if (!account) return null;

  const results = await db.batch([
    db.prepare(
      `DELETE FROM community_report_flags
       WHERE reporter_account_id = ?1
          OR report_id IN (SELECT id FROM community_reports WHERE account_id = ?1)`
    ).bind(id),
    db.prepare("DELETE FROM community_reports WHERE account_id = ?1").bind(id),
    db.prepare("DELETE FROM community_post_daily WHERE account_id = ?1").bind(id),
    db.prepare("DELETE FROM quiz_best_scores WHERE account_id = ?1").bind(id),
    db.prepare("DELETE FROM quiz_daily_scores WHERE account_id = ?1").bind(id),
    db.prepare("DELETE FROM quiz_daily_active WHERE account_id = ?1").bind(id),
    db.prepare("DELETE FROM quiz_challenges WHERE account_id = ?1").bind(id),
    db.prepare("DELETE FROM quiz_attempts WHERE account_id = ?1").bind(id),
    db.prepare("DELETE FROM quiz_sessions WHERE account_id = ?1").bind(id),
    db.prepare(
      `DELETE FROM app_records
       WHERE key LIKE 'early-access-activation:%'
         AND json_extract(value, '$.accountId') = ?1`
    ).bind(id),
    db.prepare("DELETE FROM quiz_accounts WHERE id = ?1").bind(id)
  ]);
  return {
    account: publicAccount(account),
    deletedRows: results.reduce((sum, result) => sum + d1Changes(result), 0)
  };
}

export function normalizeAccountID(value) {
  const id = String(value || "").trim().toLowerCase();
  if (!ACCOUNT_ID_PATTERN.test(id)) throw new TypeError("Invalid account ID.");
  return id;
}

function publicAccount(account) {
  return {
    id: String(account?.id || ""),
    username: String(account?.username_normalized || ""),
    displayName: String(account?.display_name || ""),
    createdAt: account?.created_at || null,
    updatedAt: account?.updated_at || null
  };
}

function d1Changes(result) {
  return Math.max(0, Number(result?.meta?.changes ?? result?.changes ?? 0));
}
