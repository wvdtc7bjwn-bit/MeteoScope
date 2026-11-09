import { authenticateAccount } from "./accountAuth.js";
import { readJson, writeJson, deleteJson } from "./d1Store.js";

const PREFIX = "early-access-account:";

export async function getAccountEarlyAccess(request, db) {
  const auth = await authenticateAccount(request, db);
  if (!auth) return { active: false, authenticated: false, error: "MeteoScopeアカウントにログインしてください。" };
  const grant = await readJson(db, `${PREFIX}${auth.account.id}`, null);
  return grant?.allowed === true
    ? { active: true, authenticated: true, label: "許可済み", activeFaultSource: grant.activeFaultSource === "gsj" ? "gsj" : "jshis" }
    : { active: false, authenticated: true, error: "このアカウントにはアーリーアクセスが許可されていません。" };
}

export async function setAccountEarlyAccess(db, accountId, allowed) {
  if (allowed) {
    const grant = await readJson(db, `${PREFIX}${accountId}`, null);
    await writeJson(db, `${PREFIX}${accountId}`, {
      allowed: true,
      activeFaultSource: grant?.activeFaultSource === "gsj" ? "gsj" : "jshis"
    });
  }
  else await deleteJson(db, `${PREFIX}${accountId}`);
}

export async function setAccountActiveFaultSource(db, accountId, source) {
  if (source !== "jshis" && source !== "gsj") throw new TypeError("Invalid active-fault source.");
  const grant = await readJson(db, `${PREFIX}${accountId}`, null);
  if (grant?.allowed !== true) throw new TypeError("Early access is not allowed for this account.");
  await writeJson(db, `${PREFIX}${accountId}`, { allowed: true, activeFaultSource: source });
}
