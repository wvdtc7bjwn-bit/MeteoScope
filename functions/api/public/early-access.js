const CODES_KEY = "early-access-codes";
const ACTIVATION_PREFIX = "early-access-activation:";

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);
  if (!env.ADMIN_KV) return response({ active: false, error: "認証機能が設定されていません。" }, 503);
  const payload = await request.json().catch(() => ({}));
  if (payload.code) return activateCode(String(payload.code), env.ADMIN_KV);
  if (payload.token) return validateToken(String(payload.token), env.ADMIN_KV);
  return response({ active: false, error: "シリアルコードを入力してください。" }, 400);
}

async function activateCode(code, kv) {
  const codeHash = await hashValue(normalizeSerial(code));
  const codes = await readCodes(kv);
  const entry = codes.find((item) => item.codeHash === codeHash);
  const invalid = getInvalidReason(entry, true);
  if (invalid) return response({ active: false, error: invalid }, 401);

  const token = randomToken(24);
  const now = new Date().toISOString();
  entry.uses = Math.max(0, Number(entry.uses) || 0) + 1;
  entry.lastUsedAt = now;
  await kv.put(CODES_KEY, JSON.stringify(codes));
  const ttl = expirationTtl(entry.expiresAt);
  await kv.put(`${ACTIVATION_PREFIX}${await hashValue(token)}`, JSON.stringify({
    codeId: entry.id,
    createdAt: now,
    lastVerifiedAt: now
  }), ttl ? { expirationTtl: ttl } : undefined);
  return response({ active: true, token, label: entry.label || "アーリーアクセス", expiresAt: entry.expiresAt || null });
}

async function validateToken(token, kv) {
  const activationKey = `${ACTIVATION_PREFIX}${await hashValue(token)}`;
  const activation = await kv.get(activationKey, "json");
  if (!activation?.codeId) return response({ active: false, error: "認証の有効期限が切れています。" }, 401);
  const entry = (await readCodes(kv)).find((item) => item.id === activation.codeId);
  const invalid = getInvalidReason(entry, false);
  if (invalid) {
    await kv.delete(activationKey);
    return response({ active: false, error: invalid }, 401);
  }
  return response({ active: true, label: entry.label || "アーリーアクセス", expiresAt: entry.expiresAt || null });
}

function getInvalidReason(entry, newActivation) {
  if (!entry) return "このシリアルコードは失効しています。";
  if (entry.expiresAt && Date.parse(entry.expiresAt) <= Date.now()) return "このシリアルコードは有効期限切れです。";
  if (newActivation && entry.maxUses && Number(entry.uses || 0) >= Number(entry.maxUses)) return "このシリアルコードは利用上限に達しています。";
  return "";
}

async function readCodes(kv) {
  const value = await kv.get(CODES_KEY, "json");
  return Array.isArray(value) ? value : [];
}

function normalizeSerial(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function hashValue(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(size) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function expirationTtl(expiresAt) {
  if (!expiresAt) return 60 * 60 * 24 * 366;
  return Math.max(60, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
