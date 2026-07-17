import { requireD1 } from "../../_shared/d1Store.js";
import { deleteMeteoScopeAccount } from "../../_shared/adminManagement.js";
import {
  QUIZ_SESSION_TTL_SECONDS, hashQuizPassword, hashQuizRateLimitKey, hashQuizToken,
  normalizeQuizDisplayName, randomQuizToken, validateQuizAccountInput,
  validateQuizLoginInput, verifyQuizPassword
} from "../../_shared/quizSecurity.js";
import {
  QUIZ_DIFFICULTIES, QUIZ_QUESTION_COUNT, createQuizQuestionIDs, isQuizDifficulty, scoreQuizAnswers
} from "../../_shared/quizCatalog.js";
import {
  CURRENT_USER_QUIZ_RANK_SQL,
  PUBLIC_QUIZ_LEADERBOARD_SQL,
  UPSERT_QUIZ_DAILY_SCORE_SQL,
  quizRankingDate
} from "../../_shared/quizStorage.js";
import {
  invalidateAllQuizLeaderboardCaches,
  invalidateQuizLeaderboardCache,
  quizLeaderboardCacheKey
} from "../../_shared/quizLeaderboardCache.js";
import { recordQuizDailyActivity } from "../../_shared/quizMaintenance.js";
import {
  accountSessionCookie,
  accountSessionToken,
  authenticateAccount,
  expiredAccountSessionHeaders,
  requireAccountAuthentication
} from "../../_shared/accountAuth.js";

const CHALLENGE_TTL_SECONDS = 15 * 60;
const MAX_REQUEST_BYTES = 8 * 1024;
const LEADERBOARD_LIMIT = 20;

export async function onRequest({ request, env }) {
  const originHeaders = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: originHeaders });
  if (request.headers.has("Origin") && !originHeaders["Access-Control-Allow-Origin"]) {
    return json({ error: "許可されていない接続元です。" }, { status: 403 });
  }
  try {
    const route = new URL(request.url).pathname.replace(/^\/api\/quiz\/?/u, "").replace(/\/$/u, "");
    const method = request.method.toUpperCase();
    let response;
    if (route === "config" && method === "GET") response = getConfiguration(env);
    else if (route === "account" && method === "GET") response = await getAccount(request, env);
    else if (route === "register" && method === "POST") response = await register(request, env);
    else if (route === "login" && method === "POST") response = await login(request, env);
    else if (route === "logout" && method === "POST") response = await logout(request, env);
    else if (route === "account" && method === "DELETE") response = await deleteAccount(request, env);
    else if (route === "leaderboard" && method === "GET") response = await leaderboard(request, env);
    else if (route === "challenge" && method === "POST") response = await createChallenge(request, env);
    else if (route === "submit" && method === "POST") response = await submitAttempt(request, env);
    else response = json({ error: "Not found" }, { status: 404 });
    return withHeaders(await response, originHeaders);
  } catch (error) {
    const response = error instanceof Response
      ? error
      : json({ error: "クイズランキングを処理できませんでした。" }, { status: 500 });
    return withHeaders(response, originHeaders);
  }
}

function getConfiguration(env) {
  return json({
    enabled: isConfigured(env),
    accountRequiredForRanking: true,
    publicFields: ["displayName", "difficulty", "points", "attemptCount", "completedAt"]
  });
}

async function register(request, env) {
  const db = requireQuizConfiguration(env);
  await enforceRateLimit(request, env, db, "register", 5, 15 * 60);
  const payload = await readJSON(request);
  const input = validateQuizAccountInput(payload);
  if (input.error) throw json({ error: input.error }, { status: 400 });
  const now = new Date().toISOString();
  const salt = randomQuizToken(16);
  const passwordHash = await hashQuizPassword(input.password, salt, env.QUIZ_PASSWORD_PEPPER);
  const accountID = crypto.randomUUID();
  try {
    await db.prepare(
      `INSERT INTO quiz_accounts
       (id, username_normalized, display_name, password_salt, password_hash, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`
    ).bind(accountID, input.username, input.displayName, salt, passwordHash, now).run();
  } catch (error) {
    if (/UNIQUE|constraint/iu.test(String(error?.message ?? error))) {
      throw json({ error: "そのアカウントIDは使用されています。" }, { status: 409 });
    }
    throw error;
  }
  const session = await createSession(db, accountID);
  await recordQuizDailyActivity(db, accountID);
  return accountResponse({ id: accountID, display_name: input.displayName }, session, payload.client);
}

async function login(request, env) {
  const db = requireQuizConfiguration(env);
  await enforceRateLimit(request, env, db, "login", 10, 15 * 60);
  const payload = await readJSON(request);
  const input = validateQuizLoginInput(payload);
  if (input.error) throw json({ error: input.error }, { status: 401 });
  const account = await db.prepare(
    `SELECT id, display_name, password_salt, password_hash
     FROM quiz_accounts WHERE username_normalized = ?1`
  ).bind(input.username).first();
  const valid = account && await verifyQuizPassword(
    input.password, account.password_salt, account.password_hash, env.QUIZ_PASSWORD_PEPPER
  );
  if (!valid) throw json({ error: "アカウントIDまたはパスワードが正しくありません。" }, { status: 401 });
  const session = await createSession(db, account.id);
  await recordQuizDailyActivity(db, account.id);
  return accountResponse(account, session, payload.client);
}

async function getAccount(request, env) {
  const db = requireQuizConfiguration(env);
  const auth = await authenticateAccount(request, db);
  if (auth) await recordQuizDailyActivity(db, auth.account.id);
  if (!auth) return json({ authenticated: false });
  const headers = auth.source === "legacy"
    ? { "Set-Cookie": accountSessionCookie(auth.token, QUIZ_SESSION_TTL_SECONDS) }
    : undefined;
  return json({ authenticated: true, account: publicAccount(auth.account) }, { headers });
}

async function logout(request, env) {
  const db = requireQuizConfiguration(env);
  const token = accountSessionToken(request).token;
  if (token) await db.prepare("DELETE FROM quiz_sessions WHERE token_hash = ?1").bind(await hashQuizToken(token)).run();
  return json({ authenticated: false }, { headers: expiredAccountSessionHeaders() });
}

async function deleteAccount(request, env) {
  const db = requireQuizConfiguration(env);
  const auth = await requireAuthentication(request, db);
  await enforceRateLimit(request, env, db, "delete", 5, 15 * 60);
  const payload = await readJSON(request);
  const account = await db.prepare(
    "SELECT password_salt, password_hash FROM quiz_accounts WHERE id = ?1"
  ).bind(auth.account.id).first();
  const valid = account && await verifyQuizPassword(
    String(payload.password ?? ""), account.password_salt, account.password_hash, env.QUIZ_PASSWORD_PEPPER
  );
  if (!valid) throw json({ error: "パスワードが正しくありません。" }, { status: 401 });
  await deleteMeteoScopeAccount(db, auth.account.id);
  await invalidateAllQuizLeaderboardCaches();
  return json({ deleted: true }, { headers: expiredAccountSessionHeaders() });
}

async function createChallenge(request, env) {
  const db = requireQuizConfiguration(env);
  const auth = await requireAuthentication(request, db);
  await recordQuizDailyActivity(db, auth.account.id);
  await enforceRateLimit(request, env, db, "challenge", 20, 10 * 60);
  const payload = await readJSON(request);
  const difficulty = String(payload.difficulty ?? "");
  if (!isQuizDifficulty(difficulty)) throw json({ error: "難易度が正しくありません。" }, { status: 400 });
  const questionIDs = createQuizQuestionIDs(difficulty);
  const challengeToken = randomQuizToken();
  const idHash = await hashQuizToken(challengeToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_SECONDS * 1000).toISOString();
  await db.batch([
    db.prepare("DELETE FROM quiz_challenges WHERE account_id = ?1").bind(auth.account.id),
    db.prepare(
      `INSERT INTO quiz_challenges
       (id_hash, account_id, difficulty, question_ids, created_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    ).bind(idHash, auth.account.id, difficulty, JSON.stringify(questionIDs), now.toISOString(), expiresAt)
  ]);
  return json({ challengeID: challengeToken, difficulty, questionIDs, expiresAt });
}

async function submitAttempt(request, env) {
  const db = requireQuizConfiguration(env);
  const auth = await requireAuthentication(request, db);
  await enforceRateLimit(request, env, db, "submit", 20, 10 * 60);
  const payload = await readJSON(request);
  const challengeID = String(payload.challengeID ?? "");
  if (challengeID.length < 20 || challengeID.length > 100 || !Array.isArray(payload.answers)) {
    throw json({ error: "回答データが正しくありません。" }, { status: 400 });
  }
  const idHash = await hashQuizToken(challengeID);
  const challenge = await db.prepare(
    `SELECT difficulty, question_ids FROM quiz_challenges
     WHERE id_hash = ?1 AND account_id = ?2 AND expires_at > ?3`
  ).bind(idHash, auth.account.id, new Date().toISOString()).first();
  if (!challenge) throw json({ error: "出題の有効期限が切れました。もう一度開始してください。" }, { status: 409 });
  let questionIDs;
  try { questionIDs = JSON.parse(challenge.question_ids); } catch { questionIDs = []; }
  const score = scoreQuizAnswers(questionIDs, payload.answers);
  if (score === null) throw json({ error: "回答と出題内容が一致しません。" }, { status: 400 });
  const completedAt = new Date().toISOString();
  const rankingDate = quizRankingDate(completedAt);
  await db.batch([
    db.prepare(
      `INSERT INTO quiz_attempts (id, account_id, difficulty, score, total, completed_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    ).bind(crypto.randomUUID(), auth.account.id, challenge.difficulty, score, QUIZ_QUESTION_COUNT, completedAt),
    db.prepare(UPSERT_QUIZ_DAILY_SCORE_SQL)
      .bind(rankingDate, auth.account.id, challenge.difficulty, score, completedAt),
    db.prepare("DELETE FROM quiz_challenges WHERE id_hash = ?1").bind(idHash)
  ]);
  await invalidateQuizLeaderboardCache(challenge.difficulty, rankingDate);
  return json({ recorded: true, difficulty: challenge.difficulty, score, total: QUIZ_QUESTION_COUNT, pointsEarned: score, rankingDate, completedAt });
}

async function leaderboard(request, env) {
  const db = requireQuizConfiguration(env);
  const difficulty = new URL(request.url).searchParams.get("difficulty") ?? "beginner";
  if (!isQuizDifficulty(difficulty)) throw json({ error: "難易度が正しくありません。" }, { status: 400 });
  const rankingDate = quizRankingDate();
  const auth = await authenticateAccount(request, db);
  const currentUser = auth ? await currentUserRanking(db, rankingDate, difficulty, auth.account.id) : null;
  const publicEntries = await cachedPublicLeaderboard(db, rankingDate, difficulty, env);
  const entries = publicEntries.map((entry) => ({
    ...entry,
    isCurrentUser: currentUser?.rank === entry.rank
  }));
  return json({ difficulty, rankingDate, entries, currentUser, updatedAt: new Date().toISOString() });
}

async function currentUserRanking(db, rankingDate, difficulty, accountID) {
  const row = await db.prepare(CURRENT_USER_QUIZ_RANK_SQL).bind(rankingDate, difficulty, accountID).first();
  return row ? {
    rank: Number(row.rank),
    points: Number(row.points),
    attemptCount: Number(row.attempt_count),
    completedAt: row.completed_at
  } : null;
}

async function cachedPublicLeaderboard(db, rankingDate, difficulty, env) {
  const cache = globalThis.caches?.default;
  const cacheKey = quizLeaderboardCacheKey(rankingDate, difficulty);
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const entries = await cached.json().catch(() => null);
      if (Array.isArray(entries)) return entries;
    }
  }
  const result = await db.prepare(PUBLIC_QUIZ_LEADERBOARD_SQL).bind(rankingDate, difficulty, LEADERBOARD_LIMIT).all();
  const entries = (result?.results ?? []).map((row, index) => ({
    rank: index + 1,
    displayName: normalizeQuizDisplayName(row.display_name),
    points: Number(row.points),
    attemptCount: Number(row.attempt_count),
    completedAt: row.completed_at
  }));
  if (cache) {
    await cache.put(cacheKey, new Response(JSON.stringify(entries), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${leaderboardCacheSeconds(env)}`
      }
    }));
  }
  return entries;
}

function leaderboardCacheSeconds(env) {
  const configured = Number.parseInt(env.QUIZ_LEADERBOARD_CACHE_SECONDS, 10);
  return Number.isFinite(configured) ? Math.min(300, Math.max(30, configured)) : 60;
}

async function createSession(db, accountID) {
  const token = randomQuizToken();
  const tokenHash = await hashQuizToken(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + QUIZ_SESSION_TTL_SECONDS * 1000);
  await db.prepare(
    `INSERT INTO quiz_sessions (token_hash, account_id, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4)`
  ).bind(tokenHash, accountID, createdAt.toISOString(), expiresAt.toISOString()).run();
  return { token, expiresAt: expiresAt.toISOString() };
}

function accountResponse(account, session, client) {
  const includeToken = client === "ios" || client === "web-external";
  return json({
    authenticated: true,
    account: publicAccount(account),
    sessionToken: includeToken ? session.token : undefined,
    sessionExpiresAt: session.expiresAt
  }, { headers: { "Set-Cookie": accountSessionCookie(session.token, QUIZ_SESSION_TTL_SECONDS) } });
}

function publicAccount(account) {
  return { id: account.id, displayName: normalizeQuizDisplayName(account.display_name) };
}

async function requireAuthentication(request, db) {
  return requireAccountAuthentication(request, db, "ランキングへの参加にはログインが必要です。");
}

async function enforceRateLimit(request, env, db, action, limit, windowSeconds) {
  const clientAddress = request.headers.get("CF-Connecting-IP") ?? "local";
  const clientHash = await hashQuizRateLimitKey(clientAddress, env.QUIZ_RATE_LIMIT_SECRET);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
  const bucket = `${action}:${windowStart}`;
  const expiresAt = new Date((windowStart + windowSeconds + 60) * 1000).toISOString();
  const result = await db.prepare(
    `INSERT INTO quiz_rate_limits (bucket, client_hash, request_count, expires_at)
     VALUES (?1, ?2, 1, ?3)
     ON CONFLICT(bucket, client_hash) DO UPDATE SET request_count = request_count + 1
     RETURNING request_count`
  ).bind(bucket, clientHash, expiresAt).first();
  if (Number(result?.request_count ?? 1) > limit) {
    throw json({ error: "操作が続いたため、しばらく待ってから再試行してください。" }, {
      status: 429, headers: { "Retry-After": String(windowSeconds) }
    });
  }
}

function requireQuizConfiguration(env) {
  if (!isConfigured(env)) throw json({ error: "クイズランキングは現在準備中です。" }, { status: 503 });
  return requireD1(env.NOTIFICATIONS_DB);
}

function isConfigured(env) {
  return Boolean(env.NOTIFICATIONS_DB && env.QUIZ_PASSWORD_PEPPER && env.QUIZ_RATE_LIMIT_SECRET);
}

async function readJSON(request) {
  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) throw json({ error: "リクエストが大きすぎます。" }, { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_REQUEST_BYTES) {
    throw json({ error: "リクエストが大きすぎます。" }, { status: 413 });
  }
  try { return JSON.parse(text || "{}"); }
  catch { throw json({ error: "JSONが正しくありません。" }, { status: 400 }); }
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  const requestOrigin = new URL(request.url).origin;
  const allowed = origin === requestOrigin || origin === "https://wvdtc7bjwn-bit.github.io" || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/u.test(origin);
  if (!allowed) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Vary": "Origin"
  };
}

function withHeaders(response, headers) {
  const next = new Headers(response.headers);
  Object.entries(headers).forEach(([key, value]) => next.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: next });
}

function json(payload, init = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json; charset=utf-8");
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(payload), { ...init, headers });
}
