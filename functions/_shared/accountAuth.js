import { hashQuizToken } from "./quizSecurity.js";

export const ACCOUNT_SESSION_COOKIE = "meteoscope_session";
export const LEGACY_ACCOUNT_SESSION_COOKIE = "meteoscope_quiz_session";

export async function authenticateAccount(request, db) {
  const session = accountSessionToken(request);
  if (!session.token) return null;
  const account = await db.prepare(
    `SELECT accounts.id, accounts.display_name
     FROM quiz_sessions sessions JOIN quiz_accounts accounts ON accounts.id = sessions.account_id
     WHERE sessions.token_hash = ?1 AND sessions.expires_at > ?2`
  ).bind(await hashQuizToken(session.token), new Date().toISOString()).first();
  return account ? { account, token: session.token, source: session.source } : null;
}

export async function requireAccountAuthentication(request, db, message = "この操作にはログインが必要です。") {
  const auth = await authenticateAccount(request, db);
  if (!auth) throw jsonError(message, 401);
  return auth;
}

export function accountSessionToken(request) {
  const authorization = request.headers.get("Authorization") ?? "";
  if (authorization.startsWith("Bearer ")) {
    return { token: authorization.slice(7).trim(), source: "bearer" };
  }
  const cookies = parseCookies(request.headers.get("Cookie") ?? "");
  if (cookies[ACCOUNT_SESSION_COOKIE]) return { token: cookies[ACCOUNT_SESSION_COOKIE], source: "account" };
  if (cookies[LEGACY_ACCOUNT_SESSION_COOKIE]) return { token: cookies[LEGACY_ACCOUNT_SESSION_COOKIE], source: "legacy" };
  return { token: "", source: "none" };
}

export function accountSessionCookie(token, maxAgeSeconds) {
  return `${ACCOUNT_SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=${maxAgeSeconds}`;
}

export function expiredAccountSessionHeaders() {
  const headers = new Headers();
  headers.append("Set-Cookie", `${ACCOUNT_SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0`);
  headers.append("Set-Cookie", `${LEGACY_ACCOUNT_SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/api/quiz; Max-Age=0`);
  return headers;
}

function parseCookies(value) {
  return Object.fromEntries(String(value).split(";").map((item) => {
    const [key, ...parts] = item.trim().split("=");
    return [key, parts.join("=")];
  }).filter(([key]) => key));
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

