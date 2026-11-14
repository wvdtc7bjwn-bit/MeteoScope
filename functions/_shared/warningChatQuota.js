import { WARNING_CHAT_LIMITS, WARNING_CHAT_MODEL } from "../../src/ai/warningChatPolicy.js";

// Optional count cap for operator shutdown/local tests; normally no shared cap.
export function warningChatDailyLimit(value) {
  if (value == null || value === "none") return null;
  if (!/^\d+$/u.test(String(value))) return 0;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : 0;
}
export function warningChatDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}
// Legacy rows still reserve every call whose usage was not reported.
const PENDING_SQL = `coalesce(json_extract(app_records.value, '$.pendingNeurons'),
  max(0, coalesce(json_extract(app_records.value, '$.used'), 0) - coalesce(json_extract(app_records.value, '$.usageReports'), 0) - coalesce(json_extract(app_records.value, '$.lookupRequests'), 0)) * ${WARNING_CHAT_LIMITS.reservedNeurons})`;

export async function reserveWarningChatQuota(db, accountId, { now = Date.now(), dailyLimit, inference = true } = {}) {
  const day = warningChatDay(now);
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${day}:${accountId}`));
  const digest = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const userPath = `$.accounts.u${digest}`;
  const reservationId = `r${crypto.randomUUID().replaceAll("-", "")}`;
  const reservationPath = `$.reservations.${reservationId}`;
  const limit = warningChatDailyLimit(dailyLimit);
  if (limit === 0) return null;
  // One atomic SQL statement across isolates. Failures/timeouts keep their
  // reservation until valid provider usage arrives. Personal counts stay used.
  const row = await db.prepare(`
    INSERT INTO app_records (key, value, updated_at)
    VALUES (?1, json_set('{"used":0,"accounts":{}}', '$.used', 1, ?2, 1,
      '$.pendingNeurons', ?6, ?7, ?6, '$.lookupRequests', ?9), ?3)
    ON CONFLICT(key) DO UPDATE SET
      value = json_set(app_records.value,
        '$.used', coalesce(json_extract(app_records.value, '$.used'), 0) + 1,
        ?2, coalesce(json_extract(app_records.value, ?2), 0) + 1,
        '$.pendingNeurons', ${PENDING_SQL} + ?6, ?7, ?6,
        '$.lookupRequests', coalesce(json_extract(app_records.value, '$.lookupRequests'), 0) + ?9),
      updated_at = excluded.updated_at
    WHERE (?4 IS NULL OR coalesce(json_extract(app_records.value, '$.used'), 0) < ?4)
      AND coalesce(json_extract(app_records.value, ?2), 0) < ?5
      AND coalesce(json_extract(app_records.value, '$.exhausted'), 0) = 0
      AND coalesce(json_extract(app_records.value, '$.reportedNeurons'), 0) + ${PENDING_SQL} + ?6 <= ?8
    RETURNING json_extract(value, '$.used') AS used, json_extract(value, ?2) AS accountUsed
  `).bind(`warning-chat-quota:${day}`, userPath, new Date(now).toISOString(), limit,
    WARNING_CHAT_LIMITS.perAccount, inference ? WARNING_CHAT_LIMITS.reservedNeurons : 0, reservationPath, WARNING_CHAT_LIMITS.dailyNeurons, inference ? 0 : 1).first();
  if (!row) return null;
  if (Number(row.used) === 1) {
    const cutoff = warningChatDay(now - 7 * 86400_000);
    await db.prepare("DELETE FROM app_records WHERE key >= 'warning-chat-quota:' AND key < ?1")
      .bind(`warning-chat-quota:${cutoff}`).run();
  }
  return { day, reservationId, used: Number(row.used), accountUsed: Number(row.accountUsed), dailyLimit: limit,
    resetAt: new Date(Date.parse(`${day}T00:00:00Z`) + 86400_000).toISOString() };
}
// Replace a reservation only once. Missing usage is unknown, never zero.
export async function recordWarningChatInferenceUsage(db, quota, result) {
  const neurons = result?.usage?.neurons;
  if (typeof neurons !== "number" || !Number.isFinite(neurons) || neurons < 0) return;
  if (!/^r[0-9a-f]{32}$/u.test(quota?.reservationId ?? "") || !/^\d{4}-\d{2}-\d{2}$/u.test(quota?.day ?? "")) return;
  const path = `$.reservations.${quota.reservationId}`;
  await db.prepare(`UPDATE app_records SET value = json_set(value,
    '$.pendingNeurons', max(0, ${PENDING_SQL} - ?4), ?3, 0,
    '$.reportedNeurons', coalesce(json_extract(value, '$.reportedNeurons'), 0) + ?2,
    '$.usageReports', coalesce(json_extract(value, '$.usageReports'), 0) + 1)
    WHERE key = ?1 AND json_extract(value, ?3) = ?4`)
    .bind(`warning-chat-quota:${quota.day}`, neurons, path, WARNING_CHAT_LIMITS.reservedNeurons).run();
}
// Only 3036 means daily exhaustion. Capacity 3040/generic 429 are not daily bans.
export function isWarningChatAllocationError(error) {
  return [error?.code, error?.cause?.code].some((code) => code === 3036 || code === "3036")
    || /(?:^|:\s*|\b(?:code|error)\s*[:=]?\s*)3036\b/iu.test(String(error?.message ?? ""));
}
export async function stopWarningChatForDay(db, { now = Date.now() } = {}) {
  await db.prepare(`INSERT INTO app_records (key, value, updated_at)
    VALUES (?1, '{"used":0,"accounts":{},"pendingNeurons":0,"exhausted":true}', ?2)
    ON CONFLICT(key) DO UPDATE SET value = json_set(app_records.value, '$.exhausted', json('true')),
      updated_at = excluded.updated_at`)
    .bind(`warning-chat-quota:${warningChatDay(now)}`, new Date(now).toISOString()).run();
}
export async function readWarningChatOperationalMetrics(env, { now = Date.now() } = {}) {
  const day = warningChatDay(now);
  const dailyLimit = warningChatDailyLimit(env.WARNING_CHAT_DAILY_LIMIT);
  const base = {
    available: false, enabled: env.WARNING_CHAT_ENABLED === "true", aiBound: typeof env.AI?.run === "function",
    model: WARNING_CHAT_MODEL, day, resetAt: new Date(Date.parse(`${day}T00:00:00Z`) + 86400_000).toISOString(),
    dailyLimit, perAccountLimit: WARNING_CHAT_LIMITS.perAccount, freeDailyNeurons: 10_000,
    budgetNeurons: WARNING_CHAT_LIMITS.dailyNeurons, providerExhausted: null, accepting: false,
    requestCount: null, lookupRequests: null, remainingRequests: null, reservedNeurons: null, reportedNeurons: null, usageReports: null, unconfirmedRequests: null,
    // This feature cannot measure other projects' AI usage in the account.
    accountTotalNeurons: null
  };
  if (!env.NOTIFICATIONS_DB) return base;
  try {
    const row = await env.NOTIFICATIONS_DB.prepare(`SELECT json_extract(value, '$.used') AS used,
      json_extract(value, '$.reportedNeurons') AS neurons, json_extract(value, '$.usageReports') AS reports,
      json_extract(value, '$.lookupRequests') AS lookups,
      ${PENDING_SQL} AS pending, json_extract(value, '$.exhausted') AS exhausted
      FROM app_records WHERE key = ?1`).bind(`warning-chat-quota:${day}`).first();
    const validCount = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    if (row && !validCount(row.used)) return base;
    const used = row?.used ?? 0;
    const reports = validCount(row?.reports) ? row.reports : 0;
    const lookups = validCount(row?.lookups) ? row.lookups : 0;
    const neurons = typeof row?.neurons === "number" && Number.isFinite(row.neurons) && row.neurons >= 0 && reports > 0 ? row.neurons : null;
    const pending = typeof row?.pending === "number" && Number.isFinite(row.pending) && row.pending >= 0 ? row.pending : 0;
    const accepting = row?.exhausted !== 1 && (dailyLimit === null || used < dailyLimit)
      && (neurons ?? 0) + pending + WARNING_CHAT_LIMITS.reservedNeurons <= WARNING_CHAT_LIMITS.dailyNeurons;
    return { ...base, available: true, requestCount: used,
      remainingRequests: dailyLimit === null ? null : Math.max(0, dailyLimit - used),
      reservedNeurons: pending, reportedNeurons: used === lookups ? 0 : neurons, lookupRequests: lookups,
      providerExhausted: row?.exhausted === 1, accepting, usageReports: reports, unconfirmedRequests: Math.max(0, used - reports - lookups) };
  } catch {
    console.warn("[warning-chat] usage metrics unavailable");
    return base;
  }
}
