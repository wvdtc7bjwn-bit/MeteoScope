import { WARNING_CHAT_LIMITS, WARNING_CHAT_MODEL } from "../../src/ai/warningChatPolicy.js";

export function warningChatDailyLimit(value = WARNING_CHAT_LIMITS.daily) {
  return Math.min(WARNING_CHAT_LIMITS.daily, Math.max(0, Number.parseInt(value, 10) || 0));
}

export function warningChatDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export async function reserveWarningChatQuota(db, accountId, { now = Date.now(), dailyLimit = WARNING_CHAT_LIMITS.daily } = {}) {
  const day = warningChatDay(now);
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${day}:${accountId}`));
  const digest = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const userPath = `$.accounts.u${digest}`;
  const limit = warningChatDailyLimit(dailyLimit);
  if (!limit) return null;
  // One conditional statement, not read-then-write: parallel requests in different
  // isolates cannot overspend either quota. Failed/timed-out inference is not refunded.
  const row = await db.prepare(`
    INSERT INTO app_records (key, value, updated_at)
    VALUES (?1, json_set('{"used":0,"accounts":{}}', '$.used', 1, ?2, 1), ?3)
    ON CONFLICT(key) DO UPDATE SET
      value = json_set(app_records.value,
        '$.used', json_extract(app_records.value, '$.used') + 1,
        ?2, coalesce(json_extract(app_records.value, ?2), 0) + 1),
      updated_at = excluded.updated_at
    WHERE json_extract(app_records.value, '$.used') < ?4
      AND coalesce(json_extract(app_records.value, ?2), 0) < ?5
    RETURNING json_extract(value, '$.used') AS used, json_extract(value, ?2) AS accountUsed
  `).bind(`warning-chat-quota:${day}`, userPath, new Date(now).toISOString(), limit, WARNING_CHAT_LIMITS.perAccount).first();
  if (!row) return null;
  if (Number(row.used) === 1) {
    const cutoff = warningChatDay(now - 7 * 86400_000);
    await db.prepare("DELETE FROM app_records WHERE key >= 'warning-chat-quota:' AND key < ?1")
      .bind(`warning-chat-quota:${cutoff}`).run();
  }
  return { day, used: Number(row.used), accountUsed: Number(row.accountUsed), dailyLimit: limit, resetAt: new Date(Date.parse(`${day}T00:00:00Z`) + 86400_000).toISOString() };
}

// Aggregate only provider-reported usage. Never persist prompts, replies, user
// identifiers or reasoning. A missing usage field is unknown, not zero.
export async function recordWarningChatInferenceUsage(db, day, result) {
  const neurons = result?.usage?.neurons;
  if (typeof neurons !== "number" || !Number.isFinite(neurons) || neurons < 0) return;
  await db.prepare(`UPDATE app_records SET value = json_set(value,
    '$.reportedNeurons', coalesce(json_extract(value, '$.reportedNeurons'), 0) + ?2,
    '$.usageReports', coalesce(json_extract(value, '$.usageReports'), 0) + 1)
    WHERE key = ?1`).bind(`warning-chat-quota:${day}`, neurons).run();
}

export async function readWarningChatOperationalMetrics(env, { now = Date.now() } = {}) {
  const day = warningChatDay(now);
  const dailyLimit = warningChatDailyLimit(env.WARNING_CHAT_DAILY_LIMIT);
  const base = {
    available: false, enabled: env.WARNING_CHAT_ENABLED === "true", aiBound: typeof env.AI?.run === "function",
    model: WARNING_CHAT_MODEL, day, resetAt: new Date(Date.parse(`${day}T00:00:00Z`) + 86400_000).toISOString(),
    dailyLimit, perAccountLimit: WARNING_CHAT_LIMITS.perAccount, freeDailyNeurons: 10_000,
    budgetNeurons: dailyLimit * WARNING_CHAT_LIMITS.reservedNeurons,
    requestCount: null, remainingRequests: null, reservedNeurons: null, reportedNeurons: null, usageReports: null, unconfirmedRequests: null,
    // This feature's counters cannot measure the Cloudflare account's other AI use.
    accountTotalNeurons: null
  };
  if (!env.NOTIFICATIONS_DB) return base;
  try {
    const row = await env.NOTIFICATIONS_DB.prepare(`SELECT json_extract(value, '$.used') AS used,
      json_extract(value, '$.reportedNeurons') AS neurons, json_extract(value, '$.usageReports') AS reports
      FROM app_records WHERE key = ?1`).bind(`warning-chat-quota:${day}`).first();
    const validCount = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    if (row && !validCount(row.used)) return base;
    const used = row?.used ?? 0;
    const reports = validCount(row?.reports) ? row.reports : 0;
    const neurons = typeof row?.neurons === "number" && Number.isFinite(row.neurons) && row.neurons >= 0 && reports > 0 ? row.neurons : null;
    return { ...base, available: true, requestCount: used, remainingRequests: Math.max(0, dailyLimit - used),
      reservedNeurons: used * WARNING_CHAT_LIMITS.reservedNeurons, reportedNeurons: used === 0 ? 0 : neurons,
      usageReports: reports, unconfirmedRequests: Math.max(0, used - reports) };
  } catch {
    console.warn("[warning-chat] usage metrics unavailable");
    return base;
  }
}
