import { authenticateAccount } from "./accountAuth.js";
import { readJson, writeJson, deleteJson } from "./d1Store.js";

const PREFIX = "early-access-account:";

export async function getAccountEarlyAccess(request, db) {
  const auth = await authenticateAccount(request, db);
  if (!auth) return { active: false, authenticated: false, error: "MeteoScopeアカウントにログインしてください。" };
  const grant = await readJson(db, `${PREFIX}${auth.account.id}`, null);
  return grant?.allowed === true
    ? { active: true, authenticated: true, label: "許可済み" }
    : { active: false, authenticated: true, error: "このアカウントにはアーリーアクセスが許可されていません。" };
}

export async function setAccountEarlyAccess(db, accountId, allowed) {
  if (allowed) await writeJson(db, `${PREFIX}${accountId}`, { allowed: true });
  else await deleteJson(db, `${PREFIX}${accountId}`);
}
