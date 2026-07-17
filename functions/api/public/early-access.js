import {
  EARLY_ACCESS_ACTIVATION_PREFIX,
  EARLY_ACCESS_CODES_KEY,
  getEarlyAccessInvalidReason,
  hashEarlyAccessValue,
  readEarlyAccessCodes,
  reconcileEarlyAccessCodeUsage,
  releaseEarlyAccessToken,
  validateEarlyAccessToken
} from "../../_shared/earlyAccessAuth.js";
import { writeJson } from "../../_shared/d1Store.js";

export async function onRequest({ request, env }) {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.headers.has("Origin") && !cors["Access-Control-Allow-Origin"]) return response({ error: "許可されていない接続元です。" }, 403);
  if (request.method !== "POST") return withHeaders(response({ error: "Method not allowed" }, 405), cors);
  if (!env.NOTIFICATIONS_DB) return withHeaders(response({ active: false, error: "認証機能が設定されていません。" }, 503), cors);
  const payload = await request.json().catch(() => ({}));
  let result;
  if (payload.action === "deactivate") result = await deactivateToken(String(payload.token ?? ""), env.NOTIFICATIONS_DB);
  else if (payload.code) result = await activateCode(String(payload.code), env.NOTIFICATIONS_DB);
  else if (payload.token) result = await validateToken(String(payload.token), env.NOTIFICATIONS_DB);
  else result = response({ active: false, error: "シリアルコードを入力してください。" }, 400);
  return withHeaders(result, cors);
}

async function activateCode(code, db) {
  const codeHash = await hashEarlyAccessValue(normalizeSerial(code));
  const codes = await readCodes(db);
  const entry = codes.find((item) => item.codeHash === codeHash);
  const previousUses = Math.max(0, Number(entry?.uses) || 0);
  if (entry) {
    const usage = await reconcileEarlyAccessCodeUsage(db, entry.id);
    entry.uses = usage.activeUses;
  }
  const invalid = getEarlyAccessInvalidReason(entry, true);
  if (invalid) {
    if (entry && entry.uses !== previousUses) await writeJson(db, EARLY_ACCESS_CODES_KEY, codes);
    return response({ active: false, error: invalid }, 401);
  }

  const token = randomToken(24);
  const now = new Date().toISOString();
  const activationExpiresAt = entry.expiresAt || new Date(Date.now() + 60 * 60 * 24 * 366 * 1000).toISOString();
  entry.uses = Math.max(0, Number(entry.uses) || 0) + 1;
  entry.lastUsedAt = now;
  await writeJson(db, EARLY_ACCESS_CODES_KEY, codes);
  await writeJson(db, `${EARLY_ACCESS_ACTIVATION_PREFIX}${await hashEarlyAccessValue(token)}`, {
    codeId: entry.id,
    createdAt: now,
    lastVerifiedAt: now,
    expiresAt: activationExpiresAt
  });
  return response({ active: true, token, label: entry.label || "アーリーアクセス", expiresAt: entry.expiresAt || null });
}

async function validateToken(token, db) {
  const result = await validateEarlyAccessToken(db, token);
  return response(result, result.active ? 200 : 401);
}

async function deactivateToken(token, db) {
  if (!token.trim()) return response({ active: false, released: false, error: "解除する認証情報がありません。" }, 400);
  return response(await releaseEarlyAccessToken(db, token));
}

async function readCodes(db) {
  return readEarlyAccessCodes(db);
}

function normalizeSerial(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function randomToken(size) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  const allowed = origin === new URL(request.url).origin || origin === "https://wvdtc7bjwn-bit.github.io" || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/u.test(origin);
  return allowed ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  } : {};
}

function withHeaders(result, headers) {
  const next = new Headers(result.headers);
  Object.entries(headers).forEach(([key, value]) => next.set(key, value));
  return new Response(result.body, { status: result.status, statusText: result.statusText, headers: next });
}
