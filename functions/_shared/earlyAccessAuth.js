import { deleteJson, readJson, writeJson } from "./d1Store.js";

export const EARLY_ACCESS_CODES_KEY = "early-access-codes";
export const EARLY_ACCESS_ACTIVATION_PREFIX = "early-access-activation:";

export async function validateEarlyAccessToken(db, token, options = {}) {
  const normalizedToken = String(token ?? "").trim();
  if (!normalizedToken) return { active: false, error: "アーリーアクセス認証が必要です。" };
  const activationKey = `${EARLY_ACCESS_ACTIVATION_PREFIX}${await hashEarlyAccessValue(normalizedToken)}`;
  const activation = await readJson(db, activationKey, null);
  if (!activation?.codeId) return { active: false, error: "認証の有効期限が切れています。" };
  if (activation.expiresAt && Date.parse(activation.expiresAt) <= Date.now()) {
    await deleteJson(db, activationKey);
    return { active: false, error: "認証の有効期限が切れています。" };
  }
  const entry = (await readEarlyAccessCodes(db)).find((item) => item.id === activation.codeId);
  const invalid = getEarlyAccessInvalidReason(entry, false);
  if (invalid) {
    await deleteJson(db, activationKey);
    return { active: false, error: invalid };
  }

  const accountID = String(options.accountID ?? "").trim();
  if (accountID && activation.accountId && activation.accountId !== accountID) {
    return { active: false, error: "このアーリーアクセス認証は別のアカウントで使用されています。" };
  }
  if (accountID && options.bindAccount && !activation.accountId) {
    await writeJson(db, activationKey, {
      ...activation,
      accountId: accountID,
      lastVerifiedAt: new Date().toISOString()
    });
  }
  return {
    active: true,
    label: entry.label || "アーリーアクセス",
    expiresAt: entry.expiresAt || null
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

export async function hashEarlyAccessValue(value) {
  const bytes = new TextEncoder().encode(String(value ?? ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

