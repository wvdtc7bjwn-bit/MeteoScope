const encoder = new TextEncoder();

export const QUIZ_PASSWORD_ITERATIONS = 100_000;
export const QUIZ_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export function normalizeQuizUsername(value) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase();
}

export function normalizeQuizDisplayName(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function validateQuizAccountInput({ username, displayName, password }) {
  const normalizedUsername = normalizeQuizUsername(username);
  const normalizedDisplayName = normalizeQuizDisplayName(displayName);
  if (!/^[a-z0-9_]{4,24}$/u.test(normalizedUsername)) {
    return { error: "アカウントIDは4〜24文字の半角英数字と_で入力してください。" };
  }
  if (normalizedDisplayName.length < 2 || normalizedDisplayName.length > 20 || /[\p{Cc}<>]/u.test(normalizedDisplayName)) {
    return { error: "表示名は2〜20文字で入力してください。" };
  }
  if (String(password ?? "").length < 10 || String(password ?? "").length > 128) {
    return { error: "パスワードは10〜128文字で入力してください。" };
  }
  return { username: normalizedUsername, displayName: normalizedDisplayName, password: String(password) };
}

export function validateQuizLoginInput({ username, password }) {
  const normalizedUsername = normalizeQuizUsername(username);
  if (!/^[a-z0-9_]{4,24}$/u.test(normalizedUsername) || String(password ?? "").length > 128) {
    return { error: "アカウントIDまたはパスワードが正しくありません。" };
  }
  return { username: normalizedUsername, password: String(password ?? "") };
}

export async function hashQuizPassword(password, salt, pepper) {
  const peppered = await hmacBytes(String(password), String(pepper));
  const key = await crypto.subtle.importKey("raw", peppered, "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: fromBase64Url(salt),
    iterations: QUIZ_PASSWORD_ITERATIONS
  }, key, 256);
  return toBase64Url(new Uint8Array(derived));
}

export async function verifyQuizPassword(password, salt, expectedHash, pepper) {
  const actual = await hashQuizPassword(password, salt, pepper);
  return constantTimeEqual(actual, expectedHash);
}

export function randomQuizToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function hashQuizToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(token)));
  return toBase64Url(new Uint8Array(digest));
}

export async function hashQuizRateLimitKey(value, secret) {
  return toBase64Url(await hmacBytes(String(value), String(secret)));
}

export function constantTimeEqual(left, right) {
  const a = encoder.encode(String(left));
  const b = encoder.encode(String(right));
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

async function hmacBytes(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function toBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/gu, "");
}

function fromBase64Url(value) {
  const normalized = String(value).replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
