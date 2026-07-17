import { deleteJson, readJson, writeJson } from "./d1Store.js";

export const EARLY_ACCESS_CODES_KEY = "early-access-codes";
export const EARLY_ACCESS_ACTIVATION_PREFIX = "early-access-activation:";
export const EARLY_ACCESS_IDLE_RECLAIM_DAYS = 30;
const EARLY_ACCESS_IDLE_RECLAIM_MS = EARLY_ACCESS_IDLE_RECLAIM_DAYS * 24 * 60 * 60 * 1000;
const EARLY_ACCESS_VERIFICATION_WRITE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function validateEarlyAccessToken(db, token, options = {}) {
  const normalizedToken = String(token ?? "").trim();
  if (!normalizedToken) return { active: false, error: "アーリーアクセス認証が必要です。" };
  const activationKey = `${EARLY_ACCESS_ACTIVATION_PREFIX}${await hashEarlyAccessValue(normalizedToken)}`;
  const activation = await readJson(db, activationKey, null);
  if (!activation?.codeId) return { active: false, error: "認証の有効期限が切れています。" };
  const now = Date.now();
  if (activation.expiresAt && Date.parse(activation.expiresAt) <= now) {
    await releaseEarlyAccessActivation(db, activationKey, activation);
    return { active: false, error: "認証の有効期限が切れています。" };
  }
  const lastVerifiedAt = Date.parse(activation.lastVerifiedAt || activation.createdAt || "");
  if (Number.isFinite(lastVerifiedAt) && now - lastVerifiedAt >= EARLY_ACCESS_IDLE_RECLAIM_MS) {
    await releaseEarlyAccessActivation(db, activationKey, activation);
    return { active: false, error: "長期間使用されなかった端末の認証枠を解放しました。シリアルコードを再入力してください。" };
  }
  const codes = await readEarlyAccessCodes(db);
  const entry = codes.find((item) => item.id === activation.codeId);
  const invalid = getEarlyAccessInvalidReason(entry, false);
  if (invalid) {
    await releaseEarlyAccessActivation(db, activationKey, activation, codes);
    return { active: false, error: invalid };
  }

  const accountID = String(options.accountID ?? "").trim();
  if (accountID && activation.accountId && activation.accountId !== accountID) {
    return { active: false, error: "このアーリーアクセス認証は別のアカウントで使用されています。" };
  }
  const shouldBindAccount = Boolean(accountID && options.bindAccount && !activation.accountId);
  const shouldRefreshVerification = !Number.isFinite(lastVerifiedAt)
    || now - lastVerifiedAt >= EARLY_ACCESS_VERIFICATION_WRITE_INTERVAL_MS;
  if (shouldBindAccount || shouldRefreshVerification) {
    await writeJson(db, activationKey, {
      ...activation,
      ...(shouldBindAccount ? { accountId: accountID } : {}),
      lastVerifiedAt: new Date(now).toISOString()
    });
  }
  return {
    active: true,
    label: entry.label || "アーリーアクセス",
    expiresAt: entry.expiresAt || null
  };
}

export async function releaseEarlyAccessToken(db, token) {
  const normalizedToken = String(token ?? "").trim();
  if (!normalizedToken) {
    return { active: false, released: false, error: "解除する認証情報がありません。" };
  }
  const activationKey = `${EARLY_ACCESS_ACTIVATION_PREFIX}${await hashEarlyAccessValue(normalizedToken)}`;
  const activation = await readJson(db, activationKey, null);
  if (!activation?.codeId) {
    return { active: false, released: false, message: "この端末の認証はすでに解除されています。" };
  }
  const released = await releaseEarlyAccessActivation(db, activationKey, activation);
  return {
    active: false,
    released,
    message: released
      ? "この端末のアーリーアクセスを解除しました。"
      : "この端末の認証はすでに解除されています。"
  };
}

export function getEarlyAccessInvalidReason(entry, newActivation) {
  if (!entry) return "このシリアルコードは失効しています。";
  if (entry.expiresAt && Date.parse(entry.expiresAt) <= Date.now()) return "このシリアルコードは有効期限切れです。";
  if (newActivation && entry.maxUses && Number(entry.uses || 0) >= Number(entry.maxUses)) {
    return "このシリアルコードは利用上限に達しています。";
  }
  return "";
}

export async function readEarlyAccessCodes(db) {
  const value = await readJson(db, EARLY_ACCESS_CODES_KEY, []);
  return Array.isArray(value) ? value : [];
}

export async function deleteEarlyAccessActivationsForCode(db, codeID) {
  const normalizedCodeID = String(codeID ?? "").trim();
  if (!normalizedCodeID) return 0;
  const result = await db.prepare(
    `DELETE FROM app_records
     WHERE key LIKE 'early-access-activation:%'
       AND json_extract(value, '$.codeId') = ?`
  ).bind(normalizedCodeID).run();
  return Math.max(0, Number(result?.meta?.changes ?? result?.changes) || 0);
}

export async function reconcileEarlyAccessCodeUsage(db, codeID, now = new Date()) {
  const normalizedCodeID = String(codeID ?? "").trim();
  if (!normalizedCodeID) return { activeUses: 0, reclaimed: 0 };
  const referenceTime = now instanceof Date ? now : new Date(now);
  const timestamp = Number.isFinite(referenceTime.getTime()) ? referenceTime.getTime() : Date.now();
  const cutoff = new Date(timestamp - EARLY_ACCESS_IDLE_RECLAIM_MS).toISOString();
  const stale = await db.prepare(
    `DELETE FROM app_records
     WHERE key LIKE 'early-access-activation:%'
       AND json_extract(value, '$.codeId') = ?
       AND (
         datetime(COALESCE(
           json_extract(value, '$.lastVerifiedAt'),
           json_extract(value, '$.createdAt')
         )) <= datetime(?)
         OR (
           json_extract(value, '$.expiresAt') IS NOT NULL
           AND datetime(json_extract(value, '$.expiresAt')) <= datetime(?)
         )
       )`
  ).bind(normalizedCodeID, cutoff, new Date(timestamp).toISOString()).run();
  const row = await db.prepare(
    `SELECT COUNT(*) AS activeUses
     FROM app_records
     WHERE key LIKE 'early-access-activation:%'
       AND json_extract(value, '$.codeId') = ?`
  ).bind(normalizedCodeID).first();
  return {
    activeUses: Math.max(0, Number(row?.activeUses) || 0),
    reclaimed: Math.max(0, Number(stale?.meta?.changes ?? stale?.changes) || 0)
  };
}

export async function hashEarlyAccessValue(value) {
  const bytes = new TextEncoder().encode(String(value ?? ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function releaseEarlyAccessActivation(db, activationKey, activation, existingCodes = null) {
  const deleted = await deleteJson(db, activationKey);
  if (!deleted || !activation?.codeId) return false;

  const codes = existingCodes ?? await readEarlyAccessCodes(db);
  const entry = codes.find((item) => item.id === activation.codeId);
  if (!entry) return true;

  const previousUses = Math.max(0, Number(entry.uses) || 0);
  const { activeUses: nextUses } = await reconcileEarlyAccessCodeUsage(db, activation.codeId);
  if (nextUses !== previousUses) {
    entry.uses = nextUses;
    await writeJson(db, EARLY_ACCESS_CODES_KEY, codes);
  }
  return true;
}
